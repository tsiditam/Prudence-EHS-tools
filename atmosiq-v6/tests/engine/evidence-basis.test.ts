/**
 * A finding's evidence basis reflects how the measurement was taken.
 *
 * Every instrument-read condition used to be hardcoded to
 * `screening_continuous`, with the rationale "Direct-reading measurement
 * collected during walkthrough" — a sentence describing a grab reading
 * while labelling it continuous. `pm_above_naaqs_documented` carried the
 * mislabel into client-facing prose: "supported by continuous monitoring".
 *
 * The zone record has always known the answer. `meas_duration` is a
 * Q_ZONE field the walkthrough collects, and the `zone` parameter was
 * passed to `inferEvidenceBasis` and never read.
 *
 * The permission layer was never fooled — `evaluatePermissions` admits
 * only `documented_8hr_twa` and `laboratory_speciation` — so the mislabel
 * never unlocked definitive, causal or regulatory language. It was the
 * report describing evidence it did not have, which is its own problem.
 */
import { describe, it, expect } from 'vitest'

import { legacyToAssessmentScore, deriveAssessmentMeta } from '../../src/engine/bridge'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { Q_ZONE } from '../../src/constants/questions.js'

type Zone = Record<string, unknown>
type Finding = {
  conditionType: string
  evidenceBasis: { kind: string; rationale: string }
  confidenceTier: string
  definitiveConclusionAllowed: boolean
  causationSupported: boolean
  regulatoryConclusionAllowed: boolean
}

const BUILDING: Zone = { fn: 'T', ft: 'Commercial Office', ht: 'Central AHU — VAV' }
const PRESURVEY: Zone = { ps_assessor: 'J. Smith, CIH' }

function findings(zone: Zone): Finding[] {
  const zones = [zone]
  const zoneScores = zones.map((z) => scoreZone(z, BUILDING))
  const meta = deriveAssessmentMeta({
    profile: { name: 'J. Smith, CIH', certs: ['CIH'] }, presurvey: PRESURVEY, building: BUILDING,
  } as never)
  const score = legacyToAssessmentScore(
    zoneScores as never, compositeScore(zoneScores) as never, zones as never,
    { meta, presurvey: PRESURVEY, building: BUILDING } as never,
  ) as unknown as { zones: Array<{ categories: Array<{ findings: Finding[] }> }> }
  return score.zones.flatMap((z) => z.categories.flatMap((c) => c.findings))
}

const MEASURED: Zone = {
  zn: 'Suite 200', su: 'office', sf: '2400', oc: '18',
  pm: '38', pmo: '9', co2: '1450', co2o: '430', tf: '72', rh: '52',
}

const instrumentFindings = (f: Finding[]) =>
  f.filter((x) => /^(pm_|co2|co_|hcho_|tvoc_|temperature_|humidity_|ventilation_)/.test(x.conditionType))

describe('a walkthrough grab reading is labelled a grab reading', () => {
  it('every instrument finding is screening_grab when nothing was logged', () => {
    const instrument = instrumentFindings(findings(MEASURED))
    expect(instrument.length).toBeGreaterThan(2)
    for (const f of instrument) {
      expect(f.evidenceBasis.kind, `${f.conditionType} claims continuous monitoring`).toBe('screening_grab')
    }
  })

  it('the rationale says what it was, not the opposite', () => {
    const pm = findings(MEASURED).find((f) => f.conditionType === 'pm_above_naaqs_documented')!
    expect(pm.evidenceBasis.rationale).toContain('a single reading rather than a logged series')
    expect(pm.evidenceBasis.rationale, 'the rationale used to say continuous AND walkthrough in one sentence')
      .not.toMatch(/Continuous direct-reading .* collected during walkthrough/)
  })

  it('says the measurement type was unrecorded rather than asserting a spot check', () => {
    // The field is skippable, so absent is the common case on legacy records.
    // Treated as a grab reading, but the rationale must not claim the assessor
    // recorded a spot check — that is a different statement about the record.
    const absent = findings(MEASURED)
      .find((f) => f.conditionType === 'pm_above_naaqs_documented')!
    expect(absent.evidenceBasis.rationale).toContain('was not recorded')

    const spot = findings({ ...MEASURED, meas_duration: 'Spot check (instantaneous)' })
      .find((f) => f.conditionType === 'pm_above_naaqs_documented')!
    expect(spot.evidenceBasis.kind).toBe('screening_grab')
    expect(spot.evidenceBasis.rationale).toContain('a single instantaneous reading')
    expect(spot.evidenceBasis.rationale).not.toContain('was not recorded')
  })

  it('promotes to screening_continuous when the assessor recorded continuous logging', () => {
    const logged = findings({ ...MEASURED, meas_duration: 'Continuous logging' })
    const instrument = instrumentFindings(logged)
    expect(instrument.length).toBeGreaterThan(2)
    for (const f of instrument) {
      expect(f.evidenceBasis.kind, `${f.conditionType} should be continuous`).toBe('screening_continuous')
    }
  })

  it('does not promote a spot check', () => {
    const pm = findings({ ...MEASURED, meas_duration: 'Spot check (instantaneous)' })
      .find((f) => f.conditionType === 'pm_above_naaqs_documented')!
    expect(pm.evidenceBasis.kind).toBe('screening_grab')
  })

  it('treats a recorded average as an integrated series, not a grab reading', () => {
    // The split is instantaneous vs. integrated, which is the distinction the
    // enum draws. Calling a 15-minute average "a single reading" is the same
    // mislabel pointing the other way, and it downgrades a STEL comparison
    // from determinative to indicative — see AVERAGING.min15.
    for (const [duration, span] of [
      ['5-minute average', '5-minute'],
      ['15-minute average', '15-minute'],
      ['1-hour average', '1-hour'],
    ]) {
      const pm = findings({ ...MEASURED, meas_duration: duration })
        .find((f) => f.conditionType === 'pm_above_naaqs_documented')!
      expect(pm.evidenceBasis.kind, `"${duration}" is a logged series`).toBe('screening_continuous')
      expect(pm.evidenceBasis.rationale).toContain(span)
      expect(pm.evidenceBasis.rationale, 'a recorded average is not "logged across the assessment period"')
        .not.toContain('across the assessment period')
    }
  })

  it('covers every meas_duration option the questionnaire offers', () => {
    // The guard that stops a new questionnaire option silently falling through
    // to the unrecorded default. Reads the option list off questions.js rather
    // than restating it here, so the two cannot drift.
    const opts = (Q_ZONE as Array<{ id?: string; opts?: string[] }>)
      .find((q) => q.id === 'meas_duration')?.opts
    expect(opts, 'meas_duration disappeared from Q_ZONE').toBeDefined()
    expect(opts!.length).toBeGreaterThan(1)

    const unrecorded = findings(MEASURED)
      .find((f) => f.conditionType === 'pm_above_naaqs_documented')!.evidenceBasis.rationale
    for (const duration of opts!) {
      const pm = findings({ ...MEASURED, meas_duration: duration })
        .find((f) => f.conditionType === 'pm_above_naaqs_documented')!
      expect(pm.evidenceBasis.rationale, `"${duration}" fell through to the unrecorded default`)
        .not.toBe(unrecorded)
    }
  })

  it('leaves observational and occupant bases alone', () => {
    const f = findings({
      ...MEASURED, mi: 'Moderate (10-100 sq ft)', cx: 'Yes — complaints reported', sy: ['Headache'],
    })
    expect(f.find((x) => x.conditionType === 'apparent_microbial_growth')?.evidenceBasis.kind)
      .toBe('visual_olfactory_screening')
    expect(f.find((x) => x.conditionType.startsWith('occupant_'))?.evidenceBasis.kind)
      .toBe('occupant_report_anecdotal')
  })

  it('never promotes a direct reading to a documented TWA', () => {
    // Even logged continuously, a PEL claim needs chain of custody.
    const logged = findings({ ...MEASURED, co: '60', meas_duration: 'Continuous logging' })
    const co = logged.find((f) => f.conditionType === 'co_above_pel_documented')
    if (co) {
      expect(co.evidenceBasis.kind).not.toBe('documented_8hr_twa')
      expect(co.evidenceBasis.rationale).toContain('chain-of-custody')
    }
  })
})

describe('the permission gate holds regardless', () => {
  it('blocks definitive, causal and regulatory language on every finding', () => {
    for (const zone of [MEASURED, { ...MEASURED, meas_duration: 'Continuous logging' }]) {
      for (const f of findings(zone)) {
        expect(f.definitiveConclusionAllowed, `${f.conditionType} granted definitive language`).toBe(false)
        expect(f.causationSupported, `${f.conditionType} granted causal language`).toBe(false)
        expect(f.regulatoryConclusionAllowed, `${f.conditionType} granted regulatory language`).toBe(false)
      }
    }
  })

  it('keeps confidence at provisional for instrument readings', () => {
    for (const f of instrumentFindings(findings(MEASURED))) {
      expect(['provisional_screening_level', 'qualitative_only', 'insufficient_data'])
        .toContain(f.confidenceTier)
    }
  })
})
