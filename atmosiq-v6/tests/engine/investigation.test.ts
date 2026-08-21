/**
 * Investigation engine — the reasoning layer that decides what to do next.
 *
 * The tests are grouped by the property each one protects. The first two
 * groups are structural guards rather than behaviour checks: they read the
 * source of the legacy engines and fail when a hypothesis, causal-chain
 * type, or sampling type is added without being mapped. That is the class
 * of defect this file exists to prevent — a fifth hypothesis vocabulary
 * appearing quietly and putting a name in the chat that the report has
 * never heard of.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import { deriveInvestigation, __testing, type InvestigationState } from '../../src/engine/investigation'
import { deriveHypotheses, ruleKeyOf, HYPOTHESIS_RULE_KEYS } from '../../src/engine/hypotheses'
import { computeParameterRanges, type ParameterKey } from '../../src/engine/report/parameter-ranges'
import { scoreZone } from '../../src/engines/scoring'
import { buildCausalChains } from '../../src/engines/causalChains'
import { generateSamplingPlan } from '../../src/engines/sampling'

const { RULE_PARAMETERS, CHAIN_TYPE_TO_RULE, SAMPLING_TYPE_TO_RULE, PARAMETER_METHOD, LIVE_STATUSES } = __testing

type Zone = Record<string, any>

/** Run the whole chain the app runs, so tests exercise real engine output. */
function investigate(zones: Zone[], bldg: Zone = {}): InvestigationState {
  const zoneScores = zones.map((z) => scoreZone(z, bldg))
  return deriveInvestigation({
    zonesData: zones,
    buildingData: bldg,
    zoneScores,
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    samplingPlan: generateSamplingPlan(zones, bldg),
  })
}

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

/** Every `type: 'X'` / `type:'X'` string literal in a source file. */
function typeLiterals(source: string): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(/\btype\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
    const raw = m[1].replace(/\\'/g, "'")
    // Skip interpolated / computed labels — those are not fixed vocabulary.
    if (raw.includes('${') || raw === '') continue
    out.add(raw)
  }
  return [...out]
}

// ── Structural guards ─────────────────────────────────────────────────

describe('mapping completeness — no unmapped vocabulary', () => {
  it('every hypothesis rule key has a parameter mapping', () => {
    for (const key of HYPOTHESIS_RULE_KEYS) {
      expect(RULE_PARAMETERS[key], `rule ${key} has no parameter mapping`).toBeDefined()
    }
    expect(Object.keys(RULE_PARAMETERS).sort()).toEqual([...HYPOTHESIS_RULE_KEYS].sort())
  })

  it('every hypothesis the §3 engine can emit carries a recoverable rule key', () => {
    // One input broad enough to fire all six rules at once.
    const zones: Zone[] = [{
      zn: 'Everything', zone_subtype: 'data_hall', gaseous_corrosion: 'G2 (moderate)',
      sa: 'Weak / reduced', od: 'Closed / minimum',
      sy: ['Headache', 'Cough'], mi: 'Small area (<10 sq ft)', wd: 'Active leak',
      ot: ['Musty / Earthy'], oi: 4, vd: 'Heavy accumulation',
    }]
    const hyps = deriveHypotheses({ zonesData: zones, buildingData: { fc: 'Heavily loaded' }, findings: [] })
    expect(hyps.length).toBe(HYPOTHESIS_RULE_KEYS.length)
    const keys = hyps.map((h) => ruleKeyOf(h))
    expect(keys, 'a rule emitted an id with no registered prefix').not.toContain(null)
    expect([...new Set(keys)].sort()).toEqual([...HYPOTHESIS_RULE_KEYS].sort())
  })

  it('every causal-chain type the legacy engine emits is mapped', () => {
    const emitted = typeLiterals(SRC('src/engines/causalChains.js'))
    expect(emitted.length).toBeGreaterThan(4)
    for (const t of emitted) {
      expect(
        Object.prototype.hasOwnProperty.call(CHAIN_TYPE_TO_RULE, t),
        `causal-chain type "${t}" is not mapped in CHAIN_TYPE_TO_RULE. Map it to the differential it describes, or to null if it describes a pathway.`,
      ).toBe(true)
    }
  })

  it('every sampling-plan type the legacy engine emits is mapped', () => {
    const emitted = typeLiterals(SRC('src/engines/sampling.js'))
    expect(emitted.length).toBeGreaterThan(4)
    for (const t of emitted) {
      expect(
        SAMPLING_TYPE_TO_RULE[t],
        `sampling type "${t}" is not mapped in SAMPLING_TYPE_TO_RULE`,
      ).toBeDefined()
    }
  })

  it('maps nothing that the legacy engines cannot emit', () => {
    const chains = new Set(typeLiterals(SRC('src/engines/causalChains.js')))
    for (const t of Object.keys(CHAIN_TYPE_TO_RULE)) {
      expect(chains.has(t), `CHAIN_TYPE_TO_RULE maps "${t}", which causalChains.js no longer emits`).toBe(true)
    }
    const samples = new Set(typeLiterals(SRC('src/engines/sampling.js')))
    for (const t of Object.keys(SAMPLING_TYPE_TO_RULE)) {
      expect(samples.has(t), `SAMPLING_TYPE_TO_RULE maps "${t}", which sampling.js no longer emits`).toBe(true)
    }
  })

  it('holds no threshold of its own', () => {
    // A threshold in this file would be a second opinion on a reading the
    // engine has already interpreted — the defect class that once had one
    // report calling the same 72 °F both within and outside ASHRAE 55.
    // Rather than pattern-match on comparison operators (which also catch
    // array-length checks), assert the file has no way to FORM an opinion:
    // it never coerces a measurement to a number, and it never names a
    // unit in code.
    const src = SRC('src/engine/investigation.ts')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code, 'investigation.ts parses a measurement value').not.toMatch(/parseFloat|parseInt|Number\s*\(/)
    // Comparisons against anything but a structural count (0, 1, 2) are
    // how a threshold would enter.
    const comparisons = code.match(/[<>]=?\s*(\d+)/g) || []
    const suspicious = comparisons.filter((c) => Number(c.replace(/[^\d]/g, '')) > 2)
    expect(suspicious, `investigation.ts compares against a magnitude: ${suspicious.join(', ')}`).toEqual([])
  })
})

// ── Nothing invented ──────────────────────────────────────────────────

describe('invents nothing', () => {
  const zones: Zone[] = [{
    zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced', ot: ['Musty / Earthy'], oi: 4,
    sy: ['Headache', 'Cough'], cx: 'Yes — complaints reported', ac: '6',
  }]
  const bldg = { fc: 'Heavily loaded' }

  it('reports only hypotheses the §3 engine derived, with its names', () => {
    const state = investigate(zones, bldg)
    const canonical = deriveHypotheses({ zonesData: zones, buildingData: bldg, findings: [] })
    const canonicalById = new Map(canonical.map((h) => [h.id as string, h]))
    expect(state.hypotheses.length).toBe(canonical.length)
    for (const h of state.hypotheses) {
      const source = canonicalById.get(h.id)
      expect(source, `hypothesis ${h.id} was not produced by deriveHypotheses`).toBeDefined()
      expect(h.name).toBe(source!.name)
      expect(h.cihConfidenceTier).toBe(source!.cihConfidenceTier)
    }
  })

  it('quotes causal-chain root causes verbatim', () => {
    const zoneScores = zones.map((z) => scoreZone(z, bldg))
    const chains = buildCausalChains(zones, bldg, zoneScores)
    const chainText = new Set(chains.map((c: any) => c.rootCause))
    const state = investigate(zones, bldg)
    for (const h of state.hypotheses) {
      for (const rc of h.rootCauses) {
        expect(chainText.has(rc), `root cause not present in the causal chains: ${rc}`).toBe(true)
      }
    }
  })

  it('quotes the sampling plan verbatim when the next step comes from it', () => {
    const moldZone: Zone[] = [{ zn: 'Basement', mi: 'Moderate (10-30 sq ft)', wd: 'Active leak', sy: ['Cough'], rh: '68' }]
    const state = investigate(moldZone)
    const plan = generateSamplingPlan(moldZone, {}).plan
    const step = state.nextStep
    if (step && step.source === 'sampling_plan') {
      const match = plan.some((p: any) => step.action.includes(p.method))
      expect(match, `next step does not quote a sampling-plan method: ${step.action}`).toBe(true)
    }
    expect(state.hypotheses.some((h) => h.name === 'Bioaerosol amplification')).toBe(true)
  })

  it('surfaces an unmapped chain verbatim rather than attributing it to a differential', () => {
    const state = deriveInvestigation({
      zonesData: [{ zn: 'A', co2: '1450' }],
      buildingData: {},
      zoneScores: [scoreZone({ zn: 'A', co2: '1450', sa: 'Weak / reduced' }, {})],
      causalChains: [
        { zone: 'A', type: 'Cross-Contamination Pathway', rootCause: 'Air pathway allowing contaminant migration from adjacent source' },
        { zone: 'A', type: 'Some Future Chain Nobody Mapped', rootCause: 'Invented for this test' },
      ],
      samplingPlan: null,
    })
    const labels = state.additionalConsiderations.map((c) => c.label)
    expect(labels).toContain('Cross-Contamination Pathway')
    expect(labels).toContain('Some Future Chain Nobody Mapped')
    for (const h of state.hypotheses) {
      expect(h.rootCauses).not.toContain('Invented for this test')
    }
  })
})

// ── Fidelity to the engine's own verdicts ─────────────────────────────

describe('reads the engine\'s verdict rather than re-deriving one', () => {
  const zones: Zone[] = [{
    zn: 'Lobby', co2: '620', pm: '38', pmo: '9', tv: '150', co: '0.5', hc: '0.01', rh: '44', tf: '72',
    vd: 'Heavy accumulation', sy: ['Cough'],
  }]

  it('supporting and opposing evidence match computeParameterRanges', () => {
    const zoneScores = zones.map((z) => scoreZone(z, {}))
    const ranges = computeParameterRanges(zones, zoneScores)
    const state = investigate(zones)
    for (const h of state.hypotheses) {
      for (const param of RULE_PARAMETERS[h.ruleKey]) {
        const range = ranges[param as ParameterKey]
        if (!range) continue
        const hasSupport = h.evidence.some((e) => e.source === 'measurement' && e.direction === 'supports')
        const hasOppose = h.evidence.some((e) => e.source === 'measurement' && e.direction === 'opposes')
        if (range.withinStandards === false) expect(hasSupport, `${h.name}/${param} flagged but no supporting measurement`).toBe(true)
        if (range.withinStandards === true && RULE_PARAMETERS[h.ruleKey].length === 1) {
          expect(hasOppose, `${h.name}/${param} clear but no opposing measurement`).toBe(true)
        }
      }
    }
  })

  it('does not let the site-wide range stand in for the flagged reading', () => {
    // Two zones measured, one flagged. The cleared zone's value must not
    // appear inside a sentence that says the engine flagged it.
    const zones: Zone[] = [
      { zn: 'Clean room', co2: '420' },
      { zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced' },
    ]
    const state = investigate(zones)
    const vent = state.hypotheses.find((h) => h.ruleKey === 'hyp_ventilation')!
    const flagged = vent.evidence.find((e) => e.source === 'measurement' && e.direction === 'supports')!
    expect(flagged.statement).toContain('Suite 200')
    expect(flagged.statement).toMatch(/Across the 2 zones measured/)
    expect(flagged.statement).not.toMatch(/flagged carbon dioxide in Suite 200 at 420/)
  })

  it('says so plainly when every zone measured was flagged', () => {
    const state = investigate([
      { zn: 'A', co2: '1450', sa: 'Weak / reduced' },
      { zn: 'B', co2: '1600' },
    ])
    const vent = state.hypotheses.find((h) => h.ruleKey === 'hyp_ventilation')!
    const flagged = vent.evidence.find((e) => e.source === 'measurement' && e.direction === 'supports')!
    expect(flagged.statement).toMatch(/in all 2 zones measured/)
  })

  it('treats a measured parameter with no finding as measured, not untested', () => {
    // CO at 0.5 ppm is below every criterion, so evaluateCriteria emits no
    // finding at all. Absence of a finding is not absence of a measurement.
    const state = investigate([{ zn: 'A', co: '0.5', sy: ['Headache'] }])
    const combustion = state.hypotheses.find((h) => h.ruleKey === 'hyp_combustion')
    expect(combustion, 'the combustion differential should have fired on neurological symptoms').toBeDefined()
    expect(combustion!.untestedParameters).not.toContain('co')
    expect(combustion!.status).toBe('not_supported_by_measurement')
    expect(combustion!.evidence.some((e) => e.direction === 'opposes')).toBe(true)
  })

  it('treats a parameter never recorded as untested, not as cleared', () => {
    const state = investigate([{ zn: 'A', sy: ['Headache'] }])
    const combustion = state.hypotheses.find((h) => h.ruleKey === 'hyp_combustion')!
    expect(combustion.untestedParameters).toContain('co')
    expect(combustion.status).toBe('untested')
    expect(combustion.evidence.every((e) => e.direction !== 'opposes')).toBe(true)
  })

  it('makes no interpretation when no engine output was supplied', () => {
    const state = deriveInvestigation({
      zonesData: [{ zn: 'A', co2: '2500', sa: 'Weak / reduced' }],
      buildingData: {},
      // no zoneScores — nothing has interpreted the reading
    })
    const vent = state.hypotheses.find((h) => h.ruleKey === 'hyp_ventilation')!
    expect(vent.status).toBe('untested')
    expect(vent.evidence.every((e) => e.source !== 'measurement')).toBe(true)
  })
})

// ── Ranking and stages ────────────────────────────────────────────────

describe('ranking', () => {
  it('names no leader when the evidence does not separate the top two', () => {
    // Two differentials, both untested, both single qualitative indicators.
    const state = investigate([{ zn: 'A', sy: ['Headache'] }])
    const live = state.hypotheses.filter((h) => LIVE_STATUSES.has(h.status))
    if (live.length >= 2) {
      const tiedTop = live[0].supportCount === live[1].supportCount
        && live[0].status === live[1].status
        && live[0].cihConfidenceTier === live[1].cihConfidenceTier
      if (tiedTop) expect(state.hypotheses.every((h) => !h.leading)).toBe(true)
    }
  })

  it('puts a measurement-supported differential ahead of an untested one', () => {
    const state = investigate([{
      zn: 'A', pm: '38', pmo: '9', vd: 'Heavy accumulation', sy: ['Cough'],
    }])
    expect(state.hypotheses[0].ruleKey).toBe('hyp_particulate')
    expect(state.hypotheses[0].leading).toBe(true)
  })

  it('never marks a measurement-negative differential as leading', () => {
    const state = investigate([{ zn: 'A', co: '0.5', rh: '44', sy: ['Headache', 'Cough'] }])
    for (const h of state.hypotheses) {
      if (h.status === 'not_supported_by_measurement') expect(h.leading).toBe(false)
    }
  })

  it('is stable — identical input gives an identical state', () => {
    const zones: Zone[] = [{ zn: 'A', co2: '1450', mi: 'Small area (<10 sq ft)', sy: ['Headache'] }]
    expect(JSON.stringify(investigate(zones))).toBe(JSON.stringify(investigate(zones)))
  })
})

describe('stages', () => {
  it('no zones → no_assessment, and says so without naming anything', () => {
    const state = deriveInvestigation({ zonesData: [], buildingData: {} })
    expect(state.stage).toBe('no_assessment')
    expect(state.hypotheses).toEqual([])
    expect(state.nextStep).toBeNull()
  })

  it('a clean walkthrough raises nothing to test', () => {
    const state = investigate([{ zn: 'Open office', co2: '620', pm: '6', pmo: '9', rh: '44', tf: '74' }])
    expect(state.stage).toBe('no_active_differential')
    expect(state.nextStep).toBeNull()
  })

  it('competing explanations with an unmeasured separator is a differential', () => {
    const state = investigate([{
      zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced', ot: ['Musty / Earthy'], oi: 4, sy: ['Headache', 'Cough'],
    }])
    expect(state.stage).toBe('differential')
    expect(state.discriminatingTests.length).toBeGreaterThan(0)
    expect(state.nextStep?.source).toBe('discriminating_test')
  })

  it('never reports concluded while work is outstanding', () => {
    for (const zones of [
      [{ zn: 'A', co2: '1450', sa: 'Weak / reduced', sy: ['Headache'] }],
      [{ zn: 'B', mi: 'Moderate (10-30 sq ft)', wd: 'Active leak', rh: '68', sy: ['Cough'] }],
      [{ zn: 'C', pm: '38', pmo: '9', vd: 'Heavy accumulation' }],
    ] as Zone[][]) {
      const state = investigate(zones)
      if (state.stage === 'concluded') {
        expect(state.nextStep).toBeNull()
        expect(state.discriminatingTests).toEqual([])
      }
    }
  })
})

// ── The discriminating test ───────────────────────────────────────────

describe('discriminating tests', () => {
  const zones: Zone[] = [{
    zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced', ot: ['Musty / Earthy'], oi: 4, sy: ['Headache', 'Cough'],
  }]

  it('only proposes a parameter that bears on one of the two, and is unmeasured', () => {
    const state = investigate(zones)
    const ranges = computeParameterRanges(zones, zones.map((z) => scoreZone(z, {})))
    const byName = new Map(state.hypotheses.map((h) => [h.name, h]))
    for (const t of state.discriminatingTests) {
      if (t.source !== 'hypothesis_sampling') continue
      const [ownerName, otherName] = t.between
      const owner = byName.get(ownerName)!
      const other = byName.get(otherName)!
      const param = (Object.keys(PARAMETER_METHOD) as ParameterKey[])
        .find((p) => PARAMETER_METHOD[p] === t.method)!
      expect(param, `no parameter owns the method "${t.method}"`).toBeDefined()
      expect(RULE_PARAMETERS[owner.ruleKey]).toContain(param)
      expect(RULE_PARAMETERS[other.ruleKey], 'the test does not discriminate — both predict it').not.toContain(param)
      const range = ranges[param]
      expect(!range || range.count === 0, `${param} was already measured`).toBe(true)
    }
  })

  it('pairs each parameter with the method that actually measures it', () => {
    // Regression: an earlier version fuzzy-matched the parameter name
    // against the leading hypothesis's sampling list and, on no match,
    // used the first entry — telling an assessor to measure relative
    // humidity with an Andersen impactor.
    const state = investigate(zones)
    for (const t of state.discriminatingTests) {
      if (t.source !== 'hypothesis_sampling') continue
      if (t.parameter === 'relative humidity') {
        expect(t.method).toMatch(/thermohygrometer/i)
        expect(t.method).not.toMatch(/impactor|spore trap|sorbent|DNPH/i)
      }
      if (t.parameter === 'carbon monoxide') expect(t.method).toMatch(/electrochemical/i)
      if (t.parameter === 'total VOCs') expect(t.method).toMatch(/TO-17|PID/i)
    }
  })

  it('states what each outcome would mean, naming both explanations', () => {
    const state = investigate(zones)
    expect(state.discriminatingTests.length).toBeGreaterThan(0)
    for (const t of state.discriminatingTests) {
      expect(t.discriminates).toContain(t.between[0])
      expect(t.discriminates).toContain(t.between[1])
    }
  })
})

// ── Open questions ────────────────────────────────────────────────────

describe('open questions', () => {
  it('ranks a question about the leading differential above one about a trailing one', () => {
    // Regression: sorting on how MANY differentials a question blocked put
    // five questions about trailing explanations ahead of the one holding
    // up the leader, and the cap then dropped the only one that mattered.
    const state = investigate([{
      zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced', ot: ['Musty / Earthy'], oi: 4,
      sy: ['Headache', 'Cough'], cx: 'Yes — complaints reported', ac: '6',
    }], { fc: 'Heavily loaded' })
    const leader = state.hypotheses.find((h) => h.leading)!
    expect(leader.ruleKey).toBe('hyp_ventilation')
    expect(state.openQuestions[0].blocks).toContain(leader.name)
    expect(state.openQuestions[0].id).toBe('ventilation_not_quantified')
  })

  it('carries the sampling plan\'s outdoor gaps through verbatim', () => {
    const zones: Zone[] = [{ zn: 'A', tv: '150', pm: '38', vd: 'Heavy accumulation' }]
    const gaps = generateSamplingPlan(zones, {}).outdoorGaps
    const state = investigate(zones)
    const questions = state.openQuestions.map((q) => q.question)
    for (const g of gaps) expect(questions).toContain(g)
  })
})

// ── Output hygiene ────────────────────────────────────────────────────

describe('output hygiene', () => {
  const CASES: Array<[string, Zone[], Zone]> = [
    ['empty', [], {}],
    ['clean', [{ zn: 'A', co2: '620', pm: '6', pmo: '9', rh: '44', tf: '74' }], {}],
    ['everything', [{
      zn: 'Everything', zone_subtype: 'data_hall', gaseous_corrosion: 'G3 (harsh)',
      co2: '2500', pm: '38', pmo: '9', tv: '900', co: '12', hc: '0.09', rh: '68', tf: '81',
      sa: 'No airflow detected', od: 'Stuck / inoperable', mi: 'Extensive (>30 sq ft)',
      wd: 'Active leak', ot: ['Musty / Earthy', 'Sewage'], oi: 5, vd: 'Heavy accumulation',
      sy: ['Headache', 'Cough', 'Dizziness'], cx: 'Yes — complaints reported', sr: 'Yes — clear pattern',
      cc: 'Yes — this zone', ac: '12', path_crosstalk: 'Sewer line adjacency',
    }], { fc: 'Heavily loaded', dp: 'Standing water with biological growth' }],
    ['sparse', [{ zn: 'A' }, { zn: 'B' }], {}],
  ]

  for (const [label, zones, bldg] of CASES) {
    it(`${label}: emits no NaN, undefined, or [object Object]`, () => {
      const json = JSON.stringify(investigate(zones, bldg))
      expect(json).not.toMatch(/NaN|undefined|\[object Object\]/)
    })

    it(`${label}: respects the payload caps`, () => {
      const state = investigate(zones, bldg)
      expect(state.discriminatingTests.length).toBeLessThanOrEqual(2)
      expect(state.openQuestions.length).toBeLessThanOrEqual(5)
      for (const h of state.hypotheses) {
        expect(h.evidence.length).toBeLessThanOrEqual(4)
        expect(h.rootCauses.length).toBeLessThanOrEqual(2)
      }
    })

    it(`${label}: every next step says what it would settle`, () => {
      const state = investigate(zones, bldg)
      if (state.nextStep) {
        expect(state.nextStep.action.trim().length).toBeGreaterThan(0)
        expect(state.nextStep.why.trim().length).toBeGreaterThan(0)
      }
    })
  }

  it('never uses "screening" as a label', () => {
    // Banned platform-wide as a caveat or chip. The word appears inside
    // engine-sourced text (condition types, sampling rationale) which this
    // file quotes verbatim; what it must not do is mint its own.
    const src = SRC('src/engine/investigation.ts')
    const strings = src.match(/'[^'\n]{12,}'/g) || []
    const minted = strings.filter((s) => /screening/i.test(s) && !/provisional_screening_level|_screening_|screening_/.test(s))
    expect(minted, `investigation.ts mints a "screening" label: ${minted.join(' | ')}`).toEqual([])
  })
})
