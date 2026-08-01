/**
 * datasetHash — the fingerprint printed in the report's colophon.
 *
 * The property under test is narrow and load-bearing: the hash must change
 * when the MEASUREMENTS change and must not change when the paperwork does.
 * A hash that moved every time someone fixed a typo in the client name would
 * certify nothing; a hash that survived an altered reading would certify
 * something false.
 */
import { describe, it, expect } from 'vitest'
import {
  canonicalDatasetText,
  hashDataset,
  sha256Hex,
  shortHash,
  DATASET_HASH_VERSION,
} from '../../src/utils/datasetHash.js'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

const dataset = (over: any = {}) => ({
  fileName: 'qtrak.csv',
  params: ['co2', 'temp'],
  units: { co2: 'ppm', temp: '°F' },
  points: [
    { t: T0, co2: 473.5352400355041, temp: 68.2 },
    { t: T0 + 10 * MIN, co2: 512.25, temp: 68.4 },
    { t: T0 + 20 * MIN, co2: 601, temp: 69.0 },
  ],
  summary: { count: 3, start: T0, end: T0 + 20 * MIN },
  ...over,
})

describe('canonical form', () => {
  it('is a stable, readable text keyed by version', () => {
    const text = canonicalDatasetText(dataset())
    expect(text.split('\n')[0]).toBe(DATASET_HASH_VERSION)
    expect(text).toContain('co2|ppm')
    expect(text).toContain('temp|°F')
    expect(text).toContain(`${T0}|473.5352400355041|68.2`)
  })

  it('serializes at full precision — no rounding that could collide', () => {
    const a = canonicalDatasetText(dataset({ points: [{ t: T0, co2: 500.0000001 }], params: ['co2'] }))
    const b = canonicalDatasetText(dataset({ points: [{ t: T0, co2: 500.0000002 }], params: ['co2'] }))
    expect(a).not.toBe(b)
  })

  it('distinguishes a missing reading from a zero', () => {
    const gap = canonicalDatasetText(dataset({ params: ['co2'], points: [{ t: T0 }] }))
    const zero = canonicalDatasetText(dataset({ params: ['co2'], points: [{ t: T0, co2: 0 }] }))
    expect(gap).not.toBe(zero)
    expect(gap).toContain(`${T0}|`)
    expect(zero).toContain(`${T0}|0`)
  })

  it('derives the parameter list from the readings when none is declared', () => {
    const text = canonicalDatasetText({ points: [{ t: T0, co2: 500, temp: 70 }] } as never)
    expect(text).toContain('co2|')
    expect(text).toContain('temp|')
    expect(text).not.toContain('t|') // the timestamp is not a parameter
  })

  it('survives malformed input rather than throwing', () => {
    expect(() => canonicalDatasetText(null as never)).not.toThrow()
    expect(() => canonicalDatasetText({ points: 'nope' } as never)).not.toThrow()
    expect(() => canonicalDatasetText({ points: [null, 3] } as never)).not.toThrow()
    expect(canonicalDatasetText(null as never)).toContain(DATASET_HASH_VERSION)
  })
})

describe('what moves the hash', () => {
  it('is stable across repeated runs on identical data', async () => {
    const a = await hashDataset(dataset())
    const b = await hashDataset(dataset())
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ignores column ORDER but not column IDENTITY', async () => {
    // Re-mapping the same two columns in the other order is the same data.
    const reordered = await hashDataset(dataset({ params: ['temp', 'co2'] }))
    expect(reordered).toBe(await hashDataset(dataset()))

    // Dropping a parameter is not.
    expect(await hashDataset(dataset({ params: ['co2'] }))).not.toBe(await hashDataset(dataset()))
  })

  it('ignores the paperwork', async () => {
    // The report can be re-issued with a corrected client name, a different
    // objective, or as the other edition, and still claim the same data.
    const base = await hashDataset(dataset())
    expect(await hashDataset(dataset({ fileName: 'renamed.csv' }))).toBe(base)
    expect(await hashDataset(dataset({ role: 'zone', label: 'North bay' }))).toBe(base)
    expect(await hashDataset(dataset({ quality: { flags: [{ level: 'minor', msg: 'x' }] } }))).toBe(base)
  })

  it('moves when a single reading is altered', async () => {
    const tampered = dataset()
    tampered.points[1].co2 = 512.26 // one hundredth of a ppm
    expect(await hashDataset(tampered)).not.toBe(await hashDataset(dataset()))
  })

  it('moves when a row is dropped, added, or re-ordered', async () => {
    const base = await hashDataset(dataset())
    const dropped = dataset()
    dropped.points.splice(1, 1)
    expect(await hashDataset(dropped)).not.toBe(base)

    const reordered = dataset()
    reordered.points.reverse()
    // A time series' order IS its data — reversing it is a different dataset.
    expect(await hashDataset(reordered)).not.toBe(base)
  })

  it('moves when a unit changes, even at identical numbers', async () => {
    // 20 °C and 20 °F are not the same measurement.
    expect(await hashDataset(dataset({ units: { co2: 'ppm', temp: '°C' } }))).not.toBe(await hashDataset(dataset()))
  })

  it('moves when a timestamp shifts', async () => {
    const shifted = dataset()
    shifted.points[0].t = T0 + 1
    expect(await hashDataset(shifted)).not.toBe(await hashDataset(dataset()))
  })
})

describe('sha256Hex', () => {
  it('matches the published digest for a known input', async () => {
    // NIST's canonical SHA-256 test vector — proof this is really SHA-256 and
    // not something that merely looks like a hash.
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })
})

describe('shortHash', () => {
  it('keeps the head and the tail, so a truncation would be visible', () => {
    const full = 'a19dd790c4b1'.padEnd(64, '0').slice(0, 60) + 'c8f4'
    expect(shortHash(full)).toBe(`${full.slice(0, 8)}…c8f4`)
  })

  it('returns what it was given rather than inventing an ellipsis', () => {
    expect(shortHash('abc')).toBe('abc')
    expect(shortHash('')).toBeNull()
    expect(shortHash(null as never)).toBeNull()
  })
})
