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
 */

import { readings, nominalIntervalSec, occupancySplit } from './monitoringStats.js'
import { alignDatasets } from './sensorParser.js'
import { fnv1aHex, median } from './forensicEvents.js'

const isNum = (v) => v != null && Number.isFinite(v)
const round3 = (v) => (isNum(v) ? Number(v.toPrecision(3)) : null)

/** Pattern kinds this module can emit. Frozen so a test can pin the vocabulary. */
export const PATTERN_KINDS = Object.freeze([
  'recurring_cycle', 'coincidence', 'occupancy_relation',
  'indoor_outdoor_tracking', 'indoor_only', 'zone_localized', 'event_proximity',
])

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
  occupancy_relation: [],
  coincidence: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an activity that would account for both traces moving together cannot be checked.' },
  ],
  indoor_only: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an indoor activity at this time cannot be confirmed or ruled out.' },
  ],
  zone_localized: [
    { input: 'annotations', why: 'Nothing was logged during monitoring, so an activity confined to this zone cannot be checked.' },
  ],
  indoor_outdoor_tracking: [],
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

/** A deterministic pattern id, derived from what the pattern is about. */
export function patternId(kind, memberIds) {
  const sig = [...new Set(memberIds || [])].sort().join('|')
  return `pat-${kind}-${fnv1aHex(`${kind}::${sig}`)}`
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
    hours.get(hour).push(r.v)
  })

  const perDay = []
  byDay.forEach((hours, day) => {
    // A day represented by only a couple of hours cannot show a daily shape.
    if (hours.size < 6) return
    let peak = null; let trough = null
    hours.forEach((vals, hour) => {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length
      if (!peak || m > peak.mean) peak = { hour, mean: m }
      if (!trough || m < trough.mean) trough = { hour, mean: m }
    })
    if (peak && trough) perDay.push({ day, peakHour: peak.hour, amplitude: peak.mean - trough.mean })
  })
  if (perDay.length < MIN_CYCLE_DAYS) return null

  // The modal peak hour, and the days that agree with it within tolerance.
  const hourDist = (a, b) => { const d = Math.abs(a - b) % 24; return Math.min(d, 24 - d) }
  let best = null
  perDay.forEach((candidate) => {
    const agree = perDay.filter((d) => hourDist(d.peakHour, candidate.peakHour) <= CYCLE_HOUR_TOLERANCE)
    if (!best || agree.length > best.agree.length) best = { hour: candidate.peakHour, agree }
  })
  if (!best || best.agree.length < MIN_CYCLE_DAYS) return null

  return {
    param,
    peakHour: best.hour,
    daysObserved: perDay.length,
    daysAgreeing: best.agree.length,
    meanAmplitude: round3(median(best.agree.map((d) => d.amplitude))),
    utcOffsetMin: offsetMin,
    // The per-day figures the cycle was concluded from. A smooth cycle
    // produces no EVENTS — there is no abrupt step or outlying peak in a slow
    // daily swing — so without these the pattern would have nothing to show
    // under "Review evidence". The measurement is the evidence here.
    days: best.agree
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => ({ dayStartTs: d.day * 86400000 - offsetMin * 60000, peakHour: d.peakHour, amplitude: round3(d.amplitude) })),
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
  const add = (kind, memberIds, body) => {
    if (out.filter((p) => p.kind === kind).length >= MAX_PER_KIND) return
    out.push({
      id: patternId(kind, memberIds),
      kind,
      eventIds: [...new Set(memberIds)].sort(),
      missingContext: missingContextFor(kind, present),
      ...body,
    })
  }

  if (!indoor) return out
  const indoorPoints = (raw[indoor.datasetId] && raw[indoor.datasetId].points) || []
  const slackMs = (nominalIntervalSec(indoorPoints) || 300) * 1000

  // ── Recurring daily cycles ───────────────────────────────────────────
  indoor.params.forEach((param) => {
    const cycle = detectRecurringCycle(indoorPoints, param, { utcOffsetMin: offsetMin })
    if (!cycle) return
    const members = indoor.events.filter((e) => e.param === param).map((e) => e.id)
    add('recurring_cycle', members, {
      params: [param],
      datasetIds: [indoor.datasetId],
      startTs: null,
      endTs: null,
      summary: cycle,
    })
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
      })
    }
  }

  // ── Occupied vs unoccupied ───────────────────────────────────────────
  // Only when windows exist. Their ABSENCE is never a standalone pattern; it
  // is named against the patterns whose reading it would change.
  if (occ.length) {
    indoor.params.forEach((param) => {
      const split = occupancySplit(indoorPoints, param, occ)
      if (!isNum(split.delta)) return
      add('occupancy_relation', indoor.events.filter((e) => e.param === param).map((e) => e.id), {
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
      })
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
      add('indoor_outdoor_tracking', [], {
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
      })

      // An indoor excursion with nothing moving outdoors at the same time.
      indoor.events
        .filter((e) => e.param === param && (e.kind === 'peak' || e.kind === 'sustained'))
        .forEach((e) => {
          const concurrent = outdoor.events.some((o) => o.param === param && windowsMeet(e, o, slackMs))
          if (concurrent) return
          add('indoor_only', [e.id], {
            params: [param],
            datasetIds: [indoor.datasetId, outdoor.datasetId],
            startTs: e.startTs,
            endTs: e.endTs,
            summary: { eventKind: e.kind, magnitude: e.magnitude, outdoorEventsInWindow: 0 },
          })
        })
      void outPoints
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
          add('zone_localized', [e.id], {
            params: [e.param],
            datasetIds: [self.datasetId],
            startTs: e.startTs,
            endTs: e.endTs,
            summary: { zone: self.label, eventKind: e.kind, zonesCompared: elsewhere.length },
          })
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
          annotations: near.map((a) => ({ t: a.t, label: a.label || null })),
        },
      })
    })
  }

  return out
}
