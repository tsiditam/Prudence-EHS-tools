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
 *
 * ── The When line is the same discipline, one row down ─────────────────
 * `patternWhen` / `patternOccurrences` / `patternTiming` are the ONLY
 * formatting layer for temporal provenance. They read a pattern's
 * `occurrenceWindows` — deterministic, minted by the detector from the same
 * inputs the fingerprint digests — and never a word of model prose. A model
 * that wrote "the spike on the morning of the 11th" would be describing the
 * evidence; this layer states it, from the record, in the site's own clock.
 *
 * Time is formatted through `localTimeParts` in `monitoringInsights.js`, the
 * one site-offset convention the monitoring report already prints in, rather
 * than a second timezone implementation that could disagree with it.
 */

import { SENSOR_PARAMS } from './sensorParser'
import { localTimeParts, formatDateRange } from './monitoringInsights'

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * What each pattern kind is, as a heading. Descriptive, never a verdict —
 * and never stronger than what the detector actually established.
 *
 * Two of these were, and the way they went wrong is worth keeping written
 * down, because the pull is constant. A heading is short, so the tempting
 * phrasing is the one that says what the pattern MEANS; and meaning is the
 * reading's job, one line further down.
 *
 *   "Excursion in one zone only" claimed spatial localization. The detector
 *   knows no matching event was found in the comparison zones THAT HAD
 *   COVERAGE — it knows nothing about a zone whose logger was down. The
 *   summary carries `zonesWithoutCoverage` precisely because that distinction
 *   matters, so a heading erasing it contradicted the evidence line beneath
 *   it. Now: no matching zone event, and the line says how many zones were
 *   compared and how many could not be.
 *
 *   "Two parameters moved together" claimed a shared direction. The detector
 *   pairs events whose windows OVERLAP, and does not ask which way either
 *   went — one rising while the other falls is a coincidence it reports
 *   identically. Now: coincident events, with each event's own kind on the
 *   evidence line, where the direction actually is.
 *
 * `forensic-present-labels.test.ts` pins every string here for that reason.
 */
export const PATTERN_LABELS = Object.freeze({
  recurring_cycle: 'Recurring daily cycle',
  coincidence: 'Coincident parameter events',
  occupancy_comparison: 'Occupied against unoccupied',
  // Parallel to the zone case below, and accurate: this detector DOES
  // establish outdoor coverage of the window before raising the pattern.
  no_matching_outdoor_event: 'Indoor excursion with no matching outdoor event',
  indoor_outdoor_comparison: 'Indoor against outdoor',
  no_matching_zone_event: 'Excursion with no matching zone event',
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

// ── Temporal provenance ────────────────────────────────────────────────

/** The offset the caller asked for, else the bundle's, else zero. Never the host's. */
const offsetFor = (bundle, options) => {
  const o = obj(options)
  if (isNum(o.utcOffsetMin)) return o.utcOffsetMin
  const ctx = obj(obj(bundle).context)
  return isNum(ctx.utcOffsetMin) ? ctx.utcOffsetMin : 0
}

const clockOf = (p) => `${p.clock} ${p.period}`

/**
 * A window as a reader says it — "Sep 11 · 10:14–10:31 AM", "Sep 11 ·
 * 11:50 AM–1:10 PM", or across midnight "Sep 11, 11:50 PM – Sep 12, 12:20
 * AM". An instant (start equals end, or no end) is "Sep 11 · 10:14 AM".
 *
 * `options.sep` replaces the middle dot between date and clock — the report
 * uses ", " so the phrase reads as a sentence rather than as a card line.
 */
export function formatWindow(start, end, options = {}) {
  const o = obj(options)
  const a = localTimeParts(start, o)
  if (!a) return null
  const sep = typeof o.sep === 'string' ? o.sep : ' · '
  const b = isNum(end) && end !== start ? localTimeParts(end, o) : null
  if (!b) return `${a.date}${sep}${clockOf(a)}`
  if (a.dayKey !== b.dayKey) return `${a.date}, ${clockOf(a)} – ${b.date}, ${clockOf(b)}`
  if (a.period === b.period) return `${a.date}${sep}${a.clock}–${b.clock} ${a.period}`
  return `${a.date}${sep}${clockOf(a)}–${clockOf(b)}`
}

/**
 * A range of clock hours — "1–3 PM", "11 AM–1 PM", "10–11 PM". Hours are
 * bucket boundaries, so 13 to 15 reads "1–3 PM": from the start of the one
 * o'clock hour to the start of the three o'clock hour.
 */
export function formatHourRange(fromHour, toHour) {
  if (!isNum(fromHour) || !isNum(toHour)) return null
  const norm = (h) => ((Math.round(h) % 24) + 24) % 24
  const a = norm(fromHour); const b = norm(toHour)
  const h12 = (h) => h % 12 || 12
  const per = (h) => (h >= 12 ? 'PM' : 'AM')
  if (a === b) return `${h12(a)} ${per(a)}`
  if (per(a) === per(b) && b > a) return `${h12(a)}–${h12(b)} ${per(a)}`
  return `${h12(a)} ${per(a)}–${h12(b)} ${per(b)}`
}

/**
 * The hour-of-day range a recurring cycle's peaks actually fell in — the
 * agreeing days' peak-hour buckets, from the earliest to the end of the
 * latest — read off the summary the detector already published. "Usually
 * 1–3 PM" when the peaks sat in the 13:00 and 14:00 buckets; "2–3 PM" when
 * every day peaked in the same hour.
 */
export function typicalHours(pattern) {
  const s = obj(obj(pattern).summary)
  if (!isNum(s.peakHour)) return null
  const days = arr(s.days).filter((d) => isNum(obj(d).peakHour))
  // Signed offset from the modal hour, so a cycle straddling midnight
  // (23:00 and 00:00) is a two-hour range and not a twenty-three-hour one.
  const offsets = days.length ? days.map((d) => { const raw = (((d.peakHour - s.peakHour) % 24) + 24) % 24; return raw > 12 ? raw - 24 : raw }) : [0]
  const lo = s.peakHour + Math.min(...offsets)
  const hi = s.peakHour + Math.max(...offsets) + 1
  return { from: ((lo % 24) + 24) % 24, to: ((hi % 24) + 24) % 24, label: formatHourRange(lo, hi) }
}

/**
 * Every occurrence window of a pattern, in order, each with its label in the
 * site's clock. Source timestamps ride along untouched so a caller that
 * navigates uses the instant, never the text.
 *
 * @param {object} pattern one of `bundle.patterns`
 * @param {object} bundle
 * @param {{utcOffsetMin?:number}} [options]
 * @returns {Array<{id,start,end,eventIds,datasetIds,representative,label,dayLabel}>}
 */
export function patternOccurrences(pattern, bundle, options = {}) {
  const off = { utcOffsetMin: offsetFor(bundle, options) }
  return arr(obj(pattern).occurrenceWindows)
    .filter((w) => w && isNum(obj(w).start))
    .slice()
    .sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)))
    .map((w) => {
      const p = localTimeParts(w.start, off)
      return {
        id: w.id,
        start: w.start,
        end: isNum(w.end) ? w.end : w.start,
        eventIds: arr(w.eventIds),
        datasetIds: arr(w.datasetIds),
        representative: !!w.representative,
        label: formatWindow(w.start, w.end, off),
        dayLabel: p ? p.date : null,
      }
    })
}

/**
 * The one occurrence a "view on chart" action goes to without asking: the
 * window the detector flagged representative, or the pattern's only window.
 * An aggregate with several unflagged windows (an occupancy comparison) has
 * none — sending the reader to one of them would imply an occurrence the
 * statistic does not have.
 */
export function representativeOccurrence(pattern) {
  const windows = arr(obj(pattern).occurrenceWindows).filter((w) => w && isNum(obj(w).start))
  return windows.find((w) => w.representative) || (windows.length === 1 ? windows[0] : null)
}

/**
 * The compact When line for a card — one sentence, never a list.
 *
 * Shape by kind, because the kinds are temporally different things:
 *   recurring   "Usually 1–3 PM · Sep 9 representative" + "+ 5 more occurrences"
 *   single      "Sep 11 · 10:14–10:31 AM"
 *   aggregate   "Across 3 occupied windows · Mar 2 – 4, 2026" (occupancy)
 *   interval    "Aligned readings · Mar 2, 12:00 AM – Mar 5, 11:45 PM"
 *
 * @returns {{mode:string, primary:string, secondary:string|null, count:number,
 *   representative:object|null, occurrences:object[]}|null}
 */
export function patternWhen(pattern, bundle, options = {}) {
  const p = obj(pattern)
  const occ = patternOccurrences(p, bundle, options)
  if (!occ.length) return null
  const off = { utcOffsetMin: offsetFor(bundle, options) }
  const rep = occ.find((w) => w.representative) || null
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

  switch (p.kind) {
    case 'recurring_cycle': {
      const hours = typicalHours(p)
      const shown = rep || (occ.length === 1 ? occ[0] : null)
      const parts = []
      if (hours && hours.label) parts.push(`Usually ${hours.label}`)
      if (shown) parts.push(`${shown.dayLabel} representative`)
      const more = occ.length - (shown ? 1 : 0)
      return {
        mode: 'recurring',
        primary: parts.join(' · ') || formatWindow(occ[0].start, occ[0].end, off),
        secondary: more > 0 ? `+ ${plural(more, 'more occurrence')}` : null,
        count: occ.length,
        representative: shown,
        occurrences: occ,
      }
    }
    case 'occupancy_comparison': {
      const span = formatDateRange(occ[0].start, occ[occ.length - 1].end, off)
      return {
        mode: 'aggregate',
        primary: `Across ${plural(occ.length, 'occupied window')}${span ? ` · ${span}` : ''}`,
        secondary: null,
        count: occ.length,
        // One contributing window IS the comparison's occupied side, and can
        // be shown; several are an aggregate, and none is singled out.
        representative: occ.length === 1 ? occ[0] : null,
        occurrences: occ,
      }
    }
    case 'indoor_outdoor_comparison': {
      const w = occ[0]
      return {
        mode: 'interval',
        primary: `Aligned readings · ${formatWindow(w.start, w.end, off)}`,
        secondary: occ.length > 1 ? `+ ${plural(occ.length - 1, 'more interval')}` : null,
        count: occ.length,
        representative: rep || (occ.length === 1 ? w : null),
        occurrences: occ,
      }
    }
    default: {
      const w = rep || occ[0]
      const more = occ.length - 1
      return {
        mode: 'single',
        primary: formatWindow(w.start, w.end, off),
        secondary: more > 0 ? `+ ${plural(more, 'more occurrence')}` : null,
        count: occ.length,
        representative: rep || (occ.length === 1 ? w : null),
        occurrences: occ,
      }
    }
  }
}

/**
 * The report's timing phrase — one clause, deterministic, or null.
 *
 *   "Typically 1–3 PM across 6 observed days."
 *   "Sep 11, 10:14–10:31 AM."
 *   "Across 3 occupied windows, Mar 2 – 4, 2026."
 *   "Aligned readings, Mar 2, 12:00 AM – Mar 5, 11:45 PM."
 *
 * Never an occurrence list: the report stays the length it is. Built from
 * the same windows as the card, so the two cannot disagree.
 */
export function patternTiming(pattern, bundle, options = {}) {
  const p = obj(pattern)
  const occ = patternOccurrences(p, bundle, options)
  if (!occ.length) return null
  const off = { utcOffsetMin: offsetFor(bundle, options), sep: ', ' }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
  switch (p.kind) {
    case 'recurring_cycle': {
      const hours = typicalHours(p)
      if (hours && hours.label) return `Typically ${hours.label} across ${plural(occ.length, 'observed day')}.`
      return `${formatWindow(occ[0].start, occ[0].end, off)}${occ.length > 1 ? ` and ${plural(occ.length - 1, 'further day')}` : ''}.`
    }
    case 'occupancy_comparison': {
      const span = formatDateRange(occ[0].start, occ[occ.length - 1].end, off)
      return `Across ${plural(occ.length, 'occupied window')}${span ? `, ${span}` : ''}.`
    }
    case 'indoor_outdoor_comparison':
      return `Aligned readings, ${formatWindow(occ[0].start, occ[0].end, off)}.`
    default: {
      const w = occ.find((x) => x.representative) || occ[0]
      return `${formatWindow(w.start, w.end, off)}.`
    }
  }
}

/**
 * A chart-navigation request for one occurrence of a pattern, or null.
 *
 * Resolved against the pattern's CURRENT windows and nothing else: an
 * occurrence id that belongs to no window of this pattern — a stale link, a
 * window that stopped existing when the data changed — yields null rather
 * than a guessed interval. With no id, the representative occurrence. The
 * request carries every window too, so a chart can mark all of them and
 * emphasize the one asked for.
 *
 * @returns {{patternId, occurrenceId, datasetIds, params, start, end, eventIds,
 *   windows:Array<{id,start,end,representative}>}|null}
 */
export function occurrenceNavigation(pattern, occurrenceId) {
  const p = obj(pattern)
  const windows = arr(p.occurrenceWindows).filter((w) => w && isNum(obj(w).start))
  const target = occurrenceId == null
    ? representativeOccurrence(p)
    : windows.find((w) => w.id === occurrenceId) || null
  if (!target || !p.id) return null
  return {
    patternId: p.id,
    occurrenceId: target.id,
    datasetIds: arr(target.datasetIds).length ? arr(target.datasetIds) : arr(p.datasetIds),
    params: arr(p.params),
    start: target.start,
    end: isNum(target.end) ? target.end : target.start,
    eventIds: arr(target.eventIds),
    windows: windows.map((w) => ({ id: w.id, start: w.start, end: isNum(w.end) ? w.end : w.start, representative: !!w.representative })),
  }
}

/**
 * How a reported complaint period and a pattern's occurrences line up, as
 * one short line, or null.
 *
 * ── Only a conclusive answer earns a line ──────────────────────────────
 * `insufficient_temporal_evidence` renders NOTHING. It is the common
 * answer — most sessions have more than one zone, and the record does not
 * say which room a logger was in — so rendering it would put "not
 * comparable" on every card of every multi-zone session. The reason is not
 * lost: it rides on the relationship object for the assistant and for a
 * later surface that has somewhere useful to put it. A card is not that
 * place.
 *
 * ── It states two clocks agreeing, and never why ───────────────────────
 * No verb here connects the pattern to the complaint. "Occurred then"
 * is a statement about time. Whether the parameter bears on anything the
 * investigation is entertaining is a separate axis on the relationship and
 * is deliberately NOT rendered: a card that said so would be the framing
 * this layer exists to avoid.
 *
 * @param {object} relationship one of `detectTemporalRelationships`
 * @returns {{label:string, parts:string[]}|null}
 */
export function patternAgreement(relationship) {
  const r = obj(relationship)
  const d = obj(r.observed_days)
  const period = str(r.reported_period).toLowerCase()
  if (!period || !isNum(d.withOccurrence) || d.withOccurrence <= 0) return null
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`
  if (r.relationship === 'temporal_overlap') {
    return { label: 'Reported', parts: [period, `pattern occurred then on ${d.inPeriod} of ${days(d.withOccurrence)}`] }
  }
  if (r.relationship === 'temporal_mismatch') {
    return { label: 'Reported', parts: [period, `pattern occurred on ${days(d.withOccurrence)}, none of them then`] }
  }
  return null
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
