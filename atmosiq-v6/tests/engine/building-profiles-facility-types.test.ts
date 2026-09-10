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
 *   • the five are facility type + zone subtypes and NOTHING more: no
 *     context findings, no air-change rows, no additional standards, no
 *     humidity override. A zone under any of them assesses exactly as an
 *     unprofiled building does. That is a product decision (2026-09): the
 *     assessment is of employee-occupied areas, the engine's own findings
 *     apply in every one of these buildings, and each population-specific
 *     rule was one more standard for the report to carry.
 */
import { describe, it, expect } from 'vitest'
import { BUILDING_PROFILES, getBuildingProfile, getProfileContextFindings, getSuppressedFields } from '../../src/engines/buildingProfiles.js'
import { Q_BUILDING, Q_QUICKSTART, Q_ZONE } from '../../src/constants/questions.js'
import { scoreZone } from '../../src/engines/scoring.js'

type Profile = {
  id: string
  label: string
  additionalStandards: string[]
  zoneSubtypes: Array<{ id: string; label: string }>
  suppressFields: Record<string, string[]>
  achOverrides?: unknown
  rhOverrides?: unknown
  tempOverrides?: unknown
  contextFindings: unknown[]
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

describe('the five profiles are facility type + zone subtypes, and nothing more', () => {
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

      it('adds no findings, no overrides and no standards', () => {
        expect(p.contextFindings).toEqual([])
        expect(p.additionalStandards).toEqual([])
        expect(p.additionalFields).toEqual({})
        expect(p.achOverrides).toBeUndefined()
        expect(p.rhOverrides).toBeUndefined()
        expect(p.tempOverrides).toBeUndefined()
        for (const s of p.zoneSubtypes) {
          expect(getProfileContextFindings(p, { zone_subtype: s.id, co: '30', co2: '2000', tf: '60', mi: 'Extensive (> 100 sq ft)', ach: '1' })).toEqual([])
        }
      })

      it('a zone under this type assesses exactly as an unprofiled building does', () => {
        // Same inputs, with and without the facility type, produce the same
        // findings tree — the profile changes what the assessor is asked,
        // never what the engine concludes.
        const zone = {
          zn: 'Z', su: 'office', zone_subtype: p.zoneSubtypes[0].id,
          co2: '1250', tf: '77', rh: '58', co: '3', pm: '12', ach: '3', cfm_person: '8',
          cx: 'Yes — complaints reported', sy: ['Headache'], mi: 'Small (< 10 sq ft)', wd: 'Old staining',
        }
        const bldg = { hm: 'Within 6 months', assessmentDate: '2026-07-15' }
        const withType = scoreZone(zone as never, { ...bldg, ft: p.label } as never) as any
        const without = scoreZone(zone as never, bldg as never) as any
        expect(withType.cats).toEqual(without.cats)
        expect(withType.confidence).toBe(without.confidence)
      })
    })
  }
})
