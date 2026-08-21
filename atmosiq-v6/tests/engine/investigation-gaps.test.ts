/**
 * Readiness gaps derived from the investigation.
 *
 * `sufficiency.js` asks whether enough fields were filled in per
 * category. That is a completeness test, and an assessment passes it
 * while leaving the actual question open: a walkthrough can fill every
 * required field, name inadequate ventilation as the cause, and never
 * have measured carbon monoxide in a building where occupants reported
 * headaches. Every category is complete; the report is not defensible.
 *
 * These gaps ask the reviewer's question instead — did you gather what
 * is needed to support the conclusions this report draws — and they are
 * gaps rather than blockers on purpose. A screening walkthrough
 * legitimately ships with untested differentials; what the assessor is
 * owed is that the open one is named in front of them, with the
 * measurement that would close it, before they sign.
 */
import { describe, it, expect } from 'vitest'

import { detectInvestigationGaps } from '../../src/engines/investigation-gaps'
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict'
import { deriveInvestigation, PARAMETER_LABEL } from '../../src/engine/investigation'
import { buildAssessmentContext } from '../../lib/context/buildAssessmentContext'
import { scoreZone } from '../../src/engines/scoring'
import { buildCausalChains } from '../../src/engines/causalChains'
import { generateSamplingPlan } from '../../src/engines/sampling'

type Zone = Record<string, any>

function investigate(zones: Zone[], bldg: Zone) {
  const zoneScores = zones.map((z) => scoreZone(z, bldg))
  return {
    zoneScores,
    investigation: deriveInvestigation({
      zonesData: zones, buildingData: bldg, zoneScores,
      causalChains: buildCausalChains(zones, bldg, zoneScores),
      samplingPlan: generateSamplingPlan(zones, bldg),
    }),
  }
}

/** The case this whole tier exists for. */
const CAUSE_NAMED_ALTERNATIVE_UNTESTED = {
  bldg: { fn: 'Tower', sa: 'Weak / reduced', ht: 'Central AHU — VAV' } as Zone,
  zones: [{
    zn: 'Suite 200', su: 'office', sf: '2400', oc: '18', co2: '1450', co2o: '430', tf: '72', rh: '52',
    op: 'Moderate persistent', ot: ['Musty / Earthy'], cx: 'Yes — complaints reported',
    sy: ['Headache', 'Cough'], sr: 'Yes — clear pattern', ac: '6-10', cc: 'Yes — this zone',
  }] as Zone[],
}

const EVERYTHING_MEASURED = {
  bldg: { fn: 'Tower', ht: 'Central AHU — VAV' } as Zone,
  zones: [{
    zn: 'A', su: 'office', sf: '2400', oc: '18', co2: '1450', co2o: '430', tf: '72', rh: '44',
    pm: '8', pmo: '9', co: '0.4', tv: '150', hc: '0.005', vd: 'None',
  }] as Zone[],
}

describe('the question a category checklist cannot ask', () => {
  it('flags a cause named while a competing explanation was never tested', () => {
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    const gaps = detectInvestigationGaps(investigation)
    const unresolved = gaps.find((g) => g.kind === 'differential_unresolved')
    expect(unresolved, 'competing explanations were not flagged').toBeTruthy()
    expect(unresolved!.severity).toBe('warn')
    expect(unresolved!.why).toMatch(/Nothing measured so far separates the leading two/)
    expect(unresolved!.why).toMatch(/first thing a reviewer will ask about/)
  })

  it('names the untested measurement in the assessor\'s words, not the engine\'s key', () => {
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    const untested = detectInvestigationGaps(investigation)
      .filter((g) => g.kind === 'untested_differential')
    expect(untested.length).toBeGreaterThan(0)
    const combustion = untested.find((g) => g.why.includes('Combustion source'))
    expect(combustion, 'CO was never measured and headaches were reported').toBeTruthy()
    expect(combustion!.why).toContain('carbon monoxide')
    expect(combustion!.why, 'the raw parameter key leaked into prose').not.toMatch(/— co —/)
    expect(combustion!.why).toMatch(/has not been ruled out; it has not been tested/)
  })

  it('says nothing when every live explanation was measured against', () => {
    const { investigation } = investigate(EVERYTHING_MEASURED.zones, EVERYTHING_MEASURED.bldg)
    expect(detectInvestigationGaps(investigation)).toEqual([])
  })

  it('says nothing about a clean walkthrough', () => {
    const { investigation } = investigate(
      [{ zn: 'A', su: 'office', sf: '3000', oc: '20', co2: '620', co2o: '430', tf: '74', rh: '44', pm: '6', pmo: '9' }],
      { fn: 'Tower', ht: 'Central AHU — VAV' },
    )
    expect(investigation.stage).toBe('no_active_differential')
    expect(detectInvestigationGaps(investigation)).toEqual([])
  })

  it('does not report the same explanation twice', () => {
    // A differential named in the discriminating test is already covered
    // by differential_unresolved; repeating it as untested_differential
    // would put the same problem in front of the assessor twice.
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    const gaps = detectInvestigationGaps(investigation)
    const test = investigation.discriminatingTests[0]
    expect(test).toBeTruthy()
    for (const name of test.between) {
      expect(
        gaps.filter((g) => g.kind === 'untested_differential' && g.why.includes(name)),
        `${name} is reported twice`,
      ).toHaveLength(0)
    }
  })

  it('weights the leading explanation above a trailing one', () => {
    const { investigation } = investigate(
      [{ zn: 'A', su: 'office', sf: '2400', oc: '18', pm: '38', pmo: '9', vd: 'Heavy accumulation', sy: ['Cough'] }],
      { fn: 'Tower', fc: 'Heavily loaded', ht: 'Central AHU — VAV' },
    )
    const gaps = detectInvestigationGaps(investigation)
    for (const g of gaps.filter((x) => x.kind === 'untested_differential')) {
      const leads = g.why.includes('currently leads the differential')
      expect(g.severity).toBe(leads ? 'warn' : 'info')
    }
  })
})

describe('it never invents a gap it cannot explain', () => {
  it('returns nothing for anything it cannot read', () => {
    for (const input of [
      null, undefined, {}, 'nope', 42, [],
      { hypotheses: [] }, { hypotheses: null }, { stage: 'differential' },
      { stage: 'differential', hypotheses: [{}] },
      { stage: 'differential', hypotheses: [{ status: 'untested' }], discriminatingTests: null },
    ] as any[]) {
      expect(() => detectInvestigationGaps(input)).not.toThrow()
      expect(Array.isArray(detectInvestigationGaps(input))).toBe(true)
    }
  })

  it('reports only explanations the investigation state holds', () => {
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    const names = investigation.hypotheses.map((h) => h.name)
    for (const g of detectInvestigationGaps(investigation)) {
      if (g.kind !== 'untested_differential') continue
      expect(names.some((n) => g.why.includes(n)), `gap names an explanation the engine did not derive: ${g.why}`).toBe(true)
    }
  })

  it('quotes only parameters the engine marked untested', () => {
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    const untestedLabels = new Set(
      investigation.hypotheses.flatMap((h) => h.untestedParameters.map((p) => PARAMETER_LABEL[p])),
    )
    for (const g of detectInvestigationGaps(investigation)) {
      if (g.kind !== 'untested_differential') continue
      expect([...untestedLabels].some((l) => g.why.includes(l))).toBe(true)
    }
  })

  it('matches the shape the other gap stream uses', () => {
    const { investigation } = investigate(
      CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    )
    for (const g of detectInvestigationGaps(investigation)) {
      expect(typeof g.kind).toBe('string')
      expect(['warn', 'info']).toContain(g.severity)
      expect(Array.isArray(g.zones)).toBe(true)
      expect(typeof g.count).toBe('number')
      expect(g.why.length, 'a gap needs a reason someone can act on').toBeGreaterThan(60)
    }
  })
})

describe('the verdict carries them, and both callers agree', () => {
  const { zoneScores, investigation } = investigate(
    CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
  )
  const assessment = {
    assessmentMode: 'SCREENING', presurvey: {}, building: CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
    client: {}, zones: CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, zoneScores, recs: null,
    photos: {}, profile: { name: 'J. Smith, CIH' },
  }

  it('merges both gap streams into one verdict', () => {
    const verdict: any = buildReadinessVerdict({ ...assessment, investigation } as any)
    const kinds = verdict.defensibility_gaps.map((g: any) => g.kind)
    expect(kinds).toContain('differential_unresolved')
    // The pre-existing stream is untouched.
    expect(kinds.some((k: string) => k.startsWith('missing_') || k.includes('mold'))).toBe(true)
  })

  it('is unchanged when no investigation is supplied', () => {
    // Adding this inspector must not alter a caller that has not been
    // updated: no new gap, no changed status.
    const without: any = buildReadinessVerdict(assessment as any)
    expect(without.defensibility_gaps.some((g: any) => g.kind.includes('differential'))).toBe(false)
    const baseline: any = buildReadinessVerdict({ ...assessment, investigation: null } as any)
    expect(JSON.stringify(baseline)).toBe(JSON.stringify(without))
  })

  it('the assessment context reaches the same verdict the panel does', () => {
    // buildAssessmentContext derives its own investigation; the Readiness
    // panel derives one in MobileApp. Both call one pure function on the
    // same state, so the gap sets must be identical — otherwise the panel
    // and the chat would describe one assessment two ways.
    const ctx: any = buildAssessmentContext({
      presurvey: {}, bldg: CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg,
      zones: CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, zoneScores, comp: { tot: 61 },
      causalChains: buildCausalChains(CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg, zoneScores),
      samplingPlan: generateSamplingPlan(CAUSE_NAMED_ALTERNATIVE_UNTESTED.zones, CAUSE_NAMED_ALTERNATIVE_UNTESTED.bldg),
      profile: { name: 'J. Smith, CIH' },
    } as any)
    const fromContext = ctx.readiness_verdict.defensibility_gaps
      .filter((g: any) => g.kind.includes('differential'))
    const fromPanel = detectInvestigationGaps(ctx.investigation)
    expect(JSON.stringify(fromContext)).toBe(JSON.stringify(fromPanel))
    expect(fromContext.length).toBeGreaterThan(0)
  })

  it('moves the verdict off "ready" rather than blocking finalization', () => {
    // A screening walkthrough legitimately ships with untested
    // differentials. The gap must be visible without making the report
    // unexportable.
    const verdict: any = buildReadinessVerdict({ ...assessment, investigation } as any)
    expect(verdict.finalization_blockers.some((b: string) => /differential|untested explanation/i.test(b))).toBe(false)
    expect(verdict.status).not.toBe('ready')
  })
})

describe('the panel can name every gap it renders', () => {
  it('humanizes both new kinds', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../src/components/ReadinessPanel.jsx', import.meta.url), 'utf8'))
    for (const kind of ['differential_unresolved', 'untested_differential']) {
      expect(src, `${kind} would render as a raw key`).toContain(kind)
    }
  })
})
