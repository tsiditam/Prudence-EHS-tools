/**
 * The recordable-field vocabulary, and the loop it closes.
 *
 * Two properties matter more than any individual case:
 *
 *   1. The vocabulary is READ from questions.js, never copied. A copy
 *      drifts, and a drifted option string is worse than a rejected one —
 *      the write appears to land while the engine, which matches these
 *      strings exactly, never sees it.
 *
 *   2. Every writable field is one an engine actually reads. A field
 *      nothing consumes is the free-text-note problem with extra steps:
 *      the assessor accepts, and nothing moves.
 *
 * The last block is the end-to-end proof: propose → validate → apply →
 * re-derive, asserting the investigation state actually changed.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

import {
  OBSERVABLE_FIELDS, getObservableField, validateObservation,
  formatObservation, describeObservableFields, SCOPE_ZONE, SCOPE_BUILDING,
} from '../../src/constants/observable-fields.js'
import { Q_ZONE, Q_BUILDING, Q_DETAILS, SENSOR_FIELDS } from '../../src/constants/questions.js'
import { dispatchTool } from '../../src/constants/field-assistant-tools.js'
import { deriveInvestigation } from '../../src/engine/investigation'
import { scoreZone } from '../../src/engines/scoring'
import { buildCausalChains } from '../../src/engines/causalChains'
import { generateSamplingPlan } from '../../src/engines/sampling'

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

/**
 * Everything that ACTS on a recorded field value — the scoring and
 * reasoning engines, plus the report's parameter model, which is what
 * turns an outdoor baseline into a stated range and an indoor/outdoor
 * comparison. The list is kept to files that consume values, not files
 * that merely mention field names, so the guard still fails on a field
 * nothing does anything with.
 */
const CONSUMER_SOURCES = [
  'src/engines/scoring.js',
  'src/engines/causalChains.js',
  'src/engines/pressurization.js',
  'src/engines/sampling.js',
  'src/engines/escalation.js',
  'src/engine/hypotheses.ts',
  'src/engine/report/parameter-ranges.ts',
].map(SRC).join('\n')

describe('the vocabulary comes from the schema', () => {
  const schemaIds = new Set([
    ...SENSOR_FIELDS.map((f: any) => f.id),
    ...[...Q_ZONE, ...Q_BUILDING, ...Q_DETAILS].map((q: any) => q.id),
  ])

  it('every writable field exists in questions.js', () => {
    for (const f of OBSERVABLE_FIELDS) {
      expect(schemaIds.has(f.id), `"${f.id}" is writable but not defined in questions.js`).toBe(true)
      expect(f.kind, `"${f.id}" resolved to an unknown kind`).not.toBe('unknown')
    }
  })

  it('every choice / multi field carries the schema\'s exact option list', () => {
    const byId = new Map<string, any>()
    for (const q of [...Q_ZONE, ...Q_BUILDING, ...Q_DETAILS]) if (!byId.has(q.id)) byId.set(q.id, q)
    for (const f of OBSERVABLE_FIELDS) {
      if (f.kind === 'number') continue
      const q = byId.get(f.id)!
      expect(f.opts, `"${f.id}" has no options`).toBeTruthy()
      expect([...f.opts!], `"${f.id}" options diverge from questions.js`).toEqual([...q.opts])
    }
  })

  const isConsumed = (id: string) =>
    new RegExp(`['"\`]${id}['"\`]`).test(CONSUMER_SOURCES)
    || new RegExp(`\\bd\\.${id}\\b`).test(CONSUMER_SOURCES)
    || new RegExp(`\\bz\\.${id}\\b`).test(CONSUMER_SOURCES)

  it('every writable field is consumed by an engine or the report parameter model', () => {
    for (const f of OBSERVABLE_FIELDS) {
      expect(
        isConsumed(f.id),
        `"${f.id}" is writable but nothing consumes it — accepting it would change nothing, which is the free-text-note problem with extra steps`,
      ).toBe(true)
    }
  })

  it('and the guard would notice a field nothing consumes', () => {
    // Without this, broadening CONSUMER_SOURCES to fix a false negative
    // could quietly make the check above vacuous.
    for (const invented of ['zz_not_a_field', 'observation_placeholder']) {
      expect(isConsumed(invented)).toBe(false)
    }
  })

  it('excludes zone identity and geometry', () => {
    // Setup, not observation. oc and sf feed the ventilation calculation,
    // so a mis-transcribed value moves a number with nothing to show for it.
    for (const id of ['zn', 'sf', 'oc', 'su', 'znt', 'meas_time', 'pid_rf']) {
      expect(getObservableField(id), `"${id}" should not be writable`).toBeNull()
    }
  })

  it('scopes each field to the record the engine reads it from', () => {
    // sa / od / fc / dp / fm / hm are Q_BUILDING fields. Writing them onto
    // a zone puts them where deriveHypotheses cannot see them.
    for (const id of ['sa', 'od', 'fc', 'dp', 'fm', 'hm']) {
      expect(getObservableField(id)!.scope, `${id} is a building field`).toBe(SCOPE_BUILDING)
    }
    for (const id of ['co2', 'rh', 'mi', 'wd', 'sy', 'ot']) {
      expect(getObservableField(id)!.scope, `${id} is a zone field`).toBe(SCOPE_ZONE)
    }
  })

  it('the prompt catalog is generated, and lists every field with its values', () => {
    const block = describeObservableFields()
    for (const f of OBSERVABLE_FIELDS) {
      expect(block).toContain(`${f.id} — ${f.label}`)
      if (f.opts) for (const o of f.opts) expect(block, `${f.id} is missing option "${o}"`).toContain(o)
    }
  })
})

describe('validation', () => {
  it('normalises a loose value to the schema\'s exact string', () => {
    const r: any = validateObservation('mi', 'extensive (> 100 SQ FT)')
    expect(r.ok).toBe(true)
    expect(r.value).toBe('Extensive (> 100 sq ft)')
  })

  it('rejects a paraphrase rather than guessing', () => {
    const r: any = validateObservation('mi', 'quite a lot of mould')
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid_option')
    expect(r.allowed).toContain('Extensive (> 100 sq ft)')
  })

  it('rejects a field outside the catalog', () => {
    expect(validateObservation('sf', '900').ok).toBe(false)
    expect(validateObservation('composite_score', '42').ok).toBe(false)
  })

  it('stores numbers as strings, the shape the wizard writes', () => {
    const r: any = validateObservation('co2', 1450)
    expect(r.ok).toBe(true)
    expect(r.value).toBe('1450')
    expect(typeof r.value).toBe('string')
  })

  it('rejects a physically impossible reading, and says it is not a threshold', () => {
    const r: any = validateObservation('rh', 250)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('out_of_range')
    expect(r.message).toMatch(/not a threshold/i)
    // The bound must not be mistaken for a criterion: a legitimately
    // elevated reading has to pass.
    expect(validateObservation('rh', 68).ok).toBe(true)
    expect(validateObservation('co2', 4500).ok).toBe(true)
    expect(validateObservation('co', 180).ok).toBe(true)
  })

  it('takes a list for multi-select and rejects one bad member', () => {
    expect((validateObservation('sy', ['Headache', 'Cough']) as any).value).toEqual(['Headache', 'Cough'])
    expect(validateObservation('sy', ['Headache', 'Spontaneous combustion']).ok).toBe(false)
  })

  it('never throws, whatever it is handed', () => {
    for (const [f, v] of [
      [undefined, undefined], [null, null], ['', ''], ['co2', {}], ['co2', []],
      ['sy', null], ['mi', 42], ['co2', 'NaN'], ['co2', Infinity],
    ] as any[]) {
      expect(() => validateObservation(f, v)).not.toThrow()
    }
  })

  it('formats a value the way the accept card shows it', () => {
    expect(formatObservation(getObservableField('co2'), '1450')).toBe('1450 ppm')
    expect(formatObservation(getObservableField('sy'), ['Headache', 'Cough'])).toBe('Headache, Cough')
  })
})

describe('propose_action carries the write', () => {
  it('proposes a validated write with its scope and a readable summary', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'dp', value: 'standing water',
    }, {})
    expect(r.status).toBe('proposed')
    expect(r.action).toMatchObject({
      type: 'record_zone_observation', field: 'dp', value: 'Standing water', scope: 'building',
    })
    expect(r.summary).toContain('Standing water')
  })

  it('rejects before the assessor is ever shown an Accept button', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'mi', value: 'some mold',
    }, {})
    expect(r.status).toBe('rejected')
    expect(r.allowed_values).toBeTruthy()
  })

  it('tells the model the state has NOT moved yet', async () => {
    const r: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'co2', value: 1450,
    }, {})
    expect(r.message).toMatch(/has NOT moved/)
  })
})

// ── The loop ──────────────────────────────────────────────────────────

describe('an accepted write moves the investigation', () => {
  type Zone = Record<string, any>

  function investigate(zones: Zone[], bldg: Zone) {
    const zoneScores = zones.map((z) => scoreZone(z, bldg))
    return deriveInvestigation({
      zonesData: zones, buildingData: bldg, zoneScores,
      causalChains: buildCausalChains(zones, bldg, zoneScores),
      samplingPlan: generateSamplingPlan(zones, bldg),
    })
  }

  /** Apply a proposed action exactly as MobileApp's executor does. */
  function apply(action: any, zones: Zone[], bldg: Zone, curZone = 0) {
    const OUTDOOR = new Set(['co2o', 'tfo', 'rho', 'pmo', 'tvo'])
    if (action.scope === 'building') return { zones, bldg: { ...bldg, [action.field]: action.value } }
    if (OUTDOOR.has(action.field)) {
      return { zones: zones.map((z) => ({ ...z, [action.field]: action.value })), bldg }
    }
    const next = zones.slice()
    next[curZone] = { ...next[curZone], [action.field]: action.value }
    return { zones: next, bldg }
  }

  it('a recorded humidity reading resolves an untested differential', async () => {
    const zones: Zone[] = [{
      zn: 'Suite 200', co2: '1450', ot: ['Musty / Earthy'], op: 'Moderate persistent', sy: ['Cough'],
    }]
    const bldg: Zone = { sa: 'Weak / reduced' }

    const before = investigate(zones, bldg)
    const bioBefore = before.hypotheses.find((h) => h.ruleKey === 'hyp_bioaerosol')!
    expect(bioBefore.status).toBe('untested')
    expect(bioBefore.untestedParameters).toContain('rh')

    const proposal: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'rh', value: 68,
    }, {})
    expect(proposal.status).toBe('proposed')

    const applied = apply(proposal.action, zones, bldg)
    const after = investigate(applied.zones, applied.bldg)

    const bioAfter = after.hypotheses.find((h) => h.ruleKey === 'hyp_bioaerosol')!
    expect(bioAfter.status).toBe('supported_by_measurement')
    expect(bioAfter.untestedParameters).not.toContain('rh')
    expect(bioAfter.evidence.some((e) => e.source === 'measurement' && e.direction === 'supports')).toBe(true)
    // The whole point: the next step is no longer the same next step.
    expect(JSON.stringify(after.nextStep)).not.toBe(JSON.stringify(before.nextStep))
  })

  it('a clean reading weakens a differential instead of leaving it open', async () => {
    const zones: Zone[] = [{ zn: 'Suite 200', sy: ['Headache'] }]
    const bldg: Zone = {}
    const before = investigate(zones, bldg)
    expect(before.hypotheses.find((h) => h.ruleKey === 'hyp_combustion')!.status).toBe('untested')

    const proposal: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'co', value: 0.4,
    }, {})
    const applied = apply(proposal.action, zones, bldg)
    const after = investigate(applied.zones, applied.bldg)

    const combustion = after.hypotheses.find((h) => h.ruleKey === 'hyp_combustion')!
    expect(combustion.status).toBe('not_supported_by_measurement')
    expect(combustion.leading).toBe(false)
    expect(combustion.evidence.some((e) => e.direction === 'opposes')).toBe(true)
  })

  it('a building-scoped write reaches the rule that reads it', async () => {
    const zones: Zone[] = [{ zn: 'Suite 200' }, { zn: 'Suite 210' }]
    const before = investigate(zones, {})
    expect(before.hypotheses.some((h) => h.ruleKey === 'hyp_ventilation')).toBe(false)

    const proposal: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'od', value: 'Stuck / inoperable',
    }, {})
    expect(proposal.action.scope).toBe('building')
    const applied = apply(proposal.action, zones, {})
    const after = investigate(applied.zones, applied.bldg)

    const vent = after.hypotheses.find((h) => h.ruleKey === 'hyp_ventilation')
    expect(vent, 'a building-level damper reading must reach the ventilation rule').toBeDefined()
    // One observation, one indicator — not one per zone.
    expect(vent!.evidence.filter((e) => e.source === 'observation')).toHaveLength(1)
  })

  it('an outdoor baseline reaches every zone, not just the open one', async () => {
    const zones: Zone[] = [
      { zn: 'A', pm: '38', vd: 'Heavy accumulation' },
      { zn: 'B', pm: '31' },
    ]
    const proposal: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'pmo', value: 9,
    }, {})
    const applied = apply(proposal.action, zones, {})
    expect(applied.zones.every((z) => z.pmo === '9'), 'outdoor baseline must propagate').toBe(true)
  })

  it('a rejected value changes nothing', async () => {
    const zones: Zone[] = [{ zn: 'Suite 200', co2: '1450' }]
    const before = investigate(zones, {})
    const proposal: any = await dispatchTool('propose_action', {
      action_type: 'record_zone_observation', field: 'mi', value: 'a fair bit of mould',
    }, {})
    expect(proposal.status).toBe('rejected')
    expect(proposal.action).toBeUndefined()
    expect(JSON.stringify(investigate(zones, {}))).toBe(JSON.stringify(before))
  })
})
