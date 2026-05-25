/**
 * Logger Studio Phase B — multi-dataset envelope + alignment + ventilation.
 *
 * Pins the pure foundations the indoor/outdoor differential and multi-zone
 * overlay build on: the backward-compatible v1→v2 migration, the primary
 * dataset accessor, nearest-timestamp alignment, and the CO₂ mass-balance
 * estimate extracted from Co2OaCalculator.
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeSensorData, primaryDataset, alignDatasets, sensorAveragesToFields,
  SENSOR_DATA_VERSION,
} from '../../src/utils/sensorParser'
import { calcCfmPerPerson, G_CFM_PER_PERSON, MIN_DIFFERENTIAL_PPM } from '../../src/utils/ventilation'

// A minimal legacy (v1) parsed object.
const v1 = {
  fileName: 'indoor.csv',
  params: ['co2'],
  units: { co2: 'ppm' },
  hasTimestamps: true,
  points: [{ t: 1000, co2: 800 }, { t: 2000, co2: 900 }],
  summary: { count: 2, start: 1000, end: 2000, stats: { co2: { mean: 850, median: 850, min: 800, max: 900, n: 2 } } },
  quality: { level: 'ok', status: 'ok', flags: [] },
  graphs: { co2: { include: true, imageDataUrl: 'data:image/png;base64,AAAA' } },
  thresholds: { co2: true, pm: true },
}

describe('normalizeSensorData migration', () => {
  it('wraps a legacy v1 object as the primary indoor dataset, lifting graphs/thresholds', () => {
    const env = normalizeSensorData(v1)
    expect(env.version).toBe(SENSOR_DATA_VERSION)
    expect(env.datasets).toHaveLength(1)
    expect(env.datasets[0]).toMatchObject({ id: 'primary', role: 'indoor', label: 'Indoor', fileName: 'indoor.csv' })
    // graphs + thresholds move to the envelope level, not the dataset
    expect(env.graphs).toEqual(v1.graphs)
    expect(env.thresholds).toEqual(v1.thresholds)
    expect(env.datasets[0].graphs).toBeUndefined()
    expect(env.occupancyWindows).toEqual([])
  })

  it('is idempotent — normalizing a v2 envelope changes nothing material', () => {
    const once = normalizeSensorData(v1)
    const twice = normalizeSensorData(once)
    expect(twice.datasets).toEqual(once.datasets)
    expect(twice.graphs).toEqual(once.graphs)
    expect(twice.thresholds).toEqual(once.thresholds)
    expect(twice.version).toBe(SENSOR_DATA_VERSION)
  })

  it('defaults missing envelope fields and returns null for nullish input', () => {
    const env = normalizeSensorData({ version: 2, datasets: [{ id: 'a', role: 'indoor' }] })
    expect(env.occupancyWindows).toEqual([])
    expect(env.thresholds).toEqual({ co2: true })
    expect(env.graphs).toEqual({})
    expect(normalizeSensorData(null)).toBeNull()
  })
})

describe('primaryDataset accessor', () => {
  it('prefers the indoor dataset, else the first', () => {
    const env = { datasets: [{ id: 'o', role: 'outdoor' }, { id: 'i', role: 'indoor' }] }
    expect(primaryDataset(env).id).toBe('i')
    expect(primaryDataset({ datasets: [{ id: 'z', role: 'zone' }] }).id).toBe('z')
  })
  it('treats a legacy v1 object as its own primary dataset', () => {
    expect(primaryDataset(v1).fileName).toBe('indoor.csv')
    expect(primaryDataset(null)).toBeNull()
  })
})

describe('sensorAveragesToFields accepts both shapes', () => {
  it('reads averages from the primary dataset of a v2 envelope', () => {
    const env = normalizeSensorData(v1)
    const fromEnv = sensorAveragesToFields(env)
    const fromV1 = sensorAveragesToFields(v1)
    expect(fromEnv.fields).toEqual(fromV1.fields)
    expect(fromEnv.fields.co2).toBe('850')
  })
})

describe('alignDatasets', () => {
  const indoor = { id: 'indoor', hasTimestamps: true, summary: { intervalSec: 60 }, points: [{ t: 0, co2: 1000 }, { t: 60000, co2: 1100 }] }
  const outdoor = { id: 'outdoor', hasTimestamps: true, summary: { intervalSec: 60 }, points: [{ t: 5000, co2: 420 }, { t: 61000, co2: 430 }] }

  it('builds a union timeline and nearest-joins each dataset within tolerance', () => {
    const { points, ids } = alignDatasets([indoor, outdoor], 'co2')
    expect(ids).toEqual(['indoor', 'outdoor'])
    // union of {0, 60000, 5000, 61000} → 4 base rows, sorted
    expect(points.map((p) => p.t)).toEqual([0, 5000, 60000, 61000])
    const at0 = points.find((p) => p.t === 0)
    expect(at0.indoor).toBe(1000)
    expect(at0.outdoor).toBe(420) // nearest outdoor (5 s away) within 60 s tol
  })

  it('nulls a dataset value at base times with no point within tolerance', () => {
    const sparse = { id: 'outdoor', hasTimestamps: true, summary: { intervalSec: 60 }, points: [{ t: 9_000_000, co2: 420 }] }
    const { points } = alignDatasets([indoor, sparse], 'co2', { toleranceMs: 60000 })
    // indoor's own timestamps are far from the lone outdoor point → null there
    expect(points.find((p) => p.t === 0).outdoor).toBeNull()
    expect(points.find((p) => p.t === 60000).outdoor).toBeNull()
    // the outdoor point's own timestamp is in the union and resolves to itself
    expect(points.find((p) => p.t === 9_000_000).outdoor).toBe(420)
    expect(points.find((p) => p.t === 9_000_000).indoor).toBeNull()
  })

  it('excludes row-order (non-timestamped) datasets', () => {
    const noTs = { id: 'x', hasTimestamps: false, points: [{ t: 0, co2: 1 }] }
    const { ids } = alignDatasets([noTs], 'co2')
    expect(ids).toEqual([])
  })
})

describe('calcCfmPerPerson (extracted mass-balance)', () => {
  it('computes Vo = G·1e6/Δ for a valid differential', () => {
    const r = calcCfmPerPerson(1100, 420)
    expect(r.cfmPerPerson).toBeCloseTo((G_CFM_PER_PERSON * 1e6) / (1100 - 420), 1)
  })
  it(`flags a differential below ${MIN_DIFFERENTIAL_PPM} ppm as unreliable`, () => {
    expect(calcCfmPerPerson(450, 420).error).toBeTruthy()
  })
  it('returns null for non-numeric inputs', () => {
    expect(calcCfmPerPerson('', 420)).toBeNull()
  })
})
