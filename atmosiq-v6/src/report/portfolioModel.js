/**
 * AtmosFlow — Portfolio Summary model.
 *
 * A PURE aggregator that rolls the dashboard's per-assessment signals up into
 * a practice / book-of-work view: how many assessments and sites, the
 * distribution of risk bands, a per-site status table, and an "attention
 * queue" (overdue reassessments, calibration status, stale drafts). It is the
 * portfolio-level sibling of `assembleRenderModel` — same model-first shape, so
 * a DOCX or PDF renderer only lays out what this returns and never re-derives.
 *
 * Deterministic and side-effect-free: pass `now` to pin the clock (tests do),
 * and it reuses the single sources of truth the rest of the app reads —
 * `getRiskBand` for score→band and `getCalibrationBannerState` for instrument
 * currency — so the report can never drift from the dashboard.
 *
 * Positioning: this is an internal practice-management / client-portfolio
 * summary of SCREENING assessments. It carries ONE plain scope statement (in
 * `limitations`); each site's own assessment report remains the authoritative
 * record. It makes no new cross-site determination or causation.
 */

import { getRiskBand, RISK_BANDS } from '../engines/riskBands'
import { getCalibrationBannerState } from '../utils/instrumentRegistry'

const DAY = 86400000
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function toDate(v) {
  if (!v) return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const daysBetween = (a, b) => Math.floor((a.getTime() - b.getTime()) / DAY)

function fmtDate(v) {
  const d = toDate(v)
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}

/** Worst band first (CRITICAL → LOW), with INSUFFICIENT last — the order the
 * distribution and the site table both sort by. */
const BANDS_WORST_FIRST = [...RISK_BANDS].sort((a, b) => b.severity - a.severity)
const INSUFFICIENT = getRiskBand(null)

/**
 * Build the portfolio summary model.
 *
 * @param {object} input
 * @param {Array<{id,ts,facility,score}>} input.reports  finalized-report index meta
 * @param {Array<{id,facility,ua,ts}>}   [input.drafts]  in-progress draft index meta
 * @param {Array<object>}                [input.sites]   site-library records (reassessment cadence)
 * @param {object}                       [input.records] id → full assessment record (for site_id linkage)
 * @param {object}                       [input.profile] user profile (instrument calibration fields)
 * @param {string}                       [input.firm]    issuing firm name
 * @param {string}                       [input.periodLabel] e.g. 'All assessments' / 'Q3 2026'
 * @param {number}                       [input.priorFinalized] finalized count in the prior period (for a delta)
 * @param {number}                       [input.staleDraftDays=14] a draft older than this counts as stale
 * @param {string}                       [input.reportId]
 * @param {Date|string|number}           [input.now]     clock, for determinism
 * @returns {object} the portfolio model
 */
export function assemblePortfolioModel(input = {}) {
  const now = toDate(input.now) || new Date()
  const reports = (Array.isArray(input.reports) ? input.reports : []).filter(Boolean)
  const drafts = (Array.isArray(input.drafts) ? input.drafts : []).filter(Boolean)
  const sites = (Array.isArray(input.sites) ? input.sites : []).filter(Boolean)
  const records = input.records || {}
  const profile = input.profile || {}
  const firm = input.firm || 'Prudence EHS'
  const staleDraftDays = num(input.staleDraftDays) ?? 14

  // ── Per-site grouping ─────────────────────────────────────────────────────
  // Key a report to a site by its record's site_id when available, else by
  // facility name (case-folded). Each group keeps its latest report.
  const siteKey = (r) => {
    const rec = records[r.id]
    const sid = rec && rec.site_id
    return sid ? `id:${sid}` : `name:${String(r.facility || 'Unknown').trim().toLowerCase()}`
  }
  const groups = new Map()
  for (const r of reports) {
    const key = siteKey(r)
    const ts = toDate(r.ts)
    const g = groups.get(key) || { key, facility: r.facility || 'Unknown site', count: 0, latest: null, latestTs: null, siteId: null }
    g.count += 1
    const rec = records[r.id]
    if (rec && rec.site_id) g.siteId = rec.site_id
    if (!g.latestTs || (ts && ts > g.latestTs)) {
      g.latest = r
      g.latestTs = ts
      g.facility = r.facility || g.facility
    }
    groups.set(key, g)
  }

  // Match a group to a site-library record (by id, then name).
  const siteById = new Map(sites.filter((s) => s.id).map((s) => [`id:${s.id}`, s]))
  const siteByName = new Map(sites.filter((s) => s.name).map((s) => [String(s.name).trim().toLowerCase(), s]))
  const matchSite = (g) =>
    (g.siteId && siteById.get(`id:${g.siteId}`)) || siteByName.get(String(g.facility).trim().toLowerCase()) || null

  const siteRows = [...groups.values()]
    .map((g) => {
      const score = g.latest ? num(g.latest.score) : null
      const band = getRiskBand(score)
      const daysSince = g.latestTs ? daysBetween(now, g.latestTs) : null
      const site = matchSite(g)
      const due = site ? reassessmentStatus(site, now) : null
      return {
        facility: g.facility,
        assessments: g.count,
        lastAssessed: g.latestTs ? fmtDate(g.latestTs) : '—',
        daysSince,
        score,
        band: { id: band.id, label: band.label, color: band.color },
        severity: band.severity,
        reassessment: due,
      }
    })
    .sort((a, b) => b.severity - a.severity || (b.daysSince ?? -1) - (a.daysSince ?? -1) || a.facility.localeCompare(b.facility))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const scores = reports.map((r) => num(r.score)).filter((n) => n !== null)
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
  const distinctSites = groups.size
  const priorFinalized = num(input.priorFinalized)
  const kpis = {
    assessmentsFinalized: reports.length,
    distinctSites,
    draftsInProgress: drafts.length,
    scoredCount: scores.length,
    avgScore,
    avgScoreBand: avgScore === null ? null : (() => { const b = getRiskBand(avgScore); return { id: b.id, label: b.label, color: b.color } })(),
    priorFinalized,
    deltaFinalized: priorFinalized === null ? null : reports.length - priorFinalized,
  }

  // ── Risk-band distribution (worst first, INSUFFICIENT last) ────────────────
  const counts = new Map()
  for (const r of reports) counts.set(getRiskBand(num(r.score)).id, (counts.get(getRiskBand(num(r.score)).id) || 0) + 1)
  const total = reports.length || 1
  const riskDistribution = [...BANDS_WORST_FIRST, INSUFFICIENT]
    .map((b) => {
      const count = counts.get(b.id) || 0
      return { id: b.id, label: b.label, color: b.color, count, pct: Math.round((count / total) * 100) }
    })
    .filter((row) => row.count > 0)

  // ── Attention queue ────────────────────────────────────────────────────────
  const overdueReassessments = siteRows
    .filter((row) => row.reassessment && row.reassessment.overdue)
    .map((row) => ({ facility: row.facility, dueLabel: row.reassessment.label, daysOverdue: row.reassessment.daysOverdue }))
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))

  const calState = getCalibrationBannerState(profile.iaq_meter, profile.iaq_cal_date, now)
  const calibration = calState ? { kind: calState.kind, tone: calState.tone, message: calState.message } : null

  const staleDrafts = drafts
    .map((d) => {
      const t = toDate(d.ua) || toDate(d.ts)
      const daysStale = t ? daysBetween(now, t) : null
      return { facility: d.facility || 'Untitled draft', daysStale }
    })
    .filter((d) => d.daysStale !== null && d.daysStale >= staleDraftDays)
    .sort((a, b) => (b.daysStale ?? 0) - (a.daysStale ?? 0))

  const attentionQueue = { overdueReassessments, calibration, staleDrafts }
  const hasAttention = overdueReassessments.length > 0 || !!calibration || staleDrafts.length > 0

  return {
    meta: {
      docTitle: `AtmosFlow — IAQ Portfolio Summary`,
      reportTitle: 'IAQ Portfolio Summary',
      firm,
      generatedLabel: fmtDate(now),
      periodLabel: input.periodLabel || 'All assessments',
      portfolioScope: `${distinctSites} site${distinctSites === 1 ? '' : 's'} · ${reports.length} assessment${reports.length === 1 ? '' : 's'}`,
      reportId: input.reportId || null,
    },
    kpis,
    riskDistribution,
    siteRows,
    attentionQueue,
    hasAttention,
    isEmpty: reports.length === 0 && drafts.length === 0,
    limitations: [
      'This portfolio summary aggregates IAQ assessments completed in AtmosFlow for internal practice management and client-portfolio review. Each site’s individual assessment report — with its measurements, findings, and limitations — remains the authoritative record.',
    ],
  }
}

/**
 * Reassessment status for a site-library record, relative to `now`.
 * Mirrors the SiteLibraryPanel `nextDueLabel` phrasing.
 */
function reassessmentStatus(site, now) {
  if (!site || site.disabled_at) return null
  const due = toDate(site.next_due_at)
  if (!due) return { label: 'No reminder scheduled', overdue: false, daysOverdue: null }
  const daysPast = daysBetween(now, due) // positive → due date is in the past
  if (daysPast >= 0) return { label: `Reassessment due (${fmtDate(due)})`, overdue: true, daysOverdue: daysPast }
  const inDays = -daysPast
  if (inDays < 60) return { label: `Due in ${inDays} days (${fmtDate(due)})`, overdue: false, daysOverdue: null }
  return { label: `Due ${fmtDate(due)}`, overdue: false, daysOverdue: null }
}
