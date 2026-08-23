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
  parseCalibrationGas,
  tvocBasis,
  tvocEquivalenceNote,
  tvocReference,
  TVOC_REFERENCES,
} from '../../src/utils/vocConversion'
import { paramReference } from '../../src/utils/sensorThresholds'
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
    // `tvoc_leed_target` joined in 2026-08 — the 500 µg/m³ green-building
    // acceptance value, added because the Logger Studio profile was drawing
    // that line with no criterion behind it. It is a µg/m³ TVOC figure and so
    // crosses bases exactly like the Mølhave tiers.
    expect(withBasis.sort()).toEqual([
      'tvoc/tvoc_leed_target', 'tvoc/tvoc_molhave_action', 'tvoc/tvoc_molhave_concern',
    ])
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


describe('parseCalibrationGas', () => {
  it('reads the compound out of what an assessor actually types', () => {
    for (const text of ['Isobutylene 100 ppm', 'isobutylene', 'IBE 100ppm', '2-methylpropene']) {
      expect(parseCalibrationGas(text).key, text).toBe('isobutylene')
    }
    expect(parseCalibrationGas('Toluene 10 ppm').key).toBe('toluene')
    expect(parseCalibrationGas('100 ppm isopropyl alcohol').key).toBe('isopropanol')
  })

  it('matches whole words, so a neighbouring compound is not mistaken for one', () => {
    // Isobutane is C4H10 (MW 58.12), not isobutylene (C4H8, 56.11). A
    // substring test would read "isobutane" as a hit on "ibe"-style aliases
    // and convert through the wrong weight without ever saying so.
    const r = parseCalibrationGas('Isobutane 100 ppm')
    expect(r.key).toBeNull()
    expect(r.recorded).toBe(true)
    expect(r.recognised).toBe(false)
  })

  it('separates "nothing recorded" from "recorded but unknown"', () => {
    const blank = parseCalibrationGas('   ')
    expect(blank.recorded).toBe(false)
    expect(blank.stated).toBe('')

    const unknown = parseCalibrationGas('Freon 12')
    expect(unknown.recorded).toBe(true)
    expect(unknown.recognised).toBe(false)
    expect(unknown.stated).toBe('Freon 12')
  })

  it('says which of the three it was, in the disclosure', () => {
    const recognised = tvocEquivalenceNote(TVOC_REFERENCES.toluene, parseCalibrationGas('Toluene 10 ppm'))
    expect(recognised).toMatch(/recorded for this survey \(Toluene 10 ppm\)/)

    const unknown = tvocEquivalenceNote(TVOC_REFERENCES.isobutylene, parseCalibrationGas('Freon 12'))
    expect(unknown).toMatch(/Freon 12/)
    expect(unknown).toMatch(/do not reflect it/i)

    const absent = tvocEquivalenceNote(TVOC_REFERENCES.isobutylene, parseCalibrationGas(''))
    expect(absent).toMatch(/was not recorded/i)
  })
})

describe('the survey’s own calibration gas decides the weight', () => {
  it('restates the tier through the recorded compound, not the default', () => {
    const iso = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    const tol = resolveReference('tvoc', 'molhave', { unit: 'ppb', calibrationGas: 'Toluene 100 ppm' })!
    expect(iso.limit).toBe(218)      // 500 × 24.45 ÷ 56.11
    expect(tol.limit).toBe(133)      // 500 × 24.45 ÷ 92.14
    expect(tol.note).toMatch(/toluene-equivalent/i)
    expect(tol.note).toMatch(/Toluene 100 ppm/)
  })

  it('changes nothing when the log is already in mass units', () => {
    // The recorded gas is only a conversion input. It cannot move a tier
    // that never crosses a basis.
    const a = resolveReference('tvoc', 'molhave', { unit: 'µg/m³' })!
    const b = resolveReference('tvoc', 'molhave', { unit: 'µg/m³', calibrationGas: 'Toluene' })!
    expect(a.limit).toBe(500)
    expect(b.limit).toBe(500)
    expect(b.note || '').not.toMatch(/toluene/i)
  })

  it('falls back to the default for a gas it cannot weigh, and names the mismatch', () => {
    const r = resolveReference('tvoc', 'molhave', { unit: 'ppb', calibrationGas: 'Freon 12' })!
    expect(r.limit).toBe(218)
    expect(r.note).toMatch(/Freon 12/)
    expect(r.note).toMatch(/do not reflect it/i)
  })

  it('reaches the Logger Studio cards through the same option', () => {
    expect(paramReference('tvoc', { unit: 'ppb' }).limit).toBe(218)
    const tol = paramReference('tvoc', { unit: 'ppb', calibrationGas: 'Toluene 100 ppm' })
    expect(tol.limit).toBe(133)
    expect(tol.note).toMatch(/toluene-equivalent/i)
  })

  it('keeps both paths in agreement once a gas is recorded', () => {
    // The same property as above, but with the assumption now sourced from
    // the survey record rather than a default. A wiring that reached one path
    // and not the other would break here and nowhere else.
    const mean = 400
    const ug = convertTvoc(mean, 'ppb', 'µg/m³', { reference: 'toluene' })!.value
    const limitPpb = resolveReference('tvoc', 'molhave', { unit: 'ppb', calibrationGas: 'Toluene' })!.limit as number
    expect(ug > STD.c.tvoc.con).toBe(mean > limitPpb)
    expect(ug > STD.c.tvoc.con).toBe(true)
  })
})
