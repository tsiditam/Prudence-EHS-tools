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

describe('the acute action tier (the figure’s red span)', () => {
  it('rides on the CO 9-ppm references, keyed to the WHO 1-hour guideline over a 1-hour window', () => {
    for (const id of ['epa-naaqs', 'well']) {
      const r = resolveReference('co', id, { unit: 'ppm' })!
      expect(r.action, `co/${id} action`).toBeTruthy()
      expect(r.action!.limit).toBe(STD.c.co.who1h)
      expect(r.action!.windowMs).toBe(3_600_000)
      expect(r.action!.source).toMatch(/WHO/)
    }
  })

  it('is NOT offered on the occupational CO references, where it would sit below the selected limit', () => {
    // NIOSH 35 / OSHA 50 already exceed the WHO 1-hour tier (30), so a higher
    // acute span would invert the hierarchy — the guard drops it.
    expect(resolveReference('co', 'niosh-rel', { unit: 'ppm' })!.action).toBeNull()
    expect(resolveReference('co', 'osha-pel', { unit: 'ppm' })!.action).toBeNull()
  })

  it('rides on the 24-hour PM2.5 references, keyed to the EPA Unhealthy category over a 24-hour window', () => {
    for (const id of ['epa', 'who']) {
      const r = resolveReference('pm25', id, { unit: 'µg/m³' })!
      expect(r.action, `pm25/${id} action`).toBeTruthy()
      expect(r.action!.limit).toBe(STD.c.pm25.epaUnhealthy)
      expect(r.action!.windowMs).toBe(86_400_000)
    }
  })

  it('is NOT offered on the annual PM2.5 references or on parameters without a defensible tier', () => {
    expect(resolveReference('pm25', 'epa-annual', { unit: 'µg/m³' })!.action).toBeNull()
    expect(resolveReference('pm25', 'well', { unit: 'µg/m³' })!.action).toBeNull()
    expect(resolveReference('co2', 'ashrae-advisory', { unit: 'ppm' })!.action).toBeNull()
    expect(resolveReference('tvoc', 'molhave', { unit: 'ppb' })!.action).toBeNull()
    expect(resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: Date.UTC(2026, 6, 15) })!.action).toBeNull()
  })
})

describe('unit projection', () => {
  it('projects the TVOC advisory into every unit that has a basis, naming what it assumed', () => {
    const ugm3 = resolveReference('tvoc', 'molhave', { unit: 'µg/m³' })!
    expect(ugm3.limit).toBe(STD.c.tvoc.con)
    // 500 × 24.45 ÷ 56.11. The molecular weight is isobutylene's — a choice,
    // not a fact about the mixture — so the number is only allowed out of
    // the resolver with the choice attached to it.
    const ppb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    expect(ppb.limit).toBe(218)
    expect(ppb.note).toMatch(/isobutylene-equivalent/i)
    // And the mass units assumed nothing, so they must not claim to have.
    expect(ugm3.note || '').not.toMatch(/isobutylene-equivalent/i)
  })

  it('keeps the action tier above the advisory tier in every unit it resolves in', () => {
    ;['µg/m³', 'mg/m³'].forEach((unit) => {
      const a = resolveReference('tvoc', 'molhave', { unit })!.limit as number
      const b = resolveReference('tvoc', 'molhave-action', { unit })!.limit as number
      expect(b, `action tier not above advisory in ${unit}`).toBeGreaterThan(a)
    })
    // Including the volumetric units, where both tiers cross bases against
    // the SAME reference compound — so the ordering has to survive the
    // crossing. It would not if the two tiers ever picked different ones.
    ;['ppb', 'ppm'].forEach((unit) => {
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
    // The citation now resolves from the criterion registry, which names the
    // regulation and the averaging period rather than just the agency.
    expect(rows[0].source).toBe('40 CFR 50.6 — EPA National Ambient Air Quality Standard, PM10, 24-hour')
  })
})

describe('TVOC in the unit the instrument logged', () => {
  const tvocPts = (unit: string, scale: number) => {
    const out: any[] = []
    for (let i = 0; i < 30; i++) out.push({ t: T0 + i * 10 * MIN, tvoc: (i % 3 === 0 ? 340 : 90) * scale })
    return out
  }

  // ── What these tests pin, and the round trip they have been through ──
  //
  // They originally pinned that Mølhave's 500 µg/m³ projects into ~218 ppb.
  // That was withdrawn on the reasoning that 500 µg/m³ is the mass of a
  // defined 22-compound chamber mixture while a PID reports
  // isobutylene-equivalent response, so the two are different quantities.
  //
  // The reasoning was right about the limitation and wrong about the remedy.
  // The limitation is a property of the READING, and it exists whichever
  // unit the instrument is set to display — a PID logging µg/m³ computes
  // that number from the same isobutylene-equivalent response, internally,
  // by the same arithmetic. Withholding the tier from ppb therefore did not
  // remove an unsound comparison; it removed the tier from half the
  // instruments in the field on the basis of a display setting, and left the
  // other half comparing against it with no disclosure at all.
  //
  // So the tier projects into every unit with a basis, and the assumption is
  // disclosed with it. That is the property pinned below.

  it('projects Mølhave into ppb against a named compound, and says which', () => {
    const ppb = resolveReference('tvoc', 'molhave', { unit: 'ppb' })!
    expect(ppb.limit).toBe(218)      // 500 × 24.45 ÷ 56.11
    expect(ppb.unavailable).toBeFalsy()
    // The assumption must reach the reader wherever the number does.
    expect(ppb.note).toMatch(/isobutylene-equivalent/i)
    expect(ppb.note).toMatch(/TO-17/)
  })

  it('resolves in mass units, where the conversion is only a change of scale', () => {
    const ug = resolveReference('tvoc', 'molhave', { unit: 'µg/m³' })!
    expect(ug.limit).toBe(500)
    const mg = resolveReference('tvoc', 'molhave', { unit: 'mg/m³' })!
    // 0.5, not 1. Rounding a mass unit to whole numbers doubled the
    // reference — a separate defect the measurand work surfaced.
    expect(mg.limit).toBe(0.5)
    for (const r of [ug, mg]) expect(r.unavailable).toBeFalsy()
  })

  it('applies the same disclosure to every mass-published TVOC tier', () => {
    // Mølhave's action tier and WELL's performance target are the same kind
    // of figure and cross the same way. A rule that reached only the tier
    // that prompted it would let the next report state a converted number
    // with nothing attached.
    for (const id of ['molhave-action', 'well']) {
      const r = resolveReference('tvoc', id, { unit: 'ppb' })!
      expect(r.limit, `${id} did not resolve in ppb`).toBeGreaterThan(0)
      expect(r.note, `${id} states no assumption`).toMatch(/isobutylene-equivalent/i)
    }
  })

  it('reports the same air the same way across units that mean the same thing', () => {
    // Was "one atmosphere, three units", spanning ppb, µg/m³ and ppm — and
    // that framing was the error: for a TVOC mixture those are not one
    // atmosphere described three ways, they are two different measurands.
    // The property is real and still asserted, over the units where it is
    // true: µg/m³ and mg/m³ are one quantity at two scales, so the share of
    // readings above the reference must not depend on which was logged.
    const share = (unit: string, scale: number) => {
      const ref = resolveReference('tvoc', 'molhave', { unit })!
      return parameterStats(tvocPts(unit, scale), 'tvoc', { reference: { limit: ref.limit } })!.pctAbove
    }
    const inUg = share('µg/m³', 2.283)
    expect(share('mg/m³', 0.002283)).toBeCloseTo(inUg, 5)
    expect(inUg).toBeGreaterThan(0)
  })

  it('states the reference in the reader’s unit, at its own precision', () => {
    const say = (unit: string, scale: number) => {
      const ref = resolveReference('tvoc', 'molhave', { unit })!
      const st = parameterStats(tvocPts(unit, scale), 'tvoc', { reference: { limit: ref.limit } })!
      return parameterStatement('tvoc', st, { limit: ref.limit }, { units: { tvoc: unit } })!
    }
    expect(say('µg/m³', 2.283)).toContain('(500 µg/m³)')
    // A sub-unit magnitude must not collapse the cited value to "0 mg/m³".
    // This was pinned in ppm, where the reference no longer resolves; mg/m³
    // is the surviving unit where the same rounding trap exists — and it
    // caught a real one: 0.5 mg/m³ was being rounded to 1.
    expect(say('mg/m³', 0.002283)).toContain('(0.5 mg/m³)')
  })
})
