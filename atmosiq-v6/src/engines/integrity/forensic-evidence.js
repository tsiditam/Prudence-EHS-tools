/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Logger Forensics as READ-ONLY evidence for the integrity layer.
 *
 * One direction only. This module reads an already-built forensic bundle
 * and never builds one, never re-derives a pattern, and never writes
 * anything back. `forensicPatterns.js` decides what a pattern is and when
 * it occurred; this only asks which of those occurrences fall in a part of
 * the day somebody complained about.
 *
 * ── Absence is not evidence, and it is not a defect ────────────────────
 * A walkthrough with no logger deployed produces no bundle, and that is a
 * normal assessment, not an omission. Every function here returns null or
 * an empty set for a missing bundle, and no caller may turn that into a
 * finding. A finding rests on the walkthrough record; forensic evidence
 * only ever STRENGTHENS one that already exists.
 *
 * ── No causation, in either direction ──────────────────────────────────
 * A CO₂ cycle peaking in the afternoon and an afternoon symptom report are
 * two facts that share a part of the day. This module states the overlap
 * and nothing else. It does not rank, weigh, or suggest that one explains
 * the other, and the finding that carries its output says only that the
 * evidence exists.
 */

const isNum = (v) => v != null && Number.isFinite(v)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * The part-of-day vocabulary, as local hour ranges, half-open [from, to).
 *
 * These are the three time-linked answers `sy_time` offers. They are a
 * READING of a dropdown, not a threshold: nothing here judges a
 * measurement, and no report sentence is built from them. Exported so a
 * test can pin them rather than leaving them inline.
 *
 * Deliberately NOT the 22:00–05:00 window `monitoringInsights.js` uses for
 * its overnight bullet. That one averages readings while a building is
 * empty; this one asks when a person said they felt unwell. Same clock,
 * different questions, so sharing a constant between them would make one
 * of the two wrong the next time either is tuned.
 */
export const COMPLAINT_PERIOD_HOURS = Object.freeze({
  Morning: Object.freeze([6, 12]),
  Afternoon: Object.freeze([12, 17]),
  'Evening / night': Object.freeze([17, 6]),
})

/** Is this local hour inside a range that may wrap past midnight? */
function inRange(hour, range) {
  if (!isNum(hour) || !range) return false
  const [from, to] = range
  return from < to ? hour >= from && hour < to : hour >= from || hour < to
}

/** Site-local hour for an instant. Offset-pure, never the host clock. */
const localHour = (t, offsetMin) => (
  isNum(t) ? ((Math.floor((t + (offsetMin || 0) * 60000) / 3600000) % 24) + 24) % 24 : null
)

/**
 * The forensic occurrences that fall in one part of the day.
 *
 * A window matches when either end of it sits in the range. Occurrence
 * windows are minutes to hours long — one peak hour for a recurring cycle,
 * an event's own span otherwise — so a window cannot straddle a period
 * without one of its ends landing inside it.
 *
 * @param {object|null} bundle a built ForensicAnalysisBundle, or null
 * @param {string} partOfDay one of the COMPLAINT_PERIOD_HOURS keys
 * @returns {{patternIds:string[], occurrenceIds:string[], parameterIds:string[],
 *   start:number, end:number, fingerprint:string|null}|null} null when there
 *   is no bundle, no such period, or nothing overlapping
 */
export function forensicEvidenceForPeriod(bundle, partOfDay) {
  const b = obj(bundle)
  const range = COMPLAINT_PERIOD_HOURS[partOfDay]
  if (!range || !arr(b.patterns).length) return null
  const offsetMin = isNum(obj(b.context).utcOffsetMin) ? obj(b.context).utcOffsetMin : 0

  const patternIds = new Set()
  const occurrenceIds = new Set()
  const params = new Set()
  const datasetIds = new Set()
  let start = null
  let end = null

  arr(b.patterns).forEach((p) => {
    arr(obj(p).occurrenceWindows).forEach((w) => {
      if (!w || !isNum(w.start)) return
      const wEnd = isNum(w.end) ? w.end : w.start
      if (!inRange(localHour(w.start, offsetMin), range) && !inRange(localHour(wEnd, offsetMin), range)) return
      patternIds.add(p.id)
      occurrenceIds.add(w.id)
      arr(p.params).forEach((x) => params.add(x))
      arr(w.datasetIds).length ? arr(w.datasetIds).forEach((d) => datasetIds.add(d)) : arr(p.datasetIds).forEach((d) => datasetIds.add(d))
      if (start == null || w.start < start) start = w.start
      if (end == null || wEnd > end) end = wEnd
    })
  })

  if (!patternIds.size) return null

  // Parameter ids come off the bundle's own parameter blocks rather than
  // being composed from a dataset id and a key here — the bundle already
  // decided what a parameter block is called, and a second construction of
  // that string is a second opinion about it.
  const parameterIds = arr(b.parameters)
    .filter((q) => params.has(obj(q).param) && datasetIds.has(obj(q).datasetId))
    .map((q) => obj(q).id)
    .filter(Boolean)

  return {
    patternIds: [...patternIds].sort(),
    occurrenceIds: [...occurrenceIds].sort(),
    parameterIds: [...new Set(parameterIds)].sort(),
    start,
    end,
    // Carried so a later phase can stale a PERSISTED resolution against the
    // evidence it was made about. Nothing reads it today.
    fingerprint: typeof b.fingerprint === 'string' ? b.fingerprint : null,
  }
}
