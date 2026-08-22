/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * assessmentVerdict — one answer to "what does this assessment conclude".
 *
 * Pure and deterministic; reads scoring OUTPUT only and computes nothing the
 * engine computes. It exists because every surface used to re-derive its own
 * verdict from comp.tot, which let them disagree:
 *
 *   • A finding marked critical zeroes its category but leaves the other four
 *     intact, so the zone can land in the MODERATE band and the composite
 *     stay >= 70. The card then read "Conditions within acceptable range"
 *     while professional-opinion.ts, seeing the same critical finding, told
 *     the report "conditions warrant corrective action".
 *   • Escalation triggers were evaluated only on the export path, so
 *     "continue routine monitoring" could render beside an exported report
 *     carrying "investigate potential combustion source immediately".
 *   • Insufficient categories were flagged by the engine and ignored by the
 *     UI, so partial data read as clean.
 *
 * The rule here USED to be "the composite is a FLOOR, never a ceiling": the
 * verdict started at the composite's band and could only be raised from
 * there. Engine v3.0 removed the composite, and with it the floor. A verdict
 * now starts at `pass` and is raised by what was FOUND — a finding, or an
 * escalation trigger.
 *
 * That is a real change and it moves in one direction only: an assessment
 * whose composite happened to land under 70 but that produced nothing above
 * a `low` finding now reads "Within Acceptable Range" where it once read
 * "Moderate Concern". A verdict can only move DOWN, never up, and only for
 * an assessment that had nothing to point at. Nothing that was found gets
 * quieter; a floor derived from a number nobody could explain stopped
 * speaking. See `tests/components/assessment-verdict.test.ts`, whose first
 * describe block is named for the rule this replaced.
 *
 * Contact: tsidi@prudenceehs.com
 */

/**
 * Severities the engine treats as findings (client.ts filters out only
 * `pass` and `info`). Counting anything else — or counting `pass` rows as
 * findings, as the zone list used to — makes the headline and the count
 * contradict each other.
 */
export const FINDING_SEVERITIES = ['critical', 'high', 'medium', 'low']

/** Severities strong enough to name a driver. See primaryDriver.js. */
export const ATTENTION_SEVERITIES = ['critical', 'high', 'medium']

const RANK = { pass: 0, low: 0, medium: 1, high: 2, critical: 3 }
const BY_RANK = ['pass', 'medium', 'high', 'critical']
// Reverse lookup that preserves `low` — BY_RANK maps rank 0 to 'pass', which
// is right for a verdict band and wrong for naming a finding's own severity.
const BY_RANK_FULL = ['low', 'medium', 'high', 'critical']

export function isFinding(row) {
  return !!row && FINDING_SEVERITIES.includes(row.sev)
}

/** Count real findings across zones. `attention` is the medium+ subset. */
export function countFindings(zoneScores) {
  const out = { total: 0, attention: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0 } }
  for (const z of zoneScores || []) {
    for (const c of z?.cats || []) {
      for (const r of c?.r || []) {
        if (!isFinding(r)) continue
        out.total += 1
        out.bySeverity[r.sev] += 1
        if (ATTENTION_SEVERITIES.includes(r.sev)) out.attention += 1
      }
    }
  }
  return out
}

/**
 * Index of the zone carrying the worst finding, or 0 when there are none.
 *
 * Callers used to find this with `reduce((a, b) => a.tot < b.tot ? a : b)`
 * — the lowest-scoring zone. With no score, the zone that matters is the
 * one holding the most severe finding. Ties go to the first, so the
 * answer is stable for a given input.
 */
export function worstZoneIndex(zoneScores) {
  let best = 0
  let bestRank = -1
  ;(zoneScores || []).forEach((z, i) => {
    const sev = worstFindingSeverity([z])
    const rank = sev ? RANK[sev] ?? -1 : -1
    if (rank > bestRank) { bestRank = rank; best = i }
  })
  return best
}

/**
 * The category label carrying the worst finding across all zones, or null.
 *
 * Replaces "the category with the lowest score ratio" (`a.s / a.mx`),
 * which the report used to name as the primary area of concern. That was
 * a different question from the one it claimed to answer: a category can
 * lose most of its points to several medium findings while another holds
 * a single critical one, and the ratio names the first. What a reader
 * wants is where the worst thing found is.
 *
 * Ties go to the first category encountered, so the answer is stable for
 * a given input rather than dependent on iteration order.
 */
export function worstFindingCategory(zoneScores) {
  let best = null
  let bestRank = -1
  for (const z of zoneScores || []) {
    for (const c of z?.cats || []) {
      for (const r of c?.r || []) {
        if (!isFinding(r)) continue
        const rank = RANK[r.sev] ?? -1
        if (rank > bestRank) { bestRank = rank; best = c.l }
      }
    }
  }
  return best
}

/**
 * The Complaints category is capped when it escalates the verdict.
 *
 * Occupant symptom reports are `occupant_report_anecdotal` evidence. A cluster
 * is urgent and must stay visible — but a self-reported symptom cannot make a
 * BUILDING CONDITION critical, and the engine's permission flags exist to stop
 * exactly that inference. Scoring rates 6+ occupants reporting symptoms as
 * `critical`, which the verdict layer then propagated to the whole assessment
 * and to the report's P1 triage — contradicting the codebase's own principle,
 * honoured by driverCat, that complaints are a symptom and not a driver.
 *
 * Capped rather than excluded: a symptom cluster still raises the verdict to
 * `high`, so it cannot be quietly dropped either.
 */
const COMPLAINT_CATEGORY = 'Complaints'
const COMPLAINT_MAX = 'high'

/** Worst finding severity present, or null. Complaints are capped. */
export function worstFindingSeverity(zoneScores) {
  let worst = null
  for (const z of zoneScores || []) {
    for (const c of z?.cats || []) {
      const cap = c?.l === COMPLAINT_CATEGORY ? RANK[COMPLAINT_MAX] : Infinity
      for (const r of c?.r || []) {
        if (!isFinding(r)) continue
        const rank = Math.min(RANK[r.sev] ?? 0, cap)
        if (worst === null || rank > RANK[worst]) worst = BY_RANK_FULL[rank]
      }
    }
  }
  return worst
}

/**
 * True when any zone or category was assessed on incomplete data.
 *
 * Took a second `comp` argument and short-circuited on its
 * `partialComposite` flag. Both are gone: the zones carry the same fact
 * first-hand, and a pre-v3.0 record's flag is not a source this reads.
 */
export function hasPartialData(zoneScores) {
  return (zoneScores || []).some(z => z?.partialScore || (z?.insufficientCats || []).length > 0)
}

const LABELS = {
  critical: 'Critical Concern',
  high: 'Significant Concern',
  medium: 'Moderate Concern',
  pass: 'Within Acceptable Range',
}

const PROSE = {
  critical: 'Building-related symptom cluster identified. Immediate corrective action recommended.',
  high: 'Targeted investigation and corrective action warranted.',
  medium: 'Targeted improvements recommended; conditions trending outside accepted range.',
  pass: 'Conditions within acceptable range; continue routine monitoring.',
}

const ACTIONS = {
  critical: 'Immediate corrective action recommended',
  high: 'Targeted investigation and corrective action warranted',
  medium: 'Targeted improvements recommended',
  pass: 'Continue routine monitoring',
}

const RISK = {
  critical: 'Critical indoor air quality concern',
  high: 'Significant indoor air quality concern',
  medium: 'Moderate indoor air quality concern',
  pass: 'Conditions within acceptable range',
}

/**
 * Resolve one verdict for the whole assessment.
 *
 * Two inputs, both of them things that were observed: the worst finding
 * recorded in any zone, and the escalation triggers. A third — the composite
 * band — was removed in v3.0; see the header for what that changed.
 *
 * @returns {{severity, label, prose, actionLabel, riskLabel, escalatedBy, findings, partialData}}
 *   `escalatedBy` names what raised the verdict above `pass` — 'finding' or
 *   'escalation' — or null when nothing did.
 */
export function resolveVerdict({ zoneScores, escalationTriggers } = {}) {
  const worstFinding = worstFindingSeverity(zoneScores)
  const fromFinding = worstFinding ? bandSeverityFromFinding(worstFinding) : 'pass'
  const fromTrigger = triggerSeverity(escalationTriggers)

  let severity = 'pass'
  let escalatedBy = null
  if (RANK[fromFinding] > RANK[severity]) { severity = fromFinding; escalatedBy = 'finding' }
  if (RANK[fromTrigger] > RANK[severity]) { severity = fromTrigger; escalatedBy = 'escalation' }

  const partialData = hasPartialData(zoneScores)
  let prose = PROSE[severity]
  if (partialData) {
    // Never let an incomplete assessment read as a clean bill of health.
    prose += ' Some categories were assessed on incomplete data — see the data gaps noted in the report.'
  }

  return {
    severity,
    label: LABELS[severity],
    prose,
    actionLabel: ACTIONS[severity],
    riskLabel: RISK[severity],
    escalatedBy,
    findings: countFindings(zoneScores),
    partialData,
  }
}

// A `low` finding is a real finding but does not by itself move the verdict.
function bandSeverityFromFinding(sev) {
  return BY_RANK[RANK[sev] ?? 0]
}

function triggerSeverity(triggers) {
  if (!Array.isArray(triggers) || triggers.length === 0) return 'pass'
  if (triggers.some(t => t?.severity === 'critical')) return 'critical'
  if (triggers.some(t => t?.severity === 'high')) return 'high'
  return 'pass'
}

/**
 * Does anything actionable exist, across EVERY tier?
 *
 * The results card used to check `recs.imm` and the sampling plan only, so it
 * announced "No immediate actions identified. Continue routine monitoring"
 * directly above a "View all actions" link to the engineering and
 * administrative recommendations it had just denied.
 */
export function hasAnyAction(recs, samplingPlan, escalationTriggers) {
  const tiers = ['imm', 'eng', 'adm', 'mon']
  if (tiers.some(t => (recs?.[t] || []).length > 0)) return true
  if ((samplingPlan?.plan || []).length > 0) return true
  return (escalationTriggers || []).length > 0
}
