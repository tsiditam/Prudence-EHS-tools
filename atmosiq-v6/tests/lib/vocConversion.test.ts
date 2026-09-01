/**
 * The TVOC volumetric ↔ mass converter, and the one property that made it
 * necessary: the two paths a ppb log can take through this codebase have to
 * reach the same conclusion about the same air.
 *
 * Path A — the assessment. `sensorAveragesToFields` converts a ppb mean into
 * the zone's `tv` field, which is µg/m³.
 *
 * Path B — the monitoring report. `resolveReference` projected a published
 * TVOC threshold into the unit the series was logged in, and the chart
 * compared the ppb readings against that.
 *
 * The two used to disagree: path A converted, path B refused to, so the same
 * instrument produced a comparison in the report and no reference line at all
 * in the chart. Unifying them on `convertTvoc` is why this module exists.
 *
 * ── Path B no longer exists (2026-08) ─────────────────────────────────────
 * Every TVOC threshold was removed — see `tests/engine/no-molhave.test.ts` —
 * so there is nothing left to project and nothing left to disagree with.
 *
 * The module is untouched by that, deliberately. Path A is a factual question
 * about the air: a logger reporting ppb feeding an engine field denominated
 * in µg/m³ has to cross bases correctly, disclose the compound it crossed
 * against, and follow the survey's own calibration record when one exists.
 * Getting that wrong is an error about the measurement, not about a verdict,
 * and it stays an error whether or not anything scores the result.
 *
 * So the tests below split along that line: everything about converting a
 * READING is kept and still asserted, and everything that projected a
 * THRESHOLD is replaced by an assertion that no threshold survives to
 * project. The figures 500 µg/m³ ≈ 218 ppb isobutylene ≈ 133 ppb toluene
 * still appear, now purely as conversion arithmetic with the answers already
 * worked out — not because anything compares a reading to them.
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

describe('the surviving path converts and discloses', () => {
  // What is left of the two-path property. There is one path now, so the
  // assertion is no longer "the two agree" but "this one is right and says
  // what it assumed" — which is the half that was ever about the air.
  const PPB = [800, 200, 200, 800, 200, 200]   // mean 400 ppb

  const logOf = (unit: string, vals: number[]) => ({
    version: 2,
    datasets: [{
      role: 'indoor',
      params: ['tvoc'],
      units: { tvoc: unit },
      summary: { stats: { tvoc: { mean: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } } },
    }],
  })

  it('carries a ppb mean into the engine field in µg/m³, against a named compound', () => {
    const { fields, details } = sensorAveragesToFields(logOf('ppb', PPB) as any, { stat: 'mean' })
    // 400 ppb x 56.11 / 24.45 is about 918 µg/m³. The field is rounded for
    // display, so compare to the converter within a whole unit.
    expect(Number(fields.tv)).toBeCloseTo(convertTvoc(400, 'ppb', 'µg/m³')!.value, 0)
    expect(Number(fields.tv)).toBeGreaterThan(900)
    // And it discloses the assumption in its own preview note, unprompted.
    expect(details.find((d: any) => d.param === 'tvoc')!.note).toMatch(/Isobutylene/)
  })

  it('follows the recorded span gas rather than the default', () => {
    const iso = sensorAveragesToFields(logOf('ppb', PPB) as any, { stat: 'mean' })
    const tol = sensorAveragesToFields(logOf('ppb', PPB) as any, { stat: 'mean', tvocRef: 'toluene' })
    // Toluene is the heavier molecule, so the same ppb series is more mass.
    expect(Number(tol.fields.tv)).toBeGreaterThan(Number(iso.fields.tv))
    expect(Number(tol.fields.tv)).toBeCloseTo(convertTvoc(400, 'ppb', 'µg/m³', { reference: 'toluene' })!.value, 0)
  })

  it('leaves a mass log alone — there is no basis to cross', () => {
    const { fields } = sensorAveragesToFields(logOf('µg/m³', [400, 400]) as any, { stat: 'mean' })
    expect(Number(fields.tv)).toBe(400)
  })

  it('has no threshold on the other side to disagree with', () => {
    // Path B, asserted as absent. `STD.c.tvoc` is gone and no profile
    // resolves, so the comparison this file was written to reconcile cannot
    // now be made from either direction.
    expect((STD as any).c.tvoc).toBeUndefined()
    for (const unit of ['ppb', 'µg/m³', 'mg/m³', 'ppm']) {
      expect(resolveReference('tvoc', 'molhave', { unit }), unit).toBeNull()
      expect(paramReference('tvoc', { unit }).limit, unit).toBeNull()
    }
  })
})

describe('the equivalence basis is declared once', () => {
  it('is set on nothing today — the only two criteria that had it are gone', () => {
    // It was `['tvoc/tvoc_molhave_action', 'tvoc/tvoc_molhave_concern']`, and
    // those were the only two thresholds this platform ever crossed a basis
    // for. The FIELD is kept, with its projection in referenceProfiles and
    // the rule below, because a field whose behaviour had been deleted would
    // silently do nothing the next time somebody set it. So this asserts the
    // contract is idle, not that it was dismantled.
    const withBasis: string[] = []
    for (const [param, list] of Object.entries(CRITERIA)) {
      for (const c of list as any[]) if (c.equivalenceBasis) withBasis.push(`${param}/${c.id}`)
    }
    expect(withBasis.sort()).toEqual([])
  })

  it('names a compound the converter actually knows', () => {
    for (const list of Object.values(CRITERIA)) {
      for (const c of list as any[]) {
        if (c.equivalenceBasis) expect(TVOC_REFERENCES[c.equivalenceBasis], c.id).toBeTruthy()
      }
    }
  })

  it('has no TVOC tier left to disclose a crossing for', () => {
    // This required every µg/m³-published TVOC tier to name isobutylene when
    // it resolved in ppb, and to stay silent when it resolved in mass — the
    // rule held per profile, including WELL, which declared the basis on
    // itself with no registry entry behind it. All three profiles went in
    // 2026-08. The disclosure rule survives for any future mass threshold;
    // what is asserted here is that nothing invokes it.
    for (const id of ['molhave', 'molhave-action', 'well']) {
      for (const unit of ['ppb', 'µg/m³']) {
        expect(resolveReference('tvoc', id, { unit }), `${id}/${unit}`).toBeNull()
      }
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
  // It still does — for the reading. Every assertion here used to run through
  // `resolveReference`, restating a 500 µg/m³ tier as 218 ppb against
  // isobutylene or 133 ppb against toluene. With no tier to restate, the same
  // property is asserted where it still bites: on the measured value crossing
  // into the engine's µg/m³ field, where the wrong molecular weight silently
  // changes what the report says the air contained.

  it('converts through the recorded compound, not the default', () => {
    const iso = convertTvoc(218, 'ppb', 'µg/m³')!
    const tol = convertTvoc(133, 'ppb', 'µg/m³', { reference: 'toluene' })!
    // Both land near 500 µg/m³ from different ppb readings, which is the
    // point: ppb and µg/m³ are different quantities, and which one a number
    // is says nothing until the compound is named. (The ppb inputs are
    // themselves rounded, so this is within a couple of µg/m³, not exact.)
    expect(iso.value).toBeCloseTo(500, -1)
    expect(tol.value).toBeCloseTo(500, -1)
    expect(iso.reference!.label).toBe('Isobutylene')
    expect(tol.reference!.label).toBe('Toluene')
  })

  it('changes nothing when the log is already in mass units', () => {
    // The recorded gas is only a conversion input. It cannot move a value
    // that never crosses a basis.
    expect(convertTvoc(500, 'mg/m³', 'µg/m³')!.value).toBe(500000)
    expect(convertTvoc(500, 'mg/m³', 'µg/m³', { reference: 'toluene' })!.value).toBe(500000)
  })

  it('falls back to the default for a gas it cannot weigh, and names the mismatch', () => {
    const gas = parseCalibrationGas('Freon 12')
    expect(convertTvoc(218, 'ppb', 'µg/m³', { reference: gas.key })!.reference!.label)
      .toBe('Isobutylene')
    const note = tvocEquivalenceNote(tvocReference(gas.key), gas)
    expect(note).toMatch(/Freon 12/)
    expect(note).toMatch(/do not reflect it/i)
  })

  it('reaches the Logger Studio cards, which now show no line at all', () => {
    // `paramReference` still takes `calibrationGas` — the parameter is part
    // of its contract and another parameter may yet need it — but for TVOC
    // there is no longer a reference for it to weigh.
    for (const gas of [undefined, 'Toluene 100 ppm', 'Freon 12']) {
      const r = paramReference('tvoc', { unit: 'ppb', calibrationGas: gas })
      expect(r.limit, String(gas)).toBeNull()
      expect(r.refs, String(gas)).toEqual([])
      expect(String(r.note), String(gas)).toMatch(/no consensus health-based limit/i)
    }
  })
})
