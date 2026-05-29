/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Portfolio digest stats — pure computation over a user's
 * audit_log rows. Backs the quarterly digest email
 * (habit-loop PR 3, scripts/cron-portfolio-digest.ts).
 *
 * Design constraints (from the Hook audit + screening-only rule):
 *   • Numbers are exact, derived from the user's own corpus.
 *     Variability comes from the user's data shifting quarter to
 *     quarter — that's the defensible form of variable reward.
 *   • No cohort comparison. The audit explicitly flagged
 *     leaderboards / public scoring as incompatible with the
 *     screening-only positioning. Per-user only.
 *   • Volume metrics only (counts). Score averages are deferred
 *     to a follow-up — they read as quality signaling without
 *     careful framing.
 *   • Eligibility: ≥ 2 assessments finalized in the quarter +
 *     account ≥ 14 days old + opt-in still set.
 */

export const DIGEST_MIN_ASSESSMENTS = 2
export const DIGEST_MIN_ACCOUNT_AGE_DAYS = 14

/** Audit log row shape this module reads. Loose by design. */
export interface AuditRow {
  action: string
  created_at: string
  target_id?: string | null
  details?: Record<string, unknown> | null
}

/** Inclusive quarter window. */
export interface QuarterWindow {
  start: Date
  end: Date
  label: string  // e.g. "Q2 2026"
}

/**
 * Compute the start and end of the quarter `now` falls into.
 * Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec. UTC.
 */
export function currentQuarter(now: Date = new Date()): QuarterWindow {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()  // 0–11
  const qIdx = Math.floor(month / 3)   // 0..3
  const startMonth = qIdx * 3
  const endMonth = startMonth + 3
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, endMonth, 1, 0, 0, 0))
  return { start, end, label: `Q${qIdx + 1} ${year}` }
}

/** Quarter immediately before `q`. Q1 wraps to prior year's Q4. */
export function priorQuarter(q: QuarterWindow): QuarterWindow {
  const start = new Date(Date.UTC(
    q.start.getUTCFullYear(),
    q.start.getUTCMonth() - 3,
    1, 0, 0, 0,
  ))
  const end = new Date(Date.UTC(
    q.start.getUTCFullYear(),
    q.start.getUTCMonth(),
    1, 0, 0, 0,
  ))
  const qIdx = Math.floor(start.getUTCMonth() / 3)
  return { start, end, label: `Q${qIdx + 1} ${start.getUTCFullYear()}` }
}

/**
 * The shape the digest template renders against. All counters are
 * integers ≥ 0; deltas are signed. JSON-serialized into
 * email_queue.payload — kept flat for readability in DB introspection.
 */
export interface DigestStats {
  quarter_label: string
  prior_label: string
  assessments_finalized: number
  assessments_finalized_prior: number
  delta_finalized: number
  reports_exported: number
  reports_exported_prior: number
  distinct_sites: number
  engine_runs: number
  // Account context — eligibility predicates can be checked
  // downstream (template just renders).
  account_age_days: number
}

function rowInWindow(row: AuditRow, q: QuarterWindow): boolean {
  const ts = new Date(row.created_at).getTime()
  return ts >= q.start.getTime() && ts < q.end.getTime()
}

/**
 * Compute the digest stats from a flat list of audit_log rows.
 * Pure / deterministic — same inputs → same outputs. The cron
 * script handles the DB query and eligibility gating; this module
 * only does math.
 */
export function computeDigestStats(args: {
  rows: AuditRow[]
  quarter: QuarterWindow
  prior: QuarterWindow
  account_created_at: string | null
  now?: Date
}): DigestStats {
  const { rows, quarter, prior, account_created_at } = args
  const now = args.now ?? new Date()

  const current = rows.filter(r => rowInWindow(r, quarter))
  const previous = rows.filter(r => rowInWindow(r, prior))

  const assessmentsFinalized = current.filter(r => r.action === 'assessment_finalized').length
  const assessmentsFinalizedPrior = previous.filter(r => r.action === 'assessment_finalized').length
  const reportsExported = current.filter(r => r.action === 'report_exported').length
  const reportsExportedPrior = previous.filter(r => r.action === 'report_exported').length
  const engineRuns = current.filter(r => r.action === 'engine_ran').length

  // distinct_sites: count distinct site_id values from
  // assessment_finalized events this quarter (only counts assessments
  // the user explicitly bound to a site library entry — matches the
  // "investment" axis from PR 1).
  const sites = new Set<string>()
  for (const r of current) {
    if (r.action !== 'assessment_finalized') continue
    const sid = r.details && typeof r.details.site_id === 'string' ? r.details.site_id : null
    if (sid) sites.add(sid)
  }

  let accountAgeDays = 0
  if (account_created_at) {
    const created = new Date(account_created_at).getTime()
    if (!Number.isNaN(created)) {
      accountAgeDays = Math.floor((now.getTime() - created) / 86400000)
    }
  }

  return {
    quarter_label: quarter.label,
    prior_label: prior.label,
    assessments_finalized: assessmentsFinalized,
    assessments_finalized_prior: assessmentsFinalizedPrior,
    delta_finalized: assessmentsFinalized - assessmentsFinalizedPrior,
    reports_exported: reportsExported,
    reports_exported_prior: reportsExportedPrior,
    distinct_sites: sites.size,
    engine_runs: engineRuns,
    account_age_days: accountAgeDays,
  }
}

/**
 * Eligibility check — the cron uses this to decide whether to call
 * enqueuePortfolioDigest. Centralized so the rule lives in one
 * place and is unit-testable.
 */
export function isDigestEligible(stats: DigestStats): boolean {
  if (stats.account_age_days < DIGEST_MIN_ACCOUNT_AGE_DAYS) return false
  if (stats.assessments_finalized < DIGEST_MIN_ASSESSMENTS) return false
  return true
}
