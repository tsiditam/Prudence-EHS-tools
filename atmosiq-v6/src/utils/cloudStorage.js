/**
 * Cloud storage facade — single point of indirection for cloud-backed
 * auth + persistence.
 *
 * Today: re-exports SupaStorage (Supabase: auth + Postgres + Storage buckets).
 *
 * To swap backends (e.g. AWS GovCloud Cognito + RDS + S3):
 *   1. Implement the same default-export interface as SupaStorage. Method
 *      list below is the canonical contract.
 *   2. Change the import on the line marked SWAP-POINT.
 *   3. Done. No call site in the SPA needs to change.
 *
 * Interface contract — methods on the default export:
 *
 *   Auth:
 *     signUp(email, password)       → { user, ...session } | { error }
 *     signIn(email, password)       → { user, email, id, cachedAt } | { error }
 *     signOut()                     → void
 *     getUser()                     → user | null
 *     getSession()                  → session | null
 *     onAuthChange(callback)        → unsubscribe fn
 *
 *   Profile:
 *     getProfile()                  → profile | null
 *     saveProfile(profile)          → { ok: true } | { ok: false, error, queued }
 *
 *   Assessment:
 *     listAssessments(status?)      → assessment[]
 *     getAssessment(id)             → assessment | null
 *     getRemoteAssessment(id)       → assessment | null  (cloud, heals local)
 *     saveAssessment(assessment)    → { ok: true, assessment }
 *                                   | { ok: false, error, queued: true }
 *                                   | { ok: false, error, conflict: true }
 *                                   | { ok: false, error, immutable: true }
 *     deleteAssessment(id)          → { ok: true } | { ok: false, error, queued }
 *     reopenAssessment(id)          → { ok } | { ok: false, error }
 *                                     (issued report → draft so it may change)
 *
 *   Sync:
 *     processSyncQueue()            → void  (drain pending offline ops)
 *     fullSync()                    → void  (pull-down + push-up everything)
 *     getSyncState()                → { queueDepth, inFlight, lastAttempt,
 *                                       lastSuccess, lastError, conflicts,
 *                                       conflictCount, online }
 *     getConflicts()                → conflict[]
 *     resolveConflict(id, 'keep_local' | 'keep_cloud') → { ok } | { ok: false, error }
 *
 *   `ok: false` always means the CLOUD write did not land. `queued` means
 *   it will be retried on the next drain; `conflict` / `immutable` mean
 *   retrying is futile until a person decides (see getConflicts).
 *
 * Caveats for a future swap:
 *   • onAuthChange currently uses Supabase's realtime subscription model.
 *     A GovCloud impl on Cognito likely needs a polling shim — flag this
 *     when porting.
 *   • The sync queue persists pending writes in localStorage under
 *     'atmosiq-sync-queue'. A backend swap that changes the wire format
 *     should drain the queue before cutover or version-tag entries.
 */

// SWAP-POINT: change this import to swap backends.
import SupaStorage from './supabaseStorage'

const Storage = SupaStorage

export default Storage
