/**
 * The TVOC volumetric ↔ mass converter, and the one property that made it
 * necessary: the two paths a ppb log can take through this codebase have to
 * reach the same conclusion about the same air.
 *
 * Path A — the assessment. `sensorAveragesToFields` converts a ppb mean into
 * the zone's `tv` field, which is µg/m³, and the engine compares that to
 * Mølhave's 500.
 *
 * Path B — the monitoring report. `resolveReference` projects Mølhave's 500
 * into the unit the series was logged in, and the chart compares the ppb
 * readings against that.
 *
 * The two used to disagree: path A converted, path B refused to, so the same
 * instrument produced a comparison in the report and no reference line at all
 * in the chart. Both paths now go through `convertTvoc`, which is what the
 * agreement test below actually enforces.
 */
import { describe, it, expect } from 'vitest'
import {
  convertTvoc,
  tvocBasis,
  tvocEquivalenceNote,
  tvocReference,
  TVOC_REFERENCES,
} from '../../src/utils/vocConversion'
import { resolveReference } from '../../src/utils/referenceProfiles'
import { sensorAveragesToFields } from '../../src/utils/sensorParser'
import { CRITERIA } from '../../src/constants/criteria'
import { STD } from '../../src/constants/standards'

describe('tvocBasis', () => {
  it('sorts the units it knows into the two bases', () => {
    for (const u of ['µg/m³', 'ug/m3', 'mg/m³']) expect(tvocBasis(u), u).toBe('mass')
    for (const u of ['ppb', 'ppm', 'PPB']) expect(tvocBasis(u), u).toBe('volume')
  })

  it('claims no basis for a unit that has none', () => {
    // An air-quality index is a scale, not a concentration. Guessing here is
    // how a plausible-looking wrong number gets into a report.
    for (const u of ['index', 'AQI', '', null, undefined]) {
      expect(tvocBasis(u as any), String(u)).toBeNull()
    }
  })
})

describe('convertTvoc', () => {
  it('is an exact prefix shift within a basis, and assumes nothing', () => {
    const a = convertTvoc(0.5, 'mg/m³', 'µg/m³')!
    expect(a.value).toBe(500)
    expect(a.crossedBasis).toBe(false)
    expect(a.reference).toBeNull()

    const b = convertTvoc(0.218, 'ppm', 'ppb')!
    expect(b.value).toBeCloseTo(218, 10)
    expect(b.crossedBasis).toBe(false)
  })

  it('crosses bases against a named compound, and says it crossed', () => {
    const r = convertTvoc(500, 'µg/m³', 'ppb')!
    expect(r.value).toBeCloseTo(500 * 24.45 / 56.11, 10)
    expect(r.crossedBasis).toBe(true)
    expect(r.reference!.label).toBe('Isobutylene')
  })

  it('round-trips: a crossing and its inverse return the original reading', () => {
    for (const ppb of [12, 218, 1307, 4000]) {
      const ug = convertTvoc(ppb, 'ppb', 'µg/m³')!.value
      expect(convertTvoc(ug, 'µg/m³', 'ppb')!.value).toBeCloseTo(ppb, 8)
    }
  })

  it('honours the chosen reference compound rather than quietly defaulting', () => {
    const iso = convertTvoc(100, 'ppb', 'µg/m³', { reference: 'isobutylene' })!
    const tol = convertTvoc(100, 'ppb', 'µg/m³', { reference: 'toluene' })!
    expect(tol.value).toBeGreaterThan(iso.value)   // MW 92.14 > 56.11
    expect(tol.reference!.label).toBe('Toluene')
    // An unknown key falls back to the convention rather than throwing or
    // silently producing NaN.
    expect(convertTvoc(100, 'ppb', 'µg/m³', { reference: 'nonesuch' })!.reference!.label)
      .toBe('Isobutylene')
    expect(tvocReference(undefined).label).toBe('Isobutylene')
  })

  it('refuses rather than guesses when either end has no basis', () => {
    expect(convertTvoc(100, 'index', 'µg/m³')).toBeNull()
    expect(convertTvoc(100, 'ppb', 'index')).toBeNull()
    expect(convertTvoc(null as any, 'ppb', 'µg/m³')).toBeNull()
    expect(convertTvoc(NaN, 'ppb', 'µg/m³')).toBeNull()
  })

  it('handles a cross-basis conversion between non-canonical units in one step', () => {
    // ppm → mg/m³ crosses the basis AND shifts the prefix on both ends.
    const r = convertTvoc(1, 'ppm', 'mg/m³')!
    expect(r.value).toBeCloseTo(1000 * 56.11 / 24.45 / 1000, 10)
    expect(r.crossedBasis).toBe(true)
  })
})

describe('tvocEquivalenceNote', () => {
  it('names the compound, the weight, and the test that would settle it', () => {
    const note = tvocEquivalenceNote(TVOC_REFERENCES.isobutylene)
    expect(note).toMatch(/isobutylene-equivalent/i)
    expect(note).toContain('56.11')
    expect(note).toMatch(/TO-17/)
    // It states the limitation without asserting the reading is unusable —
    // a PID total IS a measurement; what it is not is a speciated one.
    expect(note).toMatch(/response varies by compound/i)
  })

  it('follows the compound actually used', () => {
    expect(tvocEquivalenceNote(TVOC_REFERENCES.toluene)).toMatch(/toluene-equivalent/i)
  })
})

describe('the two paths agree about the same air', () => {
  // The defect this whole module exists to close. Build one ppb series, send
  // it down both paths, and require the same answer.
  const PPB = [800, 200, 200, 800, 200, 200]   // mean 400 ppb ≈ 918 µg/m³, above the tier

  const logOf = (unit: string, vals: number[]) => ({
    version: 2,
    datasets: [{
      role: 'indoor',
      params: ['tvoc'],
      units: { tvoc: unit },
      summary: { stats: { tvoc: { mean: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } } },
    }],
  })

  it('reaches the same verdict whether the data moves or the reference does', () => {
    // Path A: the ppb mean converts into the µg/m³ `tv` field, compared to 500.
    const { fields, details } = sensorAveragesToFields(logOf('ppb', PPB) as any, { stat: 'mean' })
    const tvUgm3 = Number(fields.tv)
    const pathA = tvUgm3 > STD.c.tvoc.con

    // Path B: Mølhave's 500 projects into ppb, compared to the ppb mean.
    const limitPpb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!.limit as number
    const meanPpb = PPB.reduce((a, b) => a + b, 0) / PPB.length
    const pathB = meanPpb > limitPpb

    expect(pathB).toBe(pathA)
    // And not vacuously — the series is genuinely above the tier.
    expect(pathA).toBe(true)
    // Path A must also disclose what it assumed, in its own preview note.
    expect(details.find((d: any) => d.param === 'tvoc')!.note).toMatch(/Isobutylene/)
  })

  it('agrees again just under the tier, where a wrong conversion would show', () => {
    // 200 ppb ≈ 459 µg/m³ — below 500 on both paths only if the same
    // molecular weight is used at both ends.
    const near = [200, 200, 200]
    const { fields } = sensorAveragesToFields(logOf('ppb', near) as any, { stat: 'mean' })
    const limitPpb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!.limit as number
    expect(Number(fields.tv) > STD.c.tvoc.con).toBe(false)
    expect(200 > limitPpb).toBe(false)
  })
})

describe('the equivalence basis is declared once', () => {
  it('is set on exactly the TVOC criteria, and on nothing that converts exactly', () => {
    const withBasis: string[] = []
    for (const [param, list] of Object.entries(CRITERIA)) {
      for (const c of list as any[]) if (c.equivalenceBasis) withBasis.push(`${param}/${c.id}`)
    }
    expect(withBasis.sort()).toEqual(['tvoc/tvoc_molhave_action', 'tvoc/tvoc_molhave_concern'])
  })

  it('names a compound the converter actually knows', () => {
    for (const list of Object.values(CRITERIA)) {
      for (const c of list as any[]) {
        if (c.equivalenceBasis) expect(TVOC_REFERENCES[c.equivalenceBasis], c.id).toBeTruthy()
      }
    }
  })

  it('every TVOC tier published in µg/m³ discloses when it crossed, and only then', () => {
    // The rule has to hold per profile, not just for the one that prompted
    // it — including WELL, which carries no registry entry and declares the
    // basis on the profile itself.
    for (const id of ['molhave', 'molhave-action', 'well']) {
      const ppb = resolveReference('tvoc', id, { unit: 'ppb' })!
      expect(ppb.limit, `${id} did not resolve in ppb`).toBeGreaterThan(0)
      expect(ppb.note, `${id} crossed silently`).toMatch(/isobutylene-equivalent/i)

      const ug = resolveReference('tvoc', id, { unit: 'µg/m³' })!
      expect(ug.note || '', `${id} claims an assumption it did not make`)
        .not.toMatch(/isobutylene-equivalent/i)
    }
  })
})
