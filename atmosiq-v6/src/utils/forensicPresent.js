/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * How a forensic pattern and its reading are SHOWN — the deterministic
 * evidence line and the labels, as pure functions over the bundle.
 *
 * This exists because the contract splits one card into two authors:
 *
 *   Evidence: four recurring days · peak hour 14:00 · amplitude 400 ppm
 *   Reading:  The recurring temporal pattern is consistent with scheduled
 *             occupancy or with mechanical-system operation.
 *
 * Every number on the evidence line is copied from the bundle here; the model
 * writes none, and the validator (`forensicValidate.js`) rejects any it tries.
 * That is the whole guarantee — deterministic layer owns numbers, model owns
 * interpretation — and it only holds if the evidence line is rendered from the
 * record and never from the prose. So this module is the ONLY place a figure
 * is turned into text for the card, and the monitoring report will render its
 * section through the same functions rather than growing a second set.
 *
 * Nothing here interprets. A label says what KIND of pattern was found; the
 * evidence line says what was measured. Whether either matters is the reading
 * beside them, and the assessor's call after that.
 */

import { SENSOR_PARAMS } from './sensorParser'

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/** What each pattern kind is, as a heading. Descriptive, never a verdict. */
export const PATTERN_LABELS = Object.freeze({
  recurring_cycle: 'Recurring daily cycle',
  coincidence: 'Two parameters moved together',
  occupancy_comparison: 'Occupied against unoccupied',
  indoor_outdoor_comparison: 'Indoor against outdoor',
  no_matching_outdoor_event: 'Indoor excursion with no outdoor match',
  no_matching_zone_event: 'Excursion in one zone only',
  event_proximity: 'Excursion near a logged activity',
})

export const EVENT_LABELS = Object.freeze({
  step_up: 'step up',
  step_down: 'step down',
  peak: 'peak',
  sustained: 'sustained shift',
  flatline: 'flatline',
  gap: 'gap in the record',
})

/** How much of the reviewer's attention — the validator's vocabulary, as words. */
export const IMPORTANCE_LABELS = Object.freeze({
  routine: 'Routine',
  worth_review: 'Worth review',
  priority_review: 'Priority review',
})

/**
 * What each rejection reason means to the person reading the panel.
 *
 * Keyed by the validator's own codes so a new code without a label fails the
 * parity test rather than rendering as `unknown_evidence_id` to an assessor.
 */
export const REJECTION_LABELS = Object.freeze({
  unparseable_output: 'The response was not readable as a structured reading.',
  malformed_output: 'The response was not in the agreed shape.',
  no_bundle: 'There was no analysis to read against.',
  fingerprint_mismatch: 'The session changed while the reading was being produced.',
  malformed_interpretation: 'An entry was not in the agreed shape.',
  missing_pattern_id: 'An entry did not say which pattern it was about.',
  unknown_pattern_id: 'An entry referred to a pattern that was not detected.',
  duplicate_pattern: 'A pattern was read twice.',
  over_interpretation_limit: 'More readings were offered than the five allowed.',
  invalid_importance: 'An entry used an importance value outside the vocabulary.',
  missing_title: 'An entry had no title.',
  missing_interpretation: 'An entry had no reading.',
  unknown_evidence_id: 'An entry cited evidence that does not exist in this session.',
  evidence_not_on_pattern: 'An entry cited evidence that belongs to a different pattern.',
  unknown_context_gap_id: 'An entry named missing context that does not exist.',
  context_gap_not_on_pattern: 'An entry named missing context that belongs to a different pattern.',
  digits_in_prose: 'An entry stated a number. Figures come from the analysis, not the reading.',
  prohibited_language: 'An entry used wording this product does not publish.',
})

const unitFor = (bundle, pattern) => {
  const p = obj(pattern)
  const param = arr(p.params)[0]
  const ds = arr(p.datasetIds)[0]
  const block = arr(obj(bundle).parameters).find((q) => obj(q).param === param && obj(q).datasetId === ds)
    || arr(obj(bundle).parameters).find((q) => obj(q).param === param)
  return (block && block.unit) || ''
}

/** The parameter's label as the rest of Logger Studio writes it. */
export const paramName = (key) => (SENSOR_PARAMS.find((p) => p.key === key) || {}).label || String(key || '')

/**
 * A measured figure, at a precision that reads as a reading rather than as a
 * calculation: whole numbers past a hundred, one decimal past ten, two below.
 */
export function fmtFigure(v, unit = '') {
  if (!isNum(v)) return null
  const a = Math.abs(v)
  const s = a >= 100 ? String(Math.round(v)) : a >= 10 ? v.toFixed(1) : v.toFixed(2)
  return unit ? `${s} ${unit}` : s
}

const signed = (v, unit) => {
  const f = fmtFigure(v, unit)
  return f == null ? null : (v > 0 ? `+${f}` : f)
}

const clock = (hour) => (isNum(hour) ? `${String(hour).padStart(2, '0')}:00` : null)

const minutes = (sec) => (isNum(sec) ? (sec >= 3600 ? `${(sec / 3600).toFixed(sec % 3600 ? 1 : 0)} h` : `${Math.round(sec / 60)} min`) : null)

/**
 * The deterministic evidence line for one pattern — short fragments, every
 * figure copied from the bundle. Joined with a middle dot by the caller.
 *
 * @param {object} pattern one of `bundle.patterns`
 * @param {object} bundle
 * @returns {string[]}
 */
export function patternEvidence(pattern, bundle) {
  const p = obj(pattern)
  const s = obj(p.summary)
  const unit = unitFor(bundle, p)
  const out = []
  switch (p.kind) {
    case 'recurring_cycle':
      if (isNum(s.daysAgreeing) && isNum(s.daysObserved)) out.push(`${s.daysAgreeing} of ${s.daysObserved} days`)
      if (clock(s.peakHour)) out.push(`peak hour ${clock(s.peakHour)}`)
      if (fmtFigure(s.meanAmplitude, unit)) out.push(`amplitude ${fmtFigure(s.meanAmplitude, unit)}`)
      break
    case 'coincidence': {
      const kinds = arr(s.kinds)
      const params = arr(p.params)
      if (params.length === 2 && kinds.length === 2) out.push(`${paramName(params[0])} ${EVENT_LABELS[kinds[0]] || kinds[0]} · ${paramName(params[1])} ${EVENT_LABELS[kinds[1]] || kinds[1]}`)
      if (minutes(s.overlapSlackSec)) out.push(`within ${minutes(s.overlapSlackSec)}`)
      break
    }
    case 'occupancy_comparison':
      if (fmtFigure(s.meanOccupied, unit)) out.push(`occupied ${fmtFigure(s.meanOccupied, unit)}`)
      if (fmtFigure(s.meanUnoccupied, unit)) out.push(`unoccupied ${fmtFigure(s.meanUnoccupied, unit)}`)
      if (signed(s.delta, unit)) out.push(`difference ${signed(s.delta, unit)}`)
      if (isNum(s.windows)) out.push(`${s.windows} occupied ${s.windows === 1 ? 'window' : 'windows'}`)
      break
    case 'indoor_outdoor_comparison':
      if (fmtFigure(s.meanIndoor, unit)) out.push(`indoor ${fmtFigure(s.meanIndoor, unit)}`)
      if (fmtFigure(s.meanOutdoor, unit)) out.push(`outdoor ${fmtFigure(s.meanOutdoor, unit)}`)
      if (isNum(s.r)) out.push(`correlation r = ${s.r.toFixed(2)}`)
      if (isNum(s.pairedSamples)) out.push(`${s.pairedSamples} paired readings`)
      break
    case 'no_matching_outdoor_event':
      if (s.eventKind) out.push(`indoor ${EVENT_LABELS[s.eventKind] || s.eventKind}${signed(s.magnitude, unit) ? ` ${signed(s.magnitude, unit)}` : ''}`)
      if (s.outdoorCoveredWindow) out.push('outdoor logger covered the window')
      out.push('no matching outdoor event')
      break
    case 'no_matching_zone_event':
      if (s.zone) out.push(`${s.zone} ${EVENT_LABELS[s.eventKind] || s.eventKind || 'excursion'}`)
      if (isNum(s.zonesCompared)) out.push(`${s.zonesCompared} ${s.zonesCompared === 1 ? 'zone' : 'zones'} compared`)
      if (isNum(s.zonesWithoutCoverage) && s.zonesWithoutCoverage > 0) out.push(`${s.zonesWithoutCoverage} without coverage`)
      break
    case 'event_proximity': {
      const labels = arr(s.annotations).map((a) => obj(a).label).filter(Boolean)
      if (s.eventKind) out.push(EVENT_LABELS[s.eventKind] || s.eventKind)
      if (labels.length) out.push(`near “${labels.join('”, “')}”`)
      break
    }
    default:
      break
  }
  return out
}

/** The pattern's heading: its kind, and the parameter(s) it concerns. */
export function patternTitle(pattern) {
  const p = obj(pattern)
  const kind = PATTERN_LABELS[p.kind] || 'Pattern'
  const params = arr(p.params).map(paramName)
  return params.length ? `${kind} — ${params.join(' and ')}` : kind
}

/**
 * The accepted interpretations of a record, keyed by the pattern they read.
 * One per pattern by construction — the validator refuses a duplicate.
 */
export function interpretationsByPattern(record) {
  const map = new Map()
  arr(obj(record).interpretations).forEach((i) => { if (obj(i).pattern_id) map.set(i.pattern_id, i) })
  return map
}
