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
 *
 * Sync contract (audit 2026-09, §4 C2 / H3 / H5 / H6 / M4 / M5 / M13):
 * - saveAssessment / saveProfile / deleteAssessment return
 *   `{ ok: true }` when the cloud write landed and `{ ok: false, error,
 *   queued?, conflict? }` when it did not. A failed write is QUEUED for
 *   retry unless retrying is futile (a multi-device conflict or an
 *   immutable issued report), in which case it is parked in the
 *   conflicts list for a person to resolve.
 * - The queue holds ONE entry per assessment id (latest intent wins) and
 *   stores the compacted copy (photo refs, not inline base64).
 * - processSyncQueue never re-enters the queue: it pushes directly and
 *   keeps failures in `remaining`. Its single-flight guard is an
 *   in-memory timestamp that goes stale after DRAIN_STALE_MS, so a
 *   killed tab can never wedge sync for good.
 * - Every upsert carries `base_updated_at` (the cloud `updated_at` this
 *   device last saw). Migration 034 rejects the write when the row moved
 *   on since, and the client keeps the local copy instead of clobbering.
 */

import { supabase } from './supabaseClient'
import STO from './storage'
import { KEYS } from './storageKeys'
import * as Sentry from '@sentry/react'
import { compactPhotos, expandPhotos, purgeAssessmentPhotos } from './photoCompaction'
import { resolveLifecycle, toLegacyStatus, REPORT_STATUS } from '../constants/reportLifecycle'
import { normalizeAcknowledgement } from './calibrationAcknowledgement'
import { countFindings, worstFindingSeverity } from './assessmentVerdict'

/**
 * Lifecycle for a cloud row, tolerant of rows written before migration
 * 027 (which carry neither lifecycle column — resolveLifecycle derives
 * the state from the legacy `status` instead).
 */
function cloudLifecycle(a) {
  const payload = (a && a.payload && typeof a.payload === 'object') ? a.payload : {}
  return resolveLifecycle({
    report_profile: a.report_profile ?? payload.reportProfile,
    report_status: a.report_status ?? payload.reportStatus,
    status: a.status ?? payload.status,
  })
}

const SYNC_QUEUE_KEY = KEYS.syncQueue
const SYNC_STATE_KEY = KEYS.syncState
const SYNC_CONFLICTS_KEY = KEYS.syncConflicts
const SYNC_EVENT = 'atmosflow:sync-state-changed'
const isOnline = () => navigator.onLine && !!supabase

/** A drain older than this is presumed dead (tab killed mid-drain). */
export const DRAIN_STALE_MS = 2 * 60 * 1000
/** fullSync page size — PostgREST silently caps unpaged selects at 1,000. */
export const SYNC_PAGE_SIZE = 500

// Single-flight guard for processSyncQueue. In memory on purpose: the
// previous persisted `inFlight: true` flag outlived any tab that died
// mid-drain and blocked every later drain until the user cleared site
// data (audit H6). A timestamp that goes stale cannot wedge.
let drainStartedAt = null
function drainInFlight() {
  if (drainStartedAt == null) return false
  if (Date.now() - drainStartedAt > DRAIN_STALE_MS) { drainStartedAt = null; return false }
  return true
}

// localStorage quota failure the state write itself may not survive, so
// the most recent one is also held here and OR'd into getSyncState.
let quotaErrorAt = null

// Dispatch a sync-state-changed event so any UI listener (useSyncState
// hook, PendingSyncIndicator) can re-render immediately on queue or
// status change. Falls back to polling in the hook if the event is
// missed (e.g. cross-tab without a BroadcastChannel).
function emitSyncStateChange() {
  if (typeof window === 'undefined') return
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT)) } catch { /* SSR / restricted env */ }
}

async function readSyncState() {
  const s = await STO.get(SYNC_STATE_KEY)
  return (s && typeof s === 'object') ? s : {}
}

/** STO.set returned false — localStorage is full. Surface it. */
async function noteStorageQuota() {
  quotaErrorAt = new Date().toISOString()
  try {
    const state = await readSyncState()
    await STO.set(SYNC_STATE_KEY, { ...state, lastError: 'storage_quota' })
  } catch { /* the state write can fail for the same reason */ }
  emitSyncStateChange()
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

// ── Error classification ─────────────────────────────────────────────
//
// supabase-js does not throw on PostgREST errors; it resolves `{ error }`
// with the Postgres SQLSTATE in `error.code`. Every recovery below keys
// on that code — never on "any error" — so a network blip or an RLS
// denial is retried as-is instead of being "fixed" by dropping columns.

/** Postgres 42703 (undefined column) — or PostgREST's schema-cache
 *  equivalent PGRST204, which is what an upsert body naming a column the
 *  project has not migrated yet actually returns. */
export function isUndefinedColumnError(err) {
  return !!err && (err.code === '42703' || err.code === 'PGRST204')
}

/** Postgres 23505 — unique violation (the 032 assessment_uid index). */
export function isUniqueViolationError(err) {
  return !!err && err.code === '23505'
}

/** Marker the 034 triggers put in their messages so the client can tell
 *  its own guards from an unrelated check constraint. */
export const CONFLICT_MARK = 'ATMOSFLOW_CONFLICT'
export const IMMUTABLE_MARK = 'ATMOSFLOW_IMMUTABLE'

/** Migration 034's base_updated_at check refused the write: another
 *  device changed the row since this one last pulled it. */
export function isConflictError(err) {
  if (!err) return false
  const msg = String(err.message || err.details || '')
  if (msg.includes(CONFLICT_MARK)) return true
  return err.code === '40001'
}

/** Migration 034's issued-report guard refused the write. */
export function isImmutableError(err) {
  if (!err) return false
  return String(err.message || err.details || '').includes(IMMUTABLE_MARK)
}

/** Column named by an undefined-column error, or null when unparseable.
 *  Handles both Postgres ('column "x" of relation … does not exist',
 *  'column assessments.x does not exist') and PostgREST ("Could not find
 *  the 'x' column of 'assessments' in the schema cache"). */
export function missingColumnName(err) {
  const msg = String((err && err.message) || '')
  let m = /column (?:"?[a-z_][a-z0-9_]*"?\.)?"?([a-z_][a-z0-9_]*)"?(?: of relation "[^"]+")? does not exist/i.exec(msg)
  if (m) return m[1]
  m = /the '([a-z_][a-z0-9_]*)' column/i.exec(msg)
  if (m) return m[1]
  return null
}

/** Columns a build may write that an under-migrated project may lack.
 *  Dropped ONE AT A TIME, by name, on an undefined-column error. Nothing
 *  else is ever dropped. */
export const OPTIONAL_ASSESSMENT_COLUMNS = Object.freeze([
  'payload',          // 014
  'assessment_uid',   // 032
  'base_updated_at',  // 034
  'finalized_at',     // 034
])

function errorSummary(err) {
  if (!err) return 'sync_failed'
  const code = err.code ? `${err.code} ` : ''
  return `${code}${err.message || 'sync_failed'}`.trim()
}

// ── Engine-version discriminator for the `composite` column ─────────
//
// `composite` holds two incompatible shapes: the 100-point composite
// score written by engines < 3 ({ tot, risk, … }) and, briefly, the v3
// finding census ({ count, findings, confidence, partialData }). The v3
// census now lives in `payload.census` and the column is no longer
// written; on read it is consulted only for records whose engine version
// is known to predate v3 (or is unknown — every row without a payload
// predates the payload column, which predates v3).
export function engineMajor(record) {
  if (!record || typeof record !== 'object') return null
  const payload = (record.payload && typeof record.payload === 'object') ? record.payload : record
  const candidates = [
    payload.engineVersion,
    payload.standardsManifest && payload.standardsManifest.engineVersion,
    payload.ver,
    payload.version,
  ]
  for (const c of candidates) {
    if (typeof c !== 'string') continue
    const m = /(?:engine\s*v)?(\d+)\.\d+/i.exec(c)
    if (m) return Number(m[1])
  }
  return null
}

/** True for the v3 finding census shape (and not the legacy score). */
export function isCensus(c) {
  return !!c && typeof c === 'object' && !Array.isArray(c)
    && c.findings && typeof c.findings === 'object'
    && !('tot' in c)
}

/** The `composite` column may be read only for pre-v3 (or unknown) engines. */
function legacyComposite(a) {
  const major = engineMajor(a)
  if (major !== null && major >= 3) return undefined
  return a.composite ?? a.comp ?? undefined
}

// Full app-shape snapshot for the cloud `payload` column. Everything except
// photos, which keep their own column (and their own compaction lifecycle) so
// the base64 blobs aren't stored twice, and the two pieces of per-device
// bookkeeping (`cloudUpdatedAt`, `_photosPending`) that describe this
// device's view of the cloud rather than the assessment.
//
// The v3 finding census is written to `payload.census` — its own, named
// slot — so the shape is self-describing on the way back down.
export function toPayload(assessment) {
  if (!assessment || typeof assessment !== 'object') return assessment
  const { photos, cloudUpdatedAt, _photosPending, ...rest } = assessment // eslint-disable-line no-unused-vars
  const comp = rest.comp ?? rest.composite
  if (isCensus(comp)) rest.census = comp
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
//
// `ts` is the REPORT DATE. It prefers the stored finalization timestamp
// (`finalized_at`, migration 034), then the finalize timestamp the app
// stamped into the payload, and only then `updated_at` — which moves on
// every re-save and is therefore the wrong date for an issued report.
export function fromCloudRow(a) {
  if (!a || typeof a !== 'object') return a
  // Preferred path (post-014 migration): the full app-shape snapshot lives in
  // `payload`, so the restore is lossless — equipment, floorPlan, sensorData,
  // labResults, standardsManifest all survive. Photos live in their own column
  // (base64 wire form); overlay them onto the payload.
  if (a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload)) {
    const p = a.payload
    const out = {
      ...p,
      id: a.id ?? p.id,
      status: a.status ?? p.status,
      // Lifecycle from the columns, falling back to whatever the payload
      // carried — a row written before migration 027 has neither, and
      // resolveLifecycle derives it from the legacy status instead.
      //
      // Mapped onto reportProfile / reportStatus EXPLICITLY, never
      // spread: resolveLifecycle returns { profile, status }, and
      // `profile` is already taken on the app shape by the ASSESSOR
      // profile (name, certs, firm). Spreading would replace the
      // assessor with the string 'screening' and blank the signature
      // block on every report.
      reportProfile: cloudLifecycle(a).profile,
      reportStatus: cloudLifecycle(a).status,
      calibrationAcknowledgement: normalizeAcknowledgement(
        a.calibration_acknowledgement ?? p.calibrationAcknowledgement,
      ),
      photos: a.photos ?? p.photos ?? {},
      ts: a.finalized_at ?? p.ts ?? a.updated_at,
    }
    // Finding census: the named slot first, then the app-shape `comp` the
    // payload already carries, then the legacy column — pre-v3 only.
    const census = p.census ?? p.comp ?? legacyComposite(a)
    if (census !== undefined) { out.comp = census; out.composite = census }
    delete out.census
    // The uid column is the server's record of identity; a payload
    // snapshot can predate it. Never emit null over a locally held uid.
    if (a.assessment_uid) out.assessmentUid = a.assessment_uid
    if (a.updated_at) out.cloudUpdatedAt = a.updated_at
    return out
  }
  // Legacy row (no payload): map the snake_case columns → camelCase app keys.
  // Only emits keys the cloud actually carries, so spreading it over an
  // existing local copy never clobbers local-only fields (equipment, floorPlan).
  const out = {
    id: a.id,
    status: a.status,
    reportProfile: cloudLifecycle(a).profile,
    reportStatus: cloudLifecycle(a).status,
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
  const composite = legacyComposite(a) ?? null
  out.comp = composite
  out.composite = composite
  const ts = a.finalized_at ?? a.updated_at
  if (ts) out.ts = ts
  if (a.updated_at) out.cloudUpdatedAt = a.updated_at
  // Same conditional discipline as the acknowledgement below: this object is
  // spread over a local copy, so an unconditional key would push `null` over
  // a uid the local record already carries — re-identifying an assessment a
  // customer may have paid against. Absent means the cloud has nothing to say.
  if (a.assessment_uid) out.assessmentUid = a.assessment_uid
  // Emitted ONLY when the cloud actually has one. This object is spread
  // over a local copy, so an unconditional key would push `null` onto a
  // report whose acknowledgement had not synced up yet — silently
  // destroying the one record of a professional judgement. Absent means
  // "the cloud has nothing to say", not "there was no acknowledgement".
  const ack = normalizeAcknowledgement(a.calibration_acknowledgement)
  if (ack) out.calibrationAcknowledgement = ack
  return out
}

/** The report-index entry fullSync derives from a cloud row (no photos). */
export function indexEntryFromRow(a) {
  const p = (a.payload && typeof a.payload === 'object') ? a.payload : {}
  const entry = {
    id: a.id,
    ts: a.finalized_at ?? p.ts ?? a.updated_at,
    facility: a.facility_name ?? p.building?.fn ?? null,
    findings: null,
    attention: null,
  }
  if (Array.isArray(p.zoneScores) && p.zoneScores.length) {
    const c = countFindings(p.zoneScores)
    entry.findings = c.total
    entry.attention = c.attention
    entry.worstSeverity = worstFindingSeverity(p.zoneScores)
  } else {
    const census = p.census ?? p.comp ?? legacyComposite(a)
    if (census && census.findings && typeof census.findings === 'object') {
      entry.findings = census.findings.total ?? null
      entry.attention = census.findings.attention ?? null
    }
  }
  return entry
}

/** Display name for a fresh profile row — `profiles.name` is NOT NULL. */
export function deriveProfileName(user, email) {
  const md = (user && user.user_metadata) || {}
  for (const k of ['name', 'full_name', 'display_name']) {
    if (typeof md[k] === 'string' && md[k].trim()) return md[k].trim()
  }
  const addr = String(email || (user && user.email) || '')
  const local = addr.split('@')[0].trim()
  return local || 'New user'
}

/** Columns the client must never write on `profiles` (server-owned). */
const PROFILE_SERVER_COLUMNS = Object.freeze(['plan', 'credits_remaining'])

/** The row saveProfile upserts. Exported so the test can pin that the
 *  server-owned billing columns never ride along. */
export function toProfileRow(userId, profile) {
  const row = {
    id: userId,
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
    // Habit-loop PR 1 + PR 2: email preferences JSONB drives
    // the reassessment + calibration-expiry cron opt-outs.
    // Default-on is enforced server-side via migration 019;
    // we forward the field only when the SPA has it set so
    // we don't overwrite the server default with `undefined`.
    ...(profile.email_preferences ? { email_preferences: profile.email_preferences } : {}),
  }
  for (const c of PROFILE_SERVER_COLUMNS) delete row[c]
  return row
}

/** The row saveAssessment upserts. Exported for the wire-shape tests. */
export function toAssessmentRow(assessment, userId, opts = {}) {
  // Lifecycle + the legacy status column, written together. The
  // legacy column keeps its 'draft' | 'complete' vocabulary
  // because six read sites (and every older client) split
  // drafts from reports on it; report_status carries the real
  // four-state lifecycle. toLegacyStatus is total, so the two
  // can never disagree.
  const lifecycle = resolveLifecycle(assessment)
  const status = assessment.status || toLegacyStatus(lifecycle.status)
  const isFinal = lifecycle.status === REPORT_STATUS.FINAL || status === 'complete'
  const row = {
    id: assessment.id,
    user_id: userId,
    status,
    report_profile: lifecycle.profile,
    report_status: lifecycle.status,
    // Instrument-exception record. Null when the assessment was
    // finalized with complete calibration metadata — which is
    // the true statement, not a missing value.
    calibration_acknowledgement:
      normalizeAcknowledgement(assessment.calibrationAcknowledgement) || null,
    facility_name: assessment.building?.fn || assessment.bldg?.fn,
    facility_address: assessment.building?.fl || assessment.bldg?.fl,
    presurvey: assessment.presurvey || {},
    building: assessment.building || assessment.bldg || {},
    zones: assessment.zones || [],
    zone_scores: assessment.zoneScores,
    osha_evals: assessment.oshaEvals,
    recommendations: assessment.recs,
    sampling_plan: assessment.samplingPlan,
    causal_chains: assessment.causalChains,
    narrative: assessment.narrative,
    // `score` / `risk` / `composite` rode here until v3.0. The columns
    // are kept and their existing data is untouched — an issued report's
    // record is the only evidence of what it said — but nothing writes
    // them any more. The v3 finding census lives in `payload.census`.
    //
    // The assessment's durable identity. It also rides inside
    // `payload`, so the round-trip works without this column — but it
    // needs to be a real column for the server to bind on: a
    // client-minted uid means nothing until a row proves this user
    // owns it. See src/billing/assessmentUid.js.
    assessment_uid: assessment.assessmentUid || null,
    // The report date, stored once at finalize (migration 034) so a
    // later re-save cannot move it. Cleared when the record is a draft.
    finalized_at: isFinal
      ? (assessment.finalizedAt || assessment.ts || new Date().toISOString())
      : null,
    // Optimistic concurrency token: the cloud updated_at this device last
    // saw. Migration 034 refuses the write when the row moved on since.
    // Null means "no basis" (first push, or an explicit keep-local).
    base_updated_at: assessment.cloudUpdatedAt || null,
    // Lossless app-shape snapshot — preserves fields the flattened
    // columns drop (equipment, floorPlan, sensorData, labResults,
    // standardsManifest). fromCloudRow prefers this on the way down.
    payload: toPayload(assessment),
  }
  // Wire format for photos MUST be the inline base64 form (Supabase
  // JSONB doesn't know about our IDB refs). A local copy still waiting
  // for its photos (fullSync restore opened offline) must not push an
  // empty object over the cloud's — omit the column and the upsert
  // leaves it alone.
  if (!assessment._photosPending && !opts.omitPhotos) row.photos = assessment.photos || {}
  return row
}

/** Column list for the fullSync index pull — everything but `photos`,
 *  which is fetched per assessment on open (getAssessment). */
export const INDEX_COLUMNS = Object.freeze([
  'id', 'user_id', 'status', 'facility_name', 'facility_address',
  'presurvey', 'building', 'zones', 'zone_scores', 'composite', 'osha_evals',
  'recommendations', 'sampling_plan', 'causal_chains', 'narrative', 'payload',
  'report_profile', 'report_status', 'calibration_acknowledgement',
  'assessment_uid', 'finalized_at', 'created_at', 'updated_at',
])

/** Stamp the cloud `updated_at` an upsert returned onto the local copy so
 *  the NEXT push carries the right base_updated_at. */
async function recordCloudUpdatedAt(id, updatedAt) {
  if (!id || !updatedAt) return
  const local = await STO.get(id)
  if (!local || typeof local !== 'object') return
  if (local.cloudUpdatedAt === updatedAt) return
  const ok = await STO.set(id, { ...local, cloudUpdatedAt: updatedAt })
  if (ok === false) await noteStorageQuota()
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
    // Bootstrap a profile row immediately so the user can try AtmosFlow
    // before any payment step. `plan` and `credits_remaining` are
    // server-defaulted (migration 033) and the client may not write
    // them; `name` is NOT NULL, so derive one rather than fail the insert.
    if (result.data && result.data.user && result.data.user.id) {
      try {
        const user = result.data.user
        const userId = user.id
        const { data: existing } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle()
        if (!existing) {
          const { error } = await supabase.from('profiles').insert({
            id: userId,
            name: deriveProfileName(user, email),
            subscription_status: 'free',
            stripe_customer_id: null,
            billing_period: 'monthly',
            free_tier_signup_at: new Date().toISOString(),
          })
          if (error) console.warn('[signUp] profile bootstrap deferred:', error.code, error.message)
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

  /** The live auth user, or a typed failure. Never throws. */
  async _cloudUser() {
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error) return { user: null, error }
      const user = data && data.user
      if (!user) return { user: null, error: { code: 'no_user', message: 'No authenticated user (session expired?)' } }
      return { user, error: null }
    } catch (err) {
      return { user: null, error: { code: 'auth_exception', message: (err && err.message) || 'auth failed' } }
    }
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

  /**
   * Push a profile to the cloud. Pure transport: never queues, never
   * throws. Returns { ok: true } | { ok: false, error }.
   */
  async _pushProfile(profile) {
    if (!isOnline()) return { ok: false, error: { code: 'offline', message: 'offline' } }
    Sentry.addBreadcrumb({ category: 'profile_sync', message: 'saveProfile.start', level: 'info' })
    const { user, error: authError } = await this._cloudUser()
    if (!user) {
      Sentry.addBreadcrumb({ category: 'profile_sync', message: 'saveProfile.no_auth_user', level: 'info' })
      return { ok: false, error: authError }
    }
    try {
      const { error } = await supabase.from('profiles').upsert(toProfileRow(user.id, profile))
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
        return { ok: false, error }
      }
      Sentry.addBreadcrumb({ category: 'profile_sync', message: 'saveProfile.success', level: 'info' })
      return { ok: true }
    } catch (err) {
      Sentry.addBreadcrumb({
        category: 'profile_sync',
        message: 'saveProfile.exception',
        level: 'warning',
        data: { name: err?.name, message: err?.message },
      })
      Sentry.captureException(err, { tags: { component: 'profile_sync', op: 'saveProfile' } })
      return { ok: false, error: { code: 'exception', message: (err && err.message) || 'saveProfile failed' } }
    }
  },

  /**
   * Save locally, then push. Returns { ok: true } when the cloud write
   * landed, otherwise { ok: false, error, queued: true } — the profile
   * is queued for the next drain. `plan` / `credits_remaining` are never
   * sent (server-owned since migration 033).
   */
  async saveProfile(profile) {
    // Save locally first (instant)
    const wrote = await STO.set(KEYS.profile, profile)
    if (wrote === false) await noteStorageQuota()
    if (!isOnline()) {
      Sentry.addBreadcrumb({ category: 'profile_sync', message: 'saveProfile.offline_queued', level: 'info' })
      await this._queueSync('profile', profile)
      return { ok: false, queued: true, error: { code: 'offline', message: 'offline' }, localOk: wrote !== false }
    }
    const result = await this._pushProfile(profile)
    if (result.ok) return { ok: true, localOk: wrote !== false }
    await this._queueSync('profile', profile)
    return { ok: false, queued: true, error: result.error, localOk: wrote !== false }
  },

  // ── Assessments (offline-first) ──
  async listAssessments(status) {
    // Local index is the source of truth
    const idx = await STO.getIndex()
    if (status === 'draft') return idx.drafts || []
    if (status === 'complete') return idx.reports || []
    return [...(idx.reports||[]), ...(idx.drafts||[])]
  },

  /** The `photos` column alone, for a local copy fullSync restored
   *  without them. Null when unavailable (offline, missing row, error). */
  async _fetchCloudPhotos(id) {
    if (!isOnline()) return null
    try {
      const { data, error } = await supabase.from('assessments').select('photos').eq('id', id).maybeSingle()
      if (error || !data) return null
      return data.photos || {}
    } catch { return null }
  },

  async getAssessment(id) {
    // Local first
    let local = await STO.get(id)
    if (local) {
      // A copy restored by fullSync carries no photos yet (the index
      // pull leaves the column out); fetch them on first open.
      if (local._photosPending) {
        const cloudPhotos = await this._fetchCloudPhotos(id)
        if (cloudPhotos) {
          const compacted = await compactPhotos(cloudPhotos, id)
          const { _photosPending, ...rest } = local // eslint-disable-line no-unused-vars
          local = { ...rest, photos: compacted.photos }
          const ok = await STO.set(id, local)
          if (ok === false) await noteStorageQuota()
        }
      }
      // Expand any compact photo refs (idbId) back to inline base64 so
      // every consumer above this layer (DOCX, PrintReport, in-app
      // viewer) sees the legacy { src, ts } shape it has always seen.
      const expanded = await expandPhotos(local.photos || {})
      // `_photosPending` survives on the returned object when the photos
      // could not be fetched, so a later save omits the photos column
      // instead of pushing an empty object over the cloud's.
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
          const ok = await STO.set(id, { ...norm, photos: compacted.photos })
          if (ok === false) await noteStorageQuota()
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
      const ok = await STO.set(id, { ...norm, photos: compacted.photos })
      if (ok === false) await noteStorageQuota()
      return { ...norm }
    } catch { return null }
  },

  /**
   * Upsert one row with the two recoveries that are actually safe, each
   * keyed on the Postgres error code:
   *
   *   42703 / PGRST204 (undefined column) — the project is behind on
   *     migrations. Drop THE NAMED optional column and retry; never more
   *     than the optional set, never on any other error.
   *   23505 (unique violation on assessment_uid, migration 032) — a
   *     stale `draft-` row still carries the uid this `rpt-` row is
   *     claiming (the finalize deleted the draft locally only). Delete
   *     that draft row and retry once. Columns are NOT dropped: doing so
   *     "succeeded" by writing the report without its payload.
   *
   * A 034 conflict / immutability refusal is returned as such. Never
   * throws; never queues.
   */
  async _upsertAssessmentRow(row) {
    let columnRetries = 0
    let uniqueRetried = false
    for (;;) {
      let res
      try {
        res = await supabase.from('assessments').upsert(row).select('updated_at')
      } catch (err) {
        return { ok: false, error: { code: 'exception', message: (err && err.message) || 'upsert failed' } }
      }
      const { data, error } = res || {}
      if (!error) {
        const first = Array.isArray(data) ? data[0] : data
        return { ok: true, updatedAt: (first && first.updated_at) || null }
      }
      if (isConflictError(error)) return { ok: false, conflict: true, error }
      if (isImmutableError(error)) return { ok: false, immutable: true, error }
      if (isUndefinedColumnError(error) && columnRetries < OPTIONAL_ASSESSMENT_COLUMNS.length) {
        columnRetries++
        const col = missingColumnName(error)
        if (col && OPTIONAL_ASSESSMENT_COLUMNS.includes(col) && col in row) {
          delete row[col]
          continue
        }
        if (!col) {
          // Unparseable message — one broad retry without the optional set.
          let dropped = false
          for (const c of OPTIONAL_ASSESSMENT_COLUMNS) { if (c in row) { delete row[c]; dropped = true } }
          columnRetries = OPTIONAL_ASSESSMENT_COLUMNS.length
          if (dropped) continue
        }
        // A required column is missing: the project is too far behind
        // for this build. Surface it rather than mangle the row.
        return { ok: false, error }
      }
      if (isUniqueViolationError(error) && !uniqueRetried && row.assessment_uid) {
        uniqueRetried = true
        try {
          const { error: delErr } = await supabase
            .from('assessments')
            .delete()
            .eq('user_id', row.user_id)
            .eq('assessment_uid', row.assessment_uid)
            .neq('id', row.id)
            .like('id', 'draft-%')
          if (!delErr) continue
        } catch { /* fall through to the original error */ }
        return { ok: false, error }
      }
      return { ok: false, error }
    }
  },

  /**
   * Push an assessment (INLINE photos) to the cloud. Pure transport:
   * never queues, never throws. On success the cloud `updated_at` is
   * stamped onto the local copy as `cloudUpdatedAt`.
   */
  async _pushAssessment(assessment) {
    if (!isOnline()) return { ok: false, error: { code: 'offline', message: 'offline' } }
    const { user, error: authError } = await this._cloudUser()
    if (!user) return { ok: false, error: authError }
    const row = toAssessmentRow(assessment, user.id)
    const result = await this._upsertAssessmentRow(row)
    if (result.ok) await recordCloudUpdatedAt(assessment.id, result.updatedAt)
    return result
  },

  /** Park a refused write where a person can see it (never in the queue). */
  async _recordConflict(assessment, error, reason) {
    const list = (await STO.get(SYNC_CONFLICTS_KEY)) || []
    const entry = {
      id: assessment.id,
      facility: assessment.building?.fn || assessment.bldg?.fn || null,
      reason: reason || 'conflict',
      baseUpdatedAt: assessment.cloudUpdatedAt || null,
      detectedAt: new Date().toISOString(),
      message: (error && error.message) || null,
    }
    const next = list.filter(c => c && c.id !== assessment.id)
    next.push(entry)
    const ok = await STO.set(SYNC_CONFLICTS_KEY, next)
    if (ok === false) await noteStorageQuota()
    emitSyncStateChange()
    return entry
  },

  async _clearConflict(id) {
    const list = (await STO.get(SYNC_CONFLICTS_KEY)) || []
    const next = list.filter(c => c && c.id !== id)
    if (next.length !== list.length) {
      await STO.set(SYNC_CONFLICTS_KEY, next)
      emitSyncStateChange()
    }
  },

  /** Conflicts awaiting a decision. */
  async getConflicts() {
    const list = (await STO.get(SYNC_CONFLICTS_KEY)) || []
    return Array.isArray(list) ? list.filter(Boolean) : []
  },

  /**
   * Settle a conflict. 'keep_cloud' pulls the cloud copy over local;
   * 'keep_local' pushes the local copy WITHOUT a base (an explicit
   * overwrite). Returns { ok } | { ok: false, error }.
   */
  async resolveConflict(id, resolution) {
    if (resolution === 'keep_cloud') {
      const remote = await this.getRemoteAssessment(id)
      if (!remote) return { ok: false, error: { code: 'unavailable', message: 'Cloud copy unavailable' } }
      await this._clearConflict(id)
      return { ok: true }
    }
    if (resolution === 'keep_local') {
      const local = await this.getAssessment(id)
      if (!local) return { ok: false, error: { code: 'missing', message: 'No local copy' } }
      const result = await this._pushAssessment({ ...local, cloudUpdatedAt: null })
      if (!result.ok) return result
      await this._clearConflict(id)
      return { ok: true }
    }
    return { ok: false, error: { code: 'bad_resolution', message: `Unknown resolution: ${resolution}` } }
  },

  /**
   * Move an issued report back to draft in the cloud so its content may
   * change (migration 034 rejects edits to a reviewed/final row). Call
   * this when a user deliberately re-opens a report to fix it.
   */
  async reopenAssessment(id) {
    if (!isOnline()) return { ok: false, error: { code: 'offline', message: 'offline' } }
    try {
      const { error } = await supabase
        .from('assessments')
        .update({ report_status: REPORT_STATUS.DRAFT })
        .eq('id', id)
      if (error) return { ok: false, error }
      await this._clearConflict(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'exception', message: (err && err.message) || 'reopen failed' } }
    }
  },

  /**
   * Save locally (compacted photos), update the index, push to the cloud.
   *
   * Returns:
   *   { ok: true, assessment }
   *   { ok: false, queued: true, error }    — retried on the next drain
   *   { ok: false, conflict: true, error }  — parked in conflicts (034)
   *   { ok: false, immutable: true, error } — parked; reopenAssessment first
   * Plus `localOk: false` when localStorage refused the write (quota).
   */
  async saveAssessment(assessment) {
    // Compact photos before localStorage write — inline base64 blobs
    // get offloaded to IndexedDB so localStorage doesn't hit its
    // 5–10 MB quota on photo-heavy assessments. Falls through silently
    // when IndexedDB is unavailable (private browsing, etc.).
    const compactResult = await compactPhotos(assessment.photos || {}, assessment.id)
    const localCopy = { ...assessment, photos: compactResult.photos }
    const wrote = await STO.set(assessment.id, localCopy)
    if (wrote === false) await noteStorageQuota()
    const localOk = wrote !== false
    // Update local index
    if (assessment.status === 'complete') {
      await STO.addReportToIndex({
        id: assessment.id,
        ts: assessment.ts || new Date().toISOString(),
        facility: assessment.building?.fn || assessment.bldg?.fn,
      })
    } else {
      await STO.addDraftToIndex({
        id: assessment.id,
        facility: assessment.building?.fn || assessment.bldg?.fn || 'Untitled',
        ua: new Date().toISOString(),
      })
    }
    if (!isOnline()) {
      await this._queueSync('assessment', localCopy)
      return { ok: false, queued: true, error: { code: 'offline', message: 'offline' }, localOk, assessment }
    }
    // Sync to cloud — wire format MUST be the inline base64 form.
    // `assessment.photos` is already inline as received; reuse it.
    const result = await this._pushAssessment(assessment)
    if (result.ok) {
      await this._clearConflict(assessment.id)
      return { ok: true, localOk, assessment }
    }
    if (result.conflict) {
      await this._recordConflict(assessment, result.error, 'conflict')
      return { ok: false, conflict: true, error: result.error, localOk, assessment }
    }
    if (result.immutable) {
      await this._recordConflict(assessment, result.error, 'immutable')
      return { ok: false, immutable: true, error: result.error, localOk, assessment }
    }
    // Everything else — network, RLS, expired session (no user) — is
    // retried later. The COMPACTED copy is queued; the drain re-expands.
    await this._queueSync('assessment', localCopy)
    return { ok: false, queued: true, error: result.error, localOk, assessment }
  },

  /** Cloud delete. Pure transport: { ok } | { ok: false, error }. */
  async _pushDelete(id) {
    if (!isOnline()) return { ok: false, error: { code: 'offline', message: 'offline' } }
    try {
      const { error } = await supabase.from('assessments').delete().eq('id', id)
      if (error) return { ok: false, error }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: { code: 'exception', message: (err && err.message) || 'delete failed' } }
    }
  },

  async deleteAssessment(id) {
    await STO.del(id)
    await STO.removeFromIndex(id, 'rpt')
    await STO.removeFromIndex(id, 'dft')
    // Purge any IndexedDB-stored photos for this assessment so deleted
    // assessments don't leak blob storage. Best-effort; never throws.
    try { await purgeAssessmentPhotos(id) } catch { /* ignore */ }
    await this._clearConflict(id)
    if (!isOnline()) {
      await this._queueSync('delete', { id })
      return { ok: false, queued: true, error: { code: 'offline', message: 'offline' } }
    }
    const result = await this._pushDelete(id)
    if (result.ok) return { ok: true }
    await this._queueSync('delete', { id })
    return { ok: false, queued: true, error: result.error }
  },

  // ── Sync Queue (for offline changes) ──
  /**
   * Enqueue a write. ONE slot per target: a second save of the same
   * assessment REPLACES the first (an autosave every 1.2 s used to append
   * a full copy each time), and a delete supersedes any pending save of
   * that id. The profile has a single slot.
   */
  async _queueSync(type, data) {
    const queue = (await STO.get(SYNC_QUEUE_KEY)) || []
    const id = data && data.id
    const sameSlot = (item) => {
      if (!item) return true
      if (type === 'profile') return item.type === 'profile'
      return (item.type === 'assessment' || item.type === 'delete') && item.data && item.data.id === id
    }
    const next = queue.filter(item => !sameSlot(item))
    next.push({ type, data, queuedAt: new Date().toISOString() })
    const ok = await STO.set(SYNC_QUEUE_KEY, next)
    if (ok === false) await noteStorageQuota()
    emitSyncStateChange()
    return ok !== false
  },

  /**
   * Drain the offline sync queue. Updates SYNC_STATE_KEY with attempt
   * + outcome timestamps so the UI can show "last synced N min ago"
   * and so a periodic trigger (every minute, on tab focus, on the
   * online event) can be safely no-op when the queue is empty.
   *
   * Concurrent calls are guarded by an in-memory single-flight
   * timestamp (stale after DRAIN_STALE_MS) so two triggers (e.g. online
   * event + periodic interval firing close together) don't double-
   * process — and a tab killed mid-drain cannot wedge the next one.
   *
   * Items are pushed DIRECTLY (never through saveAssessment /
   * saveProfile, which would re-enqueue on failure and grow the queue
   * from inside its own drain). Failures stay in `remaining`; a 034
   * conflict or immutability refusal moves to the conflicts list.
   */
  async processSyncQueue() {
    if (!isOnline()) return
    if (drainInFlight()) return
    const queue = (await STO.get(SYNC_QUEUE_KEY)) || []
    if (!queue.length) return

    drainStartedAt = Date.now()
    const state = await readSyncState()
    const startedAt = new Date().toISOString()
    await STO.set(SYNC_STATE_KEY, { ...state, inFlight: false, lastAttempt: startedAt })
    emitSyncStateChange()

    const remaining = []
    let lastError = null
    try {
      let halted = false
      for (const item of queue) {
        if (!item || typeof item !== 'object') continue
        if (halted) { remaining.push(item); continue }
        let result
        try {
          if (item.type === 'profile') {
            result = await this._pushProfile(item.data)
          } else if (item.type === 'assessment') {
            // The queue holds the COMPACTED copy; the wire needs inline photos.
            const expanded = await expandPhotos((item.data && item.data.photos) || {})
            const assessment = { ...item.data, photos: expanded.photos }
            result = await this._pushAssessment(assessment)
            if (result.conflict) { await this._recordConflict(assessment, result.error, 'conflict'); continue }
            if (result.immutable) { await this._recordConflict(assessment, result.error, 'immutable'); continue }
          } else if (item.type === 'delete') {
            result = await this._pushDelete(item.data && item.data.id)
          } else {
            continue // unknown type — drop rather than retry forever
          }
        } catch (err) {
          result = { ok: false, error: { code: 'exception', message: (err && err.message) || 'sync_failed' } }
        }
        if (result && result.ok) continue
        remaining.push(item)
        // Keep the most recent error so the indicator can surface it.
        lastError = errorSummary(result && result.error)
        // No session → every later item fails the same way; stop here so
        // the drain is cheap and the queue is preserved intact.
        if (result && result.error && (result.error.code === 'no_user' || result.error.code === 'offline')) halted = true
      }
    } finally {
      drainStartedAt = null
    }
    const wroteQueue = await STO.set(SYNC_QUEUE_KEY, remaining)
    if (wroteQueue === false) await noteStorageQuota()

    const finishedAt = new Date().toISOString()
    const prior = await readSyncState()
    const nextState = {
      ...prior,
      inFlight: false,
      lastAttempt: startedAt,
      lastSuccess: remaining.length === 0 ? finishedAt : (state.lastSuccess || null),
      lastError: remaining.length === 0
        ? (prior.lastError === 'storage_quota' && wroteQueue === false ? 'storage_quota' : null)
        : (lastError || state.lastError || 'partial_drain'),
    }
    if (remaining.length === 0 && wroteQueue !== false) quotaErrorAt = null
    await STO.set(SYNC_STATE_KEY, nextState)
    emitSyncStateChange()
  },

  /**
   * Read-only snapshot of sync queue + state. Used by the PendingSync
   * indicator and the useSyncState hook to render reactively. Safe to
   * call from anywhere — never touches the network.
   *
   * Returns:
   *   queueDepth    — count of items waiting to sync (0 when caught up)
   *   inFlight      — true while processSyncQueue is mid-drain
   *   lastAttempt   — ISO timestamp of the last drain attempt, or null
   *   lastSuccess   — ISO timestamp of the last fully successful drain, or null
   *   lastError     — error message from the most recent partial drain,
   *                   or 'storage_quota' when localStorage refused a write
   *   conflicts     — assessments whose push was refused (034); see
   *                   getConflicts / resolveConflict
   *   conflictCount — conflicts.length
   *   online        — navigator.onLine AND supabase is configured
   */
  async getSyncState() {
    const queue = (await STO.get(SYNC_QUEUE_KEY)) || []
    const state = await readSyncState()
    const conflicts = await this.getConflicts()
    return {
      queueDepth: queue.length,
      inFlight: drainInFlight(),
      lastAttempt: state.lastAttempt || null,
      lastSuccess: state.lastSuccess || null,
      lastError: state.lastError || (quotaErrorAt ? 'storage_quota' : null),
      conflicts,
      conflictCount: conflicts.length,
      online: isOnline(),
    }
  },

  /** Convenience accessor — queueDepth alone, no full state read. */
  async getQueueDepth() {
    const queue = await STO.get(SYNC_QUEUE_KEY) || []
    return queue.length
  },

  /**
   * One page of the user's assessments, without `photos`. A column this
   * build knows about but the project has not migrated yet is dropped
   * from the select by name and the page re-requested.
   */
  async _selectAssessmentPage(userId, columns, from, to) {
    let cols = columns.slice()
    for (let attempt = 0; attempt <= OPTIONAL_ASSESSMENT_COLUMNS.length; attempt++) {
      const { data, error } = await supabase
        .from('assessments')
        .select(cols.join(','))
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .range(from, to)
      if (!error) return { rows: data || [], columns: cols }
      const col = isUndefinedColumnError(error) ? missingColumnName(error) : null
      if (col && cols.includes(col) && col !== 'id') { cols = cols.filter(c => c !== col); continue }
      throw Object.assign(new Error(error.message || 'select failed'), { code: error.code })
    }
    throw new Error('select failed: too many missing columns')
  },

  // ── Full sync (pull cloud data to local) ──
  async fullSync() {
    if (!isOnline()) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // Sync profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (profile) {
        const ok = await STO.set(KEYS.profile, profile)
        if (ok === false) await noteStorageQuota()
      }
      // Sync assessments — explicit columns (no photos; they are fetched
      // per assessment on open), paged so PostgREST's 1,000-row cap
      // cannot silently truncate a busy account's history.
      const rows = []
      let columns = INDEX_COLUMNS.slice()
      for (let from = 0; ; from += SYNC_PAGE_SIZE) {
        const page = await this._selectAssessmentPage(user.id, columns, from, from + SYNC_PAGE_SIZE - 1)
        columns = page.columns
        rows.push(...page.rows)
        if (page.rows.length < SYNC_PAGE_SIZE) break
      }
      // Local copies with an unsynced change are left alone: the pending
      // push carries base_updated_at and the 034 check decides, rather
      // than the pull silently discarding the offline edit (audit H5).
      const queue = (await STO.get(SYNC_QUEUE_KEY)) || []
      const pendingIds = new Set(queue.filter(i => i && i.type === 'assessment' && i.data).map(i => i.data.id))
      const conflicts = await this.getConflicts()
      for (const c of conflicts) pendingIds.add(c.id)
      for (const a of rows) {
        if (pendingIds.has(a.id)) continue
        // Map cloud → app shape and merge over any existing local copy so
        // local-only fields (equipment, floorPlan, draft progress) survive
        // a re-sync.
        const existing = await STO.get(a.id)
        const norm = fromCloudRow(a)
        delete norm.photos // not selected — keep whatever local holds
        const next = { ...(existing || {}), ...norm }
        // Photos are fetched lazily by getAssessment when there is no
        // local copy, or when the cloud row moved on since this device
        // last saw it. A legacy local copy with no cloud stamp keeps its
        // photos — they may be the only copy of an unsynced edit.
        const cloudMoved = !!(existing && existing.cloudUpdatedAt && a.updated_at && existing.cloudUpdatedAt !== a.updated_at)
        if (!existing || cloudMoved) {
          next._photosPending = true
          if (!existing) next.photos = {}
        }
        const ok = await STO.set(a.id, next)
        if (ok === false) await noteStorageQuota()
      }
      // Rebuild local index
      const reports = rows.filter(a => a.status === 'complete').map(indexEntryFromRow)
      const drafts = rows.filter(a => a.status === 'draft').map(a => ({ id: a.id, facility: a.facility_name, ua: a.updated_at }))
      await STO.saveIndex({ reports, drafts })
      // Process any pending offline changes
      await this.processSyncQueue()
    } catch (e) {
      console.warn('Sync failed:', e)
    }
  },
}

// A persisted `inFlight: true` from a build that stored the flag is a
// dead tab's leftover, never a live drain. Clear it once on load.
async function clearPersistedInFlight() {
  try {
    const state = await STO.get(SYNC_STATE_KEY)
    if (state && typeof state === 'object' && state.inFlight) {
      await STO.set(SYNC_STATE_KEY, { ...state, inFlight: false })
    }
  } catch { /* nothing to clear */ }
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  clearPersistedInFlight()
  window.addEventListener('online', () => {
    SupaStorage.processSyncQueue()
  })
}

export default SupaStorage
