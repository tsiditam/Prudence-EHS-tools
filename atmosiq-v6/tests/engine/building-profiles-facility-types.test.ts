/**
 * The 2026-09 facility types — Marine / Vessel, Hotel / Lodging, Senior
 * Living / Long-Term Care, Childcare / Early Learning, Residential — and the
 * contract every facility type has to keep:
 *
 *   • the two `ft` option lists (quick start, building) are identical;
 *   • every option offered resolves a profile, and the five new labels
 *     resolve to their own;
 *   • legacy free-text names an assessor may have typed land on the right
 *     profile, and the substrings they share with older matches ("preschool"
 *     / "school", "nursing home" / "home", "hospitality" / "hospital",
 *     "dealership" / "ship") do not misroute;
 *   • the new profiles carry NO air-change override and NO humidity override
 *     — no figure for these occupancies was entered from a checked table, so
 *     a recorded ACH is reported, not judged (the profile file says why);
 *   • every finding names the standard it asks the assessor to verify
 *     against, and the population-specific findings fire on the record and
 *     only on the record.
 *
 * Banned-term scanning, the ASHRAE 62.1-for-ACH rule and the ASHRAE 170-for-
 * mold rule are enforced over ALL profiles by
 * citations-building-profiles.test.ts and are not repeated here.
 */
import { describe, it, expect } from 'vitest'
import { BUILDING_PROFILES, getBuildingProfile, getProfileContextFindings, getSuppressedFields } from '../../src/engines/buildingProfiles.js'
import { Q_BUILDING, Q_QUICKSTART, Q_ZONE } from '../../src/constants/questions.js'
import { STD } from '../../src/constants/standards'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus.js'
import { scoreZone } from '../../src/engines/scoring.js'

type Profile = {
  id: string
  label: string
  additionalStandards: string[]
  zoneSubtypes: Array<{ id: string; label: string }>
  suppressFields: Record<string, string[]>
  achOverrides?: unknown
  rhOverrides?: unknown
  contextFindings: Array<{ condition: (z: any) => boolean; text: unknown; sev: string; std?: string }>
}

const NEW = {
  'Marine / Vessel': 'MARINE_VESSEL',
  'Hotel / Lodging': 'HOTEL_LODGING',
  'Senior Living / Long-Term Care': 'SENIOR_LIVING',
  'Childcare / Early Learning': 'CHILDCARE',
  'Residential': 'RESIDENTIAL',
} as const

const ftOpts = (list: Array<Record<string, unknown>>) => (list.find((q) => q.id === 'ft')!.opts as string[])
const profiles = BUILDING_PROFILES as Record<string, Profile>
const findings = (key: string, z: Record<string, unknown>) =>
  getProfileContextFindings(profiles[key], z) as Array<{ t: string; sev: string; std: string }>

describe('the facility-type option lists', () => {
  it('are identical on the quick start and the building screen', () => {
    expect(ftOpts(Q_QUICKSTART as never)).toEqual(ftOpts(Q_BUILDING as never))
  })

  it('offer the five new types', () => {
    for (const label of Object.keys(NEW)) expect(ftOpts(Q_BUILDING as never)).toContain(label)
  })

  it('every option offered resolves a profile — "every facility type offered in questions.js has a profile here"', () => {
    for (const label of ftOpts(Q_BUILDING as never)) {
      expect(getBuildingProfile(label), `"${label}" has no profile`).toBeTruthy()
    }
  })

  it('the five labels resolve to their own profiles', () => {
    for (const [label, key] of Object.entries(NEW)) {
      expect(getBuildingProfile(label), label).toBe(profiles[key])
    }
  })

  it('the nine older labels still resolve where they did', () => {
    expect(getBuildingProfile('Commercial Office')).toBe(BUILDING_PROFILES.COMMERCIAL_OFFICE)
    expect(getBuildingProfile('School / University')).toBe(BUILDING_PROFILES.SCHOOL_K12)
    expect(getBuildingProfile('Healthcare')).toBe(BUILDING_PROFILES.HEALTHCARE)
    expect(getBuildingProfile('Industrial / Manufacturing')).toBe(BUILDING_PROFILES.INDUSTRIAL)
    expect(getBuildingProfile('Retail')).toBe(BUILDING_PROFILES.RETAIL)
    expect(getBuildingProfile('Government')).toBe(BUILDING_PROFILES.GOVERNMENT)
    expect(getBuildingProfile('Laboratory')).toBe(BUILDING_PROFILES.LABORATORY)
    expect(getBuildingProfile('Warehouse')).toBe(BUILDING_PROFILES.WAREHOUSE)
    expect(getBuildingProfile('Mixed Use')).toBe(BUILDING_PROFILES.MIXED_USE)
  })
})

describe('free-text facility names route to the right profile', () => {
  it.each([
    ['Nursing home', 'SENIOR_LIVING'],
    ['Assisted living', 'SENIOR_LIVING'],
    ['Skilled nursing facility', 'SENIOR_LIVING'],
    ['Daycare', 'CHILDCARE'],
    ['Preschool', 'CHILDCARE'],
    ['Child care center', 'CHILDCARE'],
    ['Motel', 'HOTEL_LODGING'],
    ['Hospitality', 'HOTEL_LODGING'],
    ['Apartment building', 'RESIDENTIAL'],
    ['Multifamily', 'RESIDENTIAL'],
    ['Cargo ship', 'MARINE_VESSEL'],
    ['Fishing boat', 'MARINE_VESSEL'],
    ['Research vessel', 'MARINE_VESSEL'],
  ])('%s → %s', (name, key) => {
    expect(getBuildingProfile(name)).toBe(profiles[key])
  })

  it('shared substrings do not misroute', () => {
    // "hospital" inside "hospitality", "school" inside "preschool".
    expect(getBuildingProfile('Hospital')).toBe(BUILDING_PROFILES.HEALTHCARE)
    expect(getBuildingProfile('Elementary school')).toBe(BUILDING_PROFILES.SCHOOL_K12)
    // "ship" inside "dealership" and "worship" is not a vessel.
    expect(getBuildingProfile('Car dealership')).toBeNull()
    expect(getBuildingProfile('Place of worship')).toBeNull()
    // A residential zone subtype under Mixed Use is not the Residential profile.
    expect(getBuildingProfile('Mixed Use')).toBe(BUILDING_PROFILES.MIXED_USE)
  })
})

describe('the five profiles are well-formed', () => {
  for (const key of Object.values(NEW)) {
    describe(key, () => {
      const p = profiles[key]

      it('carries a label that matches its facility-type option', () => {
        expect(ftOpts(Q_BUILDING as never)).toContain(p.label)
      })

      it('offers at least four distinct zone subtypes', () => {
        const ids = p.zoneSubtypes.map((s) => s.id)
        expect(ids.length).toBeGreaterThanOrEqual(4)
        expect(new Set(ids).size).toBe(ids.length)
        for (const s of p.zoneSubtypes) expect(s.label, s.id).toBeTruthy()
      })

      it('suppresses fields only on subtypes it declares, and only zone fields', () => {
        const ids = new Set(p.zoneSubtypes.map((s) => s.id))
        const zoneIds = new Set((Q_ZONE as Array<{ id: string }>).map((q) => q.id))
        for (const [subtype, fields] of Object.entries(p.suppressFields)) {
          expect(ids.has(subtype), `${key}.suppressFields.${subtype} is not a subtype`).toBe(true)
          for (const f of fields) expect(zoneIds.has(f), `${key}.${subtype} suppresses ${f}`).toBe(true)
          expect(getSuppressedFields(p, subtype)).toEqual(fields)
        }
      })

      it('carries no air-change or humidity override', () => {
        // No figure for these occupancies was entered from a checked table.
        // A recorded ACH in these zones is reported, not judged.
        expect(p.achOverrides).toBeUndefined()
        expect(p.rhOverrides).toBeUndefined()
      })

      it('names the standard behind every finding and cites at least one profile-level standard', () => {
        expect(p.additionalStandards.length).toBeGreaterThan(0)
        expect(p.contextFindings.length).toBeGreaterThan(0)
        for (const f of p.contextFindings) {
          expect(String(f.std || '').length, `${key}: a finding has no std`).toBeGreaterThan(3)
          expect(['low', 'medium', 'high', 'critical']).toContain(f.sev)
        }
      })

      it('fires nothing on a bare zone with no subtype and no readings', () => {
        expect(findings(key, { zn: 'Z' })).toEqual([])
      })
    })
  }
})

describe('Senior Living / Long-Term Care', () => {
  const room = (z: Record<string, unknown>) => findings('SENIOR_LIVING', { zone_subtype: 'resident_room', ...z })
  const cms = (z: Record<string, unknown>) => room(z).find((f) => /42 CFR 483\.10/.test(f.std))

  it('states the CMS 71–81 °F range on a resident room outside it, beside (not instead of) the comfort band', () => {
    expect(cms({ tf: '69' })).toBeTruthy()
    expect(cms({ tf: '82' })).toBeTruthy()
    expect(cms({ tf: '69' })!.t).toMatch(/69 °F is outside the 71–81 °F range/)
    expect(cms({ tf: '69' })!.sev).toBe('medium')
    // The engine's own ASHRAE 55 finding is untouched: scoreZone reports both.
    const zs = scoreZone({ zn: 'Rm 12', su: 'healthcare', zone_subtype: 'resident_room', tf: '69' } as never,
      { ft: 'Senior Living / Long-Term Care', hm: 'Within 6 months', assessmentDate: '2026-07-15' } as never) as any
    const env = zs.cats.find((c: any) => c.l === 'Environment').r.map((r: any) => `${r.t} | ${r.std || ''}`)
    expect(env.some((t: string) => /42 CFR 483\.10/.test(t))).toBe(true)
    expect(env.some((t: string) => /ASHRAE 55/.test(t))).toBe(true)
  })

  it('does not fire inside the range, at its bounds, or with no reading', () => {
    for (const tf of ['71', '75', '81']) expect(cms({ tf }), tf).toBeUndefined()
    expect(cms({})).toBeUndefined()
    expect(cms({ tf: '' })).toBeUndefined()
    expect(cms({ tf: 'n/a' })).toBeUndefined()
    // The range is a resident-room requirement, not a corridor one.
    expect(findings('SENIOR_LIVING', { zone_subtype: 'corridor', tf: '69' }).find((f) => /42 CFR/.test(f.std))).toBeUndefined()
  })

  it('the CMS range is double-entered in the standards corpus', () => {
    const e = STANDARDS_CORPUS.find((c: any) => c.id === 'cms-ltc-temperature') as any
    expect(e).toBeTruthy()
    expect(e.citation).toMatch(/42 CFR 483\.10\(i\)\(6\)/)
    expect(e.text).toMatch(/71 to 81 °F/)
    expect(e.text).toMatch(/October 1, 1990/)
  })

  it('routes visible mold through infection prevention (42 CFR 483.80), not ASHRAE 170', () => {
    const f = room({ mi: 'Small (< 10 sq ft)' }).find((x) => /\bmold\b/i.test(x.t))!
    expect(f.sev).toBe('high')
    expect(f.std).toMatch(/483\.80/)
    expect(f.std).not.toMatch(/ASHRAE 170/)
    expect(room({ mi: 'Suspected discoloration' }).find((x) => /\bmold\b/i.test(x.t))).toBeUndefined()
  })

  it('a bathing room asks for the water management program and states it is not a Legionella assessment', () => {
    const f = findings('SENIOR_LIVING', { zone_subtype: 'bathing' }).find((x) => /water management/.test(x.t))!
    expect(f.std).toMatch(/QSO-17-30/)
    expect(f.std).toMatch(/ASHRAE 188/)
    expect(f.t).toMatch(/not a Legionella assessment/)
  })
})

describe('Childcare / Early Learning', () => {
  const infant = (z: Record<string, unknown>) => findings('CHILDCARE', { zone_subtype: 'infant_room', ...z })

  it('asks for outdoor air in a child room when none was measured, and stops when it was', () => {
    expect(infant({}).find((f) => /outdoor air was not measured/.test(f.t))).toBeTruthy()
    expect(infant({ cfm_person: '14' }).find((f) => /outdoor air was not measured/.test(f.t))).toBeUndefined()
    // Not in the office.
    expect(findings('CHILDCARE', { zone_subtype: 'office' }).find((f) => /outdoor air was not measured/.test(f.t))).toBeUndefined()
  })

  it('raises the lead RRP finding only for a pre-1978 building with renovation, in a child-occupied room', () => {
    const rrp = (z: Record<string, unknown>) => infant(z).find((f) => /40 CFR 745/.test(f.std))
    expect(rrp({ ba: '1965', rn: 'Within 30 days' })).toBeTruthy()
    expect(rrp({ ba: '1965', rn: 'Within 30 days' })!.sev).toBe('high')
    expect(rrp({ ba: '1965', rn: 'Within 30 days' })!.t).toMatch(/built in 1965/)
    expect(rrp({ ba: '1965', rn: 'No' })).toBeUndefined()
    expect(rrp({ ba: '1990', rn: 'Within 30 days' })).toBeUndefined()
    expect(rrp({ rn: 'Within 30 days' })).toBeUndefined()
    expect(findings('CHILDCARE', { zone_subtype: 'office', ba: '1965', rn: 'Within 30 days' }).find((f) => /40 CFR 745/.test(f.std))).toBeUndefined()
  })

  it('a space heater or a chemical odor in a child room produces its own finding', () => {
    expect(infant({ src_internal: ['Space heaters'] }).find((f) => /Space heater/.test(f.t))).toBeTruthy()
    expect(infant({ src_internal: ['Laser printers'] }).find((f) => /Space heater/.test(f.t))).toBeUndefined()
    expect(infant({ op: 'Faint / intermittent', ot: ['Chemical'] }).find((f) => /Chemical odor/.test(f.t))).toBeTruthy()
    expect(infant({ op: 'Faint / intermittent', ot: ['Musty / Earthy'] }).find((f) => /Chemical odor/.test(f.t))).toBeUndefined()
  })

  it('the CO₂ finding is capped at medium and cites the ASHRAE position document', () => {
    const f = infant({ co2: '1300' }).find((x) => /CO₂/.test(x.t))!
    expect(f.sev).toBe('medium')
    expect(f.std).toMatch(/ASHRAE Position Document on Indoor Carbon Dioxide \(2022\)/)
    expect(f.t).toContain(`${STD.v.co2.con} ppm`)
  })
})

describe('Residential', () => {
  const res = (z: Record<string, unknown>) => findings('RESIDENTIAL', z)

  it('says a cfm/person reading is an ASHRAE 62.1 (buildings) comparison and points at 62.2', () => {
    const f = res({ zone_subtype: 'living', cfm_person: '12' }).find((x) => /62\.2/.test(x.std))!
    expect(f).toBeTruthy()
    expect(f.sev).toBe('low')
    expect(f.t).toMatch(/ASHRAE 62\.2/)
    expect(res({ zone_subtype: 'living' }).find((x) => /cfm\/person figure/.test(x.t))).toBeUndefined()
  })

  it('a basement is a ground-contact space: radon, cited to the EPA guide, as a low finding', () => {
    const f = res({ zone_subtype: 'basement' }).find((x) => /radon/i.test(x.t))!
    expect(f.sev).toBe('low')
    expect(f.std).toMatch(/402-K-12-002/)
    expect(res({ zone_subtype: 'bedroom' }).find((x) => /radon/i.test(x.t))).toBeUndefined()
  })

  it('lead RRP is stated in the living area and bedrooms only, and only for pre-1978 renovation', () => {
    const rrp = (z: Record<string, unknown>) => res(z).find((x) => /40 CFR 745/.test(x.std))
    expect(rrp({ zone_subtype: 'living', ba: '1950', rn: 'Within 6 months' })).toBeTruthy()
    expect(rrp({ zone_subtype: 'bedroom', ba: '1950', rn: 'Within 6 months' })).toBeTruthy()
    expect(rrp({ zone_subtype: 'kitchen', ba: '1950', rn: 'Within 6 months' })).toBeUndefined()
    expect(rrp({ zone_subtype: 'living', ba: '1950', rn: 'No' })).toBeUndefined()
    expect(rrp({ zone_subtype: 'living', ba: '2001', rn: 'Within 6 months' })).toBeUndefined()
  })

  it('CO in the utility space cites the WHO 24-hour guideline at its own severity', () => {
    const f = res({ zone_subtype: 'mechanical', co: String(STD.c.co.who24h + 1) }).find((x) => /\bCO\b/.test(x.t))!
    expect(f.sev).toBe('low')
    expect(f.std).toMatch(/WHO/)
    expect(f.t).toContain(`${STD.c.co.who24h} ppm`)
    expect(res({ zone_subtype: 'mechanical', co: String(STD.c.co.who24h) }).find((x) => /\bCO\b/.test(x.t))).toBeUndefined()
  })
})

describe('Hotel / Lodging', () => {
  const hotel = (z: Record<string, unknown>) => findings('HOTEL_LODGING', z)

  it('a PTAC or fan-coil guest room gets the outdoor-air-path finding; a central-AHU one does not', () => {
    expect(hotel({ zone_subtype: 'guest_room', ht: 'PTAC / PTHP' }).find((f) => /through-wall or fan-coil/.test(f.t))).toBeTruthy()
    expect(hotel({ zone_subtype: 'guest_room', ht: 'Fan Coil Units' }).find((f) => /through-wall or fan-coil/.test(f.t))).toBeTruthy()
    expect(hotel({ zone_subtype: 'guest_room', ht: 'Central AHU — VAV' }).find((f) => /through-wall or fan-coil/.test(f.t))).toBeUndefined()
  })

  it('a negative guest corridor is a make-up air finding', () => {
    expect(hotel({ zone_subtype: 'corridor', path_pressure: 'Negative (draws in)' }).find((f) => /corridor measured negative/i.test(f.t))).toBeTruthy()
    expect(hotel({ zone_subtype: 'corridor', path_pressure: 'Positive (pushes out)' }).find((f) => /corridor measured negative/i.test(f.t))).toBeUndefined()
  })

  it('the pool / spa finding cites the CDC aquatic code and ASHRAE 188 and says it is not a Legionella assessment', () => {
    const f = hotel({ zone_subtype: 'pool_spa' }).find((x) => /chloramine/i.test(x.t))!
    expect(f.std).toMatch(/Model Aquatic Health Code/)
    expect(f.std).toMatch(/ASHRAE 188/)
    expect(f.t).toMatch(/not a Legionella assessment/)
  })
})

describe('Marine / Vessel', () => {
  const ship = (z: Record<string, unknown>) => findings('MARINE_VESSEL', z)

  it('accommodation cites the Maritime Labour Convention and calls ASHRAE 62.1 an indicator, not the design basis', () => {
    const f = ship({ zone_subtype: 'cabin' }).find((x) => /Maritime Labour Convention/.test(x.t))!
    expect(f.std).toMatch(/MLC 2006 Standard A3\.1/)
    expect(f.t).toMatch(/ASHRAE 62\.1\) are an indicator here, not the design requirement/)
  })

  it('a cargo hold is an enclosed space: high, cited to IMO A.1050(27), and says a walkthrough reading is not an entry test', () => {
    const f = ship({ zone_subtype: 'cargo_hold' }).find((x) => /enclosed space/.test(x.t))!
    expect(f.sev).toBe('high')
    expect(f.std).toMatch(/A\.1050\(27\)/)
    expect(f.t).toMatch(/not an entry test/)
    // Complaint and comfort fields are suppressed there — no occupants to ask.
    expect(getSuppressedFields(BUILDING_PROFILES.MARINE_VESSEL, 'cargo_hold')).toContain('cx')
  })

  it('CO outside the machinery space is attributed to exhaust re-entrainment at the WHO 24-hour severity', () => {
    const co = String(STD.c.co.who24h + 2)
    const f = ship({ zone_subtype: 'mess', co }).find((x) => /re-entering/.test(x.t))!
    expect(f.sev).toBe('low')
    expect(f.std).toMatch(/WHO/)
    // In the engine room the reading is an occupational question, handled by
    // that subtype's own finding.
    expect(ship({ zone_subtype: 'engine_room', co }).find((x) => /re-entering/.test(x.t))).toBeUndefined()
    expect(ship({ zone_subtype: 'engine_room', co }).find((x) => /ACGIH/.test(x.std))).toBeTruthy()
  })
})
