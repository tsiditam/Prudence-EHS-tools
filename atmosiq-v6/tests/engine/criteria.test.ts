/**
 * The criterion layer — a threshold plus what it means.
 *
 * Every case here is a defect that shipped because a number was compared
 * without its averaging period, its class, or its citation.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { evaluateCriteria, capSeverity, allCriteria, AVERAGING, CRITERION_CLASS, CRITERIA } from '../../src/constants/criteria'
// @ts-expect-error — JS module without TS types
import { profilesFor, parametersWithProfiles, __PROFILES_FOR_TEST as RAW_PROFILES } from '../../src/utils/referenceProfiles'

const sev = (p: string, v: number, basis?: string) => evaluateCriteria(p, v, basis)?.severity ?? null
const id = (p: string, v: number, basis?: string) => evaluateCriteria(p, v, basis)?.criterion.id ?? null

describe('a criterion class bounds severity', () => {
  it('CO₂ can never be critical — it indexes ventilation, not contamination', () => {
    // 1,500 ppm used to be rated `critical`, the same severity as a hydrogen
    // reading at 25% of the lower explosive limit.
    expect(id('co2', 1600)).toBe('co2_action')
    expect(sev('co2', 1600)).toBe('high')
    expect(CRITERION_CLASS.ventilation_indicator.maxSeverity).toBe('high')
  })

  it('caps a proposed severity at the class ceiling and leaves lower ones alone', () => {
    expect(capSeverity('critical', 'ventilation_indicator')).toBe('high')
    // `high`, not `medium`: an ambient standard's caveat is jurisdictional,
    // not a weak health basis. Capping lower would demote a real indoor PM2.5
    // exceedance. Criteria still set a lower severity individually where it
    // fits — CO's 8-hour NAAQS tier declares `medium` on its own terms.
    expect(capSeverity('critical', 'ambient_benchmark')).toBe('high')
    expect(capSeverity('critical', 'comfort_consensus')).toBe('medium')
    expect(capSeverity('critical', 'physical_hazard')).toBe('critical')
    expect(capSeverity('low', 'regulatory_oel')).toBe('low')
  })
})

describe('averaging period decides what a grab reading can settle', () => {
  it('a ceiling IS evaluable instantaneously — that is what a ceiling means', () => {
    const r = evaluateCriteria('co', 250)
    expect(r.criterion.id).toBe('co_niosh_ceiling')
    expect(r.determinative).toBe(true)
    expect(r.severity).toBe('critical')
    expect(r.statement).not.toMatch(/cannot establish/)
  })

  it('an 8-hour TWA is not, and the statement says so', () => {
    const r = evaluateCriteria('co', 60)
    expect(r.criterion.id).toBe('co_osha_pel')
    expect(r.determinative).toBe(false)
    expect(r.statement).toMatch(/8-hour time-weighted average/)
    expect(r.statement).toMatch(/cannot establish compliance/)
  })

  it('does not move severity with the averaging period', () => {
    // These are different questions. 60 ppm CO indoors is a serious condition
    // whether or not the reading was an 8-hour average; what the averaging
    // period governs is what may be ASSERTED, not how much attention the
    // condition deserves. Downgrading for non-determinism demoted exactly the
    // indoor criteria that matter in a building investigation.
    expect(sev('co', 60, 'screening_grab')).toBe('critical')
    expect(sev('co', 60, 'documented_8hr_twa')).toBe('critical')
    // ...but what the measurement can settle DOES change, and consumers read
    // that flag to decide what language is permitted.
    expect(evaluateCriteria('co', 60, 'screening_grab').determinative).toBe(false)
    expect(evaluateCriteria('co', 60, 'documented_8hr_twa').determinative).toBe(true)
    expect(evaluateCriteria('co', 60, 'documented_8hr_twa').statement)
      .not.toMatch(/cannot establish/)
  })

  it('keeps the indoor tiers at the severity their condition warrants', () => {
    // The regression this guards: an office at 15 ppm CO must stay `medium`.
    expect(sev('co', 15)).toBe('medium')
    expect(sev('co', 32)).toBe('high')
  })

  it('treats a 15-minute STEL as indicative from a grab reading', () => {
    const r = evaluateCriteria('hcho', 3)
    expect(r.criterion.id).toBe('hcho_osha_stel')
    expect(r.indicative).toBe(true)
    expect(r.statement).toMatch(/indicative but not determinative/)
  })
})

describe('short-duration criteria that were previously missing', () => {
  it('models the NIOSH CO ceiling', () => {
    expect(CRITERIA.co.some((c: any) => c.id === 'co_niosh_ceiling')).toBe(true)
    expect(id('co', 250)).toBe('co_niosh_ceiling')
  })

  it('models the OSHA formaldehyde STEL', () => {
    expect(CRITERIA.hcho.some((c: any) => c.id === 'hcho_osha_stel')).toBe(true)
    expect(id('hcho', 2.5)).toBe('hcho_osha_stel')
  })
})

describe('the ladder resolves worst-first', () => {
  it('CO', () => {
    expect(id('co', 250)).toBe('co_niosh_ceiling')
    expect(id('co', 60)).toBe('co_osha_pel')
    expect(id('co', 40)).toBe('co_niosh_rel')
    expect(id('co', 32)).toBe('co_who_1h')
    expect(id('co', 15)).toBe('co_epa_naaqs_8h')
    expect(id('co', 7)).toBe('co_who_24h')
    expect(id('co', 3)).toBeNull()
  })

  it('formaldehyde', () => {
    expect(id('hcho', 1.0)).toBe('hcho_osha_pel')
    expect(id('hcho', 0.6)).toBe('hcho_osha_al')
    expect(id('hcho', 0.09)).toBe('hcho_who_30min')
    expect(id('hcho', 0.001)).toBeNull()
  })
})

describe('registry integrity', () => {
  it('every criterion resolves a finite value from the manifest', () => {
    // A criterion is a LIMIT (one number) or a BAND (a floor and a ceiling).
    // Bands arrived with thermal comfort in 2026-08; before that the registry
    // could only express "value > threshold", which is why temperature and
    // relative humidity had no entry here at all — and why they were the only
    // two parameters whose citations were wrong.
    for (const c of allCriteria()) {
      if (c.band) {
        expect(Number.isFinite(c.band.min), `${c.id} band has no min`).toBe(true)
        expect(Number.isFinite(c.band.max), `${c.id} band has no max`).toBe(true)
        expect(c.band.max, `${c.id} band is inverted`).toBeGreaterThan(c.band.min)
        expect(c.value, `${c.id} is a band and must not also carry a value`).toBeNull()
      } else {
        expect(Number.isFinite(c.value), `${c.id} has no value`).toBe(true)
      }
    }
  })

  it('every criterion exposes one uniform accessor, whatever its shape', () => {
    // The contract that stops a consumer having to branch. `${c.resolve()}`
    // printed "[object Object] °F" for a band until `valueLabel` existed.
    for (const c of allCriteria()) {
      expect(typeof c.resolve, `${c.id}.resolve`).toBe('function')
      expect(c.valueLabel, `${c.id}.valueLabel`).toBeTruthy()
      expect(c.valueLabel, `${c.id}.valueLabel is stringified object`).not.toContain('object')
      expect(Number.isFinite(c.midpoint), `${c.id}.midpoint`).toBe(true)
    }
  })

  it('every criterion declares a known averaging period and class, and a source', () => {
    for (const c of allCriteria()) {
      expect(AVERAGING[c.averaging], `${c.id} averaging`).toBeTruthy()
      expect(CRITERION_CLASS[c.class], `${c.id} class`).toBeTruthy()
      expect(c.source, `${c.id} source`).toBeTruthy()
      expect(c.action, `${c.id} action`).toBeTruthy()
    }
  })

  it('each parameter ladder is ordered worst-first', () => {
    for (const [param, list] of Object.entries(CRITERIA) as any) {
      const vals = list.map((c: any) => c.value)
      const sorted = [...vals].sort((a, b) => b - a)
      expect(vals, `${param} is not ordered worst-first`).toEqual(sorted)
    }
  })

  it('ignores a non-numeric or absent reading', () => {
    expect(evaluateCriteria('co', NaN)).toBeNull()
    expect(evaluateCriteria('co', undefined as never)).toBeNull()
    expect(evaluateCriteria('nope', 5)).toBeNull()
  })
})

describe('referenceProfiles resolves its citations from the registry', () => {
  it('every linked profile finds its criterion', () => {
    // The link is by id and nothing enforces it at the type level, so a
    // renamed criterion would silently fall back to the profile's own source
    // — or to null, now that the local declarations are gone.
    for (const param of parametersWithProfiles()) {
      for (const p of profilesFor(param)) {
        const raw = (RAW_PROFILES[param] || []).find((x: any) => x.id === p.id)
        if (!raw?.criterionId) continue
        const found = (CRITERIA[param] || []).find((c: any) => c.id === raw.criterionId)
        expect(found, `${param}/${p.id} → ${raw.criterionId} not in CRITERIA`).toBeTruthy()
        expect(p.source).toBe(found.source)
      }
    }
  })

  it('leaves profiles with no published threshold declaring their own', () => {
    // Custom bands and "no reference line" are not published thresholds and
    // legitimately have no criterion behind them.
    const custom = profilesFor('temp').find((p: any) => p.id === 'custom')
    expect(custom).toBeTruthy()
    expect(custom.source).toBe('Assessor-defined')
  })

  it('names a source for every profile that resolves a value', () => {
    for (const param of parametersWithProfiles()) {
      for (const p of profilesFor(param)) {
        if (p.id === 'none') continue
        expect(p.source, `no source for ${param}/${p.id}`).toBeTruthy()
      }
    }
  })
})
