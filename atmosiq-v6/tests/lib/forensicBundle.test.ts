/**
 * The ForensicAnalysisBundle and its input fingerprint.
 *
 * Three properties matter more than the individual cases:
 *
 *   1. RAW ROWS DO NOT CROSS THE BOUNDARY. The bundle is what a model reads.
 *      A 20,000-reading dataset contributes statistics and coverage; the
 *      readings stay in Logger Studio.
 *   2. THE FINGERPRINT COVERS INTERPRETATION, NOT JUST MEASUREMENT. Marking an
 *      occupancy window changes nothing about the readings and everything about
 *      how they read, so it must change the fingerprint — while leaving the
 *      existing `hashDataset` alone, since that answers a different question.
 *   3. EVERY ID RESOLVES. The validator that runs after the model is a lookup
 *      against the evidence registry, never a re-derivation.
 */
import { describe, it, expect } from 'vitest'
import {
  buildForensicBundle, forensicInputHash, forensicInputSignature, stableStringify,
  forensicHashHex, bundleEvidence, forensicFreshness, isForensicAnalysisFresh,
  annotationId, parameterId, FORENSIC_SCHEMA_VERSION,
  projectDeploymentContext, projectAnnotations, effectiveCalibrationGas,
} from '../../src/utils/forensicBundle.js'
import { paramReference } from '../../src/utils/sensorThresholds.js'
import { hashDataset, canonicalDatasetText } from '../../src/utils/datasetHash.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000

const multiDay = (days: number, f: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) {
    for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  }
  return pts
}

const mkDataset = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})

/** A realistic session: four days of CO2 with a daily cycle, plus a PM spike. */
const indoorPoints = multiDay(4, (_d, h, i) => ({
  co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI),
  pm: i === 50 ? 180 : 10 + (i % 5),
}))
const outdoorPoints = multiDay(4, (_d, _h, i) => ({ pm: 9 + (i % 5) }))

const baseEnv = () => ({
  version: 2,
  datasets: [
    mkDataset('primary', 'indoor', 'Indoor', indoorPoints, ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' }),
    mkDataset('ds-out', 'outdoor', 'Outdoor', outdoorPoints, ['pm'], { pm: 'µg/m³' }),
  ],
  occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied', label: 'Business hours' }],
  graphs: {},
  thresholds: {},
})

const baseContext = () => ({
  objective: 'Characterize afternoon complaints',
  location: { building: 'Northgate', floor: '2', room: 'Suite 200', zone: 'Open office', sensorPosition: 'Desk height' },
  instrument: { make: 'Acme', model: 'X1', serial: 'SN-1' },
  calibration: { date: '2026-01-15', gas: 'isobutylene', status: 'current' },
})

const baseInput = (over: any = {}) => ({
  sensorData: baseEnv(),
  annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: '' }],
  context: baseContext(),
  utcOffsetMin: 0,
  generatedAt: '2026-03-10T00:00:00.000Z',
  ...over,
})

describe('stable serialization', () => {
  it('sorts keys at every nesting level', () => {
    const a = { b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } }
    const b = { a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('distinguishes different content and survives null', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify([1, [2, 3]])).toBe('[1,[2,3]]')
  })

  it('the hash is 16 hex chars, stable, and sensitive', () => {
    expect(forensicHashHex('x')).toMatch(/^[0-9a-f]{16}$/)
    expect(forensicHashHex('x')).toBe(forensicHashHex('x'))
    expect(forensicHashHex('x')).not.toBe(forensicHashHex('y'))
  })
})

describe('the forensic fingerprint covers every interpretation-relevant input', () => {
  const base = forensicInputHash(baseInput())

  it('identical semantic inputs produce an identical fingerprint', () => {
    expect(forensicInputHash(baseInput())).toBe(base)
  })

  it('reordered object keys produce an identical fingerprint', () => {
    const reordered = {
      generatedAt: '2026-03-10T00:00:00.000Z',
      utcOffsetMin: 0,
      context: {
        calibration: { status: 'current', gas: 'isobutylene', date: '2026-01-15' },
        instrument: { serial: 'SN-1', model: 'X1', make: 'Acme' },
        location: { sensorPosition: 'Desk height', zone: 'Open office', room: 'Suite 200', floor: '2', building: 'Northgate' },
        objective: 'Characterize afternoon complaints',
      },
      annotations: [{ note: '', label: 'HVAC adjusted', type: 'hvac_adjusted', t: T0 + 50 * Q, id: 'e1' }],
      sensorData: baseEnv(),
    }
    expect(forensicInputHash(reordered as never)).toBe(base)
  })

  it('reordered datasets, occupancy windows and annotations do not change it', () => {
    const env = baseEnv()
    env.datasets = [env.datasets[1], env.datasets[0]] as never
    const flipped = baseInput({
      sensorData: env,
      annotations: [
        { id: 'e2', t: T0 + 80 * Q, type: 'cleaning', label: 'Cleaning', note: '' },
        { id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: '' },
      ],
    })
    const other = baseInput({
      sensorData: baseEnv(),
      annotations: [
        { id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: '' },
        { id: 'e2', t: T0 + 80 * Q, type: 'cleaning', label: 'Cleaning', note: '' },
      ],
    })
    expect(forensicInputHash(flipped)).toBe(forensicInputHash(other))
  })

  it('a changed reading changes it', () => {
    const env = baseEnv()
    env.datasets[0].points = env.datasets[0].points.map((p: any, i: number) => (i === 10 ? { ...p, co2: p.co2 + 1 } : p))
    expect(forensicInputHash(baseInput({ sensorData: env }))).not.toBe(base)
  })

  it('changed occupancy changes it', () => {
    const env = baseEnv()
    env.occupancyWindows = [{ ...env.occupancyWindows[0], end: T0 + 18 * 3600_000 }] as never
    expect(forensicInputHash(baseInput({ sensorData: env }))).not.toBe(base)
    const none = baseEnv(); none.occupancyWindows = []
    expect(forensicInputHash(baseInput({ sensorData: none }))).not.toBe(base)
  })

  it('a changed comparison or outdoor dataset changes it', () => {
    const removed = baseEnv()
    removed.datasets = [removed.datasets[0]] as never
    expect(forensicInputHash(baseInput({ sensorData: removed }))).not.toBe(base)

    // Same readings, reclassified from outdoor to a comparison zone: every
    // comparison drawn from it changes, so the fingerprint must.
    const recast = baseEnv()
    recast.datasets[1].role = 'zone'
    expect(forensicInputHash(baseInput({ sensorData: recast }))).not.toBe(base)
  })

  it('a changed annotation changes it', () => {
    expect(forensicInputHash(baseInput({ annotations: [] }))).not.toBe(base)
    expect(forensicInputHash(baseInput({
      annotations: [{ id: 'e1', t: T0 + 51 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: '' }],
    }))).not.toBe(base)
    expect(forensicInputHash(baseInput({
      annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'cleaning', label: 'Cleaning', note: '' }],
    }))).not.toBe(base)
  })

  it('changed deployment context changes it — location, instrument and calibration', () => {
    const ctxRoom = baseContext(); ctxRoom.location.room = 'Suite 210'
    expect(forensicInputHash(baseInput({ context: ctxRoom }))).not.toBe(base)
    const ctxInst = baseContext(); ctxInst.instrument.serial = 'SN-2'
    expect(forensicInputHash(baseInput({ context: ctxInst }))).not.toBe(base)
    const ctxCal = baseContext(); ctxCal.calibration.date = '2025-01-15'
    expect(forensicInputHash(baseInput({ context: ctxCal }))).not.toBe(base)
  })

  it('the analysis timezone changes it, because patterns bucket by local hour', () => {
    expect(forensicInputHash(baseInput({ utcOffsetMin: -300 }))).not.toBe(base)
  })

  it('the schema version is part of it, so a detector change invalidates stored readings', () => {
    expect(forensicInputSignature(baseInput())).toContain(`"schema":${FORENSIC_SCHEMA_VERSION}`)
  })

  it('generation time is NOT part of it', () => {
    expect(forensicInputHash(baseInput({ generatedAt: '2030-01-01T00:00:00.000Z' }))).toBe(base)
  })
})

describe('it does not disturb the existing dataset hash', () => {
  it('hashDataset still ignores everything but the measurements', async () => {
    const ds = mkDataset('primary', 'indoor', 'Indoor', indoorPoints, ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' })
    const renamed = { ...ds, label: 'Renamed', fileName: 'other.csv' }
    expect(await hashDataset(ds)).toBe(await hashDataset(renamed))
  })

  it('but the forensic fingerprint reacts to the context the dataset hash ignores', () => {
    // The whole reason for a second fingerprint: occupancy changes no reading.
    const env = baseEnv()
    const before = forensicInputHash(baseInput({ sensorData: env }))
    const withMore = baseEnv()
    withMore.occupancyWindows = [
      ...withMore.occupancyWindows,
      { id: 'occ-2', start: T0 + DAY + 9 * 3600_000, end: T0 + DAY + 17 * 3600_000, kind: 'occupied', label: 'Day 2' },
    ] as never
    expect(forensicInputHash(baseInput({ sensorData: withMore }))).not.toBe(before)
    // And the measurements are untouched, so the dataset hash's canonical text is identical.
    expect(canonicalDatasetText(env.datasets[0])).toBe(canonicalDatasetText(withMore.datasets[0]))
  })
})

describe('the bundle composes and stays compact', () => {
  const bundle = buildForensicBundle(baseInput())

  it('carries the deterministic layers it was built from', () => {
    expect(bundle.schemaVersion).toBe(FORENSIC_SCHEMA_VERSION)
    expect(bundle.fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(bundle.datasets).toHaveLength(2)
    expect(bundle.events.length).toBeGreaterThan(0)
    expect(bundle.patterns.length).toBeGreaterThan(0)
    expect(bundle.parameters.length).toBeGreaterThan(0)
    expect(bundle.period.start).toBe(indoorPoints[0].t)
  })

  it('carries NO raw logger rows anywhere', () => {
    const text = JSON.stringify(bundle)
    expect(text).not.toContain('"points"')
    const walk = (v: any): void => {
      if (Array.isArray(v)) return v.forEach(walk)
      if (v && typeof v === 'object') {
        Object.entries(v).forEach(([k, val]) => {
          expect(k).not.toBe('points')
          expect(k).not.toBe('rows')
          walk(val)
        })
      }
    }
    walk(bundle)
    // A four-day two-parameter session is ~768 readings; the bundle must be far
    // smaller than the readings it describes.
    expect(text.length).toBeLessThan(60_000)
  })

  it('scales with structure, not with the number of readings', () => {
    const long = baseEnv()
    long.datasets[0].points = multiDay(12, (_d, h, i) => ({
      co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI),
      pm: i === 50 ? 180 : 10 + (i % 5),
    })) as never
    const big = buildForensicBundle(baseInput({ sensorData: long }))
    const small = JSON.stringify(bundle).length
    const large = JSON.stringify(big).length
    // Three times the readings must not mean three times the payload.
    expect(large).toBeLessThan(small * 2)
  })

  it('reuses the existing statistics rather than recomputing them', () => {
    const co2 = bundle.parameters.find((p: any) => p.param === 'co2' && p.datasetId === 'primary')
    expect(co2.id).toBe(parameterId('primary', 'co2'))
    expect(co2.stats.n).toBe(indoorPoints.length)
    expect(typeof co2.stats.mean).toBe('number')
    expect(co2.stats.occupancy).toBeTruthy()
    expect(co2.stats.coverage.coveragePct).toBeCloseTo(100, 3)
    // Reference metadata rides as context and states no verdict.
    expect(co2.reference).toBeTruthy()
    expect(JSON.stringify(co2.reference)).not.toMatch(/exceed|fail|unsafe|acceptable/i)
  })

  it('reports which contextual inputs the session has, without grading them', () => {
    expect(bundle.context.available.occupancy).toBe(true)
    expect(bundle.context.available.outdoor).toBe(true)
    expect(bundle.context.available.annotations).toBe(true)
    expect(bundle.context.available.hvac_schedule).toBe(false)
    expect(bundle.context.annotations[0].id).toBe('ann-e1')
  })

  it('states shape and never an interpretation', () => {
    const text = JSON.stringify({ events: bundle.events, patterns: bundle.patterns })
    expect(text).not.toMatch(/likely|suggests|indicates|caused|probably|severity/i)
  })
})

describe('the evidence registry is the validator’s lookup', () => {
  const bundle = buildForensicBundle(baseInput())

  it('indexes every deterministic id the model may cite', () => {
    const ev = bundle.evidence
    expect(ev.eventIds).toEqual(bundle.events.map((e: any) => e.id).sort())
    expect(ev.patternIds).toEqual(bundle.patterns.map((p: any) => p.id).sort())
    expect(ev.datasetIds).toEqual(['ds-out', 'primary'])
    expect(ev.parameterIds).toContain(parameterId('primary', 'co2'))
    expect(ev.annotationIds).toEqual(['ann-e1'])
  })

  it('every pattern cites only events that exist in the registry', () => {
    const known = new Set(bundle.evidence.eventIds)
    bundle.patterns.forEach((p: any) => p.eventIds.forEach((id: string) => expect(known.has(id)).toBe(true)))
  })

  it('every context-gap id names a declared contextual input', () => {
    bundle.evidence.contextGapIds.forEach((id: string) => {
      expect(Object.keys(bundle.context.labels)).toContain(id)
    })
  })

  it('ids are unique within their collection', () => {
    Object.values(bundle.evidence).forEach((ids: any) => {
      expect(new Set(ids).size).toBe(ids.length)
    })
  })

  it('bundleEvidence is a pure projection of the bundle', () => {
    expect(bundleEvidence(bundle)).toEqual(bundle.evidence)
    expect(bundleEvidence({})).toEqual({
      datasetIds: [], parameterIds: [], eventIds: [], patternIds: [],
      annotationIds: [], contextGapIds: [],
    })
  })

  it('annotationId is stable, and derived when the stored id is missing', () => {
    expect(annotationId({ id: 'e1', t: 1 })).toBe('ann-e1')
    const derived = annotationId({ t: T0, type: 'cleaning' })
    expect(derived).toBe(annotationId({ t: T0, type: 'cleaning' }))
    expect(derived).not.toBe(annotationId({ t: T0 + 1, type: 'cleaning' }))
  })
})

describe('the same inputs reproduce the same bundle', () => {
  it('ids and fingerprint are identical across runs', () => {
    const a = buildForensicBundle(baseInput())
    const b = buildForensicBundle(baseInput())
    expect(a.fingerprint).toBe(b.fingerprint)
    expect(a.evidence).toEqual(b.evidence)
    expect(a.events.map((e: any) => e.id)).toEqual(b.events.map((e: any) => e.id))
    expect(a.patterns.map((p: any) => p.id)).toEqual(b.patterns.map((p: any) => p.id))
  })

  it('the bundle fingerprint equals the input fingerprint', () => {
    expect(buildForensicBundle(baseInput()).fingerprint).toBe(forensicInputHash(baseInput()))
  })

  it('tolerates an empty or malformed session', () => {
    const empty = buildForensicBundle({})
    expect(empty.datasets).toEqual([])
    expect(empty.events).toEqual([])
    expect(empty.patterns).toEqual([])
    expect(empty.fingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(buildForensicBundle({ sensorData: null } as never).events).toEqual([])
  })
})

describe('staleness is never resolved silently', () => {
  const bundle = buildForensicBundle(baseInput())

  it('an interpretation of these inputs is fresh', () => {
    const stored = { fingerprint: bundle.fingerprint, patterns: [] }
    expect(isForensicAnalysisFresh(stored, bundle)).toBe(true)
    expect(forensicFreshness(stored, bundle).reason).toBe('fresh')
  })

  it('an interpretation of different inputs is stale, and says which', () => {
    const changed = buildForensicBundle(baseInput({ annotations: [] }))
    const stored = { fingerprint: bundle.fingerprint }
    const verdict = forensicFreshness(stored, changed)
    expect(verdict.fresh).toBe(false)
    expect(verdict.reason).toBe('inputs_changed')
    expect(verdict.storedFingerprint).toBe(bundle.fingerprint)
    expect(verdict.currentFingerprint).toBe(changed.fingerprint)
  })

  it('a missing or unfingerprinted interpretation is never treated as fresh', () => {
    expect(forensicFreshness(null, bundle).reason).toBe('no_interpretation')
    expect(forensicFreshness({}, bundle).reason).toBe('no_stored_fingerprint')
    expect(forensicFreshness({ fingerprint: bundle.fingerprint }, {}).reason).toBe('no_current_fingerprint')
    expect(isForensicAnalysisFresh(undefined, bundle)).toBe(false)
  })

  it('accepts a bare fingerprint string as the current side', () => {
    expect(isForensicAnalysisFresh({ fingerprint: bundle.fingerprint }, bundle.fingerprint)).toBe(true)
    expect(isForensicAnalysisFresh({ fingerprint: bundle.fingerprint }, 'deadbeefdeadbeef')).toBe(false)
  })
})

/** Every leaf path of a nested plain object. */
const leafPaths = (o: any, prefix: string[] = []): string[][] =>
  Object.entries(o || {}).flatMap(([k, v]) => (
    v && typeof v === 'object' && !Array.isArray(v) ? leafPaths(v, [...prefix, k]) : [[...prefix, k]]
  ))

/** A deep copy with one leaf replaced. */
const setAt = (o: any, path: string[], val: any) => {
  const copy = JSON.parse(JSON.stringify(o ?? {}))
  let cur = copy
  path.slice(0, -1).forEach((k) => { cur[k] = cur[k] ?? {}; cur = cur[k] })
  cur[path[path.length - 1]] = val
  return copy
}

describe('what the model sees and what the fingerprint protects are the same thing', () => {
  const bundle = buildForensicBundle(baseInput())

  it('EVERY model-visible deployment field is fingerprint-covered', () => {
    // The regression this closes: the bundle passed the caller's whole context
    // through while the signature fingerprinted a chosen subset, so a field
    // could change under the model with the fingerprint standing still.
    const paths = leafPaths(bundle.context.deployment)
    expect(paths.length).toBeGreaterThan(8)
    const base = forensicInputHash(baseInput())
    paths.forEach((path) => {
      const mutated = setAt(baseContext(), path, `changed-${path.join('.')}`)
      expect(
        forensicInputHash(baseInput({ context: mutated })),
        `${path.join('.')} is visible to the model but not fingerprinted`,
      ).not.toBe(base)
    })
  })

  it('the bundle transmits the canonical projection and nothing else', () => {
    const withExtra = baseContext() as any
    withExtra.preparedFor = 'Acme Corp'
    withExtra.internalNotes = 'do not send'
    const b = buildForensicBundle(baseInput({ context: withExtra }))
    expect(b.context.deployment).toEqual(projectDeploymentContext(withExtra, 'isobutylene'))
    expect(JSON.stringify(b.context.deployment)).not.toContain('Acme Corp')
    expect(JSON.stringify(b.context.deployment)).not.toContain('do not send')
    // Consistent in the other direction too: what is not transmitted is not
    // fingerprinted, so an untransmitted field cannot invalidate a reading.
    expect(forensicInputHash(baseInput({ context: withExtra }))).toBe(forensicInputHash(baseInput()))
  })

  it('the projection is the same object in both halves', () => {
    expect(bundle.context.deployment).toEqual(projectDeploymentContext(baseContext(), 'isobutylene'))
    expect(forensicInputSignature(baseInput()))
      .toContain(stableStringify(projectDeploymentContext(baseContext(), 'isobutylene')).slice(1, 60))
  })
})

describe('annotation content the fingerprint protects reaches the model', () => {
  it('the note is transmitted, not just the label', () => {
    const noted = baseInput({
      annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: 'Damper reset to 20%' }],
    })
    const b = buildForensicBundle(noted)
    expect(b.context.annotations[0].note).toBe('Damper reset to 20%')
  })

  it('changing the note changes the fingerprint AND the bundle content', () => {
    const a = baseInput({ annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: 'Damper reset to 20%' }] })
    const b = baseInput({ annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted', note: 'Damper reset to 40%' }] })
    expect(forensicInputHash(a)).not.toBe(forensicInputHash(b))
    expect(buildForensicBundle(a).context.annotations[0].note)
      .not.toBe(buildForensicBundle(b).context.annotations[0].note)
  })

  it('the annotation list is the same projection in both halves', () => {
    const input = baseInput()
    const b = buildForensicBundle(input)
    expect(b.context.annotations).toEqual(projectAnnotations(input.annotations))
  })
})

describe('fallback annotation ids are semantic, not positional', () => {
  const at = T0 + 50 * Q

  it('same instant and type but different labels get different ids', () => {
    const one = annotationId({ t: at, type: 'other', label: 'Door propped open' })
    const two = annotationId({ t: at, type: 'other', label: 'Printer running' })
    expect(one).not.toBe(two)
  })

  it('a different note alone is enough to separate them', () => {
    expect(annotationId({ t: at, type: 'other', label: 'X', note: 'a' }))
      .not.toBe(annotationId({ t: at, type: 'other', label: 'X', note: 'b' }))
  })

  it('the same semantic annotation reproduces the same id across reruns', () => {
    const a = { t: at, type: 'cleaning', label: 'Cleaning', note: 'Wet mop' }
    expect(annotationId(a)).toBe(annotationId({ ...a }))
    expect(annotationId(a)).toBe(annotationId({ note: 'Wet mop', label: 'Cleaning', type: 'cleaning', t: at }))
  })

  it('a stored id still wins, and unlabeled collisions no longer occur in a bundle', () => {
    expect(annotationId({ id: 'e9', t: at, type: 'other' })).toBe('ann-e9')
    const b = buildForensicBundle(baseInput({
      annotations: [
        { t: at, type: 'other', label: 'Door propped open' },
        { t: at, type: 'other', label: 'Printer running' },
      ],
    }))
    expect(b.context.annotations).toHaveLength(2)
    expect(new Set(b.evidence.annotationIds).size).toBe(2)
  })

  it('an exact duplicate is one annotation, not two', () => {
    const dup = { t: at, type: 'other', label: 'Door propped open', note: '' }
    const b = buildForensicBundle(baseInput({ annotations: [dup, { ...dup }] }))
    expect(b.context.annotations).toHaveLength(1)
    expect(b.evidence.annotationIds).toHaveLength(1)
  })
})

describe('the calibration gas is resolved once', () => {
  it('the session record wins over the page value, everywhere', () => {
    const input = baseInput({ calibrationGas: 'toluene' }) // context says isobutylene
    expect(effectiveCalibrationGas(input)).toBe('isobutylene')
    expect(buildForensicBundle(input).context.deployment.calibration.gas).toBe('isobutylene')
    expect(buildForensicBundle(input).context.calibrationGas).toBe('isobutylene')
  })

  it('the page value is used when the session record carries none', () => {
    const ctx = baseContext(); ctx.calibration.gas = ''
    const input = baseInput({ context: ctx, calibrationGas: 'toluene' })
    expect(effectiveCalibrationGas(input)).toBe('toluene')
    expect(buildForensicBundle(input).context.deployment.calibration.gas).toBe('toluene')
  })

  it('changing it changes the fingerprint and the transmitted value together', () => {
    const ctxA = baseContext(); ctxA.calibration.gas = 'isobutylene'
    const ctxB = baseContext(); ctxB.calibration.gas = 'toluene'
    expect(forensicInputHash(baseInput({ context: ctxA })))
      .not.toBe(forensicInputHash(baseInput({ context: ctxB })))
    expect(buildForensicBundle(baseInput({ context: ctxA })).context.deployment.calibration.gas)
      .not.toBe(buildForensicBundle(baseInput({ context: ctxB })).context.deployment.calibration.gas)
  })

  it('changing it via the page value alone also moves the fingerprint', () => {
    const ctx = baseContext(); ctx.calibration.gas = ''
    expect(forensicInputHash(baseInput({ context: ctx, calibrationGas: 'isobutylene' })))
      .not.toBe(forensicInputHash(baseInput({ context: ctx, calibrationGas: 'toluene' })))
  })

  it('no reference varies with the gas today, so nothing downstream can disagree about it', () => {
    // `paramReference` still accepts and documents `calibrationGas`, but the
    // only branch that consumed it — the Molhave TVOC tier — was removed in
    // 2026-08, so every reference is currently gas-independent. Pinned rather
    // than assumed: if a reference starts varying with the gas, this fails and
    // whoever makes that change has to confirm the bundle carries it through.
    const ts = Date.UTC(2026, 6, 1)
    const params = ['co2', 'pm', 'co', 'tvoc', 'hcho', 'temp', 'rh']
    params.forEach((param) => {
      expect(JSON.stringify(paramReference(param, { unit: 'ppb', ts, calibrationGas: 'isobutylene' })))
        .toBe(JSON.stringify(paramReference(param, { unit: 'ppb', ts, calibrationGas: 'toluene' })))
    })
  })
})
