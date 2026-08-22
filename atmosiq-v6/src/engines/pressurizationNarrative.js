/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 *
 * ── Pressurization narrative templates ────────────────────────────────
 *
 * Constrained prose for the pressurization mechanism. Every sentence
 * this module can emit is assembled here, from fragments, so the
 * language is auditable in one file rather than scattered across the
 * engine.
 *
 * Three rules, and the third is the one that keeps catching people:
 *
 *   1. The permitted attributions are "consistent with" and "a plausible
 *      mechanism for". Never "caused by", never "due to", never
 *      "responsible for". Pressurization EXPLAINS an observation; it is
 *      never asserted to have produced it.
 *
 *   2. Nothing here asserts a verdict on the pressure itself. There is
 *      no threshold to be over, so no sentence may read as though there
 *      were one — no "excessive", no "out of range", no "deficient".
 *      The phrase-template rule from CLAUDE.md, applied to a parameter
 *      that has no criterion at all: a template states the CONDITION or
 *      the LIMITATION and leaves the judgement to the reader.
 *
 *   3. "Confirmed" is on the banned-tone list unconditionally — the
 *      scanner does not read context for it. The natural sentence here
 *      ("this was not confirmed by measurement") therefore fails the
 *      linter despite saying the cautious thing, which is exactly the
 *      trap that makes a hand-written caveat riskier than a template.
 *      The wording below says "was not verified by measurement".
 *      `tests/engine/pressurization.test.ts` runs every string this
 *      module can produce through the engine's own scanner.
 */

import {
  PRESSURIZATION_ANCHOR,
  PRESSURIZATION_CONFIDENCE,
  PRESSURIZATION_FRAMING,
  PRESSURIZATION_REVIEW_LABEL,
  DOOR_AIRFLOW,
  DOOR_BEHAVIOR,
  UNIT_IN_WC,
  fromPascals,
} from '../constants/pressurizationStandards'

/** Round for display without pretending to more precision than was read. */
const show = (pa, units) => {
  const v = fromPascals(pa, units)
  if (!Number.isFinite(v)) return null
  return units === UNIT_IN_WC ? v.toFixed(3) : (Math.round(v * 10) / 10).toString()
}

/**
 * The permitted attribution clause, keyed by direction.
 *
 * "Consistent with" is the strongest link this module may draw, and it
 * is drawn to the BUILDING'S STATE ("operating under negative
 * pressure") rather than to any observation. Linking an observation to
 * a condition is what "caused by" does; this says only that the state
 * and the observation sit together, which is what was seen.
 *
 * Note the scanner interaction: "consistent with" is banned only near
 * clinical language (illness, syndrome, diagnosis, respiratory
 * condition…). Nothing in these clauses or the sentences that follow
 * them names a health condition, which is why they pass — keep it that
 * way if you extend them.
 */
const SENSE = {
  inward: 'consistent with the building operating under negative pressure',
  outward: 'consistent with the building operating under positive pressure',
}

/** "the A, the B, and the C" — an Oxford list of what the mechanism would explain. */
function joinLabels(hits) {
  const labels = hits.map((h) => h.label)
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

/**
 * The observation sentence — what was seen or read, and nothing more.
 * Returns null when there is nothing to report.
 */
export function observationSentence(a) {
  if (!a || !a.evaluated) return null
  const q = a.quantitative
  const where = q.present && q.referenceLocation ? ` at ${q.referenceLocation}` : ''

  if (a.confidence === PRESSURIZATION_CONFIDENCE.INDETERMINATE) {
    const value = show(q.valuePa, q.rawUnits)
    const tol = show(q.tolerancePa, q.rawUnits)
    return `A differential pressure of ${value} ${q.rawUnits} (building interior relative to outdoors) was recorded${where}. `
      + `That magnitude is within the stated accuracy of the instrument used (±${tol} ${q.rawUnits}), so the reading does not establish a direction of airflow. `
      + `It is reported as indeterminate rather than neutral: a neutral building is a positive statement, and this measurement does not support one.`
  }

  if (a.confidence === PRESSURIZATION_CONFIDENCE.MEASURED
    || a.confidence === PRESSURIZATION_CONFIDENCE.MEASURED_ACCURACY_UNSTATED) {
    const value = show(q.valuePa, q.rawUnits)
    const caveat = a.confidence === PRESSURIZATION_CONFIDENCE.MEASURED_ACCURACY_UNSTATED
      ? ' The accuracy of the instrument was not recorded, so the magnitude is carried as a qualitative observation rather than a quantified one.'
      : ''
    return `A differential pressure of ${value} ${q.rawUnits} (building interior relative to outdoors) was recorded${where}, ${SENSE[a.direction]}.${caveat}`
  }

  // Qualitative only.
  const dir = a.direction === DOOR_AIRFLOW.INWARD
    ? 'Air was observed flowing inward at the exterior door'
    : (a.direction === DOOR_AIRFLOW.OUTWARD
      ? 'Air was observed flowing outward at the exterior door'
      : 'Airflow at the exterior door was indeterminate')
  const sense = SENSE[a.direction] ? `, ${SENSE[a.direction]}` : ''
  const method = a.qualitative.method && a.qualitative.method !== 'not_tested'
    ? ` (${a.qualitative.method.replace(/_/g, ' ')})`
    : ''
  const behavior = a.qualitative.doorBehavior === DOOR_BEHAVIOR.PULL_SHUT_HARD
    ? ' Exterior doors were observed to pull shut hard, which is consistent with the same airflow direction.'
    : (a.qualitative.doorBehavior === DOOR_BEHAVIOR.RESIST_CLOSING
      ? ' Exterior doors were observed to resist closing, which is consistent with the same airflow direction.'
      : '')
  return `${dir}${method}${sense}.${behavior}`
}

/** The directional anchor, quoted rather than paraphrased. */
export function anchorSentence() {
  return `${PRESSURIZATION_ANCHOR.cited_by} states: "${PRESSURIZATION_ANCHOR.quote}" `
    + `This is a directional expectation only — no consensus indoor air quality standard sets a numeric value for building static pressure, and no reading in this assessment was evaluated against one.`
}

/** The design-target sentence, when the building documented one. */
export function designTargetSentence(a) {
  const d = a && a.designTarget
  if (!d || !d.present) return null
  const where = d.documentedIn ? `, documented in ${d.documentedIn}` : ''
  return `The building's own design target of ${d.rawValue} ${d.rawUnits}${where} was supplied by the owner or operator as design intent for this building. `
    + `It is not a published standard and the reading above was not evaluated against it.`
}

/** The limitation sentence, matched to how well the direction is known. */
export function limitationSentence(a) {
  if (!a) return null
  switch (a.confidence) {
    case PRESSURIZATION_CONFIDENCE.SUGGESTED_NOT_MEASURED:
      return 'The direction was observed rather than measured, so this mechanism is suggested and not quantified. '
        + 'It was not verified by measurement and should be evaluated by a mechanical engineer through a test-and-balance evaluation.';
    case PRESSURIZATION_CONFIDENCE.MEASURED_ACCURACY_UNSTATED:
      return 'The instrument accuracy was not recorded, so the magnitude of the differential is not established. '
        + 'A test-and-balance evaluation by a mechanical engineer is recommended to characterize the supply, exhaust and outdoor-air balance.';
    case PRESSURIZATION_CONFIDENCE.INDETERMINATE:
      return 'Because the reading sits inside the instrument\'s own uncertainty, the direction of airflow across the envelope remains open. '
        + 'A test-and-balance evaluation by a mechanical engineer, or a measurement with an instrument of finer resolution, would settle it.';
    case PRESSURIZATION_CONFIDENCE.MEASURED:
      return 'A single differential reading describes the building at one location and one moment; stack effect, wind and equipment staging all move it. '
        + 'A test-and-balance evaluation by a mechanical engineer is recommended to characterize the supply, exhaust and outdoor-air balance across operating modes.';
    default:
      return null
  }
}

/**
 * The consolidated mechanism statement — the point of the module.
 *
 * One paragraph replacing N separate observations, on the argument that
 * they share an explanation. It never claims the explanation is the
 * right one; it claims it is plausible and testable, and names who
 * tests it.
 */
export function consolidatedMechanismStatement(a, hits, zoneName) {
  if (!a || !Array.isArray(hits) || hits.length === 0) return null
  const where = zoneName ? ` in ${zoneName}` : ''
  return [
    observationSentence(a),
    `Negative pressurization is a plausible common mechanism for ${joinLabels(hits)}${where}, `
    + 'since a building drawn below outdoor pressure takes in unconditioned outdoor air through the envelope — around doors, at penetrations, and up stairwells and elevator shafts — rather than through the filtered supply path.',
    limitationSentence(a),
  ].filter(Boolean).join(' ')
}

/**
 * The statement for the case where nothing was captured.
 *
 * Deliberately not optional. An assessment silent about pressurization
 * reads as one that ruled it out, and it did not.
 */
export function notEvaluatedStatement(a) {
  return (a && a.notEvaluatedStatement) || null
}

/**
 * Everything the report and the result surface need, in one shape.
 * `reviewLabel` rides on all of it — see PRESSURIZATION_REVIEW_LABEL for
 * the conflict this resolves and how to change it in one line.
 */
export function buildPressurizationNarrative(a, hits, zoneName) {
  const consolidated = a && a.inwardAirflow && Array.isArray(hits) && hits.length > 0
    ? consolidatedMechanismStatement(a, hits, zoneName)
    : null
  return Object.freeze({
    reviewLabel: PRESSURIZATION_REVIEW_LABEL,
    requiresIhReview: true,
    framing: PRESSURIZATION_FRAMING,
    observation: observationSentence(a),
    anchor: anchorSentence(),
    designTarget: designTargetSentence(a),
    limitation: limitationSentence(a),
    consolidated,
    notEvaluated: notEvaluatedStatement(a),
  })
}
