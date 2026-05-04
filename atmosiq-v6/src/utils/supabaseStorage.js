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
import * as Sentry from '@sentry/react'

const SYNC_QUEUE_KEY = 'atmosiq-sync-queue'
const isOnline = () => navigator.onLine && !!supabase

const SupaStorage = {
  // ── Auth ──
  async signUp(email, password) {
    if (!supabase) return { error: { message: 'Not configured' } }
    const result = await supabase.auth.signUp({ email, password })
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
    const result = await supabase.auth.signInWithPassword({ email, password })
    // Cache session locally for offline access
    if (result.data?.session) {
      await STO.set('atmosiq-cached-session', {
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
    await STO.del('atmosiq-cached-session')
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
    const cached = await STO.get('atmosiq-cached-session')
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
    const local = await STO.get('atmosiq-profile')
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
          await STO.set('atmosiq-profile', data)
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
    await STO.set('atmosiq-profile', profile)
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
    if (local) return local
    // Try cloud
    if (isOnline()) {
      try {
        const { data } = await supabase.from('assessments').select('*').eq('id', id).single()
        if (data) {
          await STO.set(id, data)
          return data
        }
      } catch {}
    }
    return null
  },

  async saveAssessment(assessment) {
    // Save locally first (instant, works offline)
    await STO.set(assessment.id, assessment)
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
    // Sync to cloud when online
    if (isOnline()) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          await supabase.from('assessments').upsert({
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
          })
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
  },

  async processSyncQueue() {
    if (!isOnline()) return
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    if (!queue.length) return
    const remaining = []
    for (const item of queue) {
      try {
        if (item.type === 'profile') await this.saveProfile(item.data)
        else if (item.type === 'assessment') await this.saveAssessment(item.data)
        else if (item.type === 'delete') await supabase.from('assessments').delete().eq('id', item.data.id)
      } catch {
        remaining.push(item)
      }
    }
    await STO.set(SYNC_QUEUE_KEY, remaining)
  },

  // ── Full sync (pull cloud data to local) ──
  async fullSync() {
    if (!isOnline()) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Sync profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile) await STO.set('atmosiq-profile', profile)
      // Sync assessments
      const { data: assessments } = await supabase.from('assessments').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      if (assessments) {
        for (const a of assessments) {
          await STO.set(a.id, a)
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
