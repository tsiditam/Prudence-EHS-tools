/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * OFFLINE-FIRST storage with Supabase sync.
 *
 * Architecture:
 * - localStorage is the PRIMARY data store. App works 100% offline.
 * - Supabase is the SYNC layer. When online, data syncs to cloud.
 * - Auth session is cached locally after first login.
 * - Photos stored as base64 locally, uploaded to Supabase Storage when online.
 * - Pending syncs are queued and retried when connection returns.
 */

import { supabase } from './supabaseClient'
import STO from './storage'
import { KEYS } from './storageKeys'
import * as Sentry from '@sentry/react'
import { compactPhotos, expandPhotos, purgeAssessmentPhotos } from './photoCompaction'

const SYNC_QUEUE_KEY = KEYS.syncQueue
const SYNC_STATE_KEY = KEYS.syncState
const SYNC_EVENT = 'atmosflow:sync-state-changed'
const isOnline = () => navigator.onLine && !!supabase

// Dispatch a sync-state-changed event so any UI listener (useSyncState
// hook, PendingSyncIndicator) can re-render immediately on queue or
// status change. Falls back to polling in the hook if the event is
// missed (e.g. cross-tab without a BroadcastChannel).
function emitSyncStateChange() {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT)) } catch { /* SSR / restricted env */ }
}

// Auth round-trips to Supabase can stall indefinitely on flaky mobile
// connections, leaving the sign-in / sign-up button spinning forever
// with no error. Cap each call so the caller always gets a resolvable
// { error } it can surface. Resolves (not rejects) with the same
// { data, error } shape the supabase-js auth methods return.
const AUTH_TIMEOUT_MS = 20000
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message } }), ms)),
  ])
}

// Full app-shape snapshot for the cloud `payload` column. Everything except
// photos, which keep their own column (and their own compaction lifecycle) so
// the base64 blobs aren't stored twice.
export function toPayload(assessment) {
  if (!assessment || typeof assessment !== 'object') return assessment
  const { photos, ...rest } = assessment // eslint-disable-line no-unused-vars
  return rest
}

// The `assessments` cloud table stores report fields in snake_case columns
// (zone_scores, composite, recommendations, sampling_plan, causal_chains,
// osha_evals) — saveAssessment flattens to that shape on the way UP. But
// every in-app consumer (openReport, renderResults, DOCX export) reads the
// camelCase shape that the LOCAL copy is saved in. Without mapping back on
// the way DOWN, a report restored from the cloud comes back with
// zoneScores/recs/etc. undefined, so renderResults bails (`!zoneScores.length`)
// and the report view renders nothing — a tap that looks dead. Map cloud →
// app shape so a cloud-restored report opens identically to a local one.
export function fromCloudRow(a) {
  if (!a || typeof a !== 'object') return a
  // Preferred path (post-014 migration): the full app-shape snapshot lives in
  // `payload`, so the restore is lossless — equipment, floorPlan, sensorData,
  // labResults, standardsManifest all survive. Photos live in their own column
  // (base64 wire form); overlay them onto the payload.
  if (a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload)) {
    return {
      ...a.payload,
      id: a.id ?? a.payload.id,
      status: a.status ?? a.payload.status,
      photos: a.photos ?? a.payload.photos ?? {},
      ts: a.updated_at ?? a.payload.ts,
    }
  }
  // Legacy row (no payload): map the snake_case columns → camelCase app keys.
  // Only emits keys the cloud actually carries, so spreading it over an
  // existing local copy never clobbers local-only fields (equipment, floorPlan).
  const out = {
    id: a.id,
    status: a.status,
    presurvey: a.presurvey || {},
    building: a.building || {},
    zones: a.zones || [],
    photos: a.photos || {},
    narrative: a.narrative ?? null,
    zoneScores: a.zone_scores ?? a.zoneScores ?? [],
    oshaEvals: a.osha_evals ?? a.oshaEvals ?? null,
    recs: a.recommendations ?? a.recs ?? null,
    samplingPlan: a.sampling_plan ?? a.samplingPlan ?? null,
    causalChains: a.causal_chains ?? a.causalChains ?? [],
  }
  const composite = a.composite ?? a.comp ?? null
  out.comp = composite
  out.composite = composite
  if (a.updated_at) out.ts = a.updated_at
  return out
}

const SupaStorage = {
  // ── Auth ──
  async signUp(email, password) {
    if (!supabase) return { error: { message: 'Not configured' } }
    const result = await withTimeout(
      supabase.auth.signUp({ email, password }),
      AUTH_TIMEOUT_MS,
      'Sign-up timed out. Check your connection and try again.',
    )
    // Bootstrap a free-tier profile row immediately so the user can
    // try AtmosFlow with 1 credit before any payment step.
    if (result.data && result.data.user && result.data.user.id) {
      try {
        const userId = result.data.user.id
        const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
        if (!existing) {
          await supabase.from('profiles').insert({
            id: userId,
            plan: 'free',
            credits_remaining: 1,
            subscription_status: 'free',
            stripe_customer_id: null,
            billing_period: 'monthly',
            free_tier_signup_at: new Date().toISOString(),
          })
        }
      } catch (err) {
        // Profile row creation may fail if the user has to confirm email
        // first (RLS sees auth.uid() as null). The post-confirmation flow
        // also bootstraps; this best-effort attempt is fine to swallow.
        console.warn('[signUp] free-tier profile bootstrap deferred:', err && err.message)
      }
    }
    return result
  },

  async signIn(email, password) {
    if (!supabase) return { error: { message: 'Not configured' } }
    const result = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      AUTH_TIMEOUT_MS,
      'Sign-in timed out. Check your connection and try again.',
    )
    // Cache session locally for offline access
    if (result.data?.session) {
      await STO.set(KEYS.cachedSession, {
        user: result.data.user,
        email: result.data.user.email,
        id: result.data.user.id,
        cachedAt: new Date().toISOString(),
      })
    }
    return result
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut()
    await STO.del(KEYS.cachedSession)
  },

  async getUser() {
    // Try live session first
    if (isOnline()) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) return user
      } catch {}
    }
    // Fall back to cached session (offline)
    const cached = await STO.get(KEYS.cachedSession)
    return cached || null
  },

  async getSession() {
    if (!supabase) return null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      return session
    } catch { return null }
  },

  onAuthChange(callback) {
    if (!supabase) return () => {}
    const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
    return () => subscription.unsubscribe()
  },

  // ── Profile (offline-first) ──
  async getProfile() {
    // Always read from local first (fast)
    const local = await STO.get(KEYS.profile)
    // Try to sync from cloud if online
    if (isOnline()) {
      Sentry.addBreadcrumb({
        category: 'profile_sync',
        message: 'getProfile.start',
        level: 'info',
        data: { hasLocal: !!local },
      })
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          Sentry.addBreadcrumb({
            category: 'profile_sync',
            message: 'getProfile.no_auth_user',
            level: 'info',
          })
          return local
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (error) {
          // PGRST116 = "no rows returned" — normal first-sign-in case
          // when the user has no profile row yet. Logged as info, not
          // a failure. Any other error code is a real defect (RLS
          // denial, schema drift, network) and surfaces as an exception.
          if (error.code === 'PGRST116') {
            Sentry.addBreadcrumb({
              category: 'profile_sync',
              message: 'getProfile.no_row',
              level: 'info',
              data: { code: error.code },
            })
          } else {
            Sentry.addBreadcrumb({
              category: 'profile_sync',
              message: 'getProfile.read_failed',
              level: 'warning',
              data: { code: error.code, statusText: error.message },
            })
            Sentry.captureException(
              new Error(`profile_sync.getProfile failed: ${error.code || 'unknown'} ${error.message || ''}`),
              {
                tags: { component: 'profile_sync', op: 'getProfile' },
                extra: {
                  code: error.code,
                  hint: error.hint,
                  details: error.details,
                  // Note: error.message and details may include schema
                  // info but not user PII (no row contents). beforeSend
                  // in lib/sentry-client.ts scrubs Extra anyway.
                },
              },
            )
          }
        } else if (data) {
          await STO.set(KEYS.profile, data)
          Sentry.addBreadcrumb({
            category: 'profile_sync',
            message: 'getProfile.success',
            level: 'info',
          })
          return data
        }
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'profile_sync',
          message: 'getProfile.exception',
          level: 'warning',
          data: { name: err?.name, message: err?.message },
        })
        Sentry.captureException(err, {
          tags: { component: 'profile_sync', op: 'getProfile' },
        })
      }
    }
    return local
  },

  async saveProfile(profile) {
    // Save locally first (instant)
    await STO.set(KEYS.profile, profile)
    // Sync to cloud if online
    if (isOnline()) {
      Sentry.addBreadcrumb({
        category: 'profile_sync',
        message: 'saveProfile.start',
        level: 'info',
      })
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { error } = await supabase.from('profiles').upsert({
            id: user.id,
            name: profile.name,
            certs: profile.certs || [],
            experience: profile.experience,
            iaq_meter: profile.iaq_meter,
            iaq_serial: profile.iaq_serial,
            iaq_cal_date: profile.iaq_cal_date || null,
            iaq_cal_status: profile.iaq_cal_status,
            pid_meter: profile.pid_meter,
            pid_cal_status: profile.pid_cal_status,
            other_instruments: profile.other_instruments,
            firm: profile.firm,
            marketing_consent: profile.marketing_consent || false,
          })
          if (error) {
            // Supabase upsert does NOT throw on PostgREST errors —
            // RLS denial, schema mismatch, validation all return
            // {error} silently. Surface them so silent data loss
            // becomes diagnosable.
            Sentry.addBreadcrumb({
              category: 'profile_sync',
              message: 'saveProfile.upsert_failed',
              level: 'warning',
              data: { code: error.code, statusText: error.message },
            })
            Sentry.captureException(
              new Error(`profile_sync.saveProfile upsert failed: ${error.code || 'unknown'} ${error.message || ''}`),
              {
                tags: { component: 'profile_sync', op: 'saveProfile' },
                extra: { code: error.code, hint: error.hint, details: error.details },
              },
            )
            // Preserve existing fall-through behavior: original code
            // only queued on thrown exception, not on PostgREST error.
            // Not changing that here — this PR is observability-only.
          } else {
            Sentry.addBreadcrumb({
              category: 'profile_sync',
              message: 'saveProfile.success',
              level: 'info',
            })
          }
        } else {
          Sentry.addBreadcrumb({
            category: 'profile_sync',
            message: 'saveProfile.no_auth_user',
            level: 'info',
          })
        }
      } catch (err) {
        Sentry.addBreadcrumb({
          category: 'profile_sync',
          message: 'saveProfile.exception',
          level: 'warning',
          data: { name: err?.name, message: err?.message },
        })
        Sentry.captureException(err, {
          tags: { component: 'profile_sync', op: 'saveProfile' },
        })
        await this._queueSync('profile', profile)
      }
    } else {
      Sentry.addBreadcrumb({
        category: 'profile_sync',
        message: 'saveProfile.offline_queued',
        level: 'info',
      })
      await this._queueSync('profile', profile)
    }
    return true
  },

  // ── Assessments (offline-first) ──
  async listAssessments(status) {
    // Local index is the source of truth
    const idx = await STO.getIndex()
    if (status === 'draft') return idx.drafts || []
    if (status === 'complete') return idx.reports || []
    return [...(idx.reports||[]), ...(idx.drafts||[])]
  },

  async getAssessment(id) {
    // Local first
    const local = await STO.get(id)
    if (local) {
      // Expand any compact photo refs (idbId) back to inline base64 so
      // every consumer above this layer (DOCX, PrintReport, in-app
      // viewer) sees the legacy { src, ts } shape it has always seen.
      const expanded = await expandPhotos(local.photos || {})
      return { ...local, photos: expanded.photos }
    }
    // Try cloud
    if (isOnline()) {
      try {
        const { data } = await supabase.from('assessments').select('*').eq('id', id).single()
        if (data) {
          // Normalize snake_case cloud columns → camelCase app shape, then
          // compact the inline cloud photos before the localStorage write to
          // escape the quota cap (cloud still holds the base64 wire format).
          const norm = fromCloudRow(data)
          const compacted = await compactPhotos(norm.photos || {}, id)
          await STO.set(id, { ...norm, photos: compacted.photos })
          return { ...norm }
        }
      } catch {}
    }
    return null
  },

  // Always fetch from the cloud, bypassing the local-first short-circuit, and
  // heal the local copy with the result. getAssessment returns the local copy
  // whenever one exists — but the local copy can be stale or corrupt (e.g. a
  // finalized report whose localStorage entry was overwritten by a draft-shape
  // autosave). When the in-app report view needs the authoritative finalized
  // record, use this to re-pull the complete cloud copy and repair local.
  async getRemoteAssessment(id) {
    if (!isOnline()) return null
    try {
      const { data } = await supabase.from('assessments').select('*').eq('id', id).single()
      if (!data) return null
      const norm = fromCloudRow(data)
      const compacted = await compactPhotos(norm.photos || {}, id)
      await STO.set(id, { ...norm, photos: compacted.photos })
      return { ...norm }
    } catch { return null }
  },

  async saveAssessment(assessment) {
    // Compact photos before localStorage write — inline base64 blobs
    // get offloaded to IndexedDB so localStorage doesn't hit its
    // 5–10 MB quota on photo-heavy assessments. Falls through silently
    // when IndexedDB is unavailable (private browsing, etc.).
    const compactResult = await compactPhotos(assessment.photos || {}, assessment.id)
    const localCopy = { ...assessment, photos: compactResult.photos }
    await STO.set(assessment.id, localCopy)
    // Update local index
    if (assessment.status === 'complete') {
      await STO.addReportToIndex({
        id: assessment.id,
        ts: assessment.ts || new Date().toISOString(),
        facility: assessment.building?.fn || assessment.bldg?.fn,
        score: assessment.comp?.tot || assessment.composite?.tot,
      })
    } else {
      await STO.addDraftToIndex({
        id: assessment.id,
        facility: assessment.building?.fn || assessment.bldg?.fn || 'Untitled',
        ua: new Date().toISOString(),
      })
    }
    // Sync to cloud when online — wire format MUST be the inline
    // base64 form (Supabase JSONB doesn't know about our IDB refs).
    // `assessment.photos` is already inline as received; reuse it.
    if (isOnline()) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const row = {
            id: assessment.id,
            user_id: user.id,
            status: assessment.status || 'draft',
            facility_name: assessment.building?.fn || assessment.bldg?.fn,
            facility_address: assessment.building?.fl || assessment.bldg?.fl,
            presurvey: assessment.presurvey || {},
            building: assessment.building || assessment.bldg || {},
            zones: assessment.zones || [],
            photos: assessment.photos || {},
            zone_scores: assessment.zoneScores,
            composite: assessment.comp || assessment.composite,
            osha_evals: assessment.oshaEvals,
            recommendations: assessment.recs,
            sampling_plan: assessment.samplingPlan,
            causal_chains: assessment.causalChains,
            narrative: assessment.narrative,
            score: assessment.comp?.tot || assessment.composite?.tot,
            risk: assessment.comp?.risk || assessment.composite?.risk,
            // Lossless app-shape snapshot — preserves fields the flattened
            // columns drop (equipment, floorPlan, sensorData, labResults,
            // standardsManifest). fromCloudRow prefers this on the way down.
            payload: toPayload(assessment),
          }
          const { error } = await supabase.from('assessments').upsert(row)
          if (error) {
            // payload column not migrated yet → retry without it so the core
            // report still syncs (it restores via the flattened columns).
            delete row.payload
            const { error: e2 } = await supabase.from('assessments').upsert(row)
            if (e2) throw e2
          }
        }
      } catch {
        await this._queueSync('assessment', assessment)
      }
    } else {
      await this._queueSync('assessment', assessment)
    }
    return assessment
  },

  async deleteAssessment(id) {
    await STO.del(id)
    await STO.removeFromIndex(id, 'rpt')
    await STO.removeFromIndex(id, 'dft')
    // Purge any IndexedDB-stored photos for this assessment so deleted
    // assessments don't leak blob storage. Best-effort; never throws.
    try { await purgeAssessmentPhotos(id) } catch { /* ignore */ }
    if (isOnline()) {
      try { await supabase.from('assessments').delete().eq('id', id) }
      catch { await this._queueSync('delete', { id }) }
    } else {
      await this._queueSync('delete', { id })
    }
  },

  // ── Sync Queue (for offline changes) ──
  async _queueSync(type, data) {
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    queue.push({ type, data, queuedAt: new Date().toISOString() })
    await STO.set(SYNC_QUEUE_KEY, queue)
    emitSyncStateChange()
  },

  /**
   * Drain the offline sync queue. Updates SYNC_STATE_KEY with attempt
   * + outcome timestamps so the UI can show "last synced N min ago"
   * and so a periodic trigger (every minute, on tab focus, on the
   * online event) can be safely no-op when the queue is empty.
   *
   * Concurrent calls are guarded by a single-flight flag in
   * SYNC_STATE_KEY.inFlight so two triggers (e.g. online event +
   * periodic interval firing close together) don't double-process.
   */
  async processSyncQueue() {
    if (!isOnline()) return
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    if (!queue.length) return

    const state = (await STO.get(SYNC_STATE_KEY)) || {}
    if (state.inFlight) return
    const startedAt = new Date().toISOString()
    await STO.set(SYNC_STATE_KEY, { ...state, inFlight: true, lastAttempt: startedAt })
    emitSyncStateChange()

    const remaining = []
    let lastError = null
    for (const item of queue) {
      try {
        if (item.type === 'profile') await this.saveProfile(item.data)
        else if (item.type === 'assessment') await this.saveAssessment(item.data)
        else if (item.type === 'delete') await supabase.from('assessments').delete().eq('id', item.data.id)
      } catch (err) {
        remaining.push(item)
        // Keep the most recent error so the indicator can surface it.
        lastError = (err && err.message) || 'sync_failed'
      }
    }
    await STO.set(SYNC_QUEUE_KEY, remaining)

    const finishedAt = new Date().toISOString()
    const nextState = {
      ...(await STO.get(SYNC_STATE_KEY) || {}),
      inFlight: false,
      lastAttempt: startedAt,
      lastSuccess: remaining.length === 0 ? finishedAt : (state.lastSuccess || null),
      lastError: remaining.length === 0 ? null : (lastError || state.lastError || 'partial_drain'),
    }
    await STO.set(SYNC_STATE_KEY, nextState)
    emitSyncStateChange()
  },

  /**
   * Read-only snapshot of sync queue + state. Used by the PendingSync
   * indicator and the useSyncState hook to render reactively. Safe to
   * call from anywhere — never touches the network.
   *
   * Returns:
   *   queueDepth  — count of items waiting to sync (0 when caught up)
   *   inFlight    — true while processSyncQueue is mid-drain
   *   lastAttempt — ISO timestamp of the last drain attempt, or null
   *   lastSuccess — ISO timestamp of the last fully successful drain, or null
   *   lastError   — error message from the most recent partial drain, or null
   *   online      — navigator.onLine AND supabase is configured
   */
  async getSyncState() {
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    const state = await STO.get(SYNC_STATE_KEY) || {}
    return {
      queueDepth: queue.length,
      inFlight: !!state.inFlight,
      lastAttempt: state.lastAttempt || null,
      lastSuccess: state.lastSuccess || null,
      lastError: state.lastError || null,
      online: isOnline(),
    }
  },

  /** Convenience accessor — queueDepth alone, no full state read. */
  async getQueueDepth() {
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    return queue.length
  },

  // ── Full sync (pull cloud data to local) ──
  async fullSync() {
    if (!isOnline()) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Sync profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile) await STO.set(KEYS.profile, profile)
      // Sync assessments
      const { data: assessments } = await supabase.from('assessments').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      if (assessments) {
        for (const a of assessments) {
          // Map cloud → app shape and merge over any existing local copy so
          // local-only fields (equipment, floorPlan, draft progress) survive
          // a re-sync. Compact photos to stay under the localStorage quota.
          const existing = await STO.get(a.id)
          const norm = fromCloudRow(a)
          const { photos } = await compactPhotos(norm.photos || {}, a.id)
          await STO.set(a.id, { ...(existing || {}), ...norm, photos })
        }
        // Rebuild local index
        const reports = assessments.filter(a => a.status === 'complete').map(a => ({ id: a.id, ts: a.updated_at, facility: a.facility_name, score: a.score }))
        const drafts = assessments.filter(a => a.status === 'draft').map(a => ({ id: a.id, facility: a.facility_name, ua: a.updated_at }))
        await STO.saveIndex({ reports, drafts })
      }
      // Process any pending offline changes
      await this.processSyncQueue()
    } catch (e) {
      console.warn('Sync failed:', e)
    }
  },
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    SupaStorage.processSyncQueue()
  })
}

export default SupaStorage
