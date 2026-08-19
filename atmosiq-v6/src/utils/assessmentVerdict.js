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
 * The rule here: the composite is a FLOOR, never a ceiling. A verdict can be
 * escalated by a finding or a trigger; it can never be softened by a score.
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

/** Worst finding severity present, or null. */
export function worstFindingSeverity(zoneScores) {
  let worst = null
  for (const z of zoneScores || []) {
    for (const c of z?.cats || []) {
      for (const r of c?.r || []) {
        if (!isFinding(r)) continue
        if (worst === null || RANK[r.sev] > RANK[worst]) worst = r.sev
      }
    }
  }
  return worst
}

/** True when any zone or category was scored on incomplete data. */
export function hasPartialData(zoneScores, comp) {
  if (comp?.partialComposite) return true
  return (zoneScores || []).some(z => z?.partialScore || (z?.insufficientCats || []).length > 0)
}

function bandSeverity(tot) {
  if (typeof tot !== 'number') return 'pass'
  if (tot < 30) return 'critical'
  if (tot < 50) return 'high'
  if (tot < 70) return 'medium'
  return 'pass'
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
 * @returns {{severity, label, prose, actionLabel, riskLabel, escalatedBy, findings, partialData}}
 *   `escalatedBy` names what raised the verdict above the composite band —
 *   'finding' or 'escalation' — or null when the band stood on its own.
 */
export function resolveVerdict({ comp, zoneScores, escalationTriggers } = {}) {
  const fromBand = bandSeverity(comp?.tot)
  const worstFinding = worstFindingSeverity(zoneScores)
  const fromFinding = worstFinding ? bandSeverityFromFinding(worstFinding) : 'pass'
  const fromTrigger = triggerSeverity(escalationTriggers)

  let severity = fromBand
  let escalatedBy = null
  if (RANK[fromFinding] > RANK[severity]) { severity = fromFinding; escalatedBy = 'finding' }
  if (RANK[fromTrigger] > RANK[severity]) { severity = fromTrigger; escalatedBy = 'escalation' }

  const partialData = hasPartialData(zoneScores, comp)
  let prose = PROSE[severity]
  if (partialData) {
    // Never let an incomplete assessment read as a clean bill of health.
    prose += ' Some categories were scored on incomplete data — see the data gaps noted in the report.'
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
