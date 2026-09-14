/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Forensic EVENTS — where a trace changed shape.
 *
 * An event is a statement about the SHAPE of a time series and nothing else:
 * "CO₂ rose 420 ppm over 35 minutes ending 14:05". It is not a statement that
 * the reading was high, acceptable, exceeded anything, or means anything. That
 * separation is the whole design:
 *
 *   event    — something changed                (this file, deterministic)
 *   pattern  — events repeat or relate          (forensicPatterns.js)
 *   hypothesis — a possible explanation          (the model, never here)
 *
 * ── Why there are no concentration thresholds in this file ─────────────
 * The registry (`constants/criteria.js`, surfaced through `paramReference`
 * and `exceedance`) is the only place in this product that says what a
 * concentration MEANS. A detector that fired at "CO₂ above 1000" would be a
 * second opinion about that, written by whoever typed the number — exactly the
 * defect class the engine notes keep re-learning. So every threshold here is
 * derived from the series' own distribution and its own sampling geometry:
 *
 *   • Level thresholds come from the median and the median absolute deviation
 *     of THAT parameter in THAT dataset. A detector tuned to ppm would be
 *     meaningless on °C; one tuned to a robust dispersion is meaningless in no
 *     unit at all, because it asks "unusual for this trace?" and not "high?".
 *   • Durations are counted in SAMPLES and converted through the dataset's own
 *     nominal interval, so a 1-minute logger and a 15-minute logger produce the
 *     same events from the same underlying phenomenon.
 *   • Instrument resolution is inferred from the data (the smallest non-zero
 *     step actually observed), never declared.
 *
 * ── The robust-dispersion convention ───────────────────────────────────
 * Outlying points are identified the way the Hampel identifier does it:
 * `median ± k · σ̂` where `σ̂ = 1.4826 · MAD`. The 1.4826 factor makes MAD a
 * consistent estimator of the standard deviation for normally distributed data
 * (Hampel 1974; Rousseeuw & Croux 1993), and `k = 3` is that method's
 * conventional setting. MAD is used rather than the standard deviation on
 * purpose: IAQ traces are skewed and the excursions are exactly what we are
 * looking for, so an estimator those excursions can inflate would hide them.
 *
 * ── The tunable constants, in full ─────────────────────────────────────
 * There are more than the outlier multiplier, and pretending otherwise would
 * hide design choices someone will eventually need to revisit. Every one is
 * exported so a test can state it, and NONE is expressed in a measurement
 * unit — they are all about sampling geometry or how much evidence is enough:
 *
 *   K_OUTLIER          3   Hampel multiplier: how far from usual is unusual.
 *   MAD_TO_SIGMA  1.4826   Fixed by the estimator, not a choice.
 *   MIN_SERIES_SAMPLES 12  Below this, a distribution is not worth describing.
 *   MIN_RUN_SAMPLES     5  Consecutive readings before a run is sustained,
 *                          or before an unmoving stretch is a flatline.
 *   MAX_PEAK_SAMPLES    4  Above this an excursion is not "isolated"; it is
 *                          reported as a sustained elevation instead.
 *
 * `forensicPatterns.js` carries its own set (cycle support, hour tolerance,
 * overlap minimums, per-kind caps) and documents them the same way.
 *
 * ── Failing toward silence ─────────────────────────────────────────────
 * Every guard here returns "no event" rather than a guess. A trace with no
 * timestamps, fewer than `MIN_SERIES_SAMPLES` readings, or zero dispersion
 * yields nothing at all. Over-detection is worse than under-detection: an
 * assessor who is shown five patterns learns to read them, and one who is shown
 * fifty learns to dismiss them.
 */

import { readings, nominalIntervalSec, coverage, GAP_FACTOR } from './monitoringStats.js'

const isNum = (v) => v != null && Number.isFinite(v)
const asc = (a, b) => a - b

/** Consistency constant making MAD an estimator of σ for normal data. */
export const MAD_TO_SIGMA = 1.4826

/** Hampel-identifier multiplier. A point beyond median ± K·σ̂ is an outlier. */
export const K_OUTLIER = 3

/** Below this many readings a distribution is not worth describing. */
export const MIN_SERIES_SAMPLES = 12

/** Consecutive readings before a run counts as sustained, or as a flatline. */
export const MIN_RUN_SAMPLES = 5

/** A peak must return toward baseline within this many samples to be isolated. */
export const MAX_PEAK_SAMPLES = 4

/** Event kinds this module can emit. Frozen so a test can pin the vocabulary. */
export const EVENT_KINDS = Object.freeze([
  'step_up', 'step_down', 'peak', 'sustained', 'flatline', 'gap',
])

/** Median of a numeric sample, or null. Does not mutate its input. */
export function median(values) {
  const xs = (values || []).filter(isNum).slice().sort(asc)
  if (!xs.length) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/**
 * Median absolute deviation, and the robust σ estimate derived from it.
 *
 * @returns {{ median: number|null, mad: number|null, sigma: number|null }}
 */
export function robustSpread(values) {
  const med = median(values)
  if (med == null) return { median: null, mad: null, sigma: null }
  const devs = (values || []).filter(isNum).map((v) => Math.abs(v - med))
  const mad = median(devs)

  // MAD DEGENERACY. The median absolute deviation is exactly zero whenever more
  // than half the sample takes one value — which is the normal case for a
  // quantized logger, and for the first differences of a steadily trending
  // trace where two thirds of the steps are identical. Taken literally that
  // says "no dispersion", and every detector downstream then goes silent,
  // including on a genuine excursion sitting right there in the data.
  //
  // So when MAD is zero but the sample is not constant, the scale is taken from
  // the non-zero deviations instead. This is the same problem Rousseeuw and
  // Croux (1993) introduced Sn and Qn to solve; this is the cheap form of the
  // same idea, and it fails in the safe direction — the scale it returns is
  // larger than MAD would give, so the detector becomes less sensitive, never
  // more. A genuinely constant sample still has no dispersion and no events.
  // "Non-zero" has to mean non-zero IN SCALE, not merely unequal to zero.
  // Deviations that are really floating-point dust — 1e-13 against values in
  // the hundreds — are non-zero to the machine, and taking their median hands
  // back a scale of 1e-13, which makes every ordinary sample an outlier. That
  // is the same failure the MAD degeneracy causes, arrived at from the other
  // side. The tolerance is relative to the largest deviation, so it carries no
  // unit and no assumption about magnitude.
  const maxDev = devs.reduce((m, d) => (d > m ? d : m), 0)
  const tol = maxDev * 1e-9
  const nonZero = devs.filter((d) => d > tol)
  const scale = isNum(mad) && mad > tol ? mad : median(nonZero)
  return { median: med, mad, sigma: isNum(scale) ? scale * MAD_TO_SIGMA : null }
}

/**
 * The smallest non-zero change the instrument actually reported.
 *
 * This is the trace's own quantization step. Using it rather than a declared
 * precision means a logger that reports whole ppm and one that reports tenths
 * are both handled without either being told what it ought to do.
 */
export function inferredResolution(values) {
  let smallest = null
  for (let i = 1; i < (values || []).length; i++) {
    const d = Math.abs(values[i] - values[i - 1])
    if (d > 0 && (smallest == null || d < smallest)) smallest = d
  }
  return smallest
}

/** Sanitize an id fragment so ids stay greppable and collision-free. */
const slug = (s) => String(s == null ? '' : s).replace(/[^A-Za-z0-9]+/g, '').slice(0, 16) || 'x'

/**
 * A deterministic event id.
 *
 * Derived from identity — dataset, parameter, kind, and the event's start
 * instant — and never from array position. The same readings and the same
 * context produce the same ids on every run, which is what lets an assessor's
 * acceptance of an interpretation survive a re-analysis. Two events of one kind
 * on one parameter cannot start at the same instant, so this is unique by
 * construction.
 */
export function eventId(datasetId, param, kind, startTs) {
  const t = isNum(startTs) ? Math.round(startTs).toString(36) : 'nt'
  return `ev-${slug(datasetId)}-${slug(param)}-${slug(kind)}-${t}`
}

/** 32-bit FNV-1a as 8 hex chars. Matches the fingerprint idiom used in src/report. */
export function fnv1aHex(text) {
  let hash = 0x811c9dc5
  const s = String(text == null ? '' : text)
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** Seconds between two instants, or null. */
const spanSec = (a, b) => (isNum(a) && isNum(b) ? (b - a) / 1000 : null)

/**
 * Round a magnitude for reporting without pretending to precision the trace
 * does not have: three significant figures, which is more than any IAQ logger
 * resolves and few enough that an id or a card never shows float noise.
 */
const round3 = (v) => (isNum(v) ? Number(v.toPrecision(3)) : null)

/**
 * Abrupt rises and falls.
 *
 * Works on the FIRST DIFFERENCES of the trace and asks which of them are
 * outliers among the differences — so "abrupt" means "this step is unlike the
 * steps this trace usually takes", which is a property of the trace, not of a
 * substance. Adjacent qualifying differences of the same sign are merged into
 * one event so a single ramp over four samples is one rise, not four.
 */
function detectSteps(rs, ctx) {
  const diffs = []
  for (let i = 1; i < rs.length; i++) diffs.push(rs[i].v - rs[i - 1].v)
  const { median: medianDiff, sigma } = robustSpread(diffs)
  // Zero dispersion means every step is identical; there is no such thing as an
  // unusual one, and dividing by it would call all of them unusual.
  if (!isNum(sigma) || sigma <= 0 || !isNum(medianDiff)) return []
  const limit = K_OUTLIER * sigma

  // The test is on the RESIDUAL — how far a step sits from the step this trace
  // usually takes — not on the step itself. On a steadily rising trace the
  // ordinary difference is large and its deviation is near zero, so testing the
  // raw difference would label every ordinary sample an abrupt rise: a trace
  // climbing 1 unit per sample has a tiny MAD, so K·σ̂ is tiny, and |1| clears
  // it every time. Direction comes from the residual too, so a pause in a
  // steady climb reads as the anomaly it is rather than as another rise.
  const residual = (d) => d - medianDiff

  const out = []
  let run = null
  const flush = () => {
    if (!run) return
    const from = rs[run.startIdx]
    const to = rs[run.endIdx]
    const kind = run.sign > 0 ? 'step_up' : 'step_down'
    out.push({
      id: eventId(ctx.datasetId, ctx.param, kind, from.t),
      kind,
      param: ctx.param,
      datasetId: ctx.datasetId,
      startTs: from.t,
      endTs: to.t,
      durationSec: spanSec(from.t, to.t),
      samples: run.endIdx - run.startIdx + 1,
      magnitude: round3(to.v - from.v),
      baseline: round3(from.v),
      // What made it anomalous: the part of the change that is not the drift
      // this trace was already carrying. On a flat trace it equals magnitude;
      // on a climbing one it is the excess over the ordinary climb.
      excess: round3((to.v - from.v) - medianDiff * (run.endIdx - run.startIdx)),
      driftPerSample: round3(medianDiff),
      unit: ctx.unit,
      basis: 'robust_dispersion',
    })
    run = null
  }

  for (let i = 0; i < diffs.length; i++) {
    const r = residual(diffs[i])
    const sign = r > 0 ? 1 : -1
    if (Math.abs(r) < limit) { flush(); continue }
    if (run && run.sign === sign && run.endIdx === i) run.endIdx = i + 1
    else { flush(); run = { sign, startIdx: i, endIdx: i + 1 } }
  }
  flush()
  return out
}

/**
 * Isolated peaks.
 *
 * A single excursion that comes back. The test is deliberately two-sided: the
 * reading must be an outlier against the trace's own level, AND the trace must
 * return below that line within `MAX_PEAK_SAMPLES`. Something that goes up and
 * stays up is a different phenomenon and is reported as `sustained` instead, so
 * the two kinds never describe the same stretch of data.
 */
function detectPeaks(rs, ctx, level) {
  if (!isNum(level.sigma) || level.sigma <= 0) return []
  const hi = level.median + K_OUTLIER * level.sigma
  const out = []
  let i = 0
  while (i < rs.length) {
    if (rs[i].v <= hi) { i += 1; continue }
    let j = i
    while (j + 1 < rs.length && rs[j + 1].v > hi) j += 1
    const samples = j - i + 1
    const returns = j + 1 < rs.length // it came back down inside the record
    if (samples <= MAX_PEAK_SAMPLES && returns) {
      let apex = rs[i]
      for (let k = i; k <= j; k++) if (rs[k].v > apex.v) apex = rs[k]
      out.push({
        id: eventId(ctx.datasetId, ctx.param, 'peak', rs[i].t),
        kind: 'peak',
        param: ctx.param,
        datasetId: ctx.datasetId,
        startTs: rs[i].t,
        endTs: rs[j].t,
        durationSec: spanSec(rs[i].t, rs[j].t),
        samples,
        magnitude: round3(apex.v - level.median),
        peakValue: round3(apex.v),
        peakAt: apex.t,
        baseline: round3(level.median),
        unit: ctx.unit,
        basis: 'robust_dispersion',
      })
    }
    i = j + 1
  }
  return out
}

/**
 * Sustained elevations.
 *
 * A run of at least `MIN_RUN_SAMPLES` consecutive readings above the trace's
 * own robust upper line. "Sustained" is about persistence, so the event carries
 * its measured duration and the assessor reads that, not an adjective.
 */
function detectSustained(rs, ctx, level) {
  if (!isNum(level.sigma) || level.sigma <= 0) return []
  const hi = level.median + K_OUTLIER * level.sigma
  const out = []
  let i = 0
  while (i < rs.length) {
    if (rs[i].v <= hi) { i += 1; continue }
    let j = i
    while (j + 1 < rs.length && rs[j + 1].v > hi) j += 1
    const samples = j - i + 1
    if (samples >= MIN_RUN_SAMPLES) {
      const vals = rs.slice(i, j + 1).map((r) => r.v)
      out.push({
        id: eventId(ctx.datasetId, ctx.param, 'sustained', rs[i].t),
        kind: 'sustained',
        param: ctx.param,
        datasetId: ctx.datasetId,
        startTs: rs[i].t,
        endTs: rs[j].t,
        durationSec: spanSec(rs[i].t, rs[j].t),
        samples,
        magnitude: round3(median(vals) - level.median),
        meanValue: round3(vals.reduce((a, b) => a + b, 0) / vals.length),
        baseline: round3(level.median),
        unit: ctx.unit,
        basis: 'robust_dispersion',
      })
    }
    i = j + 1
  }
  return out
}

/**
 * Flatlines.
 *
 * A run where the trace does not move by even one quantization step. This is
 * the one detector that is about the INSTRUMENT rather than the air, and it is
 * reported as shape like the rest: a stuck channel and a genuinely stable
 * environment look identical in the data, and saying which is the assessor's
 * call, not this file's.
 */
function detectFlatlines(rs, ctx, resolution) {
  // A perfectly stuck channel reports the same number every time, so it has no
  // non-zero step to infer a resolution FROM — the canonical case would detect
  // nothing if a resolution were required. With one known, "unchanged" means
  // moving less than one quantization step; without one it means not moving.
  const unchanged = isNum(resolution) && resolution > 0
    ? (d) => d < resolution
    : (d) => d === 0
  const out = []
  let start = 0
  for (let i = 1; i <= rs.length; i++) {
    const same = i < rs.length && unchanged(Math.abs(rs[i].v - rs[i - 1].v))
    if (same) continue
    const samples = i - start
    if (samples >= MIN_RUN_SAMPLES) {
      out.push({
        id: eventId(ctx.datasetId, ctx.param, 'flatline', rs[start].t),
        kind: 'flatline',
        param: ctx.param,
        datasetId: ctx.datasetId,
        startTs: rs[start].t,
        endTs: rs[i - 1].t,
        durationSec: spanSec(rs[start].t, rs[i - 1].t),
        samples,
        magnitude: 0,
        baseline: round3(rs[start].v),
        unit: ctx.unit,
        basis: 'resolution',
      })
    }
    start = i
  }
  return out
}

/**
 * Data gaps, from the interval geometry `coverage` already establishes.
 *
 * Reuses the existing GAP_FACTOR rather than deciding again what counts as a
 * gap — the monitoring report and this surface must not disagree about whether
 * the logger stopped.
 */
function detectGaps(points, ctx, intervalSec) {
  if (!isNum(intervalSec) || intervalSec <= 0) return []
  const rs = readings(points, ctx.param).filter((r) => isNum(r.t))
  const cap = intervalSec * GAP_FACTOR
  const out = []
  for (let i = 1; i < rs.length; i++) {
    const sec = (rs[i].t - rs[i - 1].t) / 1000
    if (sec <= cap) continue
    out.push({
      id: eventId(ctx.datasetId, ctx.param, 'gap', rs[i - 1].t),
      kind: 'gap',
      param: ctx.param,
      datasetId: ctx.datasetId,
      startTs: rs[i - 1].t,
      endTs: rs[i].t,
      durationSec: sec,
      samples: 0,
      magnitude: null,
      baseline: null,
      unit: ctx.unit,
      basis: 'coverage',
    })
  }
  return out
}

/**
 * Every event in one parameter of one dataset, ordered by start time.
 *
 * @param {object[]} points parsed sensor points (`[{ t, co2, ... }]`)
 * @param {string} param
 * @param {object} [opts]
 * @param {string} [opts.datasetId='primary']
 * @param {string} [opts.unit]
 * @param {number} [opts.intervalSec] override the detected nominal interval
 * @returns {object[]} events; empty when the trace cannot support any
 */
export function detectParameterEvents(points, param, opts = {}) {
  const rs = readings(points, param).filter((r) => isNum(r.t))
  // No timestamps, or too short to have a describable distribution: say nothing.
  if (rs.length < MIN_SERIES_SAMPLES) return []

  const ctx = {
    datasetId: opts.datasetId || 'primary',
    param,
    unit: opts.unit == null ? null : opts.unit,
  }
  const vals = rs.map((r) => r.v)
  const level = robustSpread(vals)
  const intervalSec = isNum(opts.intervalSec) ? opts.intervalSec : nominalIntervalSec(points)

  return [
    ...detectSteps(rs, ctx),
    ...detectPeaks(rs, ctx, level),
    ...detectSustained(rs, ctx, level),
    ...detectFlatlines(rs, ctx, inferredResolution(vals)),
    ...detectGaps(points, ctx, intervalSec),
  ].sort((a, b) => (a.startTs || 0) - (b.startTs || 0) || a.id.localeCompare(b.id))
}

/**
 * Every event across every parameter of one dataset, plus the coverage facts
 * the interpretation layer needs in order to say how much of the record it is
 * reasoning from.
 *
 * @param {object} dataset a Logger Studio dataset (`{ id, role, label, points, params, units }`)
 * @returns {{ datasetId, role, label, events, coverage: object|null, params: string[] }}
 */
export function detectDatasetEvents(dataset) {
  const ds = dataset && typeof dataset === 'object' ? dataset : {}
  const points = Array.isArray(ds.points) ? ds.points : []
  const params = Array.isArray(ds.params) ? ds.params : []
  const units = ds.units && typeof ds.units === 'object' ? ds.units : {}
  const datasetId = ds.id || 'primary'
  const intervalSec = nominalIntervalSec(points)

  const events = []
  const cov = {}
  params.forEach((param) => {
    events.push(...detectParameterEvents(points, param, { datasetId, unit: units[param], intervalSec }))
    cov[param] = coverage(points, param, { intervalSec })
  })

  return {
    datasetId,
    role: ds.role || 'indoor',
    label: ds.label || 'Indoor',
    params,
    events: events.sort((a, b) => (a.startTs || 0) - (b.startTs || 0) || a.id.localeCompare(b.id)),
    coverage: cov,
  }
}
