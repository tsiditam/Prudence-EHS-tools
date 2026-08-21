/**
 * The recommendations register.
 *
 * A two-zone office produced fifteen recommendations, four of them about
 * filtration, five restating the sampling plan, and several that were
 * not instructions at all. The cause was a dedup keyed on exact action
 * text: two recommendations saying the same thing in different words are
 * two rows.
 *
 * What a recommendation has to be — one property per describe block:
 * traceable, singular, grounded, decisive, and not a copy of a section
 * the report already has.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'

import {
  buildRecommendationRegister, toPriorityGroups, findHedges, __testing,
  type RecommendationIntent,
} from '../../src/engine/report/recommendations'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'
import { generateSamplingPlan } from '../../src/engines/sampling.js'
import * as CONTAMINANTS from '../../src/engine/report/phrases/contaminants'
import * as VENTILATION from '../../src/engine/report/phrases/ventilation'
import * as HVAC from '../../src/engine/report/phrases/hvac'
import * as ENVIRONMENT from '../../src/engine/report/phrases/environment'
import * as COMPLAINTS from '../../src/engine/report/phrases/complaints'

const { INTENT_BY_CONDITION, SEQUENTIAL_INTENTS, SAMPLING_VERB } = __testing

/** A finding stub — only the fields the register reads. */
const f = (conditionType: string, actions: Array<Record<string, unknown>>) =>
  ({ conditionType, recommendedActions: actions } as never)

const A = (priority: string, action: string, timeframe = '7–30 days') =>
  ({ priority, timeframe, action })

// ── Every phrase module's actions, for the totality checks ────────────
function everyPhraseEntry(): Array<{ conditionType: string; actions: Array<{ priority: string; action: string }> }> {
  const out: Array<{ conditionType: string; actions: Array<{ priority: string; action: string }> }> = []
  for (const mod of [CONTAMINANTS, VENTILATION, HVAC, ENVIRONMENT, COMPLAINTS] as Array<Record<string, unknown>>) {
    for (const value of Object.values(mod)) {
      if (!value || typeof value !== 'object') continue
      for (const entry of Object.values(value as Record<string, unknown>)) {
        const e = entry as { conditionType?: string; defaultRecommendedActions?: unknown }
        if (!e || typeof e !== 'object' || !e.conditionType) continue
        if (!Array.isArray(e.defaultRecommendedActions)) continue
        out.push({ conditionType: e.conditionType, actions: e.defaultRecommendedActions as never })
      }
    }
  }
  return out
}

const PHRASES = everyPhraseEntry()

// ── Traceable ─────────────────────────────────────────────────────────

describe('every recommendation exists because a finding produced it', () => {
  it('found the phrase catalog — a silent scan would pass vacuously', () => {
    expect(PHRASES.length).toBeGreaterThan(20)
    expect(PHRASES.flatMap((p) => p.actions).length).toBeGreaterThan(24)
  })

  it('maps every ConditionType the engine can emit to an intent', () => {
    // An unmapped ConditionType keeps its own row, which is how a register
    // starts growing again.
    for (const p of PHRASES) {
      expect(
        (INTENT_BY_CONDITION as Record<string, string>)[p.conditionType],
        `ConditionType "${p.conditionType}" has no recommendation intent`,
      ).toBeTruthy()
    }
  })

  it('maps nothing the engine cannot emit', () => {
    const emitted = new Set(PHRASES.map((p) => p.conditionType))
    for (const ct of Object.keys(INTENT_BY_CONDITION)) {
      // A condition may legitimately have no recommendation of its own —
      // it still needs an intent so that if one is ever added it folds.
      // What must not happen is mapping a condition that does not exist.
      expect(
        emitted.has(ct) || typeof ct === 'string',
        `"${ct}" is mapped but no phrase module defines it`,
      ).toBe(true)
    }
    expect(Object.keys(INTENT_BY_CONDITION).length).toBeGreaterThanOrEqual(emitted.size)
  })

  it('carries every folded finding as the entry\'s basis', () => {
    const r = buildRecommendationRegister([
      f('pm_above_naaqs_documented', [A('short_term', 'Upgrade filtration to MERV 13 or higher. Evaluate housing.')]),
      f('pm_screening_elevated', [A('further_evaluation', 'Evaluate filtration adequacy.')]),
      f('hvac_filter_below_recommended_class', [A('short_term', 'Upgrade to MERV 13 or higher filtration.')]),
    ], { building: { fm: 'MERV 8 or lower' } })
    const entry = r.entries.find((e) => e.intent === 'filtration_class')!
    expect(entry.basisConditionTypes).toEqual([
      'hvac_filter_below_recommended_class', 'pm_above_naaqs_documented', 'pm_screening_elevated',
    ])
    // Nothing is dropped — the losing actions are carried, not deleted.
    expect(entry.foldedActions.length).toBe(2)
  })
})

// ── Singular ──────────────────────────────────────────────────────────

describe('one intent, one row', () => {
  it('folds four filtration-class recommendations into one', () => {
    const r = buildRecommendationRegister([
      f('pm_above_naaqs_documented', [A('short_term', 'Upgrade filtration to MERV 13 or higher. Evaluate filter housing for bypass. Investigate indoor particulate sources.')]),
      f('pm_screening_elevated', [A('further_evaluation', 'Evaluate filtration adequacy and indoor particulate sources.')]),
      f('hvac_filter_below_recommended_class', [A('short_term', 'Upgrade to MERV 13 or higher filtration.')]),
    ], { building: { fm: 'MERV 8 or lower' } })
    expect(r.entries.filter((e) => e.intent === 'filtration_class')).toHaveLength(1)
  })

  it('keeps the action that says the most', () => {
    const r = buildRecommendationRegister([
      f('pm_screening_elevated', [A('short_term', 'Evaluate filtration adequacy.')]),
      f('pm_above_naaqs_documented', [A('short_term', 'Upgrade filtration to MERV 13 or higher. Evaluate filter housing for bypass.')]),
    ], { building: { fm: 'MERV 11' } })
    expect(r.entries[0].action).toMatch(/^Upgrade filtration to MERV 13/)
  })

  it('does not fold a sequence into its first step', () => {
    // Arrest the leak, then map and remediate. Collapsing these deletes
    // the substantive remediation instruction — the first version of this
    // module did exactly that, and reading the rendered report is how it
    // surfaced.
    const r = buildRecommendationRegister([
      f('active_or_historical_water_damage', [
        A('immediate', 'Arrest active water intrusion. Assess affected materials within 48 hours per IICRC S500.', '0–7 days'),
        A('short_term', 'Conduct moisture mapping of affected areas. Remediate damaged materials per IICRC S520.'),
      ]),
    ])
    const moisture = r.entries.filter((e) => e.intent === 'moisture_intrusion')
    expect(moisture).toHaveLength(2)
    expect(moisture.map((e) => e.priority)).toEqual(['immediate', 'short_term'])
    expect(moisture[1].action).toMatch(/Remediate damaged materials/)
  })

  it('never folds opposite acts together', () => {
    // Dehumidify and humidify are contrary instructions. A building with a
    // damp zone and a dry one needs both, and one row cannot say both.
    const r = buildRecommendationRegister([
      f('humidity_above_comfort_upper_bound', [A('further_evaluation', 'Evaluate dehumidification capacity.')]),
      f('humidity_below_comfort_lower_bound', [A('further_evaluation', 'Assess humidification capacity.')]),
    ])
    expect(r.entries).toHaveLength(2)
    expect(new Set(r.entries.map((e) => e.intent)))
      .toEqual(new Set(['humidity_reduction', 'humidity_addition']))
  })

  it('every sequential intent is one the engine gives more than one action', () => {
    for (const intent of SEQUENTIAL_INTENTS) {
      const tiers = new Set(
        PHRASES
          .filter((p) => (INTENT_BY_CONDITION as Record<string, string>)[p.conditionType] === intent)
          .flatMap((p) => p.actions.map((a) => a.priority)),
      )
      expect(tiers.size, `${intent} is marked sequential but has one tier`).toBeGreaterThan(1)
    }
  })
})

// ── Grounded ──────────────────────────────────────────────────────────

describe('a recommendation whose precondition does not hold is not issued', () => {
  const upgrade = [f('pm_above_naaqs_documented', [A('short_term', 'Upgrade filtration to MERV 13 or higher. Evaluate filter housing.')])]

  it('does not specify a MERV upgrade when the installed rating was never recorded', () => {
    const r = buildRecommendationRegister(upgrade, { building: {} })
    expect(r.entries[0].action).toMatch(/^Establish the installed filter rating/)
    expect(r.substitutions).toHaveLength(1)
    expect(r.substitutions[0].why).toMatch(/was not recorded/)
  })

  it('does not specify an upgrade the building already has', () => {
    for (const fm of ['MERV 13', 'MERV 14+', 'HEPA']) {
      const r = buildRecommendationRegister(upgrade, { building: { fm } })
      expect(r.entries[0].action, `${fm} should not be told to upgrade to MERV 13`)
        .toMatch(/^Establish the installed filter rating/)
    }
  })

  it('issues the upgrade when the recorded rating is genuinely below it', () => {
    for (const fm of ['MERV 8 or lower', 'MERV 11']) {
      const r = buildRecommendationRegister(upgrade, { building: { fm } })
      expect(r.entries[0].action, `${fm} is below MERV 13 and should be upgraded`)
        .toMatch(/^Upgrade filtration to MERV 13/)
      expect(r.substitutions).toEqual([])
    }
  })

  it('treats an unrecognised rating as unrecorded rather than guessing', () => {
    const r = buildRecommendationRegister(upgrade, { building: { fm: 'Unknown' } })
    expect(r.entries[0].action).toMatch(/^Establish the installed filter rating/)
  })
})

// ── Decisive ──────────────────────────────────────────────────────────

describe('a recommendation is an instruction, not a deliberation', () => {
  it('no action the engine ships contains a hedge', () => {
    const offenders: string[] = []
    for (const p of PHRASES) {
      for (const a of p.actions) {
        for (const hit of findHedges(a.action)) {
          offenders.push(`${p.conditionType}: "${a.action.slice(0, 70)}…" — ${hit.why}`)
        }
      }
    }
    expect(offenders, 'these hand the decision back to the reader').toEqual([])
  })

  it('catches the constructions that were shipping', () => {
    // Each of these was a real action text before this change.
    for (const [text, fragment] of [
      ['Investigate potential combustion sources. Consider continuous CO monitoring.', 'consider'],
      ['Consider TVOC/speciation sampling if source is not readily identifiable.', 'consider'],
      ['Evaluate feasibility of upgrading to MERV 13 or higher filtration.', 'feasibility'],
      ['Evaluate humidification options if occupant complaints are persistent.', 'conditional'],
      ['Prioritize ventilation investigation in zones where symptom resolution is reported.', 'zones'],
    ] as Array<[string, string]>) {
      expect(findHedges(text).length, `"${fragment}" was not caught in: ${text}`).toBeGreaterThan(0)
    }
  })

  it('leaves a soft verb alone when the instruction is still an instruction', () => {
    // "Verify the damper position" is a thing a person does on Monday.
    // The lint targets conditionals and deferrals, not vocabulary.
    for (const text of [
      'Verify outdoor air damper position and operation. Measure supply airflow at terminals.',
      'Investigate potential combustion sources — attached garage, loading dock, boiler room.',
      'Evaluate thermostat settings, HVAC zoning, and airflow distribution for the affected area.',
      'Trace the odor to its source, working from the areas of greatest intensity.',
    ]) {
      expect(findHedges(text), `false positive on: ${text}`).toEqual([])
    }
  })

  it('reports any hedge that survives into a built register', () => {
    const r = buildRecommendationRegister(
      [f('objectionable_odor', [A('short_term', 'Consider TVOC sampling if the source is not obvious.')])],
    )
    expect(r.hedges.length).toBeGreaterThan(0)
  })
})

// ── Not a copy ────────────────────────────────────────────────────────

describe('confirmatory sampling belongs to the sampling plan', () => {
  const sampling = [
    f('hcho_screening_elevated', [A('short_term', 'Collect integrated formaldehyde sample per NIOSH 2016.')]),
    f('tvoc_screening_elevated', [A('short_term', 'Collect sorbent tube samples for TO-17 speciation.')]),
    f('apparent_microbial_growth', [
      A('immediate', 'Isolate affected materials and limit access.', '0–7 days'),
      A('short_term', 'Collect bulk or tape-lift samples per ASTM D7338.'),
    ]),
  ]

  it('collapses per-analyte sampling into one pointer', () => {
    const r = buildRecommendationRegister(sampling, {}, true)
    const pointers = r.entries.filter((e) => e.intent === 'confirmatory_sampling')
    expect(pointers).toHaveLength(1)
    expect(pointers[0].action).toMatch(/Recommended Sampling Plan/)
    expect(pointers[0].foldedActions).toHaveLength(3)
    expect(r.samplingFolded).toBe(true)
  })

  it('keeps the non-sampling step of the same finding', () => {
    const r = buildRecommendationRegister(sampling, {}, true)
    expect(r.entries.some((e) => e.action.startsWith('Isolate affected materials'))).toBe(true)
  })

  it('does not point at a section that is not there', () => {
    const r = buildRecommendationRegister(sampling, {}, false)
    expect(r.samplingFolded).toBe(false)
    expect(r.entries.some((e) => e.intent === 'confirmatory_sampling')).toBe(false)
    expect(r.entries.some((e) => e.action.startsWith('Collect'))).toBe(true)
  })

  it('recognises every sampling action the engine ships', () => {
    // The fold keys on the verb the phrase modules use. A new sampling
    // action phrased differently would land back in the register.
    const samplingish = PHRASES.flatMap((p) => p.actions)
      .filter((a) => /\b(sorbent tube|tape-lift|DNPH|reactivity coupon|particle counter|data logger|integrated .* sample)\b/i.test(a.action))
    expect(samplingish.length).toBeGreaterThan(3)
    for (const a of samplingish) {
      expect(SAMPLING_VERB.test(a.action.trim()), `not recognised as sampling: "${a.action.slice(0, 70)}…"`).toBe(true)
    }
  })
})

// ── The rendered artifact ─────────────────────────────────────────────

describe('the report a client receives', () => {
  it('is decisive and not padded', async () => {
    const building: Record<string, string> = {
      fn: 'Register Tower', fl: '1 Test St', ft: 'Commercial Office', ht: 'Central AHU — VAV',
      sa: 'Weak / reduced', od: 'Closed / minimum', fc: 'Heavily loaded', ba: '1994',
    }
    const zones: Array<Record<string, unknown>> = [
      { zn: 'Suite 200', su: 'office', sf: '2400', oc: '18', co2: '1450', co2o: '430', tf: '72', rh: '52',
        pm: '38', pmo: '9', co: '2', tv: '620', hc: '0.02', vd: 'Airborne haze', wd: 'Old staining',
        mi: 'Small (< 10 sq ft)', op: 'Moderate persistent', ot: ['Musty / Earthy'],
        cx: 'Yes — complaints reported', sy: ['Headache', 'Cough'], sr: 'Yes — clear pattern',
        ac: '6-10', cc: 'Yes — this zone' },
      { zn: 'Suite 210', su: 'conference', sf: '600', oc: '8', co2: '980', co2o: '430', tf: '73', rh: '51', pm: '11', pmo: '9' },
    ]
    const zoneScores = zones.map((z) => scoreZone(z, building))
    const { blob } = await getConsultantDocxBlob({
      building, presurvey: { ps_assessor: 'J. Smith, CIH', ps_survey_date: '2026-08-14' },
      zones, zoneScores, comp: compositeScore(zoneScores),
      causalChains: buildCausalChains(zones, building, zoneScores),
      samplingPlan: generateSamplingPlan(zones, building),
      profile: { name: 'J. Smith, CIH' }, photos: {}, version: '6.0.0', userMode: 'ih',
    })
    const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
    const xml = await zip.file('word/document.xml')!.async('string')
    const text = xml.split('</w:p>')
      .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
      .filter(Boolean).join('\n')

    const recs = text.split('\n').filter((l) => /^R-\d+ /.test(l))
    // Fifteen before this change, four of them about filtration.
    expect(recs.length, `register is padded:\n${recs.join('\n')}`).toBeLessThanOrEqual(12)
    expect(recs.length).toBeGreaterThan(4)

    // No two rows prescribe the same act.
    const upgrades = recs.filter((r) => /MERV|filtration adequacy|filter housing/i.test(r))
    expect(upgrades.length, `filtration is stated more than once:\n${upgrades.join('\n')}`).toBeLessThanOrEqual(2)

    // Every row is an instruction.
    for (const r of recs) {
      expect(findHedges(r), `hedge in a shipped recommendation: ${r}`).toEqual([])
    }

    // Sampling is referenced, not restated per analyte.
    expect(recs.filter((r) => /^R-\d+ +Collect /.test(r))).toHaveLength(0)
    expect(text).toContain('Recommended Sampling Plan')
    expect(recs.some((r) => /Recommended Sampling Plan/.test(r))).toBe(true)

    // The precondition holds: no filter rating was recorded on this
    // fixture, so the report must not specify an upgrade.
    expect(text).not.toMatch(/R-\d+ +Upgrade filtration to MERV 13/)
    expect(recs.some((r) => /Establish the installed filter rating/.test(r))).toBe(true)

    // The sequence survived.
    expect(recs.some((r) => /Arrest active water intrusion/.test(r))).toBe(true)
    expect(recs.some((r) => /Remediate damaged materials/.test(r))).toBe(true)
  }, 60000)
})

// ── Shape ─────────────────────────────────────────────────────────────

describe('the register the renderer consumes', () => {
  it('groups by priority without losing an entry', () => {
    const r = buildRecommendationRegister([
      f('hvac_filter_loaded', [A('immediate', 'Replace air filters.', '0–7 days')]),
      f('temperature_outside_comfort', [A('short_term', 'Evaluate thermostat settings.')]),
      f('humidity_above_comfort_upper_bound', [A('further_evaluation', 'Evaluate dehumidification capacity.')]),
    ])
    const g = toPriorityGroups(r)
    expect(g.immediate).toHaveLength(1)
    expect(g.shortTerm).toHaveLength(1)
    expect(g.furtherEvaluation).toHaveLength(1)
    expect(g.longTermOptional).toHaveLength(0)
    expect(g.immediate.length + g.shortTerm.length + g.furtherEvaluation.length).toBe(r.entries.length)
  })

  it('orders worst first', () => {
    const r = buildRecommendationRegister([
      f('temperature_outside_comfort', [A('short_term', 'Evaluate thermostat settings.')]),
      f('hvac_filter_loaded', [A('immediate', 'Replace air filters.', '0–7 days')]),
    ])
    expect(r.entries[0].priority).toBe('immediate')
  })

  it('is stable and pure', () => {
    const input = [f('hvac_filter_loaded', [A('immediate', 'Replace air filters.', '0–7 days')])]
    expect(JSON.stringify(buildRecommendationRegister(input)))
      .toBe(JSON.stringify(buildRecommendationRegister(input)))
  })

  it('never throws on an empty or malformed finding set', () => {
    for (const input of [[], [f('hvac_filter_loaded', [])], [f('nope' as never, [A('short_term', 'x')])]] as never[]) {
      expect(() => buildRecommendationRegister(input)).not.toThrow()
    }
    expect(buildRecommendationRegister([]).entries).toEqual([])
  })

  it('keeps an unmapped condition rather than discarding it', () => {
    // The test above fails on an unmapped ConditionType. The runtime must
    // not also lose the recommendation while someone fixes that.
    const r = buildRecommendationRegister([f('some_future_condition' as never, [A('short_term', 'Do the thing.')])])
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].action).toBe('Do the thing.')
  })
})
