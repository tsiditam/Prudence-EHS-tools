/**
 * referenceProfiles — the selectable screening reference.
 *
 * The property that matters most here is the one at the bottom: choosing a
 * profile must change the ENTIRE downstream chain — the resolved limit, the
 * computed % above, the time above, and the generated sentence. A selector
 * that only re-labels the chart while the statistics keep using the old
 * yardstick would be worse than no selector at all.
 */
import { describe, it, expect } from 'vitest'
import {
  profilesFor,
  defaultProfileId,
  parametersWithProfiles,
  resolveReference,
  resolveReferences,
  referenceTableRows,
} from '../../src/utils/referenceProfiles.js'
import { parameterStats } from '../../src/utils/monitoringStats.js'
import { parameterStatement } from '../../src/utils/monitoringInsights.js'
import { STD } from '../../src/constants/standards.js'
import * as mirrorNs from '../../api/_banned-language.js'
const mirror: any = (mirrorNs as any).default ?? mirrorNs
const { scan } = mirror

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000
const pts = (values: number[], param = 'pm25') =>
  values.map((v, i) => ({ t: T0 + i * 10 * MIN, [param]: v }))

describe('catalogue', () => {
  it('offers the alternatives an assessor actually chooses between', () => {
    expect(profilesFor('pm25').map((p) => p.id)).toEqual(['epa', 'who', 'epa-annual', 'who-annual', 'well'])
    expect(profilesFor('pm10').map((p) => p.id)).toEqual(['epa', 'who', 'who-annual', 'well'])
    expect(profilesFor('co').map((p) => p.id)).toEqual(['epa-naaqs', 'niosh-rel', 'osha-pel', 'well'])
    expect(profilesFor('co2').map((p) => p.id)).toContain('outdoor-differential')
    expect(profilesFor('tvoc').map((p) => p.id)).toEqual(['molhave', 'molhave-action', 'well', 'none'])
  })

  it('has a default for every parameter it covers', () => {
    parametersWithProfiles().forEach((p) => {
      expect(defaultProfileId(p), `no default for ${p}`).toBeTruthy()
      expect(profilesFor(p).length).toBeGreaterThan(0)
    })
  })

  it('returns nothing for a parameter with no published value', () => {
    expect(profilesFor('press')).toEqual([])
    expect(resolveReference('press', 'anything')).toBeNull()
  })
})

describe('values come from the standards manifest', () => {
  it('resolves PM2.5 to the EPA and WHO values in STD, not literals here', () => {
    expect(resolveReference('pm25', 'epa', { unit: 'µg/m³' })!.limit).toBe(STD.c.pm25.epa)
    expect(resolveReference('pm25', 'who', { unit: 'µg/m³' })!.limit).toBe(STD.c.pm25.who)
  })

  it('resolves each CO reference to its own manifest entry', () => {
    expect(resolveReference('co', 'osha-pel', { unit: 'ppm' })!.limit).toBe(STD.c.co.osha)
    expect(resolveReference('co', 'niosh-rel', { unit: 'ppm' })!.limit).toBe(STD.c.co.niosh)
    expect(resolveReference('co', 'epa-naaqs', { unit: 'ppm' })!.limit).toBe(STD.c.co.epa)
  })

  it('resolves the RH comfort band from the manifest', () => {
    expect(resolveReference('rh', 'ashrae-comfort', { unit: '%' })!.band).toEqual([STD.t.rh.min, STD.t.rh.max])
  })
})

describe('unit projection', () => {
  it('projects the TVOC advisory into the unit the data was logged in', () => {
    const ugm3 = resolveReference('tvoc', 'molhave', { unit: 'µg/m³' })!
    expect(ugm3.limit).toBe(STD.c.tvoc.con)
    // A ppb-logging instrument must not be compared against a µg/m³ number.
    const ppb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    expect(ppb.limit).toBeGreaterThan(0)
    expect(ppb.limit).not.toBe(ugm3.limit)
  })

  it('keeps the action tier above the advisory tier in every unit', () => {
    ;['µg/m³', 'ppb', 'ppm'].forEach((unit) => {
      const a = resolveReference('tvoc', 'molhave', { unit })!.limit as number
      const b = resolveReference('tvoc', 'molhave-action', { unit })!.limit as number
      expect(b, `action tier not above advisory in ${unit}`).toBeGreaterThan(a)
    })
  })

  it('delegates the season- and unit-dependent temperature band', () => {
    const f = resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: T0 })!
    const c = resolveReference('temp', 'ashrae-comfort', { unit: '°C', ts: T0 })!
    expect(f.band).toBeTruthy()
    expect(c.band).toBeTruthy()
    // °F↔°C is affine, so the Celsius band is not a scalar multiple.
    expect(c.band![0]).toBeLessThan(f.band![0])
  })
})

describe('framing notes', () => {
  it('no longer carries the CO₂ ventilation-indicator caveat (removed 2026-08)', () => {
    profilesFor('co2').forEach((p) => {
      expect(p.note, `unexpected note on co2/${p.id}`).toBeNull()
    })
  })

  it('no longer carries the Mølhave advisory caveat on the Mølhave TVOC profiles', () => {
    ;['molhave', 'molhave-action', 'none'].forEach((id) => {
      const p = profilesFor('tvoc').find((x) => x.id === id)!
      expect(p.note, `unexpected note on tvoc/${id}`).toBeNull()
    })
    // The WELL performance target keeps its own certification-target note.
    expect(profilesFor('tvoc').find((x) => x.id === 'well')!.note).toBeTruthy()
  })

  it('names a citable source for every profile that sets a value', () => {
    parametersWithProfiles().forEach((param) => {
      profilesFor(param)
        .filter((p) => p.id !== 'none')
        .forEach((p) => expect(p.source, `no source for ${param}/${p.id}`).toBeTruthy())
    })
  })
})

describe('profiles that need data the session may not have', () => {
  it('resolves the CO₂ outdoor differential against the measured baseline', () => {
    const r = resolveReference('co2', 'outdoor-differential', { unit: 'ppm', outdoorBaseline: 430 })!
    expect(r.limit).toBe(430 + STD.v.co2.diff)
    expect(r.unavailable).toBeNull()
  })

  it('reports WHY it cannot resolve rather than inventing a reference', () => {
    const r = resolveReference('co2', 'outdoor-differential', { unit: 'ppm' })!
    expect(r.limit).toBeNull()
    expect(r.unavailable).toBe('outdoorBaseline')
  })

  it('honours an explicit "no reference line" choice', () => {
    const r = resolveReference('tvoc', 'none', { unit: 'ppb' })!
    expect(r.limit).toBeNull()
    expect(r.band).toBeNull()
    expect(r.unavailable).toBeNull() // a choice, not a missing input
  })

  it('accepts a custom comfort range', () => {
    const r = resolveReference('rh', 'custom', { unit: '%', custom: [40, 55] })!
    expect(r.band).toEqual([40, 55])
  })

  it('falls back to the default profile for an unknown id', () => {
    expect(resolveReference('pm25', 'not-a-profile', { unit: 'µg/m³' })!.profileId).toBe('epa')
  })
})

describe('resolveReferences + table rows', () => {
  const resolved = resolveReferences(['co2', 'pm25', 'rh'], { pm25: 'who' }, {
    units: { co2: 'ppm', pm25: 'µg/m³', rh: '%' },
  })

  it('resolves each parameter with its own selection and unit', () => {
    expect(resolved.pm25.limit).toBe(STD.c.pm25.who)
    expect(resolved.co2.profileId).toBe(defaultProfileId('co2'))
    expect(resolved.rh.band).toEqual([STD.t.rh.min, STD.t.rh.max])
  })

  it('builds one consolidated table so figure captions can point back to it', () => {
    const rows = referenceTableRows(resolved)
    expect(rows.map((r) => r.param).sort()).toEqual(['co2', 'pm25', 'rh'])
    expect(rows.find((r) => r.param === 'pm25')!.value).toBe(`${STD.c.pm25.who} µg/m³`)
    expect(rows.find((r) => r.param === 'rh')!.value).toBe(`${STD.t.rh.min}–${STD.t.rh.max} %`)
    expect(rows.find((r) => r.param === 'co2')!.note).toBeNull()
  })

  it('omits a parameter whose reference could not be resolved', () => {
    const r = resolveReferences(['co2'], { co2: 'outdoor-differential' }, { units: { co2: 'ppm' } })
    expect(referenceTableRows(r)).toEqual([])
  })
})

describe('the selection drives the whole chain (not just the label)', () => {
  // 10 readings between the WHO (15) and EPA (35) µg/m³ values, so the two
  // profiles must produce genuinely different statistics and prose.
  const data = pts([20, 22, 25, 18, 30, 16, 24, 21, 19, 23])

  it('changes the limit, the % above, the time above, AND the sentence', () => {
    const epa = resolveReference('pm25', 'epa', { unit: 'µg/m³' })!
    const who = resolveReference('pm25', 'who', { unit: 'µg/m³' })!

    const underEpa = parameterStats(data, 'pm25', { reference: { limit: epa.limit } })!
    const underWho = parameterStats(data, 'pm25', { reference: { limit: who.limit } })!

    // EPA (35): never exceeded. WHO (15): exceeded throughout.
    expect(underEpa.pctAbove).toBe(0)
    expect(underWho.pctAbove).toBe(100)
    expect(underEpa.timeAboveSec).toBe(0)
    expect(underWho.timeAboveSec).toBeGreaterThan(0)

    const sEpa = parameterStatement('pm25', underEpa, { limit: epa.limit })!
    const sWho = parameterStatement('pm25', underWho, { limit: who.limit })!
    expect(sEpa).toContain(`${STD.c.pm25.epa} µg/m³`)
    expect(sWho).toContain(`${STD.c.pm25.who} µg/m³`)
    expect(sEpa).toMatch(/throughout the monitoring period\.$/)
    expect(sWho).not.toMatch(/throughout the monitoring period\.$/)
  })
})

describe('PM10', () => {
  it('offers EPA and WHO 24-hour references, resolved from the manifest', () => {
    const ids = profilesFor('pm10').map((p) => p.id)
    expect(ids).toEqual(['epa', 'who', 'who-annual', 'well'])
    expect(resolveReference('pm10', 'epa')!.limit).toBe(STD.c.pm10.epa)
    expect(resolveReference('pm10', 'who')!.limit).toBe(STD.c.pm10.who)
    // Nothing is hardcoded in the profile layer: the numbers ARE the manifest.
    expect(STD.c.pm10.epa).toBe(150)
    expect(STD.c.pm10.who).toBe(45)
  })

  it('never sets an annual guideline beside a daily one unlabelled', () => {
    // Both size fractions still offer a 24-hour EPA/WHO reference, and every
    // averaging basis is spelled out in the label so a daily and an annual
    // guideline are never confused — the point of stating the basis.
    for (const param of ['pm10', 'pm25']) {
      const labels = profilesFor(param).map((p) => p.label)
      expect(labels.some((l) => /24-hour/.test(l))).toBe(true)
      expect(labels.some((l) => /annual/i.test(l))).toBe(true)
      // No PM profile is left ambiguous about its basis.
      labels.forEach((l) => expect(/24-hour|annual|performance/i.test(l), l).toBe(true))
    }
  })

  it('resolves the annual and WELL PM references from the manifest', () => {
    expect(resolveReference('pm25', 'epa-annual')!.limit).toBe(STD.c.pm25.epaAnnual)
    expect(resolveReference('pm25', 'who-annual')!.limit).toBe(STD.c.pm25.whoAnnual)
    expect(resolveReference('pm25', 'well')!.limit).toBe(STD.c.pm25.well)
    expect(resolveReference('pm10', 'who-annual')!.limit).toBe(STD.c.pm10.whoAnnual)
    expect(resolveReference('pm10', 'well')!.limit).toBe(STD.c.pm10.well)
    // The values the manifest was verified to carry.
    expect(STD.c.pm25.epaAnnual).toBe(9)
    expect(STD.c.pm25.whoAnnual).toBe(5)
    expect(STD.c.pm10.whoAnnual).toBe(15)
  })

  it('every new reference carries a screening-framing note that passes the scanner', () => {
    for (const [param, id] of [['pm25', 'epa-annual'], ['pm25', 'who-annual'], ['pm25', 'well'], ['co', 'well'], ['tvoc', 'well']] as const) {
      const r = resolveReference(param, id, { unit: param === 'tvoc' ? 'µg/m³' : (param === 'co' ? 'ppm' : 'µg/m³') })!
      expect(r.note, `${param}/${id} note`).toBeTruthy()
      expect(scan(r.note as string), `banned language in ${param}/${id}`).toEqual([])
    }
  })

  it('is stricter under WHO than under EPA, for both fractions', () => {
    expect(STD.c.pm10.who).toBeLessThan(STD.c.pm10.epa)
    expect(STD.c.pm25.who).toBeLessThan(STD.c.pm25.epa)
    // And the coarse fraction's limit always sits above the fine one's.
    expect(STD.c.pm10.epa).toBeGreaterThan(STD.c.pm25.epa)
    expect(STD.c.pm10.who).toBeGreaterThan(STD.c.pm25.who)
  })

  it('no longer carries the NAAQS form caveat on the EPA particulate profiles (removed 2026-08)', () => {
    ;['pm25', 'pm10'].forEach((param) => {
      const epa = profilesFor(param).find((p) => p.id === 'epa')!
      expect(epa.note, `unexpected note on ${param}/epa`).toBeNull()
    })
  })

  it('drives the whole chain, not just the label', () => {
    // 60 µg/m³ throughout: above the WHO guideline, below the EPA standard.
    const stats = (limit: number) =>
      parameterStats(pts([60, 60, 60, 60, 60], 'pm10'), 'pm10', { reference: { limit } })!

    const epa = stats(resolveReference('pm10', 'epa')!.limit!)
    const who = stats(resolveReference('pm10', 'who')!.limit!)
    expect(epa.pctAbove).toBe(0)
    expect(who.pctAbove).toBe(100)

    const epaText = parameterStatement('pm10', epa, { limit: STD.c.pm10.epa }, { units: { pm10: 'µg/m³' } })!
    const whoText = parameterStatement('pm10', who, { limit: STD.c.pm10.who }, { units: { pm10: 'µg/m³' } })!
    expect(epaText).toContain('throughout the monitoring period')
    expect(whoText).not.toContain('throughout the monitoring period')
    // The cited value appears at its authored precision, not the reading's.
    expect(epaText).toContain('150 µg/m³')
    expect(whoText).toContain('45 µg/m³')
  })

  it('appears in the reference table under a name a client reads', () => {
    const rows = referenceTableRows(resolveReferences(['pm10'], { pm10: 'epa' }, { units: { pm10: 'µg/m³' } }))
    expect(rows).toHaveLength(1)
    expect(rows[0].value).toBe('150 µg/m³')
    expect(rows[0].source).toBe('US EPA NAAQS')
  })
})

describe('TVOC in the unit the instrument logged', () => {
  const tvocPts = (unit: string, scale: number) => {
    const out: any[] = []
    for (let i = 0; i < 30; i++) out.push({ t: T0 + i * 10 * MIN, tvoc: (i % 3 === 0 ? 340 : 90) * scale })
    return out
  }

  it('projects the Mølhave value into ppb — the unit a PID usually reports', () => {
    // 500 µg/m³ isobutylene-referenced ≈ 219 ppb. A ppb-logging instrument is
    // never compared against the µg/m³ number.
    const ppb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    expect(ppb.limit).toBeGreaterThan(210)
    expect(ppb.limit).toBeLessThan(225)
    expect(ppb.unit).toBe('ppb')
    expect(referenceTableRows({ tvoc: ppb })[0].value).toMatch(/^\d+ ppb$/)
  })

  it('resolves a usable Mølhave value whichever unit is in play (caveat note removed 2026-08)', () => {
    ;['ppb', 'ppm', 'µg/m³', 'mg/m³'].forEach((unit) => {
      const r = resolveReference('tvoc', 'molhave', { unit })!
      expect(r.note, `unexpected caveat in ${unit}`).toBeNull()
      expect(r.limit, `unusable limit in ${unit}`).toBeGreaterThan(0)
    })
  })

  it('reports the same air the same way, whatever unit it arrived in', () => {
    // One atmosphere, three units. The share of readings above the reference
    // is a property of the AIR, so it must not depend on the instrument's
    // choice of units — that equality is what proves the conversion is
    // applied to the reference and the readings consistently.
    const share = (unit: string, scale: number) => {
      const ref = resolveReference('tvoc', 'molhave', { unit })!
      return parameterStats(tvocPts(unit, scale), 'tvoc', { reference: { limit: ref.limit } })!.pctAbove
    }
    const inPpb = share('ppb', 1)
    expect(share('µg/m³', 2.283)).toBeCloseTo(inPpb, 5)
    expect(share('ppm', 0.001)).toBeCloseTo(inPpb, 5)
    expect(inPpb).toBeGreaterThan(0)
  })

  it('states the reference in the reader’s unit, at its own precision', () => {
    const say = (unit: string, scale: number) => {
      const ref = resolveReference('tvoc', 'molhave', { unit })!
      const st = parameterStats(tvocPts(unit, scale), 'tvoc', { reference: { limit: ref.limit } })!
      return parameterStatement('tvoc', st, { limit: ref.limit }, { units: { tvoc: unit } })!
    }
    expect(say('ppb', 1)).toMatch(/\(\d+ ppb\)/)
    expect(say('µg/m³', 2.283)).toContain('(500 µg/m³)')
    // A sub-unit magnitude must not collapse the cited value to "0 ppm".
    expect(say('ppm', 0.001)).toMatch(/\(0\.2\d? ppm\)/)
  })
})
