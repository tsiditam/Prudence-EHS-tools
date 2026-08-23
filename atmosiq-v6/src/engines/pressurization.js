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
 * ── Building pressurization — MECHANISM engine ────────────────────────
 *
 * Negative building pressurization is not a finding. It is an
 * explanation for findings: when the interior sits below outdoor
 * pressure, the building draws unconditioned outdoor air through the
 * envelope — around doors, at penetrations, up stairwells and elevator
 * shafts — instead of through the filtered supply path. That single
 * condition can account for elevated indoor particulate, humidity that
 * tracks the outdoors, odors migrating from a loading dock or a
 * neighbouring tenant, moisture at the envelope, and combustion gases
 * with no indoor source, all at once.
 *
 * So this engine answers two questions and no others:
 *
 *   1. What do we actually know about the direction of airflow, and how
 *      well do we know it? (`evaluatePressurization`)
 *   2. Which of the findings already present would that direction
 *      explain, and are there enough of them to be worth stating as ONE
 *      mechanism instead of N separate observations?
 *      (`findCoOccurringMechanisms`, consumed by causalChains.js)
 *
 * ── Design invariants, mirroring the mold engine ──────────────────────
 *   • PURE + deterministic — same input, identical output. No clocks.
 *   • UNSCORED — imports nothing from scoring.js, exports no points, and
 *     is never reachable from the composite. See PRESSURIZATION_SCORED.
 *   • Defensive — any malformed input degrades to `not_evaluated`; it
 *     never throws.
 *   • Never silent — the no-data case produces a SENTENCE, because an
 *     assessment that says nothing about pressurization reads as one
 *     that ruled it out.
 *   • No invented thresholds — the only anchor is directional, and the
 *     only numeric comparison made anywhere in this file is a reading
 *     against its own instrument's accuracy.
 */

import { STD } from '../constants/standards'
import {
  PRESSURIZATION_ANCHOR,
  PRESSURIZATION_CONFIDENCE,
  PRESSURIZATION_FRAMING,
  DESIGN_TARGET_FRAMING,
  PRESSURE_SIGN_CONVENTION,
  NOT_EVALUATED_STATEMENT,
  DOOR_AIRFLOW,
  DOOR_BEHAVIOR,
  ZONE_PRESSURE,
  CONTROL_TIER,
  CONTROL_HIERARCHY_SOURCE,
  UNIT_PA,
  canonicalDoorAirflow,
  canonicalMethod,
  canonicalDoorBehavior,
  canonicalZonePressure,
  canonicalLegacyBldPressure,
  toPascals,
  withinInstrumentAccuracy,
} from '../constants/pressurizationStandards'

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)

const list = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])

// ── The instrument envelope ───────────────────────────────────────────

/**
 * Read the differential-pressure instrument off the pre-survey record.
 *
 * Same `ps_inst_*` envelope the IAQ meter and the PID use — model,
 * serial, accuracy, calibration — plus `resolution`, which this module
 * needs and the family did not previously carry. Deliberately NOT a
 * parallel instrument schema: an assessment that recorded its meter in
 * a shape only this module understood would be invisible to Appendix B
 * and to the calibration gate.
 */
function readInstrument(presurvey) {
  const p = presurvey || {}
  const model = str(p.ps_inst_press)
  if (!model) return null
  const accuracyPa = toPascals(num(p.ps_inst_press_accuracy), p.ps_inst_press_acc_units || UNIT_PA)
  const resolutionPa = toPascals(num(p.ps_inst_press_res), p.ps_inst_press_res_units || UNIT_PA)
  return Object.freeze({
    model,
    serial: str(p.ps_inst_press_serial),
    accuracy: num(p.ps_inst_press_accuracy),
    accuracyUnits: str(p.ps_inst_press_acc_units),
    accuracyPa: Number.isFinite(accuracyPa) ? Math.abs(accuracyPa) : null,
    resolution: num(p.ps_inst_press_res),
    resolutionUnits: str(p.ps_inst_press_res_units),
    resolutionPa: Number.isFinite(resolutionPa) ? Math.abs(resolutionPa) : null,
    lastCalDate: str(p.ps_inst_press_cal),
    calStatus: str(p.ps_inst_press_cal_status),
  })
}

/**
 * The tolerance a reading's magnitude is judged against.
 *
 * Stated accuracy first; resolution as a fallback, because an
 * instrument that resolves to 1 Pa cannot distinguish 0.4 Pa from zero
 * whatever its accuracy claim. Null when neither was recorded — which
 * is a real state, handled explicitly rather than defaulted to a
 * convenient number.
 */
function toleranceFor(instrument) {
  if (!instrument) return null
  if (Number.isFinite(instrument.accuracyPa) && instrument.accuracyPa > 0) return instrument.accuracyPa
  if (Number.isFinite(instrument.resolutionPa) && instrument.resolutionPa > 0) return instrument.resolutionPa
  return null
}

// ── Qualitative + quantitative capture ────────────────────────────────

function readQualitative(bldg) {
  const b = bldg || {}
  const doorAirflow = canonicalDoorAirflow(b.bld_press_door)
  // `bld_pressure` predates this module and conflates the observation
  // with the conclusion. It is read as a FALLBACK only, so assessments
  // (and demo fixtures) recorded before the door test existed do not
  // silently become "not evaluated" — but it never overrides an actual
  // door observation, and the record says which one was used.
  const legacy = doorAirflow ? null : canonicalLegacyBldPressure(b.bld_pressure)
  return Object.freeze({
    doorAirflow: doorAirflow || legacy || DOOR_AIRFLOW.NOT_TESTED,
    doorAirflowSource: doorAirflow ? 'exterior_door_test' : (legacy ? 'legacy_bld_pressure' : null),
    method: canonicalMethod(b.bld_press_method),
    doorBehavior: canonicalDoorBehavior(b.bld_press_door_behavior) || DOOR_BEHAVIOR.NOT_OBSERVED,
    observed: Boolean(doorAirflow || legacy),
  })
}

function readQuantitative(bldg, instrument) {
  const b = bldg || {}
  const raw = num(b.bld_press_dp)
  const units = str(b.bld_press_dp_units) || UNIT_PA
  const valuePa = raw === null ? null : toPascals(raw, units)
  if (valuePa === null) {
    return Object.freeze({ present: false, valuePa: null, rawValue: null, rawUnits: null, referenceLocation: null, instrument, tolerancePa: null, withinAccuracy: false, toleranceStated: false })
  }
  const tolerancePa = toleranceFor(instrument)
  return Object.freeze({
    present: true,
    valuePa,
    rawValue: raw,
    rawUnits: units,
    referenceLocation: str(b.bld_press_dp_location),
    instrument,
    tolerancePa,
    toleranceStated: tolerancePa !== null,
    withinAccuracy: tolerancePa === null ? false : withinInstrumentAccuracy(valuePa, tolerancePa),
    signConvention: PRESSURE_SIGN_CONVENTION,
  })
}

function readDesignTarget(bldg) {
  const b = bldg || {}
  const raw = num(b.bld_press_design)
  if (raw === null) return Object.freeze({ present: false })
  const units = str(b.bld_press_design_units) || UNIT_PA
  return Object.freeze({
    present: true,
    userEntered: true,
    rawValue: raw,
    rawUnits: units,
    valuePa: toPascals(raw, units),
    documentedIn: str(b.bld_press_design_src),
    framing: DESIGN_TARGET_FRAMING,
  })
}

function readZonePressures(zones) {
  return Object.freeze((Array.isArray(zones) ? zones : []).map((z, i) => Object.freeze({
    zoneName: str(z && z.zn) || `Zone ${i + 1}`,
    // `path_pressure` already exists in Q_ZONE and is already read by
    // causalChains.js. Mapped onto rather than duplicated.
    relative: canonicalZonePressure(z && z.path_pressure) || ZONE_PRESSURE.NOT_TESTED,
  })))
}

// ── Direction + confidence ────────────────────────────────────────────

/**
 * Resolve the building's airflow direction and how well it is known.
 *
 * The ordering matters. A measurement outranks an observation, EXCEPT
 * when its magnitude sits inside the instrument's own uncertainty — at
 * which point it establishes nothing at all, and the qualitative
 * observation (if any) is what is left. A reading of -0.3 Pa on a meter
 * accurate to ±1 Pa is INDETERMINATE, never "neutral": neutral is a
 * positive claim about the building, and the instrument did not make it.
 */
function resolveDirection(qualitative, quantitative) {
  if (quantitative.present) {
    if (!quantitative.toleranceStated) {
      return {
        direction: quantitative.valuePa < 0 ? DOOR_AIRFLOW.INWARD : (quantitative.valuePa > 0 ? DOOR_AIRFLOW.OUTWARD : 'indeterminate'),
        confidence: PRESSURIZATION_CONFIDENCE.MEASURED_ACCURACY_UNSTATED,
        // Same primitive the IAQ engine applies to an instrument absent
        // from the accuracy database: the value is kept, its weight is not.
        qualitativeOnly: true,
      }
    }
    if (quantitative.withinAccuracy) {
      return { direction: 'indeterminate', confidence: PRESSURIZATION_CONFIDENCE.INDETERMINATE, qualitativeOnly: false }
    }
    return {
      direction: quantitative.valuePa < 0 ? DOOR_AIRFLOW.INWARD : DOOR_AIRFLOW.OUTWARD,
      confidence: PRESSURIZATION_CONFIDENCE.MEASURED,
      qualitativeOnly: false,
    }
  }
  if (qualitative.observed && qualitative.doorAirflow !== DOOR_AIRFLOW.NOT_TESTED) {
    return {
      direction: qualitative.doorAirflow === DOOR_AIRFLOW.NEUTRAL ? 'indeterminate' : qualitative.doorAirflow,
      confidence: PRESSURIZATION_CONFIDENCE.SUGGESTED_NOT_MEASURED,
      qualitativeOnly: true,
    }
  }
  return { direction: 'unknown', confidence: PRESSURIZATION_CONFIDENCE.NOT_EVALUATED, qualitativeOnly: true }
}

// ── Public: the assessment ────────────────────────────────────────────

/**
 * Evaluate building pressurization.
 *
 * @param {Object}   input
 * @param {Object}   [input.bldg]       Building record (bld_press_*).
 * @param {Array}    [input.zones]      Zone records (path_pressure).
 * @param {Object}   [input.presurvey]  Pre-survey record (ps_inst_press_*).
 * @returns {Object} A frozen PressurizationAssessment. Never null, so a
 *   consumer cannot skip the no-data case by checking for absence.
 */
export function evaluatePressurization(input) {
  const bldg = (input && input.bldg) || {}
  const zones = (input && input.zones) || []
  const presurvey = (input && input.presurvey) || {}

  const instrument = readInstrument(presurvey)
  const qualitative = readQualitative(bldg)
  const quantitative = readQuantitative(bldg, instrument)
  const designTarget = readDesignTarget(bldg)
  const zonePressures = readZonePressures(zones)
  const { direction, confidence, qualitativeOnly } = resolveDirection(qualitative, quantitative)

  const evaluated = confidence !== PRESSURIZATION_CONFIDENCE.NOT_EVALUATED
  const zonesNegative = zonePressures.filter((zp) => zp.relative === ZONE_PRESSURE.NEGATIVE)

  return Object.freeze({
    // Structural marker. Read by the isolation test — pressurization
    // contributes nothing to the 100-point composite, ever.
    scored: false,
    evaluated,
    direction,
    confidence,
    qualitativeOnly,
    inwardAirflow: direction === DOOR_AIRFLOW.INWARD,
    qualitative,
    quantitative,
    designTarget,
    zones: zonePressures,
    zonesNegative: Object.freeze(zonesNegative.map((zp) => zp.zoneName)),
    anchor: PRESSURIZATION_ANCHOR,
    framing: PRESSURIZATION_FRAMING,
    // Present ONLY in the no-data case, and non-null there. Silence is
    // not an acceptable output; the chain engine renders this verbatim.
    notEvaluatedStatement: evaluated ? null : NOT_EVALUATED_STATEMENT,
  })
}

// ── Co-occurring findings the mechanism would explain ─────────────────
//
// Each detector answers one question about ONE zone: is the observation
// that negative pressurization would explain actually present here?
//
// None of them invents a threshold. Three are pure comparisons (indoor
// vs outdoor, or presence vs absence of an identified source); the two
// that need a reference read it from STD, where the value is published
// and sourced, rather than restating a number locally.

const ENVELOPE_LOCATIONS = ['Windows', 'Walls', 'Below grade', 'Roof', 'Ceiling']

const INFILTRATION_ADJACENCIES = [
  'Loading dock', 'Parking garage', 'Kitchen / break room', 'Mechanical room',
  'Exterior wall (traffic side)', 'Roof (near exhaust)',
]

const COMBUSTION_SOURCES = ['Food preparation', 'Space heaters']

/**
 * Indoor PM2.5 above the paired outdoor reading.
 *
 * A comparison, not a threshold — which is the point. Indoor above
 * outdoor says the particulate is not simply outdoor air arriving
 * filtered; the mechanism explains how it arrives unfiltered.
 */
function pmAboveOutdoor(d) {
  const indoor = num(d.pm)
  const outdoor = num(d.pmo)
  if (indoor === null || outdoor === null) return null
  if (!(indoor > outdoor)) return null
  return { key: 'pm_indoor_above_outdoor', label: 'the elevated indoor particulate', detail: `indoor PM2.5 ${indoor} µg/m³ against an outdoor reference of ${outdoor} µg/m³` }
}

/** Indoor RH above the comfort band while outdoor RH is also high. */
function humidityTrackingOutdoors(d) {
  const indoor = num(d.rh)
  const outdoor = num(d.rho)
  if (indoor === null || outdoor === null) return null
  if (!(indoor > STD.t.rh.max && outdoor > STD.t.rh.max)) return null
  return { key: 'rh_elevated_with_outdoor', label: 'the elevated indoor humidity', detail: `indoor RH ${indoor}% with outdoor RH ${outdoor}% (above the ${STD.t.rh.max}% moisture-control bound)` }
}

/**
 * An odor with no source identified inside the zone.
 *
 * "Unexplained" is the operative word: an odor whose source is sitting
 * in the room is explained already. This fires when nothing internal
 * was identified, and it is stronger when the zone adjoins one of the
 * spaces a depressurized building pulls from.
 */
function unexplainedOdor(d) {
  const odor = str(d.op)
  if (!odor || odor === 'None') return null
  const internal = list(d.src_internal).filter((s) => s !== 'None identified')
  if (internal.length > 0) return null
  const adjacent = list(d.src_adjacent).filter((s) => INFILTRATION_ADJACENCIES.includes(s))
  const types = list(d.ot)
  const detail = adjacent.length
    ? `${odor.toLowerCase()} odor with no source identified within the zone, adjacent to ${adjacent.join(', ').toLowerCase()}`
    : `${odor.toLowerCase()} odor with no source identified within the zone`
  return { key: 'unexplained_odor', label: 'the reported odor', detail: types.length ? `${detail} (${types.join(', ').toLowerCase()})` : detail, adjacencies: adjacent }
}

/** Water or vapor arriving at the envelope itself. */
function envelopeMoisture(d) {
  const wd = str(d.wd)
  if (!wd || wd === 'None') return null
  const where = list(d.wl).filter((l) => ENVELOPE_LOCATIONS.includes(l))
  if (where.length === 0) return null
  return { key: 'envelope_moisture', label: 'the moisture observed at the envelope', detail: `${wd.toLowerCase()} at ${where.join(', ').toLowerCase()}` }
}

/**
 * CO present with no indoor source identified.
 *
 * The reference is STD.c.co.who24h — the lowest published indoor
 * criterion, and the point standards.js already designates as "above
 * typical indoor background, note a source". Used here to mean detected,
 * not to mean exceeded: this detector never produces a finding, only a
 * candidate the mechanism might explain.
 */
function combustionGasNoIndoorSource(d) {
  const co = num(d.co)
  if (co === null || !(co >= STD.c.co.who24h)) return null
  const internal = list(d.src_internal).filter((s) => COMBUSTION_SOURCES.includes(s))
  if (internal.length > 0) return null
  return { key: 'co_no_indoor_source', label: 'the carbon monoxide detected', detail: `CO at ${co} ppm with no combustion source identified within the zone` }
}

const DETECTORS = [
  pmAboveOutdoor,
  humidityTrackingOutdoors,
  unexplainedOdor,
  envelopeMoisture,
  combustionGasNoIndoorSource,
]

/**
 * Which of the explainable observations are present in this zone.
 *
 * @param {Object} d  A merged `{ ...bldg, ...zone }` record — the shape
 *                    every legacy engine reads.
 * @returns {Array} Zero or more `{ key, label, detail }`, in a stable order.
 */
export function findCoOccurringMechanisms(d) {
  const merged = d || {}
  const out = []
  for (const detect of DETECTORS) {
    const hit = detect(merged)
    if (hit) out.push(hit)
  }
  return out
}

/**
 * Should the engine consolidate?
 *
 * Two or more co-occurring observations WITH inward airflow. Below two,
 * a single observation reads better as itself than as the symptom of a
 * mechanism — consolidating one finding is not consolidation, it is
 * re-labelling.
 */
export const CONSOLIDATION_MINIMUM = 2

export function shouldConsolidate(assessment, hits) {
  return Boolean(assessment && assessment.inwardAirflow && hits.length >= CONSOLIDATION_MINIMUM)
}

// ── Remedies ──────────────────────────────────────────────────────────

/**
 * The pressurization remedies, in the action shape `genRecs` emits.
 *
 * Every one is an ENGINEERING control under the OSHA 3430 hierarchy,
 * and that is not a judgement call: each changes how the building moves
 * air. None is source management — the source is outdoors, or the
 * neighbouring tenant, and neither is ours to remove — and none is
 * administrative, because no procedure re-balances a fan.
 *
 * They are written here, in the module that owns the mechanism, rather
 * than in the recommendations register: the register would have to
 * re-derive the condition to know when to fire them.
 *
 * Note what is NOT here: an instruction to reach a particular pressure.
 * There is no number to reach. Each remedy asks for something to be
 * verified or characterized, which is the honest scope for a condition
 * whose only anchor is directional.
 */
const REMEDIES = [
  'Verify supply, exhaust and outdoor-air balance through a test-and-balance evaluation by a mechanical engineer (AABC/NEBB procedural standards).',
  'Check whether exhaust fans are running in excess of supply, including after-hours and economizer operating modes.',
  'Check outdoor-air damper position and economizer operation against the sequence of operations.',
  'Check for envelope penetrations and for stack effect at stairwells and elevator shafts.',
]

/**
 * @param {Object} assessment  Output of `evaluatePressurization`.
 * @returns {Array} Zero or more building-scoped RecommendationActions,
 *   tagged `engineering_control`. Empty unless inward airflow was
 *   actually observed or measured — a building with no pressurization
 *   evidence gets no pressurization remedies.
 */
export function pressurizationRecommendations(assessment) {
  if (!assessment || !assessment.inwardAirflow) return []
  const affected = [...(assessment.zonesNegative || [])]
  return REMEDIES.map((text) => ({
    scope: 'building',
    text,
    controlTier: CONTROL_TIER.ENGINEERING,
    controlTierSource: CONTROL_HIERARCHY_SOURCE,
    affectedZoneIds: affected,
    affectedZoneNames: affected,
  }))
}
