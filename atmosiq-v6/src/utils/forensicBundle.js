/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The ForensicAnalysisBundle — everything deterministic, in one compact object,
 * and the fingerprint that says whether it still describes the session.
 *
 * This module COMPOSES. It computes no statistic of its own: events and
 * patterns come from `forensicEvents` / `forensicPatterns`, per-parameter
 * figures from `parameterStats`, integrity from `coverage`, reference metadata
 * from `paramReference`. If a number here disagrees with the monitoring report,
 * that is a bug in one of those, not a second opinion formed here.
 *
 * ── Raw rows do not cross this boundary ────────────────────────────────
 * The bundle is what a model reads. It carries figures, windows and ids —
 * never `points`. A dataset of 20,000 readings contributes a coverage block and
 * a statistics block, and the readings stay in Logger Studio. Fetching the
 * detail behind one event is a later, narrow tool, not a default payload.
 *
 * ── Two hashes, deliberately, and only one of them is new ──────────────
 * `hashDataset` already exists and is NOT touched. Its job is measurement
 * integrity: two copies of a monitoring report claiming the same session can be
 * checked against each other, and its own module states that editing the client
 * name must not change it. Widening it to cover occupancy or context would
 * destroy exactly that meaning.
 *
 * So forensic staleness gets its OWN fingerprint, over a wider set: the
 * measurements plus everything that can change how they are read. Marking an
 * occupancy window, adding an outdoor dataset, logging an annotation or
 * correcting the calibration date all change the forensic fingerprint and none
 * of them changes the dataset hash. Both are correct, because they answer
 * different questions.
 *
 * The measurement part composes `canonicalDatasetText` — the same canonical
 * form `hashDataset` digests — so the two can never disagree about what the
 * readings are.
 */

import { canonicalDatasetText } from './datasetHash.js'
import { normalizeSensorData } from './sensorParser.js'
import { parameterStats, nominalIntervalSec, coverage } from './monitoringStats.js'
import { paramReference } from './sensorThresholds.js'
import { detectDatasetEvents } from './forensicEvents.js'
import { buildPatterns, CONTEXT_INPUTS } from './forensicPatterns.js'

/** Bumped when the bundle's shape or any detector's semantics change. */
export const FORENSIC_SCHEMA_VERSION = 1

const isNum = (v) => v != null && Number.isFinite(v)
const str = (v) => (typeof v === 'string' ? v : '')
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * Deterministic serialization with keys sorted at EVERY level.
 *
 * `JSON.stringify` preserves insertion order, so two records with the same
 * content built by different code paths serialize differently and would
 * fingerprint as changed. Written here rather than imported because the copy in
 * `src/report/evidencePackage.js` is private to that module; the note there
 * about the array-form replacer filtering keys recursively applies equally, and
 * is why this recurses explicitly instead.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

/**
 * A 64-bit fingerprint as 16 hex chars: two FNV-1a passes with different
 * offset bases.
 *
 * Not a security primitive — the same caveat `fingerprintPackage` carries. It
 * needs only to change with overwhelming probability when the inputs change.
 * Two passes rather than one because this digests far more material than an
 * evidence package does, and a stale interpretation silently reported as fresh
 * is the failure this exists to prevent.
 */
export function forensicHashHex(text) {
  const s = String(text == null ? '' : text)
  const pass = (offset) => {
    let h = offset >>> 0
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    return (h >>> 0).toString(16).padStart(8, '0')
  }
  return pass(0x811c9dc5) + pass(0x9dc5811c)
}

/**
 * Stable id for a logged annotation, since the stored `id` may be null.
 *
 * The fallback hashes the annotation's SEMANTIC CONTENT — instant, type, label
 * and note — not just its instant and type. Two annotations logged at the same
 * minute with the same type ("Other" is the catch-all, so this is not exotic)
 * would otherwise share one evidence id, and an interpretation accepted against
 * one would silently attach to the other.
 */
export function annotationId(a) {
  const e = obj(a)
  if (str(e.id)) return `ann-${str(e.id)}`
  const t = isNum(e.t) ? Math.round(e.t).toString(36) : 'nt'
  const sig = stableStringify({ t: e.t ?? null, type: str(e.type), label: str(e.label), note: str(e.note) })
  return `ann-${t}-${forensicHashHex(sig).slice(0, 8)}`
}

/**
 * The calibration gas actually in force, resolved ONCE.
 *
 * It can arrive on the session's calibration record or as the page's own
 * `calibrationGas`, and the two were previously resolved differently in two
 * places: the fingerprint preferred the session's, while the reference
 * construction only ever saw the page's. A survey whose gas came from the
 * session therefore fingerprinted one value and built its thresholds from
 * another. One resolution, used everywhere.
 */
export function effectiveCalibrationGas(input = {}) {
  return str(obj(obj(input.context).calibration).gas) || str(input.calibrationGas)
}

/**
 * The canonical deployment-context projection.
 *
 * THE ONE PLACE this shape is decided, because the fingerprint and the bundle
 * must carry exactly the same fields. The bundle previously passed the caller's
 * whole `context` object through while the signature fingerprinted a chosen
 * subset, so any extra field a caller attached was visible to the model and
 * invisible to the fingerprint — a context change that left a stored
 * interpretation looking fresh. Restricted on purpose: this is what can change
 * an interpretation, and arbitrary extra fields are not transmitted at all.
 */
export function projectDeploymentContext(context, calibrationGas = '') {
  const c = obj(context)
  return {
    objective: str(c.objective),
    location: {
      building: str(obj(c.location).building),
      floor: str(obj(c.location).floor),
      room: str(obj(c.location).room),
      zone: str(obj(c.location).zone),
      sensorPosition: str(obj(c.location).sensorPosition),
    },
    instrument: {
      make: str(obj(c.instrument).make),
      model: str(obj(c.instrument).model),
      serial: str(obj(c.instrument).serial),
    },
    calibration: {
      date: obj(c.calibration).date ?? null,
      gas: str(calibrationGas),
      status: str(obj(c.calibration).status),
    },
  }
}

/**
 * The annotations both halves read, normalized and ordered identically.
 *
 * Shared for the same reason as the context projection: the fingerprint and the
 * bundle must be describing the same list. Exact duplicates collapse — an
 * annotation with the same instant, type, label and note is the same
 * annotation, and giving indistinguishable entries distinct evidence ids would
 * be inventing a difference the record does not carry.
 */
export function projectAnnotations(annotations) {
  const seen = new Set()
  return arr(annotations)
    .filter((a) => isNum(obj(a).t))
    .map((a) => ({
      id: annotationId(a),
      t: obj(a).t,
      type: str(obj(a).type) || null,
      label: str(obj(a).label) || null,
      note: str(obj(a).note) || null,
    }))
    .filter((a) => (seen.has(a.id) ? false : seen.add(a.id)))
    .sort((a, b) => (a.t || 0) - (b.t || 0) || a.id.localeCompare(b.id))
}

/** Stable id for one parameter of one dataset. */
export const parameterId = (datasetId, param) => `par-${datasetId}-${param}`

/**
 * The exact material the forensic fingerprint digests.
 *
 * Exported because it is the part worth testing directly: if this is stable,
 * complete and key-order independent, the hash over it inherits all three.
 * `generatedAt` is deliberately NOT here — the fingerprint describes the
 * INPUTS, so re-running an unchanged session must reproduce it.
 */
export function forensicInputSignature(input = {}) {
  const env = normalizeSensorData(input.sensorData) || {}
  const datasets = arr(env.datasets)

  return stableStringify({
    schema: FORENSIC_SCHEMA_VERSION,
    // Measurements, through the same canonical form `hashDataset` digests, so
    // the two can never disagree about what the readings are. Each dataset also
    // contributes its role and label, because moving a file from "zone" to
    // "outdoor" changes every comparison drawn from it without altering a
    // single reading.
    datasets: datasets
      .map((d) => ({
        id: str(d && d.id),
        role: str(d && d.role),
        label: str(d && d.label),
        readings: forensicHashHex(canonicalDatasetText(d)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    occupancy: arr(env.occupancyWindows)
      .map((w) => ({ start: obj(w).start ?? null, end: obj(w).end ?? null, kind: str(obj(w).kind), label: str(obj(w).label) }))
      .sort((a, b) => (a.start || 0) - (b.start || 0) || a.kind.localeCompare(b.kind)),
    annotations: projectAnnotations(input.annotations),
    // Deployment context, restricted to what can change an interpretation.
    // Location and instrument bound what a reading describes; calibration
    // bounds what it is worth. A corrected client name is not here, by the same
    // reasoning that keeps it out of the dataset hash. Exactly the projection
    // the bundle transmits, so the two cannot drift.
    context: projectDeploymentContext(input.context, effectiveCalibrationGas(input)),
    // Pattern analysis buckets by local hour, so the offset is an input.
    utcOffsetMin: isNum(input.utcOffsetMin) ? input.utcOffsetMin : 0,
  })
}

/** The forensic input fingerprint. Changes when any interpretation-relevant input changes. */
export function forensicInputHash(input = {}) {
  return forensicHashHex(forensicInputSignature(input))
}

/** Per-parameter figures, composed from the existing statistics layer. */
function parameterBlocks(dataset, opts) {
  const points = arr(dataset.points)
  const params = arr(dataset.params)
  const units = obj(dataset.units)
  const intervalSec = nominalIntervalSec(points)

  return params.map((param) => {
    const unit = units[param] == null ? null : units[param]
    const ref = paramReference(param, { unit, ts: opts.periodStart, calibrationGas: opts.calibrationGas })
    const reference = ref.limit != null
      ? { limit: ref.limit }
      : (ref.band ? { band: [ref.band.min, ref.band.max] } : undefined)
    const stats = parameterStats(points, param, {
      reference,
      occupancyWindows: opts.occupancyWindows,
      intervalSec,
      utcOffsetMin: opts.utcOffsetMin,
    })
    return {
      id: parameterId(dataset.id, param),
      datasetId: dataset.id,
      param,
      unit,
      stats,
      // Reference metadata rides as CONTEXT so a reader knows which yardstick
      // the percentages above were measured against. The criteria registry
      // remains the only thing that says what a comparison means; nothing here
      // grades, bands or concludes.
      reference: { label: ref.limitLabel || null, limit: ref.limit ?? null, band: ref.band || null, refs: arr(ref.refs), note: ref.note || null },
    }
  })
}

/**
 * Build the bundle.
 *
 * @param {object} [input]
 * @param {object} [input.sensorData]  the Logger Studio envelope; absent or
 *   malformed yields an empty bundle rather than throwing, because this runs
 *   against whatever state the page happens to be in
 * @param {Array}  [input.annotations] logged monitoring events
 * @param {object} [input.context]   `{ objective, location, instrument, calibration }`
 * @param {number} [input.utcOffsetMin]
 * @param {string} [input.calibrationGas]
 * @param {string} [input.generatedAt] ISO; defaults to now. Never fingerprinted.
 * @returns {object} the ForensicAnalysisBundle
 */
export function buildForensicBundle(input = {}) {
  const env = normalizeSensorData(input.sensorData) || {}
  const rawDatasets = {}
  arr(env.datasets).forEach((d) => { if (d && d.id) rawDatasets[d.id] = d })
  const occupancyWindows = arr(env.occupancyWindows)
  // The same projections the fingerprint digests, so a model-visible field can
  // never change without the fingerprint moving with it.
  const annotations = projectAnnotations(input.annotations)
  const calibrationGas = effectiveCalibrationGas(input)
  const deployment = projectDeploymentContext(input.context, calibrationGas)
  const utcOffsetMin = isNum(input.utcOffsetMin) ? input.utcOffsetMin : 0

  const detected = arr(env.datasets).map((d) => detectDatasetEvents(d))
  const patterns = buildPatterns({
    datasets: detected, rawDatasets, occupancyWindows, annotations, utcOffsetMin,
  })

  const primary = arr(env.datasets).find((d) => d && d.role === 'indoor') || arr(env.datasets)[0] || null
  const periodStart = primary && obj(primary.summary).start
  const periodEnd = primary && obj(primary.summary).end

  const parameters = arr(env.datasets).flatMap((d) => parameterBlocks(d, {
    occupancyWindows, utcOffsetMin, periodStart, calibrationGas,
  }))

  const events = detected.flatMap((d) => d.events)
  const datasets = arr(env.datasets).map((d, i) => {
    const points = arr(d.points)
    const intervalSec = nominalIntervalSec(points)
    return {
      id: d.id || `ds-${i}`,
      role: d.role || 'indoor',
      label: d.label || 'Indoor',
      // The walkthrough zone this logger was deployed in, when the assessor
      // has said so. Optional by design — a standalone Logger Studio session
      // has no zones to name — and deliberately ABSENT from
      // `forensicInputSignature`: it changes nothing about what the readings
      // mean, so linking a dataset must not make an existing interpretation
      // stale. It is read only by the cross-evidence layer.
      zoneId: str(d.zoneId) || null,
      params: arr(d.params),
      fileName: str(d.fileName) || null,
      hasTimestamps: !!d.hasTimestamps,
      intervalSec,
      // Integrity per parameter, straight from `coverage` — the same figures
      // the monitoring report prints, not a second reading of the same gaps.
      coverage: arr(d.params).reduce((acc, p) => { acc[p] = coverage(points, p, { intervalSec }); return acc }, {}),
    }
  })

  // Which contextual inputs the session actually has. `hvac_schedule` is false
  // by construction: Logger Studio captures no such field. It is named against
  // the patterns whose reading it would change, never as a session-wide gap.
  const context = {
    available: {
      occupancy: occupancyWindows.length > 0,
      outdoor: arr(env.datasets).some((d) => d && d.role === 'outdoor'),
      comparisonZones: arr(env.datasets).filter((d) => d && d.role === 'zone').length,
      annotations: annotations.length > 0,
      hvac_schedule: false,
    },
    labels: CONTEXT_INPUTS,
    occupancyWindows: occupancyWindows.map((w) => ({ start: obj(w).start ?? null, end: obj(w).end ?? null, kind: str(obj(w).kind) || null, label: str(obj(w).label) || null })),
    // Carries the note as well as the label: the note is fingerprinted, so
    // withholding it would leave the model reading an annotation the
    // fingerprint protects a different version of. Annotation text is assessor
    // input and is treated as untrusted data by the AI layer, not here.
    annotations,
    deployment,
    calibrationGas: calibrationGas || null,
    utcOffsetMin,
  }

  const bundle = {
    schemaVersion: FORENSIC_SCHEMA_VERSION,
    generatedAt: str(input.generatedAt) || new Date().toISOString(),
    fingerprint: forensicInputHash(input),
    period: { start: periodStart ?? null, end: periodEnd ?? null },
    datasets,
    parameters,
    events,
    patterns,
    context,
  }
  bundle.evidence = bundleEvidence(bundle)
  return bundle
}

/**
 * The legal evidence set, indexed.
 *
 * The validator that runs after the model resolves every id it returns against
 * these lists. Making the set explicit is what lets that check be a lookup
 * rather than a re-derivation — a validator that rebuilt the analysis to decide
 * whether an id was real would be a second opinion about the evidence, and the
 * two could disagree.
 */
export function bundleEvidence(bundle = {}) {
  const gaps = new Set()
  arr(bundle.patterns).forEach((p) => arr(p.missingContext).forEach((m) => gaps.add(m.id)))
  return {
    datasetIds: arr(bundle.datasets).map((d) => d.id).sort(),
    parameterIds: arr(bundle.parameters).map((p) => p.id).sort(),
    eventIds: arr(bundle.events).map((e) => e.id).sort(),
    patternIds: arr(bundle.patterns).map((p) => p.id).sort(),
    annotationIds: arr(obj(bundle.context).annotations).map((a) => a.id).sort(),
    contextGapIds: [...gaps].sort(),
  }
}

/**
 * Is a stored interpretation still about this session?
 *
 * An interpretation carries the fingerprint of the inputs it was produced from.
 * Anything else — a corrected reading, a newly marked occupancy window, an
 * outdoor file added, a calibration date fixed — makes it an interpretation of
 * a session that no longer exists. It is never silently reused: the caller gets
 * `fresh: false` and the two fingerprints, so it can say so rather than quietly
 * showing yesterday's reading of today's data.
 *
 * @param {object} stored an interpretation record carrying `fingerprint`
 * @param {object|string} current the current bundle, or its fingerprint
 * @returns {{fresh:boolean, storedFingerprint:string|null, currentFingerprint:string|null, reason:string}}
 */
export function forensicFreshness(stored, current) {
  const storedFingerprint = str(obj(stored).fingerprint) || null
  const currentFingerprint = typeof current === 'string' ? current : (str(obj(current).fingerprint) || null)
  if (!stored || typeof stored !== 'object') return { fresh: false, storedFingerprint, currentFingerprint, reason: 'no_interpretation' }
  if (!storedFingerprint) return { fresh: false, storedFingerprint, currentFingerprint, reason: 'no_stored_fingerprint' }
  if (!currentFingerprint) return { fresh: false, storedFingerprint, currentFingerprint, reason: 'no_current_fingerprint' }
  if (storedFingerprint !== currentFingerprint) return { fresh: false, storedFingerprint, currentFingerprint, reason: 'inputs_changed' }
  return { fresh: true, storedFingerprint, currentFingerprint, reason: 'fresh' }
}

/** Convenience predicate over `forensicFreshness`. */
export function isForensicAnalysisFresh(stored, current) {
  return forensicFreshness(stored, current).fresh
}
