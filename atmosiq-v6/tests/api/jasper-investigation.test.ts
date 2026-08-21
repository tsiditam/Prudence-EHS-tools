/**
 * Jasper's investigation mode — the tool, the prompt contract, and the
 * seam between them.
 *
 * The engine's own behaviour is covered in
 * tests/engine/investigation.test.ts. What matters here is that the agent
 * cannot get a DIFFERENT answer than the engine gave: the dispatcher must
 * pass the state through untouched, the prompt must forbid inventing
 * differentials, and the always-on context block must not carry a second
 * copy of the reasoning for the model to paraphrase from.
 */
import { describe, it, expect } from 'vitest'

import { FIELD_ASSISTANT_TOOLS, dispatchTool } from '../../src/constants/field-assistant-tools.js'
import { OBSERVABLE_FIELDS } from '../../src/constants/observable-fields.js'
import { FIELD_ASSISTANT_ROLE_PROMPT } from '../../src/constants/field-assistant-prompt.js'
import { buildJasperContext } from '../../lib/context/buildJasperContext'
import { deriveInvestigation } from '../../src/engine/investigation'
import { scoreZone } from '../../src/engines/scoring'
import { buildCausalChains } from '../../src/engines/causalChains'
import { generateSamplingPlan } from '../../src/engines/sampling'
import { __test } from '../../api/field-assistant'

const { buildSystemBlocks } = __test

const ZONES = [{
  zn: 'Suite 200', co2: '1450', sa: 'Weak / reduced', ot: ['Musty / Earthy'], oi: 4,
  sy: ['Headache', 'Cough'], cx: 'Yes — complaints reported', ac: '6',
}]
const BLDG = { fn: 'Test Tower', fc: 'Heavily loaded' }

function liveState() {
  const zoneScores = ZONES.map((z) => scoreZone(z, BLDG))
  return deriveInvestigation({
    zonesData: ZONES,
    buildingData: BLDG,
    zoneScores,
    causalChains: buildCausalChains(ZONES, BLDG, zoneScores),
    samplingPlan: generateSamplingPlan(ZONES, BLDG),
  })
}

describe('assess_investigation — tool registration', () => {
  const tool = FIELD_ASSISTANT_TOOLS.find((t: any) => t.name === 'assess_investigation')

  it('is registered', () => {
    expect(tool).toBeDefined()
  })

  it('takes no arguments — the state is read, never parameterised', () => {
    expect(tool.input_schema.type).toBe('object')
    expect(tool.input_schema.properties).toEqual({})
    expect(tool.input_schema.required).toEqual([])
  })

  it('tells the model where the differentials come from', () => {
    expect(tool.description).toMatch(/deterministic engine/i)
    expect(tool.description).toMatch(/do NOT introduce, rename, merge, or rank/i)
  })
})

describe('assess_investigation — dispatch', () => {
  it('reports no_assessment when no context was supplied', async () => {
    const r: any = await dispatchTool('assess_investigation', {}, {})
    expect(r.status).toBe('no_assessment')
    expect(r.message).toMatch(/general IAQ question/i)
  })

  it('reports no_assessment when the context carries no investigation', async () => {
    const r: any = await dispatchTool('assess_investigation', {}, { assessmentContext: { view: 'dash' } })
    expect(r.status).toBe('no_assessment')
  })

  it('reports no_assessment when the engine itself derived none', async () => {
    const empty = deriveInvestigation({ zonesData: [], buildingData: {} })
    const r: any = await dispatchTool('assess_investigation', {}, { assessmentContext: { investigation: empty } })
    expect(r.status).toBe('no_assessment')
  })

  it('passes the engine\'s state through without altering it', async () => {
    const state = liveState()
    const r: any = await dispatchTool('assess_investigation', {}, { assessmentContext: { investigation: state } })
    expect(r.status).toBe('ok')
    expect(r.stage).toBe(state.stage)
    expect(r.rationale).toBe(state.rationale)
    expect(r.hypotheses).toEqual(state.hypotheses)
    expect(r.discriminating_tests).toEqual(state.discriminatingTests)
    expect(r.open_questions).toEqual(state.openQuestions)
    expect(r.next_step).toEqual(state.nextStep)
  })

  it('ships the reading rules the model has to follow', async () => {
    const r: any = await dispatchTool('assess_investigation', {}, { assessmentContext: { investigation: liveState() } })
    const rules = r.usage_rules.join(' ')
    expect(rules).toMatch(/complete set of live explanations/i)
    expect(rules).toMatch(/untested/i)
    expect(rules).toMatch(/not_supported_by_measurement/i)
    expect(rules).toMatch(/concluded/i)
  })

  it('never throws, whatever shape the context is', async () => {
    for (const ctx of [
      undefined, null, {}, { assessmentContext: null }, { assessmentContext: 'nope' },
      { assessmentContext: { investigation: 'nope' } },
      { assessmentContext: { investigation: { stage: 'differential' } } },
    ] as any[]) {
      const r: any = await dispatchTool('assess_investigation', {}, ctx)
      expect(['ok', 'no_assessment']).toContain(r.status)
    }
  })
})

describe('the context the agent is handed', () => {
  it('carries an investigation once zones exist', () => {
    const ctx: any = buildJasperContext({
      view: 'wizard', zones: ZONES, bldg: BLDG, curZone: 0,
      zoneScores: ZONES.map((z) => scoreZone(z, BLDG)),
      causalChains: buildCausalChains(ZONES, BLDG, ZONES.map((z) => scoreZone(z, BLDG))),
      samplingPlan: generateSamplingPlan(ZONES, BLDG),
    } as any)
    expect(ctx.investigation).toBeTruthy()
    expect(ctx.investigation.hypotheses.length).toBeGreaterThan(0)
  })

  it('derives it fresh — two builds of the same state agree exactly', () => {
    const input: any = { view: 'wizard', zones: ZONES, bldg: BLDG, curZone: 0, zoneScores: ZONES.map((z) => scoreZone(z, BLDG)) }
    const a: any = buildJasperContext(input)
    const b: any = buildJasperContext(input)
    expect(JSON.stringify(a.investigation)).toBe(JSON.stringify(b.investigation))
  })

  it('degrades to null rather than throwing on a partial draft', () => {
    expect((buildJasperContext({} as any) as any).investigation).toBeNull()
    expect((buildJasperContext({ zones: [{}] } as any) as any).investigation).toBeTruthy()
  })

  it('keeps the reasoning OUT of the always-on prompt block', () => {
    // The state is served by the tool. A second copy in the preamble is a
    // copy the model paraphrases from memory three turns later.
    const state = liveState()
    const blocks: any[] = buildSystemBlocks({ view: 'wizard', investigation: state, bldg: BLDG } as any)
    const dynamic = blocks[blocks.length - 1].text as string
    expect(dynamic).not.toContain(state.rationale)
    for (const h of state.hypotheses) expect(dynamic).not.toContain(h.name)
    expect(dynamic).toMatch(/call assess_investigation to read it/i)
  })

  it('says nothing about an investigation when there is none', () => {
    const blocks: any[] = buildSystemBlocks({ view: 'dash' } as any)
    const dynamic = blocks[blocks.length - 1].text as string
    expect(dynamic).not.toMatch(/assess_investigation/i)
  })
})

describe('the prompt contract', () => {
  it('counts its tools correctly', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('You have nine tools available:')
    expect(FIELD_ASSISTANT_TOOLS.length).toBe(9)
  })

  it('documents every registered tool by name', () => {
    for (const t of FIELD_ASSISTANT_TOOLS as any[]) {
      expect(FIELD_ASSISTANT_ROLE_PROMPT, `${t.name} is registered but undocumented in the prompt`).toContain(t.name)
    }
  })

  it('carries the investigation protocol', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# Investigation protocol')
  })

  it('forbids inventing, renaming, merging, dropping, or reordering differentials', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Investigation protocol')[1].split('\n# ')[0]
    expect(section).toMatch(/Do not add one, rename one, merge two, or quietly drop one/i)
    expect(section).toMatch(/Do not reorder them/i)
    expect(section).toMatch(/Do not call the investigation settled unless stage is "concluded"/i)
  })

  it('distinguishes untested from ruled out', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Investigation protocol')[1].split('\n# ')[0]
    expect(section).toMatch(/"untested" means nobody has measured against it — not that it has been ruled out/i)
    expect(section).toMatch(/does not disprove it/i)
  })

  it('caps the interrogation at one question a turn', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Investigation protocol')[1].split('\n# ')[0]
    expect(section).toMatch(/at most one question per turn/i)
  })

  it('routes new field information back through the record, not into agent memory', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Investigation protocol')[1].split('\n# ')[0]
    expect(section).toMatch(/propose_action/i)
    expect(section).toMatch(/Do not keep your own running list of hypotheses between turns/i)
  })

  it('carries the recording protocol', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# Recording what the assessor tells you')
  })

  it('says plainly that a note does not reach the engine', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Recording what the assessor tells you')[1].split('\n# ')[0]
    expect(section).toMatch(/no engine reads a note/i)
    expect(section).toMatch(/A note is the fallback, not the default/i)
  })

  it('forbids inventing a value and forbids retrying a rejected one', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Recording what the assessor tells you')[1].split('\n# ')[0]
    expect(section).toMatch(/Do not round one into an evidence record/i)
    expect(section).toMatch(/do not retry with a different guess/i)
  })

  it('forbids claiming the state moved before the assessor accepts', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Recording what the assessor tells you')[1].split('\n# ')[0]
    expect(section).toMatch(/Nothing is recorded until they tap/i)
    expect(section).toMatch(/do not re-run assess_investigation in the same turn/i)
  })

  it('lists every recordable field with its allowed values, generated from the schema', () => {
    for (const f of OBSERVABLE_FIELDS as any[]) {
      expect(FIELD_ASSISTANT_ROLE_PROMPT, `${f.id} missing from the prompt catalog`).toContain(`${f.id} — ${f.label}`)
      if (f.opts) {
        for (const o of f.opts) {
          expect(FIELD_ASSISTANT_ROLE_PROMPT, `${f.id} option "${o}" missing from the prompt`).toContain(o)
        }
      }
    }
  })

  it('tells the model to stand down when nothing is loaded', () => {
    const section = FIELD_ASSISTANT_ROLE_PROMPT.split('# Investigation protocol')[1].split('\n# ')[0]
    expect(section).toMatch(/status:no_assessment/i)
    expect(section).toMatch(/no differentials, no stage, and no next step/i)
  })
})
