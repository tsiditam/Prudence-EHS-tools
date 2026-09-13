/**
 * Phase 2 spike — the safety envelope around free-text interpretation.
 *
 * Every test here runs WITHOUT a model. The scenarios feed the interpreter
 * what a model plausibly returns for a given field note and assert what
 * survives, because the risk in this feature is not the prompt — it is what
 * happens when the prompt is ignored. A guarantee that only holds when the
 * model cooperates is not a guarantee.
 *
 * Twelve scenarios across the five Phase 1 domains, then the negatives.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  interpretProposals, eligibleQuestions, ATTESTERS, MAX_FACTS, MAX_QUESTIONS,
} from '../../src/engines/intake-interpreter.js'
import { OBSERVABLE_FIELDS } from '../../src/constants/observable-fields.js'

const zoneWith = (over: any = {}) => ({ zn: 'Room 214', ...over })
const ctxFor = (text: string, zone: any = zoneWith(), bldg: any = {}) => ({
  assessment: { zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] },
  zoneIndex: 0,
  text,
})

// ─── Domain scenarios ──────────────────────────────────────────────────

describe('1. complaints', () => {
  it('records a stated complaint status and offers the follow-ups the catalog gates on it', () => {
    const text = 'Two occupants complained of headaches by mid-afternoon.'
    const r = interpretProposals({
      facts: [{ field: 'cx', value: 'Yes — complaints reported', quote: 'occupants complained of headaches' }],
      questions: [{ question_id: 'sy_time', reason: 'Time-of-day pattern is described but not recorded.' }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.field)).toEqual(['cx'])
    // sy_time is cond-gated on cx. It is NOT eligible yet, because cx is
    // still unanswered ON THE RECORD — the fact is a proposal, not a write.
    expect(r.questions).toEqual([])
    expect(r.rejected.find((x) => x.question_id === 'sy_time')?.reason).toBe('not_eligible')
  })

  it('once complaints are on the record, the gated follow-ups become proposable', () => {
    const zone = zoneWith({ cx: 'Yes — complaints reported' })
    const r = interpretProposals({
      questions: [{ question_id: 'sy_time', reason: 'Worst mid-afternoon, per the note.' }],
    }, ctxFor('worse by mid-afternoon', zone))
    expect(r.questions.map((q) => q.question_id)).toEqual(['sy_time'])
  })
})

describe('2. moisture / water intrusion', () => {
  it('maps a stated water-damage observation and leaves the weather relationship as a question', () => {
    // The Phase 2 case exactly: "worse after rain" maps to no field. It is
    // not discarded — it is why a moisture question is worth asking.
    const text = 'Musty odor near the west wall, usually worse after rain. Active leak under the sill.'
    const r = interpretProposals({
      facts: [
        // The reported attack: a REAL quote attached to a severity the
        // assessor never gave. "musty odor" states a smell, not its strength.
        { field: 'op', value: 'Strong / overpowering', quote: 'Musty odor near the west wall' },
        { field: 'wd', value: 'Active leak', quote: 'Active leak under the sill' },
      ],
      questions: [{ question_id: 'mi', reason: 'Musty odor with a leak; mold indicators not recorded.' }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.field)).toEqual(['wd'])
    expect(r.rejected.find((x) => x.field === 'op')?.reason).toBe('value_not_stated')
    expect(r.questions.map((q) => q.question_id)).toEqual(['mi'])
    // No diagnosis anywhere in the output shape — there is nowhere to put one.
    expect(JSON.stringify(r)).not.toMatch(/mold growth|likely|probably|caused by/i)
  })

  it('refuses a water-damage location the assessor never gave', () => {
    const r = interpretProposals({
      facts: [{ field: 'wl', value: 'Ceiling', quote: 'water damage somewhere in the room' }],
    }, ctxFor('There is water damage somewhere in the room.'))
    expect(r.facts).toEqual([])
    // wl is cond-gated on wd and wd is unanswered, so it is not writable here.
    expect(r.rejected[0].reason).toBeTruthy()
  })
})

describe('3. odor / source', () => {
  it('maps an odor and an internal source that were both stated', () => {
    const text = 'Faint chemical smell by the elevators after the cleaning crew comes through.'
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Faint / intermittent', quote: 'Faint chemical smell by the elevators' }],
      questions: [{ question_id: 'src_internal', reason: 'Cleaning activity named as a possible source.' }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.field)).toEqual(['op'])
    expect(r.questions.map((q) => q.question_id)).toEqual(['src_internal'])
  })

  it('does not promote a described source into a structured value nobody chose', () => {
    // "cleaning crew" is not one of src_internal's options. The model may ask
    // the question; it may not pick the answer.
    const r = interpretProposals({
      facts: [{ field: 'src_internal', value: 'Cleaning crew', quote: 'after the cleaning crew comes through' }],
    }, ctxFor('Sweet chemical smell after the cleaning crew comes through.'))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('invalid_option')
  })
})

describe('4. ventilation / HVAC', () => {
  it('refuses an occupant count as a fact and offers the question instead', () => {
    // `oc` is deliberately excluded from the writable catalog: it feeds the
    // ventilation calculation, so a mis-transcribed count moves a number
    // silently. The right behavior is to ask, not to fill.
    const text = 'Six occupants were in the room during the readings.'
    const r = interpretProposals({
      facts: [{ field: 'oc', value: '6', quote: 'Six occupants were in the room' }],
      questions: [{ question_id: 'oc', reason: 'Occupant count stated in the note but not recorded.' }],
    }, ctxFor(text))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('unknown_field')
    expect(r.questions.map((q) => q.question_id)).toEqual(['oc'])
  })

  it('accepts a measured airflow the assessor actually stated', () => {
    const text = 'Measured 18 cfm per person at the diffuser.'
    const r = interpretProposals({
      facts: [{ field: 'cfm_person', value: 18, quote: 'Measured 18 cfm per person' }],
    }, ctxFor(text))
    expect(r.facts).toEqual([
      { field: 'cfm_person', label: expect.any(String), value: '18', quote: 'Measured 18 cfm per person' },
    ])
  })

  it('refuses a number the note does not contain', () => {
    const r = interpretProposals({
      facts: [{ field: 'cfm_person', value: 18, quote: 'airflow seemed adequate at the diffuser' }],
    }, ctxFor('Airflow seemed adequate at the diffuser.'))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('number_not_stated')
  })

  it('accepts a number written as a word', () => {
    const r = interpretProposals({
      facts: [{ field: 'ach', value: 4, quote: 'about four air changes an hour' }],
    }, ctxFor('The balancer reported about four air changes an hour.'))
    expect(r.facts.map((f) => f.value)).toEqual(['4'])
  })
})

describe('5. renovation / construction', () => {
  it('maps a stated observation and asks about sources rather than concluding', () => {
    const text = 'New carpet and millwork went in three weeks ago; heavy accumulation of dust on the sills.'
    const r = interpretProposals({
      facts: [{ field: 'vd', value: 'Heavy accumulation', quote: 'heavy accumulation of dust on the sills' }],
      questions: [{ question_id: 'src_internal', reason: 'Recent materials named; internal sources not recorded.' }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.field)).toEqual(['vd'])
    expect(r.questions.map((q) => q.question_id)).toEqual(['src_internal'])
  })
})

// ─── Negatives ─────────────────────────────────────────────────────────

describe('negative: nothing new should be proposed', () => {
  it('a neutral note yields nothing', () => {
    const r = interpretProposals({ facts: [], questions: [] }, ctxFor('Walked the space, nothing remarkable.'))
    expect(r.facts).toEqual([])
    expect(r.questions).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('a zone with everything recorded has no eligible questions to offer', () => {
    // Nothing is eligible, so nothing the model returns can survive gate 1.
    const full: any = { zn: 'Z' }
    for (const q of eligibleQuestions({ zones: [{ zn: 'Z' }] } as any, 0)) full[q.id] = 'answered'
    const r = interpretProposals(
      { questions: [{ question_id: 'mi', reason: 'worth a look' }] },
      ctxFor('Something smells off.', full),
    )
    expect(eligibleQuestions({ zones: [full] } as any, 0)).toEqual([])
    expect(r.questions).toEqual([])
    expect(r.rejected[0].reason).toBe('not_eligible')
  })
})

describe('negative: ambiguity is not resolved into a value', () => {
  it('a hedged observation cannot become a structured option', () => {
    const r = interpretProposals({
      facts: [{ field: 'mi', value: 'Extensive', quote: 'might be some mold somewhere' }],
    }, ctxFor('There might be some mold somewhere behind the units.'))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('invalid_option')
  })
})

describe('negative: the field is already populated', () => {
  it('never re-proposes a value the assessor already entered', () => {
    const zone = zoneWith({ op: 'None' })
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Moderate persistent', quote: 'definite musty smell' }],
    }, ctxFor('There is a definite musty smell.', zone))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('field_already_answered')
  })

  it('and never re-asks an answered question', () => {
    const zone = zoneWith({ mi: 'None visible' })
    const r = interpretProposals({ questions: [{ question_id: 'mi' }] }, ctxFor('any mold?', zone))
    expect(r.questions).toEqual([])
    expect(r.rejected[0].reason).toBe('not_eligible')
  })
})

describe('negative: the model cannot invent a question', () => {
  it('an id outside the approved catalog is dropped', () => {
    const r = interpretProposals({
      questions: [{ question_id: 'MOIST-014', reason: 'Is the material currently wet, damp or dry?' }],
    }, ctxFor('Staining on the wall.'))
    expect(r.questions).toEqual([])
    expect(r.rejected[0].reason).toBe('not_eligible')
  })

  it('a question the condition currently hides stays hidden', () => {
    // `ot` is gated on op !== 'None'. With op recorded as None it is not
    // eligible, whatever the free text says.
    const zone = zoneWith({ op: 'None' })
    const r = interpretProposals({ questions: [{ question_id: 'ot' }] }, ctxFor('smells odd', zone))
    expect(r.questions).toEqual([])
    expect(r.rejected[0].reason).toBe('not_eligible')
  })
})

describe('negative: attestation', () => {
  it('a quote the assessor never wrote is refused', () => {
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Moderate persistent', quote: 'the room smelled strongly of mildew' }],
    }, ctxFor('Slight odor near the window.'))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('quote_not_in_text')
  })

  it('a fact with no quote at all is refused', () => {
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Moderate persistent' }],
    }, ctxFor('Musty smell in here.'))
    expect(r.rejected[0].reason).toBe('missing_quote')
  })

  it('quote matching tolerates case and whitespace, not content', () => {
    const r = interpretProposals({
      facts: [{ field: 'vd', value: 'Heavy accumulation', quote: 'HEAVY   accumulation' }],
    }, ctxFor('There is heavy accumulation on the sills.'))
    expect(r.facts.map((f) => f.field)).toEqual(['vd'])
  })
})

describe('negative: the VALUE must be attested, not just the quote', () => {
  it('a decimal point in a proposed number is not a regex wildcard', () => {
    // The quote is real and the digits look close enough to pass an
    // unescaped `18.5`, where the dot matches the "x". A serial number is
    // not a humidity reading.
    const text = 'Datalogger unit 18x5 was placed on the sill.'
    const r = interpretProposals({
      facts: [{ field: 'rh', value: 18.5, quote: 'unit 18x5 was placed' }],
    }, ctxFor(text))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('number_not_stated')
  })

  it('still accepts the decimal when the assessor actually wrote it', () => {
    const r = interpretProposals({
      facts: [{ field: 'rh', value: 18.5, quote: 'RH read 18.5%' }],
    }, ctxFor('RH read 18.5% at the desk.'))
    expect(r.facts.map((f) => f.value)).toEqual(['18.5'])
  })

  it('every member of a multi-select needs its own words', () => {
    // "Musty" is stated. "Sewage" is the model filling out a list.
    const text = 'Musty smell near the sink.'
    const r = interpretProposals({
      facts: [{ field: 'ot', value: ['Musty / Earthy', 'Sewage'], quote: 'Musty smell near the sink' }],
    }, ctxFor(text))
    expect(r.facts).toEqual([])
    expect(r.rejected[0]).toMatchObject({ reason: 'value_not_stated', detail: 'Sewage' })
  })

  it('accepts the multi-select once every member is named', () => {
    const text = 'Musty smell near the sink, and a sewage odor in the corridor.'
    const r = interpretProposals({
      facts: [{ field: 'ot', value: ['Musty / Earthy', 'Sewage'], quote: text }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.value)).toEqual([['Musty / Earthy', 'Sewage']])
  })

  it('a severity the assessor never graded is refused even from a perfect quote', () => {
    const text = 'There is a musty odor in here.'
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Strong / overpowering', quote: 'There is a musty odor in here' }],
    }, ctxFor(text))
    expect(r.facts).toEqual([])
    expect(r.rejected[0].reason).toBe('value_not_stated')
  })
})

describe('the attestation map is exhaustive over what is writable', () => {
  it('every writable field kind has an attestation rule', () => {
    // A kind with no rule is REFUSED at runtime, not waved through — but a
    // field nobody can propose is a feature that silently does not work, so
    // the gap should surface here rather than in the field.
    const kinds = [...new Set(OBSERVABLE_FIELDS.map((f) => f.kind))].sort()
    for (const k of kinds) {
      expect(ATTESTERS[k], `no attestation rule for kind "${k}"`).toBeTypeOf('function')
    }
    // Free text is absent from BOTH lists on purpose: no writable field is
    // free text, so an extractive rule would be unreachable code. If this
    // fails because `text` appeared above, write the rule then — against a
    // field that exists.
    expect(kinds).toEqual(['choice', 'multi', 'number'])
  })
})

describe('scope: the zone walkthrough, explicitly', () => {
  it('reads no questionnaire other than Q_ZONE', () => {
    // The pre-survey and building questionnaires are a different interview,
    // answered at a desk from records. Widening the catalog is a product
    // decision; this fails rather than letting it happen in a refactor.
    const src = readFileSync(new URL('../../src/engines/intake-interpreter.js', import.meta.url), 'utf8')
    const imported = [...src.matchAll(/^import \{([^}]*)\} from '([^']*questions\.js)'/gm)]
    expect(imported).toHaveLength(1)
    expect(imported[0][1].trim()).toBe('Q_ZONE')
    expect(imported[0][2]).toBe('../constants/questions.js')
    for (const other of ['Q_PRESURVEY', 'Q_BUILDING', 'Q_DETAILS', 'Q_QUICKSTART', 'Q_MOLD_ZONE', 'Q_MOLD_PRESURVEY']) {
      expect(src, `${other} is outside this interpreter's scope`).not.toContain(other)
    }
  })
})

describe('fail closed', () => {
  it('unparseable output proposes nothing', () => {
    const r = interpretProposals('{not json', ctxFor('anything'))
    expect(r).toMatchObject({ facts: [], questions: [], ok: false })
    expect(r.rejected[0].reason).toBe('unparseable_output')
  })

  it('a non-object response proposes nothing', () => {
    for (const bad of [null, undefined, 42, [], 'plain text']) {
      const r = interpretProposals(bad as never, ctxFor('anything'))
      expect(r.facts).toEqual([])
      expect(r.questions).toEqual([])
      expect(r.ok).toBe(false)
    }
  })

  it('missing arrays are treated as empty, not as an error', () => {
    const r = interpretProposals({}, ctxFor('anything'))
    expect(r).toMatchObject({ facts: [], questions: [], ok: true })
  })

  it('no active zone proposes nothing', () => {
    const r = interpretProposals({ facts: [{ field: 'op', value: 'None', quote: 'x' }] }, {
      assessment: { zones: [] }, zoneIndex: 0, text: 'x',
    })
    expect(r.ok).toBe(false)
    expect(r.rejected[0].reason).toBe('no_active_zone')
  })
})

describe('bounds', () => {
  it('caps facts and questions, rejecting the overflow rather than truncating silently', () => {
    const text = 'No visible dust, no unusual odor, no water damage, too cold in here.'
    const facts = [
      { field: 'vd', value: 'None', quote: 'No visible dust' },
      { field: 'op', value: 'None', quote: 'no unusual odor' },
      { field: 'wd', value: 'None', quote: 'no water damage' },
      { field: 'tc', value: 'Too cold', quote: 'too cold in here' },
    ]
    const r = interpretProposals({ facts }, ctxFor(text))
    expect(r.facts.length).toBeLessThanOrEqual(MAX_FACTS)
    expect(r.rejected.some((x) => x.reason === 'over_fact_limit')).toBe(true)
  })

  it('caps questions', () => {
    const ids = eligibleQuestions({ zones: [zoneWith()] } as any, 0).slice(0, MAX_QUESTIONS + 2)
    const r = interpretProposals({ questions: ids.map((q) => ({ question_id: q.id })) }, ctxFor('note'))
    expect(r.questions.length).toBe(MAX_QUESTIONS)
    expect(r.rejected.some((x) => x.reason === 'over_question_limit')).toBe(true)
  })

  it('drops a duplicate question id', () => {
    const r = interpretProposals({
      questions: [{ question_id: 'mi' }, { question_id: 'mi' }],
    }, ctxFor('note'))
    expect(r.questions.length).toBe(1)
    expect(r.rejected[0].reason).toBe('duplicate')
  })

  it('does not ask for what it is already offering to fill', () => {
    const r = interpretProposals({
      facts: [{ field: 'vd', value: 'None', quote: 'no visible dust' }],
      questions: [{ question_id: 'vd' }],
    }, ctxFor('There is no visible dust on the sills.'))
    expect(r.facts.map((f) => f.field)).toEqual(['vd'])
    expect(r.rejected.find((x) => x.question_id === 'vd')?.reason).toBe('superseded_by_fact')
  })
})

describe('eligibility is the deterministic layer, not the model', () => {
  it('offers only unanswered, currently-visible, simple questions', () => {
    const e = eligibleQuestions({ zones: [zoneWith({ cx: 'No complaints' })] } as any, 0)
    const ids = e.map((q) => q.id)
    expect(ids).toContain('mi')
    expect(ids).not.toContain('cx')          // answered
    expect(ids).not.toContain('sy')          // cond-gated on cx === Yes
    expect(ids).not.toContain('_sensors')    // a screen, not a question
    expect(ids).not.toContain('logger_deployment')
    expect(ids).not.toContain('src_detail')
  })

  it('flags questions a deterministic gap already names', () => {
    const e = eligibleQuestions({ zones: [zoneWith()], presurvey: {}, bldg: {} } as any, 0)
    expect(e.some((q) => q.deterministic)).toBe(true)
  })

  it('every proposal traces to a real catalog question', () => {
    const e = eligibleQuestions({ zones: [zoneWith()] } as any, 0)
    for (const q of e) {
      expect(q.id).toBeTruthy()
      expect(q.question).toBeTruthy()
    }
  })
})

describe('it cannot reach the engine', () => {
  it('proposes no severity, finding, criterion or conclusion', () => {
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Moderate persistent', quote: 'musty smell' }],
      questions: [{ question_id: 'mi' }],
      // Everything below is outside the contract and must not survive.
      severity: 'critical',
      finding: 'Mold growth is likely behind the west wall.',
      criterion: 'co2_action',
    } as never, ctxFor('there is a musty smell'))
    expect(Object.keys(r).sort()).toEqual(['facts', 'ok', 'questions', 'rejected'])
    expect(JSON.stringify(r)).not.toMatch(/critical|Mold growth is likely|co2_action/)
  })
})
