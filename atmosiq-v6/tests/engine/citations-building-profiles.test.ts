/**
 * Building-profile findings and overrides — citation discipline
 * (AUDIT-2026-09 C1, C7).
 *
 * `buildingProfiles.js` bypasses the criteria registry: its context findings
 * carry their own text, severity and `std`, and its `achOverrides` carry
 * their own numbers. None of it is seen by `criterion-coverage.test.ts`. The
 * audit found nine profiles citing ASHRAE 55 for a humidity band it does not
 * contain, procedure rooms at 6 ACH cited to a table that says 15, an office
 * ACH cited to a standard that sets none, a CO finding rated `high` against
 * an OSHA figure that does not exist, and a banned term shipping in a
 * pharmacy finding. This file pins each of those shut.
 *
 * Four rules:
 *   1. No profile finding text contains a banned term (api/_banned-language.js
 *      is the same ruleset the narrative path is linted against).
 *   2. No profile cites ASHRAE 62.1 for an air-change rate — 62.1 sets
 *      outdoor-air rates, not ACH.
 *   3. No profile cites ASHRAE 170 for mold — it is a ventilation standard.
 *   4. Every numeric ACH in a profile carries a citation naming the table it
 *      comes from, OR the profile/subtype is on the gap ledger with a reason.
 */
import { describe, it, expect } from 'vitest'
import { BUILDING_PROFILES, getProfileContextFindings, getRHOverride, isolationKind } from '../../src/engines/buildingProfiles.js'
import { STD } from '../../src/constants/standards'
import { allCriteria, CRITERION_CLASS } from '../../src/constants/criteria'
import { scan } from '../../api/_banned-language.js'
import { PROFILE_ACH_GAPS } from './citations-gap-ledger'

type Finding = { condition: (z: any) => boolean; text: string | ((z: any) => string); sev: string; std?: string }
type Profile = {
  id: string
  zoneSubtypes: Array<{ id: string }>
  achOverrides?: Record<string, { min: number; label: string }>
  rhOverrides?: unknown
  contextFindings: Finding[]
}

const profiles = Object.entries(BUILDING_PROFILES as Record<string, Profile>)

/**
 * Every rendered text a finding can produce. A `text` function is evaluated
 * for each variant it branches on (isolation kind), so the sweep sees all
 * of them rather than only the unrecorded default.
 */
const renderedTexts = (f: Finding): string[] => {
  if (typeof f.text === 'string') return [f.text]
  return [{}, { isolation_kind: 'AII' }, { isolation_kind: 'protective environment' }].map((z) => f.text(z))
}

describe('no profile finding ships a banned term', () => {
  for (const [key, p] of profiles) {
    it(`${key}`, () => {
      const hits: string[] = []
      for (const f of p.contextFindings) {
        for (const t of renderedTexts(f)) {
          for (const h of scan(t)) hits.push(`${h.term} — "${h.snippet}"`)
        }
      }
      expect(hits).toEqual([])
    })
  }

  it('the pharmacy finding no longer says "hazardous compounding"', () => {
    // The specific defect the audit named: "hazardous" is a banned term and
    // the AtmosFlow DOCX path does not run the scanner. The concept survives
    // under its own name — USP <800>.
    const t = renderedTexts(BUILDING_PROFILES.HEALTHCARE.contextFindings.find((f: Finding) => f.condition({ zone_subtype: 'pharmacy' }))!)[0]
    expect(t).not.toMatch(/hazardous/i)
    expect(t).toMatch(/USP <800>/)
  })
})

describe('humidity: no profile re-cites the default band', () => {
  it('no profile carries an rhOverrides block at all', () => {
    // All nine held { 30, 60, 'ASHRAE 55' } — the engine default under the
    // one attribution it does not have. An override identical to the default
    // exists only to re-cite it.
    for (const [key, p] of profiles) {
      expect(p.rhOverrides, `${key} rhOverrides`).toBeUndefined()
      expect(getRHOverride(p, 'anything'), `${key} getRHOverride`).toBeNull()
    }
  })
})

describe('air-change rates', () => {
  const achEntries = profiles.flatMap(([key, p]) =>
    Object.entries(p.achOverrides || {}).map(([subtype, o]) => ({ key, subtype, ...o })))

  it('the sweep is not vacuous — some overrides remain', () => {
    expect(achEntries.length).toBeGreaterThan(0)
  })

  it('no ACH override or ACH finding cites ASHRAE 62.1', () => {
    for (const e of achEntries) expect(e.label, `${e.key}.${e.subtype}`).not.toMatch(/62\.1/)
    for (const [key, p] of profiles) {
      for (const f of p.contextFindings) {
        for (const t of renderedTexts(f)) {
          if (/\bACH\b|air[- ]change/i.test(t) && /\d+\s*(total\s+)?ACH/i.test(t)) {
            expect(String(f.std), `${key}: "${t.slice(0, 60)}"`).not.toMatch(/62\.1/)
            expect(t, `${key}: "${t.slice(0, 60)}"`).not.toMatch(/\d+\s*(total\s+)?ACH[^.]{0,60}62\.1/i)
          }
        }
      }
    }
  })

  it('every numeric ACH names the table it comes from, or is on the gap ledger', () => {
    const TABLE = /Table \d+(\.\d+)*/
    for (const e of achEntries) {
      expect(typeof e.min, `${e.key}.${e.subtype} min`).toBe('number')
      const ledgered = PROFILE_ACH_GAPS.some((g) => g.profile === e.key && g.subtype === e.subtype)
      expect(
        TABLE.test(e.label) || ledgered,
        `${e.key}.${e.subtype} = ${e.min} ACH cites "${e.label}", which names no table, and is not on the gap ledger`,
      ).toBe(true)
    }
  })

  it('a ledgered subtype has no override — the ledger records a removal, not an excuse', () => {
    for (const g of PROFILE_ACH_GAPS) {
      const p = (BUILDING_PROFILES as Record<string, Profile>)[g.profile]
      expect(p, `${g.profile} is not a profile`).toBeTruthy()
      expect(p.zoneSubtypes.map((s) => s.id), `${g.profile}.${g.subtype} is not a subtype`).toContain(g.subtype)
      expect(p.achOverrides?.[g.subtype], `${g.profile}.${g.subtype} is on the ledger AND still has an override`).toBeUndefined()
      expect(g.reason.length, `${g.profile}.${g.subtype} reason`).toBeGreaterThan(40)
    }
  })

  it('finding text states no ACH figure that is not also in an override with a table citation', () => {
    // A number in prose must trace to the same place the engine scores from.
    for (const [key, p] of profiles) {
      const cited = new Set(Object.values(p.achOverrides || {}).map((o) => o.min))
      for (const f of p.contextFindings) {
        for (const t of renderedTexts(f)) {
          for (const m of t.matchAll(/(\d+)\s*(?:total\s+)?ACH/gi)) {
            const n = Number(m[1])
            const usp797 = n === 30 && /USP <797>/.test(t)
            expect(cited.has(n) || usp797, `${key}: "${m[0]}" in "${t.slice(0, 80)}" has no override behind it`).toBe(true)
          }
        }
      }
    }
  })

  it('procedure rooms are 15 total ACH per ASHRAE 170-2021 Table 7.1, not 6', () => {
    expect(BUILDING_PROFILES.HEALTHCARE.achOverrides.procedure).toEqual({ min: 15, label: 'ASHRAE 170-2021 Table 7.1' })
  })
})

describe('isolation rooms: direction depends on which kind was recorded', () => {
  const finding = (z: Record<string, string>) =>
    getProfileContextFindings(BUILDING_PROFILES.HEALTHCARE, { zone_subtype: 'isolation', ...z })
      .find((f: any) => /isolation/i.test(f.t))!

  it('an unrecorded kind asserts no direction and names both', () => {
    const f = finding({})
    expect(f.t).toMatch(/AII/)
    expect(f.t).toMatch(/PE\b/)
    expect(f.t).toMatch(/NEGATIVE/)
    expect(f.t).toMatch(/POSITIVE/)
    expect(f.t).toMatch(/not recorded/i)
    expect(f.std).toMatch(/ASHRAE 170-2021 Table 7\.1/)
  })

  it('AII is negative, PE is positive', () => {
    expect(isolationKind({ isolation_kind: 'AII' })).toBe('aii')
    expect(isolationKind({ isolation_kind: 'Protective environment' })).toBe('pe')
    expect(isolationKind({})).toBeNull()
    expect(finding({ isolation_kind: 'AII' }).t).toMatch(/^Airborne infection isolation \(AII\) room: maintained NEGATIVE/)
    expect(finding({ isolation_kind: 'PE' }).t).toMatch(/^Protective environment \(PE\) room: maintained POSITIVE/)
  })
})

describe('mold in healthcare', () => {
  it('does not cite ASHRAE 170, which says nothing about mold', () => {
    for (const [key, p] of profiles) {
      for (const f of p.contextFindings) {
        const moldy = renderedTexts(f).some((t) => /\bmold\b/i.test(t))
        if (moldy) expect(String(f.std), `${key}: "${renderedTexts(f)[0].slice(0, 60)}"`).not.toMatch(/ASHRAE 170/)
      }
    }
  })
})

describe('severity is bounded by the criterion class the finding leans on', () => {
  const byId = new Map((allCriteria() as any[]).map((c) => [c.id, c]))
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as Record<string, number>

  it('warehouse CO > 5 ppm is capped at the EPA NAAQS criterion and cites it, not OSHA', () => {
    const f = getProfileContextFindings(BUILDING_PROFILES.WAREHOUSE, { zone_subtype: 'main_floor', co: '6' })
      .find((x: any) => /\bCO\b/.test(x.t))!
    expect(f).toBeTruthy()
    const c = byId.get('co_epa_naaqs_8h')
    expect(f.std).not.toMatch(/OSHA|1910/)
    expect(f.std).toMatch(/NAAQS/)
    expect(f.t).toContain(`${STD.c.co.epa} ppm`)
    expect(rank[f.sev]).toBeLessThanOrEqual(rank[c.severity])
    expect(rank[f.sev]).toBeLessThanOrEqual(rank[CRITERION_CLASS[c.class].maxSeverity])
  })

  it('classroom CO₂ > 800 ppm is at most medium and cites the ASHRAE position document, not "EPA TfS"', () => {
    const f = getProfileContextFindings(BUILDING_PROFILES.SCHOOL_K12, { zone_subtype: 'classroom', co2: '900', cfm_person: '12' })
      .find((x: any) => /CO₂/.test(x.t))!
    expect(f).toBeTruthy()
    expect(rank[f.sev]).toBeLessThanOrEqual(rank.medium)
    expect(f.std).toMatch(/ASHRAE Position Document on Indoor Carbon Dioxide \(2022\)/)
    expect(f.std).not.toMatch(/TfS|Tools for Schools/)
    expect(f.t).not.toMatch(/Tools for Schools/)
  })

  it('enclosed-parking CO 25 ppm is not attributed to ASHRAE 62.1', () => {
    const f = getProfileContextFindings(BUILDING_PROFILES.MIXED_USE, { zone_subtype: 'parking', co: '30' })
      .find((x: any) => /25 ppm/.test(x.t))!
    expect(f).toBeTruthy()
    expect(f.std).toMatch(/IMC §404\.1/)
    expect(f.std).toMatch(/ACGIH/)
    expect(f.std).not.toMatch(/62\.1/)
    expect(f.t).not.toMatch(/62\.1/)
  })
})
