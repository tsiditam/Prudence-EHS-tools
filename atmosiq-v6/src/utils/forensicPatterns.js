/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Forensic PATTERNS — where events repeat or relate.
 *
 *   event    — something changed                (forensicEvents.js)
 *   pattern  — events repeat or relate          (this file, deterministic)
 *   hypothesis — a possible explanation          (the model, never here)
 *
 * A pattern carries measured numbers and the ids of the events it rests on. It
 * carries no prose, no ranking and no explanation: "CO₂ peaked between 14:00
 * and 15:00 on three of four days, mean amplitude 380" is a pattern. "CO₂ rises
 * with afternoon occupancy" is a hypothesis and belongs to the model, which may
 * only reach it by citing these ids.
 *
 * ── Missing context is a property of a pattern, not of a session ───────
 * The obvious way to report missing context is a session-level checklist, and
 * it is wrong. Logger Studio has no HVAC-schedule field at all, so a checklist
 * would complain about the HVAC schedule on every analysis ever run, and an
 * assessor would learn to skip the whole section inside a week.
 *
 * So a contextual input is only named where it would MATERIALLY CHANGE the
 * reading of one specific pattern. The HVAC schedule is named against a
 * recurring daily cycle, because a cycle driven by a timer and a cycle driven
 * by people are indistinguishable without it. It is not named against an
 * isolated solvent spike, where it would settle nothing. `CONTEXT_RULES` below
 * is that mapping, and it is deliberately small: every entry has to justify why
 * the absent input changes what this pattern can support.
 *
 * ── Temporal provenance is deterministic, and pattern-specific ─────────
 * Every pattern carries `occurrenceWindows`: the interval(s) of the record
 * that actually produced it, so an assessor reading a long run can navigate
 * back to the stretch of chart behind a card. The windows are derived HERE,
 * from the same inputs the fingerprint digests, and never from prose — the
 * model interprets a pattern; it does not say when it happened.
 *
 * One rule per kind rather than one generic timestamp, because the kinds are
 * temporally different things:
 *
 *   • an event-backed pattern (a no-matching-outdoor/zone event, an excursion
 *     near a logged activity) occurs when its member event does, so the window
 *     is copied from that event rather than recomputed from readings;
 *   • a coincidence occurs over the PAIRED window — the span covering both
 *     member events — not over one event's window chosen arbitrarily;
 *   • a recurring cycle is not one event. It carries one window per agreeing
 *     day (that day's peak hour, bounded by the readings inside it) and a
 *     deterministic representative day (`representativeCycleDay`), so a card
 *     can say "usually 1–3 PM, Sep 9 representative, five more" and never
 *     collapse six days to one timestamp;
 *   • an occupancy comparison is an aggregate over the occupied windows that
 *     contributed readings, so it carries each of those and NO representative
 *     — implying one specific occurrence would misdescribe the statistic;
 *   • an indoor/outdoor comparison is computed over aligned pairs, so its one
 *     window is the aligned interval actually used — the whole run when the
 *     pairing spans it — rather than an invented representative event.
 *
 * Window ids are derived from the pattern's id and the window's bounds and
 * member events (`occurrenceId`), never from array position, so the same
 * session reproduces the same ids and a navigation target survives a re-run.
 */

import { readings, nominalIntervalSec, occupancySplit } from './monitoringStats.js'
import { alignDatasets } from './sensorParser.js'
import { fnv1aHex, median, robustSpread } from './forensicEvents.js'

const isNum = (v) => v != null && Number.isFinite(v)
const round3 = (v) => (isNum(v) ? Number(v.toPrecision(3)) : null)

/** Pattern kinds this module can emit. Frozen so a test can pin the vocabulary. */
export const PATTERN_KINDS = Object.freeze([
  'recurring_cycle', 'coincidence', 'occupancy_comparison',
  'indoor_outdoor_comparison', 'no_matching_outdoor_event',
  'no_matching_zone_event', 'event_proximity',
])

/**
 * Why these names and not the obvious ones.
 *
 * `indoor_outdoor_comparison` was `indoor_outdoor_tracking`. The detector emits
 * whenever a correlation is mathematically defined, so an r of 0.02 would have
 * been published under a name asserting the traces track each other. The honest
 * fix is the neutral name, not an arbitrary cutoff on r invented to keep the
 * old one: the deterministic layer states the measured relationship and the
 * model decides whether it is worth raising.
 *
 * `occupancy_comparison` was `occupancy_relation`, for the same reason — any
 * finite delta produced one, including a negligible one.
 *
 * `no_matching_outdoor_event` and `no_matching_zone_event` were `indoor_only`
 * and `zone_localized`. Those named a CONCLUSION the data does not reach: the
 * absence of a detected event next door is not the absence of a change. The
 * other dataset may have thinner coverage, a different logging interval, or a
 * real change its own dispersion does not mark. So the pattern states exactly
 * what is known — nothing matching was detected there — and only after
 * `coversWindow` has established the comparison dataset actually had readings
 * across that window to be silent about.
 */

/** Contextual inputs a pattern's reading can depend on. */
export const CONTEXT_INPUTS = Object.freeze({
  occupancy: 'Occupancy periods',
  hvac_schedule: 'HVAC operating schedule',
  outdoor: 'Outdoor baseline dataset',
  annotations: 'Logged events during monitoring',
})

/**
 * Which absent input matters to which pattern, and why.
 *
 * The `why` is the whole point of the entry: it says what the pattern cannot
 * distinguish without that input. An entry that cannot express one does not
 * belong here.
 */
export const CONTEXT_RULES = Object.freeze({
  recurring_cycle: [
    { input: 'hvac_schedule', why: 'A daily cycle driven by a system timer and one driven by people occupy the same hours. Without the HVAC operating schedule the two cannot be separated.' },
    { input: 'occupancy', why: 'No occupancy periods are marked, so the cycle cannot be compared against when the space was in use.' },
  ],
  occupancy_comparison: [],
  coincidence: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an activity that would account for both traces moving together cannot be checked.' },
  ],
  no_matching_outdoor_event: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an indoor activity at this time cannot be confirmed or ruled out.' },
  ],
  no_matching_zone_event: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an activity confined to this zone cannot be checked.' },
  ],
  indoor_outdoor_comparison: [],
  event_proximity: [],
})

/** Abrupt events are the ones an annotation would ordinarily explain. */
const STEP_KINDS = new Set(['step_up', 'step_down'])

/**
 * Name the absent inputs that matter to this pattern.
 *
 * @param {string} kind pattern kind
 * @param {object} present which inputs the session actually has
 * @returns {{id:string,label:string,why:string}[]}
 */
export function missingContextFor(kind, present = {}) {
  return (CONTEXT_RULES[kind] || [])
    .filter((rule) => !present[rule.input])
    .map((rule) => ({ id: rule.input, label: CONTEXT_INPUTS[rule.input], why: rule.why }))
}

/**
 * A deterministic pattern id, derived from everything that makes the pattern
 * the one it is.
 *
 * Membership alone is not enough, and that was a real collision: a smooth
 * recurring cycle carries NO event ids (there is no abrupt step in a slow
 * swing), so a CO₂ cycle and a PM2.5 cycle both hashed the empty set and
 * received the same id. The same held for every indoor/outdoor and occupancy
 * comparison. Since an accepted interpretation is stored against this id, two
 * patterns sharing one would let an assessor's acceptance of one silently
 * apply to the other.
 *
 * So identity is the semantic scope: kind, the datasets involved, the
 * parameters involved, an optional subject discriminator for patterns that can
 * repeat within one parameter, and the member events where there are any.
 * Order-insensitive, so the same analysis reproduces the same id.
 */
export function patternId(kind, scope = {}) {
  const list = (xs) => [...new Set(xs || [])].map(String).sort().join(',')
  const sig = [
    kind,
    list(scope.datasetIds),
    list(scope.params),
    scope.subject == null ? '' : String(scope.subject),
    list(scope.eventIds),
  ].join('::')
  return `pat-${kind}-${fnv1aHex(sig)}`
}

/**
 * A deterministic occurrence-window id.
 *
 * Derived from the pattern it belongs to, the window's bounds, and the member
 * events inside it — everything that makes the window the one it is — and
 * never from its position in the list. A navigation request stored against
 * this id (a "view occurrence" link) resolves to the same stretch of chart on
 * every re-run of the same session, and to nothing at all once the data has
 * changed underneath it, which is the correct answer.
 */
export function occurrenceId(patternId, start, end, eventIds = []) {
  const t = (v) => (isNum(v) ? Math.round(v).toString(36) : 'nt')
  const members = [...new Set(eventIds || [])].map(String).sort().join(',')
  return `occ-${fnv1aHex([String(patternId == null ? '' : patternId), t(start), t(end), members].join('::'))}`
}

/** One occurrence window in the compact, deterministic shape every pattern carries. */
function occurrence(patternId, w) {
  const start = isNum(w.start) ? w.start : null
  const end = isNum(w.end) ? w.end : start
  const eventIds = [...new Set(w.eventIds || [])].sort()
  const out = {
    id: occurrenceId(patternId, start, end, eventIds),
    start,
    end,
    eventIds,
    datasetIds: [...new Set(w.datasetIds || [])].sort(),
  }
  // Present only when true: a comparison or an aggregate carries no
  // representative, and an absent key says so without a second vocabulary.
  if (w.representative) out.representative = true
  return out
}

/**
 * The day a recurring cycle is best shown by — deterministic, and chosen to
 * MATCH the summary rather than to impress.
 *
 * Among the agreeing days, prefer those whose peak fell in the modal hour
 * itself (not merely within tolerance); among those, the day whose amplitude
 * sits closest to the cycle's median amplitude; and on a tie, the earliest.
 * The representative is the day the summary figures already describe, so a
 * reader who clicks through sees the pattern the card stated, not its
 * largest or its latest instance.
 *
 * @param {object} cycle a `detectRecurringCycle` result
 * @returns {object|null} the chosen `days[]` entry
 */
export function representativeCycleDay(cycle) {
  const days = Array.isArray(cycle && cycle.days) ? cycle.days.filter((d) => d && isNum(d.dayStartTs)) : []
  if (!days.length) return null
  const exact = days.filter((d) => d.peakHour === cycle.peakHour)
  const pool = exact.length ? exact : days
  const target = isNum(cycle.meanAmplitude) ? cycle.meanAmplitude : null
  return pool.slice().sort((a, b) => {
    const da = target == null ? 0 : Math.abs((a.amplitude || 0) - target)
    const db = target == null ? 0 : Math.abs((b.amplitude || 0) - target)
    return da - db || a.dayStartTs - b.dayStartTs
  })[0]
}

/**
 * Does `points` actually carry readings ACROSS this window for `param`?
 *
 * Required before any "nothing matching was detected over there" pattern. A
 * dataset that stopped logging, started late, or samples far more coarsely is
 * silent for reasons that have nothing to do with the air, and inferring
 * localization from that silence is the defect this guards.
 *
 * The window must be bracketed — a reading at or before it and a reading at or
 * after it — and carry at least `MIN_OVERLAP_SAMPLES` readings inside.
 */
export const MIN_OVERLAP_SAMPLES = 2

export function coversWindow(points, param, startTs, endTs, slackMs = 0) {
  if (!isNum(startTs)) return false
  const end = isNum(endTs) ? endTs : startTs
  const ts = readings(points, param).map((r) => r.t).filter(isNum)
  if (!ts.length) return false
  const before = ts.some((t) => t <= startTs + slackMs)
  const after = ts.some((t) => t >= end - slackMs)
  const inside = ts.filter((t) => t >= startTs - slackMs && t <= end + slackMs).length
  return before && after && inside >= MIN_OVERLAP_SAMPLES
}

/** Pearson correlation of paired samples, or null when undefined. */
export function correlation(xs, ys) {
  const n = Math.min((xs || []).length, (ys || []).length)
  if (n < 3) return null
  let sx = 0; let sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n; const my = sy / n
  let num = 0; let dx = 0; let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx; const b = ys[i] - my
    num += a * b; dx += a * a; dy += b * b
  }
  if (dx <= 0 || dy <= 0) return null // a constant series correlates with nothing
  return num / Math.sqrt(dx * dy)
}

/** Local calendar day key and local hour for an instant, offset-pure. */
const localParts = (t, offsetMin) => {
  const shifted = t + (offsetMin || 0) * 60000
  return { day: Math.floor(shifted / 86400000), hour: ((Math.floor(shifted / 3600000) % 24) + 24) % 24 }
}

/**
 * A recurring daily cycle.
 *
 * Not "the 24-hour average profile has a bump" — that can come from a single
 * day. The trace is split into local days, each day's own peak and trough hours
 * are found, and a cycle is reported only when at least `MIN_CYCLE_DAYS` days
 * put their peak in the same hour window. Consistency across days IS the
 * pattern; the mean amplitude is reported so the assessor can see whether it
 * is worth anything.
 */
export const MIN_CYCLE_DAYS = 2
export const CYCLE_HOUR_TOLERANCE = 1

/**
 * How many of the adequately sampled days must agree before a cycle is claimed.
 *
 * A fixed floor of two was wrong on a long deployment: in a seven-day record,
 * two days happening to peak in the same hour while the other five disagree is
 * coincidence, not recurrence. Support therefore scales with how many days were
 * actually available — a simple majority — while never dropping below the floor
 * that makes "recurring" mean anything at all.
 */
export function requiredCycleDays(eligibleDays) {
  return Math.max(MIN_CYCLE_DAYS, Math.ceil((eligibleDays || 0) / 2))
}

/**
 * How far the day-to-day swing must stand above the trace's own short-term
 * noise before the cycle is worth reporting.
 *
 * Every day has a mathematical maximum, so without this a dead-flat trace
 * carrying nothing but sampling jitter produces a "recurring daily cycle" with
 * a peak hour. The comparison is against the robust spread of the FIRST
 * DIFFERENCES — sample-to-sample noise — rather than the spread of the values,
 * which would be circular: on a real cycle the swing IS most of the value
 * spread. Data-relative, unit-free, and no concentration anywhere.
 */
export const MIN_CYCLE_AMPLITUDE_K = 3

export function detectRecurringCycle(points, param, opts = {}) {
  const offsetMin = isNum(opts.utcOffsetMin) ? opts.utcOffsetMin : 0
  const rs = readings(points, param).filter((r) => isNum(r.t))
  if (!rs.length) return null

  const byDay = new Map()
  rs.forEach((r) => {
    const { day, hour } = localParts(r.t, offsetMin)
    if (!byDay.has(day)) byDay.set(day, new Map())
    const hours = byDay.get(day)
    if (!hours.has(hour)) hours.set(hour, [])
    hours.get(hour).push(r)
  })

  // Short-term noise: how much this trace moves between adjacent samples.
  const diffs = []
  for (let i = 1; i < rs.length; i++) diffs.push(rs[i].v - rs[i - 1].v)
  const noise = robustSpread(diffs).sigma

  const perDay = []
  byDay.forEach((hours, day) => {
    // A day represented by only a couple of hours cannot show a daily shape.
    if (hours.size < 6) return
    let peak = null; let trough = null
    hours.forEach((rsInHour, hour) => {
      const m = rsInHour.reduce((a, r) => a + r.v, 0) / rsInHour.length
      if (!peak || m > peak.mean) peak = { hour, mean: m, rs: rsInHour }
      if (!trough || m < trough.mean) trough = { hour, mean: m }
    })
    if (peak && trough) {
      // The peak hour's window, bounded by the readings that were actually
      // averaged to find it: the narrowest interval this day's figure rests on.
      const ts = peak.rs.map((r) => r.t)
      perDay.push({
        day, peakHour: peak.hour, amplitude: peak.mean - trough.mean,
        peakStartTs: Math.min(...ts), peakEndTs: Math.max(...ts),
      })
    }
  })
  const required = requiredCycleDays(perDay.length)
  if (perDay.length < MIN_CYCLE_DAYS) return null

  // The modal peak hour, and the days that agree with it within tolerance.
  const hourDist = (a, b) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d) }
  let best = null
  perDay.forEach((candidate) => {
    const agree = perDay.filter((d) => hourDist(d.peakHour, candidate.peakHour) <= CYCLE_HOUR_TOLERANCE)
    if (!best || agree.length > best.agree.length) best = { hour: candidate.peakHour, agree }
  })
  if (!best || best.agree.length < required) return null

  // A swing indistinguishable from the trace's own jitter is not a cycle.
  const amplitude = median(best.agree.map((d) => d.amplitude))
  if (!isNum(amplitude)) return null
  if (isNum(noise) && noise > 0 && amplitude < MIN_CYCLE_AMPLITUDE_K * noise) return null

  return {
    param,
    peakHour: best.hour,
    daysObserved: perDay.length,
    daysAgreeing: best.agree.length,
    daysRequired: required,
    meanAmplitude: round3(amplitude),
    shortTermNoise: round3(noise),
    utcOffsetMin: offsetMin,
    // The per-day figures the cycle was concluded from. A smooth cycle
    // produces no EVENTS — there is no abrupt step or outlying peak in a slow
    // daily swing — so without these the pattern would have nothing to show
    // under "Review evidence". The measurement is the evidence here.
    days: best.agree
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => ({
        dayStartTs: d.day * 86400000 - offsetMin * 60000,
        peakHour: d.peakHour,
        amplitude: round3(d.amplitude),
        // Where on that day the peak hour's readings sit — the occurrence
        // window a card can navigate to. Source timestamps, unrounded.
        peakStartTs: d.peakStartTs,
        peakEndTs: d.peakEndTs,
      })),
  }
}

/** Do two windows overlap, allowing one sampling interval of slack? */
const windowsMeet = (a, b, slackMs) => {
  const aStart = a.startTs; const aEnd = isNum(a.endTs) ? a.endTs : a.startTs
  const bStart = b.startTs; const bEnd = isNum(b.endTs) ? b.endTs : b.startTs
  if (!isNum(aStart) || !isNum(bStart)) return false
  return aStart - slackMs <= bEnd && bStart - slackMs <= aEnd
}

/** Cap on how many patterns of one kind are worth emitting before review. */
export const MAX_PER_KIND = 12

/**
 * Build every pattern the session's events and datasets support.
 *
 * @param {object} input
 * @param {Array} input.datasets `detectDatasetEvents` results, one per dataset
 * @param {Array}  [input.occupancyWindows]
 * @param {Array}  [input.annotations] logged monitoring events `[{ t, label }]`
 * @param {object} [input.rawDatasets] id → the parsed dataset (for series maths)
 * @param {number} [input.utcOffsetMin]
 * @returns {object[]} patterns, each carrying the event ids it rests on
 */
export function buildPatterns(input = {}) {
  const sets = Array.isArray(input.datasets) ? input.datasets : []
  const raw = input.rawDatasets && typeof input.rawDatasets === 'object' ? input.rawDatasets : {}
  const occ = Array.isArray(input.occupancyWindows) ? input.occupancyWindows : []
  const notes = (Array.isArray(input.annotations) ? input.annotations : []).filter((a) => a && isNum(a.t))
  const offsetMin = isNum(input.utcOffsetMin) ? input.utcOffsetMin : 0

  const indoor = sets.find((d) => d.role === 'indoor') || sets[0] || null
  const outdoor = sets.find((d) => d.role === 'outdoor') || null
  const zones = sets.filter((d) => d.role === 'zone')

  const present = {
    occupancy: occ.length > 0,
    hvac_schedule: false, // Logger Studio captures no HVAC schedule today
    outdoor: !!outdoor,
    annotations: notes.length > 0,
  }
  const out = []
  // `body` carries datasetIds and params, which are part of identity — a smooth
  // cycle has no member events, so without them every cycle would share an id.
  // `windows` is called with the minted pattern id, because occurrence ids are
  // derived from it; it returns the raw windows this pattern occurred over.
  const add = (kind, memberIds, body, windows) => {
    if (out.filter((p) => p.kind === kind).length >= MAX_PER_KIND) return
    const eventIds = [...new Set(memberIds)].sort()
    const id = patternId(kind, {
      datasetIds: body.datasetIds,
      params: body.params,
      subject: body.subject,
      eventIds,
    })
    const raw = typeof windows === 'function' ? windows(id) : []
    out.push({
      id,
      kind,
      eventIds,
      missingContext: missingContextFor(kind, present),
      ...body,
      occurrenceWindows: (Array.isArray(raw) ? raw : [])
        .filter((w) => w && isNum(w.start))
        .map((w) => occurrence(id, w))
        .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
    })
  }
  /** An event-backed window: the event's own bounds, copied, never recomputed. */
  const eventWindow = (e, datasetIds) => ({ start: e.startTs, end: e.endTs, eventIds: [e.id], datasetIds })

  if (!indoor) return out
  const indoorPoints = (raw[indoor.datasetId] && raw[indoor.datasetId].points) || []
  const slackMs = (nominalIntervalSec(indoorPoints) || 300) * 1000

  // ── Recurring daily cycles ───────────────────────────────────────────
  indoor.params.forEach((param) => {
    const cycle = detectRecurringCycle(indoorPoints, param, { utcOffsetMin: offsetMin })
    if (!cycle) return
    const members = indoor.events.filter((e) => e.param === param).map((e) => e.id)
    const rep = representativeCycleDay(cycle)
    add('recurring_cycle', members, {
      params: [param],
      datasetIds: [indoor.datasetId],
      startTs: null,
      endTs: null,
      summary: cycle,
    }, () => cycle.days.map((d) => ({
      // One window per agreeing day: that day's peak hour, bounded by the
      // readings averaged inside it. A cycle is never one timestamp.
      start: d.peakStartTs,
      end: d.peakEndTs,
      datasetIds: [indoor.datasetId],
      representative: !!rep && d.dayStartTs === rep.dayStartTs,
    })))
  })

  // ── Cross-parameter coincidence ──────────────────────────────────────
  const levelEvents = indoor.events.filter((e) => e.kind !== 'gap' && e.kind !== 'flatline')
  for (let i = 0; i < levelEvents.length; i++) {
    for (let j = i + 1; j < levelEvents.length; j++) {
      const a = levelEvents[i]; const b = levelEvents[j]
      if (a.param === b.param) continue
      if (!windowsMeet(a, b, slackMs)) continue
      add('coincidence', [a.id, b.id], {
        params: [a.param, b.param].sort(),
        datasetIds: [indoor.datasetId],
        startTs: Math.min(a.startTs, b.startTs),
        endTs: Math.max(isNum(a.endTs) ? a.endTs : a.startTs, isNum(b.endTs) ? b.endTs : b.startTs),
        summary: { overlapSlackSec: slackMs / 1000, kinds: [a.kind, b.kind] },
      }, () => [{
        // The PAIRED window — the span covering both events — not either
        // event's own window. The two may only meet within one sampling
        // interval of slack, so their intersection can be empty; the span
        // that contains both is what the coincidence rests on.
        start: Math.min(a.startTs, b.startTs),
        end: Math.max(isNum(a.endTs) ? a.endTs : a.startTs, isNum(b.endTs) ? b.endTs : b.startTs),
        eventIds: [a.id, b.id],
        datasetIds: [indoor.datasetId],
      }])
    }
  }

  // ── Occupied vs unoccupied ───────────────────────────────────────────
  // Only when windows exist. Their ABSENCE is never a standalone pattern; it
  // is named against the patterns whose reading it would change.
  if (occ.length) {
    indoor.params.forEach((param) => {
      const split = occupancySplit(indoorPoints, param, occ)
      if (!isNum(split.delta)) return
      // The windows that actually contributed: those with at least one reading
      // of this parameter inside them. A window the logger never sampled took
      // no part in the mean and is not an occurrence of the comparison.
      // TODO(claude): `occupancySplit` treats every window as occupied
      // regardless of `kind`; the report sheet filters to `occupied` first.
      const ts = readings(indoorPoints, param).map((r) => r.t).filter(isNum)
      const contributing = occ.filter((w) => isNum(w.start) && isNum(w.end) && ts.some((t) => t >= w.start && t <= w.end))
      add('occupancy_comparison', indoor.events.filter((e) => e.param === param).map((e) => e.id), {
        params: [param],
        datasetIds: [indoor.datasetId],
        startTs: null,
        endTs: null,
        summary: {
          meanOccupied: round3(split.meanOccupied),
          meanUnoccupied: round3(split.meanUnoccupied),
          delta: round3(split.delta),
          windows: occ.length,
        },
      }, () => contributing.map((w) => ({ start: w.start, end: w.end, datasetIds: [indoor.datasetId] })))
    })
  }

  // ── Indoor / outdoor ─────────────────────────────────────────────────
  if (outdoor) {
    const outPoints = (raw[outdoor.datasetId] && raw[outdoor.datasetId].points) || []
    const shared = indoor.params.filter((p) => outdoor.params.includes(p))
    shared.forEach((param) => {
      const aligned = alignDatasets(
        [{ ...(raw[indoor.datasetId] || {}), id: 'in' }, { ...(raw[outdoor.datasetId] || {}), id: 'out' }],
        param,
      )
      const pairs = (aligned.points || []).filter((p) => isNum(p.in) && isNum(p.out))
      const r = correlation(pairs.map((p) => p.in), pairs.map((p) => p.out))
      if (r == null) return
      add('indoor_outdoor_comparison', [], {
        params: [param],
        datasetIds: [indoor.datasetId, outdoor.datasetId],
        startTs: null,
        endTs: null,
        summary: {
          r: round3(r),
          pairedSamples: pairs.length,
          meanIndoor: round3(pairs.reduce((s, p) => s + p.in, 0) / pairs.length),
          meanOutdoor: round3(pairs.reduce((s, p) => s + p.out, 0) / pairs.length),
        },
      }, () => [{
        // The aligned interval the correlation was computed over — first to
        // last paired reading. When the pairing spans the run, this IS the
        // run; no representative event is invented for a statistic.
        start: pairs[0].t,
        end: pairs[pairs.length - 1].t,
        datasetIds: [indoor.datasetId, outdoor.datasetId],
      }])

      // An indoor excursion with nothing matching detected outdoors.
      //
      // Only claimable when the outdoor dataset actually covered that window.
      // Silence from a logger that had stopped, started late, or samples far
      // more coarsely says nothing about the air, and reading localization into
      // it is exactly the inference this guard exists to prevent.
      indoor.events
        .filter((e) => e.param === param && (e.kind === 'peak' || e.kind === 'sustained'))
        .forEach((e) => {
          const concurrent = outdoor.events.some((o) => o.param === param && windowsMeet(e, o, slackMs))
          if (concurrent) return
          if (!coversWindow(outPoints, param, e.startTs, e.endTs, slackMs)) return
          add('no_matching_outdoor_event', [e.id], {
            params: [param],
            datasetIds: [indoor.datasetId, outdoor.datasetId],
            startTs: e.startTs,
            endTs: e.endTs,
            summary: {
              eventKind: e.kind,
              magnitude: e.magnitude,
              outdoorEventsInWindow: 0,
              outdoorCoveredWindow: true,
            },
          }, () => [eventWindow(e, [indoor.datasetId, outdoor.datasetId])])
        })
    })
  }

  // ── Zone-localized events ────────────────────────────────────────────
  if (zones.length) {
    const others = [indoor, ...zones]
    zones.concat(indoor).forEach((self) => {
      self.events
        .filter((e) => e.kind === 'peak' || e.kind === 'sustained')
        .forEach((e) => {
          const elsewhere = others.filter((d) => d.datasetId !== self.datasetId)
          if (!elsewhere.length) return
          const alsoThere = elsewhere.some((d) => d.events.some((o) => o.param === e.param && windowsMeet(e, o, slackMs)))
          if (alsoThere) return
          // Only the zones that actually covered this window can be silent
          // about it. A zone whose logger was down says nothing either way.
          const covering = elsewhere.filter((d) => coversWindow(
            (raw[d.datasetId] && raw[d.datasetId].points) || [], e.param, e.startTs, e.endTs, slackMs,
          ))
          if (!covering.length) return
          add('no_matching_zone_event', [e.id], {
            params: [e.param],
            datasetIds: [self.datasetId],
            startTs: e.startTs,
            endTs: e.endTs,
            summary: {
              zone: self.label,
              eventKind: e.kind,
              zonesCompared: covering.length,
              zonesWithoutCoverage: elsewhere.length - covering.length,
            },
          }, () => [eventWindow(e, [self.datasetId])])
        })
    })
  }

  // ── Proximity to something the assessor logged ───────────────────────
  if (notes.length) {
    indoor.events.filter((e) => STEP_KINDS.has(e.kind) || e.kind === 'peak').forEach((e) => {
      const near = notes.filter((a) => windowsMeet(e, { startTs: a.t, endTs: a.t }, slackMs * 2))
      if (!near.length) return
      add('event_proximity', [e.id], {
        params: [e.param],
        datasetIds: [indoor.datasetId],
        startTs: e.startTs,
        endTs: e.endTs,
        summary: {
          eventKind: e.kind,
          // The ids as well as the labels. Which annotations a pattern rests on
          // is a fact the detector knows and nothing downstream can recover: the
          // scope projection would otherwise have to re-match annotations by
          // timestamp, which is a second opinion about the evidence and could
          // disagree. Same reasoning `bundleEvidence` is written from — make the
          // set explicit so the check downstream is a lookup, not a rederivation.
          annotationIds: near.map((a) => a.id).filter(Boolean),
          annotations: near.map((a) => ({ t: a.t, label: a.label || null })),
        },
      }, () => [eventWindow(e, [indoor.datasetId])])
    })
  }

  return out
}
