/**
 * A citation earns its place only if removing it would change what the
 * reader does or believes.
 *
 * A rendered two-zone report with every parameter flagged put roughly
 * fifteen distinct authorities and forty-odd citation instances in front
 * of a client, for one office walkthrough. A CIH review had already cut
 * five whole sections from this report as overbuilt for the work behind
 * it; the citations were the same problem one level down.
 *
 * Four jobs justify a citation: it is the yardstick a number was compared
 * against, it is the authority for a recommended action, it is a METHOD
 * someone has to order, or it forecloses a specific misreading. Anything
 * else is furniture, and furniture reads as padding.
 *
 * What was cut, and why each failed the test:
 *
 *   • ACGIH TLV (CO) — a THIRD parallel occupational limit beside the
 *     REL and the PEL, driving no criterion. Also copyrighted and
 *     licensed by ACGIH, which states the TLVs are not for adoption as
 *     standards.
 *   • OSH Act 5(a)(1) — an enforcement hook, edging toward a compliance
 *     determination the platform says it does not make.
 *   • The OSHA 1989 vacated-rule history — regulatory history. The
 *     conclusion it supported (practice acts on 35, not 50) is stated
 *     plainly without it.
 *   • Seifert (1990) — a second citation for the same background range
 *     Mølhave already supports, whose tiers are the ones actually applied.
 *   • NYC DOHMH — a second humidity number (65 %) beside the ASHRAE 55
 *     bound (60 %) that the engine applies, and a municipal document
 *     cited as a national benchmark, tagged `edition: 'current'` for
 *     something unrevised since 2008.
 *   • WELL v2 — see the certification-target block below.
 *
 * What was NOT cut, because each passes: the OSHA PELs, the NIOSH RELs,
 * ASHRAE 55 and 62.1, the EPA NAAQS, Mølhave, Persily, IICRC S520, and
 * every sampling METHOD (NIOSH 2016 / 0800, EPA TO-17, and the ACGIH
 * *Bioaerosols* guidance in `sampling.js` — methodology, not a limit).
 * The specialty-occupancy standards (ISO 14644-1, NFPA 855, IEEE 1635,
 * ANSI/ISA 71.04, ASHRAE TC 9.9) are already occupancy-conditional and
 * fire only for the buildings they apply to.
 */
import { describe, it, expect } from 'vitest'

import { PARAMETER_PROSE } from '../../src/engine/report/parameter-prose'
import { CRITERIA, CRITERION_CLASS, evaluateCriteria } from '../../src/constants/criteria.js'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'
import { parametersWithProfiles, profilesFor, __PROFILES_FOR_TEST } from '../../src/utils/referenceProfiles.js'

type Criterion = { id: string; class: string; source: string; value: number }
const allCriteria = (): Criterion[] =>
  Object.values(CRITERIA as Record<string, Criterion[]>).flat()

const allProse = () => Object.values(PARAMETER_PROSE) as Array<{
  standardsBackground: string
  applicableStandards: ReadonlyArray<{ source: string }>
}>

describe('cut citations stay cut', () => {
  // Each pattern was present in the client deliverable before 2026-08.
  const BANISHED: ReadonlyArray<readonly [string, RegExp]> = [
    ['ACGIH TLV — a third parallel OEL that drove no criterion', /ACGIH|Threshold Limit Value/i],
    ['OSH Act General Duty Clause — an enforcement hook', /General Duty|5\(a\)\(1\)/i],
    ['the OSHA 1989 vacated-rule history', /1989 air.contaminants|vacated/i],
    ['Seifert (1990) — a duplicate of Mølhave', /Seifert/i],
    ['NYC DOHMH — a second humidity number, cited nationally', /DOHMH|New York City Department of Health/i],
  ]

  for (const [what, pattern] of BANISHED) {
    it(`no parameter prose reintroduces ${what}`, () => {
      for (const entry of allProse()) {
        expect(entry.standardsBackground).not.toMatch(pattern)
        for (const c of entry.applicableStandards) {
          expect(c.source).not.toMatch(pattern)
        }
      }
    })
  }

  it('the criterion registry never applied ACGIH in the first place', () => {
    // The point of the ACGIH cut: the report NAMED a limit it never used.
    expect(allCriteria().some((c) => /ACGIH/i.test(c.source))).toBe(false)
  })
})

describe('a certification target is opt-in, never applied by the engine', () => {
  it('the class declares itself non-auto-applied', () => {
    expect((CRITERION_CLASS as Record<string, { autoApplied?: boolean }>)
      .certification_target.autoApplied).toBe(false)
  })

  it('no certification target can be reached by evaluating a reading', () => {
    const targets = new Set(
      allCriteria().filter((c) => c.class === 'certification_target').map((c) => c.id),
    )
    expect(targets.size, 'the WELL criteria disappeared; this guard is now vacuous').toBeGreaterThan(0)

    for (const parameter of Object.keys(CRITERIA as Record<string, unknown>)) {
      for (let v = 0; v <= 6000; v += 0.25) {
        const hit = evaluateCriteria(parameter, v, 'screening_grab') as
          { criterion: { id: string } } | null
        if (hit && targets.has(hit.criterion.id)) {
          throw new Error(`${parameter} at ${v} applied certification target ${hit.criterion.id}`)
        }
      }
    }
  })

  it('removing them from the ladder changed no finding, because none was reachable', () => {
    // co_well (9 ppm) tied co_epa_naaqs_8h (9); pm25_well (15) tied
    // pm25_who_24h (15) — a tier above matched first in both worst-first
    // ladders. pm10_well was ordered reachable, but nothing evaluates pm10:
    // scoring.js calls evaluateCriteria for pm25, co, hcho and tvoc only.
    // So this was dead weight carrying a citation, not a live comparison.
    const byId = new Map(allCriteria().map((c) => [c.id, c]))
    for (const [target, shadowedBy] of [
      ['co_well', 'co_epa_naaqs_8h'],
      ['pm25_well', 'pm25_who_24h'],
    ]) {
      expect(byId.get(target)!.value,
        `${target} no longer ties ${shadowedBy}; re-check the impact claim`)
        .toBe(byId.get(shadowedBy)!.value)
    }
  })

  it('but stays selectable in Logger Studio, where the assessor opts in', () => {
    // The rule is about WHO decides, not about deleting the reference. A
    // profile resolves its citation from the registry, so Logger Studio and
    // the walkthrough cite identically — deleting the criteria would break
    // that link and remove a real capability.
    const raw = __PROFILES_FOR_TEST as Record<string, Array<{ id: string; criterionId?: string }>>
    const well = Object.values(raw).flat().filter((p) => p.id === 'well')
    expect(well.length, 'the WELL profiles were deleted, not just de-automated').toBeGreaterThan(0)

    // Only the LINKED ones — the TVOC profile declares its own source
    // because no `tvoc_well` criterion exists, which is the documented
    // pattern for a profile with no registry threshold behind it.
    const linked = well.filter((p) => p.criterionId)
    expect(linked.length, 'no WELL profile still links a criterion').toBeGreaterThan(0)
    const ids = new Set(allCriteria().map((c) => c.id))
    for (const p of linked) {
      expect(ids.has(p.criterionId!), `${p.criterionId} is linked but missing`).toBe(true)
    }

    // And the citation still resolves through the registry, which is the
    // whole reason the criteria are kept rather than deleted.
    for (const param of parametersWithProfiles() as string[]) {
      for (const p of profilesFor(param) as Array<{ id: string; source?: string }>) {
        if (p.id !== 'well') continue
        expect(p.source, `WELL profile for ${param} resolved no citation`).toMatch(/WELL/i)
      }
    }
  })

  it('the manifest says WELL is opt-in rather than implying it is applied', () => {
    expect(STANDARDS_MANIFEST['WELL Building Standard v2']).toMatch(/opt-in/i)
  })
})

describe('the citations that earn their place are still there', () => {
  const REQUIRED: ReadonlyArray<readonly [string, RegExp]> = [
    ['the OSHA PEL paragraph', /1910\.1000|1910\.1048/],
    ['the NIOSH REL', /NIOSH/],
    ['ASHRAE 55', /ASHRAE (Standard )?55/],
    ['ASHRAE 62.1', /ASHRAE (Standard )?62\.1/],
    ['the EPA NAAQS', /NAAQS/],
    ['Mølhave, for the TVOC tiers that have no regulatory limit', /Mølhave/],
    ['Persily, which forecloses reading CO₂ as a contaminant limit', /Persily/],
    ['a confirmatory sampling method', /NIOSH Method|TO-17/],
  ]
  const corpus = allProse()
    .map((e) => e.standardsBackground + ' ' + e.applicableStandards.map((c) => c.source).join(' '))
    .join('\n')

  for (const [what, pattern] of REQUIRED) {
    it(`still cites ${what}`, () => {
      expect(corpus).toMatch(pattern)
    })
  }
})
