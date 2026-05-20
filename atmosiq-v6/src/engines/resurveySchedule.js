/**
 * AtmosFlow — Re-survey Schedule
 *
 * Pure computation: takes a recommendations register (or the legacy
 * recs shape) plus the assessment date, returns a structured
 * re-survey schedule the DOCX renderer can table out.
 *
 * Cadence is driven by the highest-severity bucket that has items:
 *
 *   Immediate (Critical / Emergency)  → 30 days
 *   Short-term (High / Engineering)   → 90 days
 *   Further evaluation (Medium / Adm) → 180 days
 *   Long-term only or no items        → 365 days
 *
 * The cadence numbers themselves are not engine math — they are
 * standard CIH follow-up guidance for screening-grade IAQ
 * assessments. CLAUDE.md "Preserve calibration gating" and "engine
 * is sacred" concerns do not apply here (no scoring, no thresholds,
 * no manifest entries). This file lives under src/engines/ (plural,
 * the orchestration layer), not src/engine/ (the TypeScript engine
 * that is off-limits).
 *
 * Pure: same inputs → same outputs. Caller injects `now` for
 * deterministic tests.
 */

export const CADENCE = Object.freeze({
  critical: { days: 30, label: '30 days', tier: 'critical' },
  high: { days: 90, label: '90 days', tier: 'high' },
  medium: { days: 180, label: '6 months', tier: 'medium' },
  low: { days: 365, label: '12 months', tier: 'low' },
})

/**
 * Extract the four bucket counts from either the v2.1 ClientReport
 * recommendationsRegister or the legacy ctx.recs shape. Both shapes
 * land here; the function normalizes them to a uniform count map.
 *
 *   v2.1 shape:  { immediate, shortTerm, furtherEvaluation, longTermOptional }
 *   legacy:      { imm,       eng,       adm,                 mon }
 */
function countBuckets(input) {
  if (!input || typeof input !== 'object') {
    return { immediate: 0, shortTerm: 0, furtherEvaluation: 0, longTermOptional: 0 }
  }
  const len = (x) => Array.isArray(x) ? x.length : 0
  return {
    immediate: len(input.immediate) || len(input.imm),
    shortTerm: len(input.shortTerm) || len(input.eng),
    furtherEvaluation: len(input.furtherEvaluation) || len(input.adm),
    longTermOptional: len(input.longTermOptional) || len(input.mon),
  }
}

function chooseCadence(counts) {
  if (counts.immediate > 0) return CADENCE.critical
  if (counts.shortTerm > 0) return CADENCE.high
  if (counts.furtherEvaluation > 0) return CADENCE.medium
  return CADENCE.low
}

function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : (plural || `${singular}s`)}`
}

function buildRationale(counts, cadence) {
  if (counts.immediate > 0) {
    return `${pluralize(counts.immediate, 'immediate-priority action')} identified. A follow-up re-survey is recommended within ${cadence.label} of remediation completion to verify resolution of the underlying conditions.`
  }
  if (counts.shortTerm > 0) {
    return `${pluralize(counts.shortTerm, 'short-term recommendation')} identified. A follow-up re-survey is recommended within ${cadence.label} of implementation to verify effectiveness of the engineering or operational controls put in place.`
  }
  if (counts.furtherEvaluation > 0) {
    return `${pluralize(counts.furtherEvaluation, 'further-evaluation item')} identified. A follow-up assessment is recommended within ${cadence.label} to revisit conditions that warrant additional characterization.`
  }
  return `No active recommendations were identified at the time of this assessment. Routine re-survey is recommended within ${cadence.label} to confirm conditions remain within acceptable ranges.`
}

/**
 * Parse a possibly-formatted assessment date string into a Date.
 * Accepts ISO-8601 ("2026-05-19"), JS-Date.toString output, and the
 * "Month D, YYYY" form that DocxReport.js emits via
 * toLocaleDateString. Returns null on unparseable input rather than
 * an Invalid Date.
 */
function parseAssessmentDate(s) {
  if (!s) return null
  if (s instanceof Date) return Number.isNaN(s.getTime()) ? null : s
  if (typeof s !== 'string') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDueDate(d) {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

/**
 * Main entry. Returns the structured schedule.
 *
 * @param {object} opts
 * @param {object} [opts.recommendations]   v2.1 recommendationsRegister or legacy ctx.recs
 * @param {string|Date} [opts.assessmentDate]  used to compute the absolute due date
 * @param {Date} [opts.now]                 injectable clock; used only when assessmentDate is missing
 * @returns {{
 *   cadence: { days: number, label: string, tier: string },
 *   dueDate: string | null,
 *   rationale: string,
 *   counts: { immediate: number, shortTerm: number, furtherEvaluation: number, longTermOptional: number },
 * }}
 */
export function computeResurveySchedule(opts = {}) {
  const counts = countBuckets(opts.recommendations)
  const cadence = chooseCadence(counts)
  const base = parseAssessmentDate(opts.assessmentDate) || opts.now || null
  let dueDate = null
  if (base) {
    const d = new Date(base.getTime())
    d.setDate(d.getDate() + cadence.days)
    dueDate = formatDueDate(d)
  }
  const rationale = buildRationale(counts, cadence)
  return { cadence, dueDate, rationale, counts }
}
