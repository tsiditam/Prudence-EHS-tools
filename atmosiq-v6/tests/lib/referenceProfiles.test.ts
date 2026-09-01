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
    // TVOC offers nothing to choose between. Its four profiles (two Mølhave
    // tiers, the WELL target and the explicit "no line" option) went in
    // 2026-08 with every other TVOC threshold — and the KEY is absent rather
    // than empty, because `parametersWithProfiles` returns `Object.keys`, so
    // an empty array would still advertise a choice. See
    // tests/engine/no-molhave.test.ts.
    expect(profilesFor('tvoc')).toEqual([])
    expect(parametersWithProfiles()).not.toContain('tvoc')
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
    expect(resolveReference('tvoc', 'molhave', { unit: 'ppb' })).toBeNull()  // no TVOC reference at all since 2026-08
    expect(resolveReference('temp', 'ashrae-comfort', { unit: '°F', ts: Date.UTC(2026, 6, 15) })!.action).toBeNull()
  })
})

describe('unit projection', () => {
  it('has no TVOC advisory left to project', () => {
    // This pinned 500 µg/m³ resolving to 218 ppb through isobutylene's
    // molecular weight, with the choice of compound disclosed on the note —
    // and, separately, that the mass units claimed no assumption they had not
    // made. Both tiers were removed in 2026-08. The projection machinery is
    // kept for any future mass-published threshold (see vocConversion.test),
    // but TVOC no longer reaches it from any unit.
    for (const unit of ['µg/m³', 'mg/m³', 'ppb', 'ppm']) {
      expect(resolveReference('tvoc', 'molhave', { unit }), unit).toBeNull()
      expect(resolveReference('tvoc', 'molhave-action', { unit }), unit).toBeNull()
    }
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

  it('has no TVOC profile left to carry a caveat', () => {
    // The caveat on the Mølhave profiles was dropped first, then the profiles
    // themselves. Worth recording why the order went that way: the caveat
    // said the tiers were advisory rather than regulatory, which read as a
    // safeguard and worked as a delivery mechanism — a tier printed beside a
    // measured value is a comparison however it is captioned. Removing the
    // disclaimer did not make the tier safe; removing the tier did.
    expect(profilesFor('tvoc')).toEqual([])
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

  it('no longer offers an explicit "no reference line" choice anywhere', () => {
    // `tvoc/none` was the only opt-out profile in the catalogue, and it went
    // with the rest of TVOC's in 2026-08. It existed because TVOC was the one
    // parameter where an assessor might reasonably want the series drawn with
    // no line against it — which is now what TVOC does unconditionally, so
    // the option has nothing left to express.
    //
    // The distinction it demonstrated survives and is asserted directly above
    // on `co2/outdoor-differential`: a resolver that returns no number has to
    // say WHY, and `unavailable` is what separates a missing input from a
    // deliberate blank. Nothing today is the deliberate-blank case.
    for (const param of parametersWithProfiles()) {
      expect(profilesFor(param).map((x) => x.id), param).not.toContain('none')
    }
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
    // ['tvoc', 'well'] was in this list until 2026-08. The WELL TVOC target
    // was removed with the Mølhave tiers rather than kept as the parameter's
    // last selectable yardstick: opt-in does not rescue a figure with no
    // health basis behind it.
    for (const [param, id] of [['pm25', 'epa-annual'], ['pm25', 'who-annual'], ['pm25', 'well'], ['co', 'well']] as const) {
      const r = resolveReference(param, id, { unit: param === 'co' ? 'ppm' : 'µg/m³' })!
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

describe('TVOC has no reference in any unit the instrument might log', () => {
  // ── What this block used to pin, and why it is gone ──────────────────────
  //
  // It pinned that Mølhave's 500 µg/m³ projected into ~218 ppb through
  // isobutylene's molecular weight, with the assumption disclosed on the note.
  //
  // That itself was a reinstatement. The projection had been withdrawn once,
  // on the reasoning that 500 µg/m³ is the mass of a defined 22-compound
  // chamber mixture while a PID reports isobutylene-equivalent response, so
  // the two are different quantities. The reasoning was right about the
  // limitation and wrong about the remedy: the limitation belongs to the
  // READING and exists whichever unit the instrument displays, so withholding
  // the tier from ppb removed it from half the instruments in the field on
  // the basis of a display setting and left the other half comparing against
  // it with no disclosure at all.
  //
  // In 2026-08 the question was settled at the root instead. There is no
  // 500 µg/m³ tier. Mølhave's figures are a chamber-study dose-response
  // framework, not a limit, and no consensus health-based limit exists for a
  // non-specific sum — so the argument about which unit to state it in was an
  // argument about how to render a comparison that should never have been
  // made. Both tiers, and the WELL target beside them, are gone.
  //
  // The two properties this block proved about the STATEMENT machinery —
  // scale-invariance and sub-unit precision — were real and are not about
  // TVOC. They are re-asserted below on formaldehyde, which still has a
  // reference and still crosses scales.

  it('resolves nothing, in any unit, under any profile id', () => {
    for (const id of ['molhave', 'molhave-action', 'well', 'none', 'default', '']) {
      for (const unit of ['ppb', 'ppm', 'µg/m³', 'mg/m³', '']) {
        expect(resolveReference('tvoc', id, { unit }), `${id}/${unit}`).toBeNull()
      }
    }
  })
})

describe('a reference reads the same across scales, at its own precision', () => {
  // Inherited from the TVOC block above. Formaldehyde is the right carrier:
  // its NIOSH REL is 0.016 ppm, so ppm and ppb are one quantity at two
  // scales, and the ppm magnitude is small enough to trip the rounding trap
  // that once collapsed a cited reference to "0".
  const hchoPts = (scale: number) => {
    const out: any[] = []
    for (let i = 0; i < 30; i++) out.push({ t: T0 + i * 10 * MIN, hcho: (i % 3 === 0 ? 0.04 : 0.005) * scale })
    return out
  }

  const share = (unit: string, scale: number) => {
    const ref = resolveReference('hcho', 'niosh-rel', { unit })!
    return parameterStats(hchoPts(scale), 'hcho', { reference: { limit: ref.limit } })!.pctAbove
  }

  it('puts the same share of readings above the reference whichever scale was logged', () => {
    const inPpm = share('ppm', 1)
    expect(share('ppb', 1000)).toBeCloseTo(inPpm, 5)
    expect(inPpm).toBeGreaterThan(0)
  })

  it('states the reference in the reader’s unit without rounding it away', () => {
    const say = (unit: string, scale: number) => {
      const ref = resolveReference('hcho', 'niosh-rel', { unit })!
      const st = parameterStats(hchoPts(scale), 'hcho', { reference: { limit: ref.limit } })!
      return parameterStatement('hcho', st, { limit: ref.limit }, { units: { hcho: unit } })!
    }
    expect(say('ppb', 1000)).toContain('(16 ppb)')
    // The sub-unit case, and the actual defect being guarded: the statement
    // renders to two decimal places, so 0.016 ppm prints as 0.02 ppm — small,
    // but still a number. Whole-number rounding here would cite "0 ppm", the
    // same class of error that once doubled a 0.5 mg/m³ TVOC reference to 1.
    expect(say('ppm', 1)).toContain('(0.02 ppm)')
    expect(say('ppm', 1)).not.toContain('(0 ppm)')
  })
})
