/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The bundle, in the form that crosses the network.
 *
 * `buildForensicBundle` assembles the complete deterministic record. This is
 * the projection of it the model is sent, and it exists for the reason
 * `packageForWriter` exists on the report side: what is constructed and what
 * is transmitted are different questions, and the second one has a budget.
 * A four-day two-dataset session serializes past 40 KB before any trimming,
 * and a dense multi-zone session is several times that.
 *
 * Three rules, each load-bearing:
 *
 * 1. IT IS A PROJECTION, NEVER A RE-DERIVATION. Every value here is copied
 *    from the bundle. Nothing is recomputed, so the wire form cannot disagree
 *    with the record the validator checks against — the same discipline
 *    `evidencePackage.js` states about `assembleRenderModel`.
 *
 * 2. EACH PATTERN CARRIES ITS OWN CITABLE SET. `citable_evidence_ids` is
 *    `evidenceScopeForPattern` rendered into the payload, so the model is
 *    shown exactly what it may cite rather than being asked to derive it from
 *    a global registry and then rejected for getting it wrong. A gate the
 *    writer cannot see is a gate that produces rejections instead of good
 *    output — this codebase has shipped that disagreement three times.
 *
 * 3. TRIMMING ONLY EVER REMOVES. The model can cite only what it was shown,
 *    and the validator resolves against the FULL bundle, so a trimmed payload
 *    can never cause a false rejection. That asymmetry is what makes shedding
 *    safe; it would not be if the validator ran against the wire form.
 *
 * What gets shed, in order, is detail that elaborates a figure already
 *    present — never a pattern, an event, an id, or a context gap. `omitted`
 *    says what went, because a model that cannot tell a trimmed record from a
 *    complete one will describe the trimming as a finding.
 */

import { bundleEvidence } from './forensicBundle.js'
import { evidenceScopeForPattern } from './forensicValidate.js'

/** Chars. Pinned by test to `MAX_PAYLOAD_CHARS` in `api/forensic-interpret.js`. */
export const WIRE_BUDGET_CHARS = 60_000

const isNum = (v) => v != null && Number.isFinite(v)
const isStr = (v) => typeof v === 'string'
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const num = (v) => (isNum(v) ? v : null)

/** Round a projected statistic to three places. Presentation, not arithmetic. */
const r3 = (v) => (isNum(v) ? Math.round(v * 1000) / 1000 : null)

function wireEvent(e) {
  const o = obj(e)
  return {
    id: o.id, kind: o.kind, param: o.param, dataset_id: o.datasetId,
    start_ts: num(o.startTs), end_ts: num(o.endTs), duration_sec: num(o.durationSec),
    magnitude: r3(o.magnitude), baseline: r3(o.baseline), unit: o.unit ?? null,
  }
}

function wireParameter(p) {
  const o = obj(p)
  const s = obj(o.stats)
  const cov = obj(s.coverage)
  return {
    id: o.id, dataset_id: o.datasetId, param: o.param, unit: o.unit ?? null,
    stats: {
      n: num(s.n), mean: r3(s.mean), median: r3(s.median), min: r3(s.min), max: r3(s.max),
      p95: r3(s.p95), std_dev: r3(s.stdDev),
      pct_above: r3(s.pctAbove), time_above_sec: num(s.timeAboveSec),
      pct_in_band: r3(s.pctInBand), time_outside_sec: num(s.timeOutsideSec),
      occupancy: {
        mean_occupied: r3(obj(s.occupancy).meanOccupied),
        mean_unoccupied: r3(obj(s.occupancy).meanUnoccupied),
        delta: r3(obj(s.occupancy).delta),
      },
      coverage_pct: r3(cov.coveragePct), gap_count: num(cov.gapCount),
      longest_gap_sec: num(cov.longestGapSec), interval_sec: num(cov.intervalSec),
    },
    // The yardstick the percentages above were measured against, carried so a
    // reader knows what `pct_above` is above. The criteria registry remains the
    // only thing that says what a comparison MEANS; nothing here grades.
    reference: obj(o.reference),
  }
}

function wireDataset(d) {
  const o = obj(d)
  const cov = obj(o.coverage)
  return {
    id: o.id, role: o.role, label: o.label, params: arr(o.params),
    file_name: o.fileName ?? null, interval_sec: num(o.intervalSec),
    coverage: Object.keys(cov).reduce((acc, k) => {
      acc[k] = { coverage_pct: r3(obj(cov[k]).coveragePct), gap_count: num(obj(cov[k]).gapCount) }
      return acc
    }, {}),
  }
}

function wirePattern(bundle, p) {
  const o = obj(p)
  const scope = evidenceScopeForPattern(bundle, o.id)
  return {
    id: o.id, kind: o.kind, params: arr(o.params), dataset_ids: arr(o.datasetIds),
    event_ids: arr(o.eventIds),
    start_ts: num(o.startTs), end_ts: num(o.endTs),
    summary: obj(o.summary),
    // The only ids an interpretation of THIS pattern may cite.
    citable_evidence_ids: [...scope.ids].sort(),
    missing_context: arr(o.missingContext).map((m) => ({
      id: obj(m).id, input: obj(m).input ?? null, label: obj(m).label ?? null, why: obj(m).why ?? null,
    })),
  }
}

/**
 * Build the payload.
 *
 * @param {object} bundle result of `buildForensicBundle`
 * @param {object} [opts]
 * @param {number} [opts.budgetChars] defaults to `WIRE_BUDGET_CHARS`
 * @returns {object} the wire form, carrying `omitted`
 */
export function bundleForWriter(bundle, opts = {}) {
  const b = obj(bundle)
  const budget = isNum(opts.budgetChars) ? opts.budgetChars : WIRE_BUDGET_CHARS
  const ctx = obj(b.context)

  const wire = {
    schema_version: num(b.schemaVersion),
    fingerprint: isStr(b.fingerprint) ? b.fingerprint : null,
    period: obj(b.period),
    datasets: arr(b.datasets).map(wireDataset),
    parameters: arr(b.parameters).map(wireParameter),
    events: arr(b.events).map(wireEvent),
    patterns: arr(b.patterns).map((p) => wirePattern(b, p)),
    context: {
      available: obj(ctx.available),
      labels: obj(ctx.labels),
      occupancy_windows: arr(ctx.occupancyWindows),
      annotations: arr(ctx.annotations),
      deployment: obj(ctx.deployment),
      calibration_gas: ctx.calibrationGas ?? null,
      utc_offset_min: num(ctx.utcOffsetMin),
    },
    // The registry, so an id the model reads anywhere can be checked against
    // the same list the validator will check it against.
    evidence: obj(b.evidence).patternIds ? b.evidence : bundleEvidence(b),
    omitted: [],
  }

  // Shed in order of how little each costs the reading. Every step removes
  // elaboration of a figure that is still present; none removes a pattern, an
  // event, an id or a context gap, because those are what an interpretation is
  // allowed to rest on.
  const steps = [
    ['per_day_cycle_detail', () => {
      let hit = false
      wire.patterns.forEach((p) => {
        if (arr(obj(p.summary).days).length) { p.summary = { ...p.summary, days: undefined }; delete p.summary.days; hit = true }
      })
      return hit
    }],
    ['annotation_notes', () => {
      let hit = false
      wire.context.annotations = wire.context.annotations.map((a) => {
        if (obj(a).note == null) return a
        hit = true
        return { ...a, note: null }
      })
      return hit
    }],
    ['dataset_coverage_detail', () => {
      let hit = false
      wire.datasets.forEach((d) => { if (Object.keys(obj(d.coverage)).length) { d.coverage = {}; hit = true } })
      return hit
    }],
    ['occupancy_window_list', () => {
      if (!wire.context.occupancy_windows.length) return false
      // The COUNT survives, because `context.available.occupancy` and the
      // occupancy statistics both depend on windows existing. Only the list goes.
      wire.context.occupancy_window_count = wire.context.occupancy_windows.length
      wire.context.occupancy_windows = []
      return true
    }],
    ['deployment_context', () => {
      if (!Object.keys(wire.context.deployment).length) return false
      wire.context.deployment = {}
      return true
    }],
  ]

  const size = () => { try { return JSON.stringify(wire).length } catch { return Infinity } }
  for (const [name, shed] of steps) {
    if (size() <= budget) break
    if (shed()) wire.omitted.push(name)
  }
  return wire
}
