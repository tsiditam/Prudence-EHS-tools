/**
 * AtmosFlow — Portfolio Summary model.
 *
 * A PURE aggregator that rolls the dashboard's per-assessment signals up into
 * a practice / book-of-work view: how many assessments and sites, what was
 * found across them, a per-site status table, and an "attention
 * queue" (overdue reassessments, calibration status, stale drafts). It is the
 * portfolio-level sibling of `assembleRenderModel` — same model-first shape, so
 * a DOCX or PDF renderer only lays out what this returns and never re-derives.
 *
 * Deterministic and side-effect-free: pass `now` to pin the clock (tests do),
 * and it reuses the single sources of truth the rest of the app reads —
 * the report index's own finding counts and `getCalibrationBannerState` for
 * instrument currency — so the report can never drift from the dashboard.
 *
 * It was built on the risk band: an "Avg composite" KPI, a band column and a
 * band-distribution histogram. All three are now finding counts. A report
 * finalized before the score was removed carries no count, so it contributes
 * nothing to the totals and shows a dash in its row — the honest rendering,
 * since nothing recomputes an old assessment.
 *
 * Positioning: this is an internal practice-management / client-portfolio
 * summary of SCREENING assessments. It carries ONE plain scope statement (in
 * `limitations`); each site's own assessment report remains the authoritative
 * record. It makes no new cross-site determination or causation.
 */

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

/** Severity order, worst first — how the distribution and site table sort. */
const SEVERITY_ROWS = [
  { id: 'critical', label: 'Critical', color: '#B91C1C', rank: 4 },
  { id: 'high', label: 'High', color: '#B91C1C', rank: 3 },
  { id: 'medium', label: 'Medium', color: '#A16207', rank: 2 },
  { id: 'low', label: 'Low', color: '#64748B', rank: 1 },
  { id: 'none', label: 'No findings', color: '#15803D', rank: 0 },
]
const SEVERITY_BY_ID = Object.fromEntries(SEVERITY_ROWS.map((b) => [b.id, b]))
const UNASSESSED = { id: 'unassessed', label: 'Not recorded', color: '#6B7380', rank: -1 }
/** The severity row for a report-index entry, or UNASSESSED for a legacy one. */
const severityRow = (r) => {
  if (r.worstSeverity) return SEVERITY_BY_ID[r.worstSeverity] || UNASSESSED
  if (num(r.findings) === 0) return SEVERITY_BY_ID.none
  if (num(r.findings) === null) return UNASSESSED
  return SEVERITY_BY_ID.low
}

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
      const findings = g.latest ? num(g.latest.findings) : null
      const attention = g.latest ? num(g.latest.attention) : null
      const band = g.latest ? severityRow(g.latest) : UNASSESSED
      const daysSince = g.latestTs ? daysBetween(now, g.latestTs) : null
      const site = matchSite(g)
      const due = site ? reassessmentStatus(site, now) : null
      return {
        facility: g.facility,
        assessments: g.count,
        lastAssessed: g.latestTs ? fmtDate(g.latestTs) : '—',
        daysSince,
        findings,
        attention,
        band: { id: band.id, label: band.label, color: band.color },
        severity: band.rank,
        reassessment: due,
      }
    })
    .sort((a, b) => b.severity - a.severity || (b.daysSince ?? -1) - (a.daysSince ?? -1) || a.facility.localeCompare(b.facility))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const counted = reports.map((r) => num(r.findings)).filter((n) => n !== null)
  const totalFindings = counted.reduce((a, b) => a + b, 0)
  const totalAttention = reports.map((r) => num(r.attention)).filter((n) => n !== null).reduce((a, b) => a + b, 0)
  const distinctSites = groups.size
  const priorFinalized = num(input.priorFinalized)
  const kpis = {
    assessmentsFinalized: reports.length,
    distinctSites,
    draftsInProgress: drafts.length,
    assessedCount: counted.length,
    totalFindings: counted.length ? totalFindings : null,
    totalAttention: counted.length ? totalAttention : null,
    priorFinalized,
    deltaFinalized: priorFinalized === null ? null : reports.length - priorFinalized,
  }

  // ── Distribution by worst severity found (worst first) ────────────────────
  const counts = new Map()
  for (const r of reports) {
    const row = severityRow(r)
    counts.set(row.id, (counts.get(row.id) || 0) + 1)
  }
  const total = reports.length || 1
  const riskDistribution = [...SEVERITY_ROWS, UNASSESSED]
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
