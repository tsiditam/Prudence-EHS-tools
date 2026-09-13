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
import {
  interpretProposals, eligibleQuestions, MAX_FACTS, MAX_QUESTIONS,
} from '../../src/engines/intake-interpreter.js'

const zoneWith = (over: any = {}) => ({ zn: 'Room 214', ...over })
const ctxFor = (text: string, zone: any = zoneWith(), bldg: any = {}) => ({
  assessment: { zones: [zone], presurvey: {}, bldg, recs: {}, zoneScores: [] },
  zoneIndex: 0,
  text,
})

// ─── Domain scenarios ──────────────────────────────────────────────────

describe('1. complaints', () => {
  it('records a stated complaint status and offers the follow-ups the catalog gates on it', () => {
    const text = 'Three people in this office say they get headaches by mid-afternoon.'
    const r = interpretProposals({
      facts: [{ field: 'cx', value: 'Yes — complaints reported', quote: 'say they get headaches' }],
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
    const text = 'Musty odor near the west wall, usually worse after rain. Staining on the drywall.'
    const r = interpretProposals({
      facts: [
        { field: 'op', value: 'Moderate persistent', quote: 'Musty odor near the west wall' },
        { field: 'wd', value: 'Old staining', quote: 'Staining on the drywall' },
      ],
      questions: [{ question_id: 'mi', reason: 'Musty odor with staining; mold indicators not recorded.' }],
    }, ctxFor(text))
    expect(r.facts.map((f) => f.field).sort()).toEqual(['op', 'wd'])
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
    const text = 'Sweet chemical smell by the elevators after the cleaning crew comes through.'
    const r = interpretProposals({
      facts: [{ field: 'op', value: 'Moderate persistent', quote: 'Sweet chemical smell by the elevators' }],
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
    const text = 'New carpet and millwork went in three weeks ago; there is fine dust on the sills.'
    const r = interpretProposals({
      facts: [{ field: 'vd', value: 'Light surface dust', quote: 'fine dust on the sills' }],
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
      facts: [{ field: 'vd', value: 'Light surface dust', quote: 'A  LITTLE   dust' }],
    }, ctxFor('There is a little dust on the sills.'))
    expect(r.facts.map((f) => f.field)).toEqual(['vd'])
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
    const text = 'light dust, musty smell, no water damage, comfortable, humid, dry air'
    const facts = [
      { field: 'vd', value: 'Light surface dust', quote: 'light dust' },
      { field: 'op', value: 'Moderate persistent', quote: 'musty smell' },
      { field: 'wd', value: 'None', quote: 'no water damage' },
      { field: 'tc', value: 'Comfortable', quote: 'comfortable' },
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
      facts: [{ field: 'vd', value: 'Light surface dust', quote: 'light dust' }],
      questions: [{ question_id: 'vd' }],
    }, ctxFor('there is light dust on the sills'))
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
