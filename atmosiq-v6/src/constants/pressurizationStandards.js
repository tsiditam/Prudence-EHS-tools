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
 * ── Building pressurization — vocabulary, anchor, and unit handling ────
 *
 * This is the pressurization module's equivalent of `moldStandards.js`:
 * the one place its vocabulary and its single published anchor live, so
 * `src/engines/pressurization.js` never hardcodes either.
 *
 * THREE RULES GOVERN THIS FILE, and each one is why a value that looks
 * like it belongs here is absent:
 *
 *   1. **There is no numeric pass/fail threshold for indoor building
 *      static pressure, and this file must never invent one.** No
 *      consensus IAQ standard establishes one. A number here would be
 *      indistinguishable, downstream, from the sourced thresholds in
 *      `criteria.js` — which is exactly how `CO — EXCEEDS OSHA PEL`
 *      shipped against a grab reading. The only anchor is DIRECTIONAL
 *      (see `PRESSURIZATION_ANCHOR`), and it is carried with
 *      `source_status: 'advisory'`.
 *
 *   2. **Design intent is the building's, not a standard's.** Where an
 *      O&M document states a design differential, it is captured as a
 *      USER-ENTERED target and labelled as such everywhere it renders
 *      (`DESIGN_TARGET_FRAMING`). It never acquires the authority of a
 *      published criterion, and the engine never scores against it.
 *
 *   3. **Pressurization is a MECHANISM, not a scored parameter.** It
 *      explains findings; it is not itself one. Nothing in this module
 *      is reachable from the 100-point composite — see the structural
 *      note on `PRESSURIZATION_SCORED`.
 */

/**
 * Structural marker, asserted by `tests/engine/pressurization.test.ts`.
 *
 * The mold module is kept out of the composite by living in a separate
 * engine that the scorer never calls. Pressurization is kept out the
 * same way, but it is a closer call: its inputs sit on the BUILDING
 * record, which `scoreZone` merges into every zone as `d`. A field that
 * lands in `d` is one `sufficiency.js` requirement away from carrying
 * points. This constant, the test that reads it, and the registry guard
 * in the same test are what make that accidental weighting fail loudly
 * instead of silently shifting every score in the product.
 */
export const PRESSURIZATION_SCORED = false

/**
 * The only published anchor this module has, and it is directional.
 *
 * OSHA 3430-04 states an expected DIRECTION of airflow, verified by an
 * observation any assessor can make without an instrument. It does not
 * state a magnitude, and no reading is compared against it — it is the
 * reason the exterior-door observation is worth recording at all.
 *
 * `source_status: 'advisory'` is the load-bearing field: it keeps this
 * out of any code path that treats a citation as a compliance line.
 */
export const PRESSURIZATION_ANCHOR = Object.freeze({
  id: 'pressurization_direction_osha_3430',
  label: 'Slight positive building pressure (directional)',
  source_status: 'advisory',
  cited_by: 'OSHA 3430-04 (2011)',
  source: 'OSHA 3430-04 (2011) — Indoor Air Quality in Commercial and Institutional Buildings',
  // Verbatim. Quoted rather than paraphrased because the paraphrase
  // ("should be positive") reads as a threshold and this does not.
  quote:
    'Ensure and validate that the building is maintained under a slight '
    + 'positive pressure (i.e., air comes out of the building when exterior '
    + 'doors are opened).',
  // What the anchor does NOT do, stated once so no consumer has to infer it.
  framing:
    'A directional expectation, not a numeric criterion. No consensus indoor '
    + 'air quality standard establishes a pass/fail value for building static '
    + 'pressure, so no measured differential is evaluated against a threshold '
    + 'in this assessment.',
})

/**
 * The standing framing that rides on EVERY pressurization output, in the
 * same spirit as `MOLD_SCREENING_DISCLAIMER`. Imported rather than
 * re-authored so the sentence cannot drift between engine and report.
 */
export const PRESSURIZATION_FRAMING =
  'Building pressurization is evaluated as a possible MECHANISM for other '
  + 'observations, not as a finding in its own right. It carries no score and '
  + 'no pass/fail determination. Verification of supply, exhaust and '
  + 'outdoor-air balance is a mechanical-engineering scope item.'

export const DESIGN_TARGET_FRAMING =
  'Design target supplied by the building owner or operator from project '
  + 'documentation. It is a USER-ENTERED value describing design intent for '
  + 'this building — not a published standard, and not a criterion this '
  + 'assessment evaluates the building against.'

/**
 * Review label carried on every narrative this module emits.
 *
 * ── Conflict flagged, resolved to one constant ────────────────────────
 * The pressurization spec requires narrative output to stay labelled
 * "IH Review Required". CLAUDE.md records that this exact phrase was
 * deliberately reworded off every report and chat answer in 2026-08 —
 * it stamped everything as pending review, which is the problem the
 * report lifecycle set out to fix; the surviving labels are
 * "AI-ASSISTED NARRATIVE — VERIFY BEFORE ISSUE" (DOCX) and
 * "AI-assisted response — verify before use." (chat), and the mold
 * module uses a per-finding `requiresProfessionalReview` flag instead.
 *
 * The spec is followed here. It is isolated to this one constant plus
 * the boolean beside it so that aligning with the platform convention
 * later is a one-line edit rather than a sweep through the narrative
 * templates.
 */
export const PRESSURIZATION_REVIEW_LABEL = 'IH Review Required'

// ── Canonical vocabularies ────────────────────────────────────────────
//
// The wizard stores the human-readable option strings from questions.js.
// The engine reasons over the canonical tokens below. Mapping happens in
// exactly one place (the `canonical*` functions) so no consumer matches
// on display prose — the `classify.ts` lesson: rewording a question must
// never change how an answer is classified.

/** Exterior-door test — what the air did when the door was opened. */
export const DOOR_AIRFLOW = Object.freeze({
  OUTWARD: 'outward',
  INWARD: 'inward',
  NEUTRAL: 'neutral',
  NOT_TESTED: 'not_tested',
})

export const DOOR_AIRFLOW_OPTIONS = Object.freeze({
  'Air flows OUT of the building': DOOR_AIRFLOW.OUTWARD,
  'Air flows IN to the building': DOOR_AIRFLOW.INWARD,
  'Neutral / indeterminate': DOOR_AIRFLOW.NEUTRAL,
  'Not tested': DOOR_AIRFLOW.NOT_TESTED,
})

/** How the direction was observed. Drives nothing but the record. */
export const PRESSURE_METHOD = Object.freeze({
  SMOKE_PENCIL: 'smoke_pencil',
  TISSUE_RIBBON: 'tissue_ribbon',
  FELT_BY_HAND: 'felt_by_hand',
  NOT_TESTED: 'not_tested',
})

export const PRESSURE_METHOD_OPTIONS = Object.freeze({
  'Smoke pencil': PRESSURE_METHOD.SMOKE_PENCIL,
  'Tissue / ribbon': PRESSURE_METHOD.TISSUE_RIBBON,
  'Felt by hand': PRESSURE_METHOD.FELT_BY_HAND,
  'Not tested': PRESSURE_METHOD.NOT_TESTED,
})

/** Corroborating observation — how the doors themselves behave. */
export const DOOR_BEHAVIOR = Object.freeze({
  PULL_SHUT_HARD: 'pull_shut_hard',
  RESIST_CLOSING: 'resist_closing',
  NORMAL: 'normal',
  NOT_OBSERVED: 'not_observed',
})

export const DOOR_BEHAVIOR_OPTIONS = Object.freeze({
  'Doors pull shut hard': DOOR_BEHAVIOR.PULL_SHUT_HARD,
  'Doors resist closing': DOOR_BEHAVIOR.RESIST_CLOSING,
  'Normal': DOOR_BEHAVIOR.NORMAL,
  'Not observed': DOOR_BEHAVIOR.NOT_OBSERVED,
})

/** Zone pressure relative to the adjacent corridor or space. */
export const ZONE_PRESSURE = Object.freeze({
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
  NOT_TESTED: 'not_tested',
})

/**
 * `path_pressure` already existed in Q_ZONE with these exact options and
 * is already read by `causalChains.js`. The module maps onto it rather
 * than declaring a second zone-pressure field beside it.
 */
export const ZONE_PRESSURE_OPTIONS = Object.freeze({
  'Positive (pushes out)': ZONE_PRESSURE.POSITIVE,
  'Negative (draws in)': ZONE_PRESSURE.NEGATIVE,
  'Neutral': ZONE_PRESSURE.NEUTRAL,
  'Not assessed': ZONE_PRESSURE.NOT_TESTED,
})

/**
 * The pre-existing building field `bld_pressure`. It conflates the
 * observation with the conclusion ("Negative (air pulls in)"), which is
 * why the module asks the door test separately. It is still read, as a
 * FALLBACK only, so assessments recorded before this module — and the
 * demo fixtures — do not silently become "not evaluated".
 */
export const LEGACY_BLD_PRESSURE_OPTIONS = Object.freeze({
  'Positive (air pushes out)': DOOR_AIRFLOW.OUTWARD,
  'Negative (air pulls in)': DOOR_AIRFLOW.INWARD,
  'Neutral': DOOR_AIRFLOW.NEUTRAL,
  'Variable / unknown': DOOR_AIRFLOW.NOT_TESTED,
  'Not assessed': DOOR_AIRFLOW.NOT_TESTED,
})

// ── Units ─────────────────────────────────────────────────────────────

export const UNIT_PA = 'Pa'
export const UNIT_IN_WC = 'in. w.c.'

/**
 * Inch of water column → pascal.
 *
 * 249.0889 Pa is the inch of water at 4 °C (NIST SP 811, Appendix B.8).
 * HVAC practice also uses 248.84 (inch of water at 60 °F); at the
 * magnitudes involved here (a building differential is a few pascals)
 * the difference is far below any manometer's resolution. The exact
 * constant is pinned so that a stored canonical value is reproducible
 * for the life of a report, not so that it is more accurate.
 */
export const PA_PER_IN_WC = 249.0889

/**
 * Canonical storage is PASCALS, signed. The sign convention is stated
 * once, here, and echoed in the question label the assessor reads:
 *
 *   negative → building interior BELOW outdoor (air infiltrates in)
 *   positive → building interior ABOVE outdoor (air exfiltrates out)
 */
export const PRESSURE_SIGN_CONVENTION =
  'Differential is reported as building interior relative to outdoors. A '
  + 'negative value means the interior is below outdoor pressure; a positive '
  + 'value means it is above.'

/** Convert a value in `units` to canonical pascals. Returns null if unparseable. */
export function toPascals(value, units) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(n)) return null
  if (units === UNIT_IN_WC) return n * PA_PER_IN_WC
  if (units === UNIT_PA || units == null || units === '') return n
  return null
}

/** Convert canonical pascals back to `units`, for display only. */
export function fromPascals(pa, units) {
  if (!Number.isFinite(pa)) return null
  if (units === UNIT_IN_WC) return pa / PA_PER_IN_WC
  return pa
}

/**
 * Is the magnitude of a reading indistinguishable from zero, given the
 * instrument's stated accuracy?
 *
 * This is `isWithinNoiseFloor(observed, threshold, band)` from
 * `src/engine/instruments/accuracy.ts` with `threshold = 0` and an
 * absolute-only band — the same suppression rule the IAQ engine applies
 * to a contaminant sitting on its reference line. It is re-expressed
 * here rather than imported because that module is TypeScript and this
 * one is loaded by the legacy JS engines; `tests/engine/
 * pressurization.test.ts` asserts the two agree numerically so the
 * duplication cannot drift into a second opinion.
 *
 * There is no threshold to compare against for pressurization, so the
 * comparison is against zero: a reading whose magnitude is inside the
 * instrument's own uncertainty has not established a direction. The
 * engine calls that INDETERMINATE — never "neutral", which would be a
 * positive claim the instrument cannot support.
 */
export function withinInstrumentAccuracy(valuePa, tolerancePa) {
  if (!Number.isFinite(valuePa)) return false
  if (!Number.isFinite(tolerancePa) || tolerancePa <= 0) return false
  return Math.abs(valuePa - 0) <= tolerancePa
}

// ── Confidence states ─────────────────────────────────────────────────
//
// Not a score. These name WHAT WAS DONE, and every one of them produces
// a sentence — including the first, because silence about an unevaluated
// mechanism reads as its absence.

export const PRESSURIZATION_CONFIDENCE = Object.freeze({
  /** Nothing captured. The chain engine must still say so. */
  NOT_EVALUATED: 'not_evaluated',
  /** Direction observed by hand/smoke/ribbon only. */
  SUGGESTED_NOT_MEASURED: 'suggested_not_measured',
  /** Measured, but magnitude sits inside instrument accuracy. */
  INDETERMINATE: 'indeterminate',
  /** Measured, magnitude outside instrument accuracy. */
  MEASURED: 'measured',
  /** Measured, but the instrument's accuracy was never stated. */
  MEASURED_ACCURACY_UNSTATED: 'measured_accuracy_unstated',
})

/**
 * The sentence for the state where nothing was captured.
 *
 * Required by the spec and worth stating why: an assessment that is
 * silent about pressurization reads, to a client, as an assessment that
 * ruled it out. It did not. This says so.
 */
export const NOT_EVALUATED_STATEMENT =
  'Building pressurization was not evaluated during this assessment. No '
  + 'exterior-door airflow observation and no differential-pressure '
  + 'measurement were recorded, so infiltration of unconditioned outdoor air '
  + 'through the building envelope can be neither ruled in nor ruled out as a '
  + 'contributing mechanism.'

/**
 * The same fact, short enough for a causal-chain card.
 *
 * A chain's `rootCause` renders in a fixed card and is asserted to stay
 * under 200 characters and to carry no advice
 * (`tests/engine/findings-state-the-finding.test.ts` — the clamp that
 * used to slice it mid-word is gone precisely because the strings are
 * written short instead). The full statement above is what the report
 * and the result surface render; this is what the card says.
 */
export const NOT_EVALUATED_SHORT =
  'Building pressurization was not assessed, so infiltration of unconditioned '
  + 'outdoor air through the envelope can be neither ruled in nor ruled out.'

/**
 * The consolidated mechanism, as a cause statement rather than a
 * paragraph. Same card contract as above: states the condition, stops,
 * and leaves the reasoning and the follow-up to `mechanismStatement`
 * and to the recommendations register.
 */
export const NEGATIVE_PRESSURE_SHORT =
  'Building operating under negative pressure, taking in unconditioned outdoor '
  + 'air through the envelope rather than through the filtered supply path.'

// ── OSHA 3430 control hierarchy ───────────────────────────────────────
//
// The tier a recommendation belongs to. OSHA 3430-04 orders IAQ controls
// source management → engineering → administrative; tagging the tier
// lets a report group remedies by what they actually do rather than by
// how soon they are due.
//
// Pressurization remedies are ENGINEERING controls without exception:
// every one of them changes how the building moves air. None of them is
// source management (the source is outdoors, or is the neighbouring
// tenant) and none is administrative (no procedure re-balances a fan).

export const CONTROL_TIER = Object.freeze({
  SOURCE_MANAGEMENT: 'source_management',
  ENGINEERING: 'engineering_control',
  ADMINISTRATIVE: 'administrative_control',
})

export const CONTROL_TIER_LABEL = Object.freeze({
  [CONTROL_TIER.SOURCE_MANAGEMENT]: 'Source management',
  [CONTROL_TIER.ENGINEERING]: 'Engineering control',
  [CONTROL_TIER.ADMINISTRATIVE]: 'Administrative control',
})

export const CONTROL_HIERARCHY_SOURCE = 'OSHA 3430-04 (2011)'

// ── Canonicalizers ────────────────────────────────────────────────────

const lookup = (table, raw) => {
  if (raw == null || raw === '') return null
  const direct = table[raw]
  if (direct) return direct
  const key = Object.keys(table).find((k) => k.toLowerCase() === String(raw).toLowerCase())
  return key ? table[key] : null
}

export const canonicalDoorAirflow = (raw) => lookup(DOOR_AIRFLOW_OPTIONS, raw)
export const canonicalMethod = (raw) => lookup(PRESSURE_METHOD_OPTIONS, raw)
export const canonicalDoorBehavior = (raw) => lookup(DOOR_BEHAVIOR_OPTIONS, raw)
export const canonicalZonePressure = (raw) => lookup(ZONE_PRESSURE_OPTIONS, raw)
export const canonicalLegacyBldPressure = (raw) => lookup(LEGACY_BLD_PRESSURE_OPTIONS, raw)
