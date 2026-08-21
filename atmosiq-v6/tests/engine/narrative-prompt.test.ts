/**
 * Narrative prompt — the stakeholder-writing contract.
 *
 * The AI narrative layer is the one place in the product where prose is
 * not written by us, so the prompt IS the implementation. A CIH review of
 * a live narrative (Summani Plaza, 2026-08) found the engine selected and
 * ranked findings correctly and then communicated them badly: it opened
 * with a count of internal indicators, stacked four analytical steps into
 * one sentence, invoked a threshold from unnamed "screening literature",
 * jumped straight to a named laboratory method, printed an internal OSHA
 * classification "per the platform's logic", and asserted that two spot
 * readings put a space within ASHRAE 55.
 *
 * Each defect is pinned below. These are assertions about instructions,
 * not about model output — they cannot prove a narrative reads well, only
 * that the instruction which prevents each known failure is still present.
 * The model's actual output is guarded separately by the banned-language
 * scanner (api/_banned-language.js) on the server.
 */
import { describe, it, expect } from 'vitest'
import { REASONING_SYSTEM_PROMPT as P } from '../../src/engines/narrative.js'

describe('narrative prompt — structure', () => {
  it('orders the summary Finding -> Significance -> Action', () => {
    expect(P).toMatch(/\*\*Overall Finding\*\*/)
    expect(P).toMatch(/\*\*Recommended Next Steps\*\*/)
    expect(P.indexOf('**Overall Finding**')).toBeLessThan(P.indexOf('**Recommended Next Steps**'))
  })

  it('requires the plain-language claim before the numbers', () => {
    expect(P).toMatch(/plain language FIRST/)
    expect(P).toMatch(/supporting numbers AFTER/)
  })

  it('forbids opening on a count, a score, or a review request', () => {
    expect(P).toMatch(/Never open with a count of indicators, a score, a severity label, a request for professional review/)
  })

  it('forbids stacking the analytical steps into one sentence', () => {
    expect(P).toMatch(/Never stack a ratio, a criterion comparison, a guideline tier, and pathway speculation into a single sentence/)
  })

  it('requires an unidentified source to be stated as such', () => {
    expect(P).toMatch(/The source of these conditions was not identified during the assessment/)
    expect(P).toMatch(/An unidentified source is a finding, not an omission/)
  })
})

describe('narrative prompt — investigation before intervention', () => {
  it('separates further investigation from corrective action', () => {
    expect(P).toMatch(/\*\*Further investigation\*\*/)
    expect(P).toMatch(/\*\*Corrective action\*\*/)
    expect(P).toMatch(/never merge them/)
  })

  it('bars recommending a control for a source that has not been found', () => {
    expect(P).toMatch(/Do not recommend equipment, filtration, or remediation for a source that has not been found/)
  })

  it('makes a named analytical method a conditional escalation, never the opening step', () => {
    expect(P).toMatch(/TO-17/)
    expect(P).toMatch(/only as a conditional escalation/)
    expect(P).toMatch(/never as the opening step/)
  })
})

describe('narrative prompt — boundaries that produced the worst sentence', () => {
  it('forbids describing AtmosFlow, its logic, scores or classifications', () => {
    expect(P).toMatch(/Never describe AtmosFlow, its scoring, or its internal reasoning/)
    for (const term of ['defensibility', 'severity labels', 'confidence values', 'AtmosFlow AI chat']) {
      expect(P, `boundary 4 should name "${term}"`).toContain(term)
    }
  })

  it('forbids appealing to an unnamed source for a threshold', () => {
    expect(P).toMatch(/do not appeal to an unnamed authority|Never appeal to an unnamed authority/)
    for (const phrase of ['the literature', 'published guidance', 'commonly accepted ratios']) {
      expect(P, `should forbid "${phrase}"`).toContain(phrase)
    }
    // The indoor/outdoor comparison is the case that tempted it — the
    // prompt has to say that comparison needs no threshold at all.
    expect(P).toMatch(/without invoking any threshold for that comparison/)
  })

  it('forbids asserting comfort compliance from temperature and RH alone', () => {
    expect(P).toMatch(/Comfort parameters are not settled by two numbers/)
    expect(P).toMatch(/clothing insulation, metabolic rate, mean radiant temperature, and air speed/)
    expect(P).toMatch(/fall within ASHRAE 55 ranges/)   // named as the phrasing to avoid
    expect(P).toMatch(/did not identify a notable condition during the assessment/)
  })
})

describe('narrative prompt — plain-English register', () => {
  it('sets a newspaper register, not a consultant one', () => {
    expect(P).toMatch(/New York Times/)
    expect(P).toMatch(/building owner with no industrial-hygiene training/)
  })

  it('asks for short sentences and plain words', () => {
    expect(P).toMatch(/Short sentences/)
    expect(P).toMatch(/15 to 20 words/)
    expect(P).toMatch(/Plain words over technical ones/)
  })

  it('requires a term to be explained on first use', () => {
    expect(P).toMatch(/Explain a term the first time/)
    expect(P).toMatch(/Never leave an acronym unexplained on first use/)
  })

  it('requires a number to be given something to measure against', () => {
    expect(P).toMatch(/Give a number something to measure against/)
    expect(P).toMatch(/A bare figure does not/)
  })

  it('names the consultant tics to cut', () => {
    for (const tic of ['it should be noted', 'in order to', 'utilise', 'prior to', 'with respect to']) {
      expect(P, `should name "${tic}"`).toContain(tic)
    }
  })

  // Plain language is a style instruction, not a licence to weaken a claim.
  // "may indicate" -> "shows" would be a boundary breach dressed as clarity.
  it('forbids simplifying away a boundary or dropping a measurement', () => {
    expect(P).toMatch(/Do not simplify away a boundary/)
    expect(P).toMatch(/"may indicate" cannot become "shows"/)
    expect(P).toMatch(/"not identified" cannot become "not present"/)
    expect(P).toMatch(/do not drop a number to make a sentence read more smoothly/)
  })
})

describe('narrative prompt — length contract', () => {
  // The prompt is what governs narrative length, not api/narrative.js's
  // max_tokens: the old instruction asked for "about 150 to 250 words"
  // while the API allowed roughly 600 words, so the ceiling was never
  // reached and raising it alone did nothing. Nothing pinned this section
  // before — every one of these strings could have been rewritten with
  // the whole suite staying green.
  it('asks for the long-form target, not the old short one', () => {
    expect(P).toMatch(/about 600 to 900 words/)
    expect(P).not.toMatch(/150 to 250 words/)
    expect(P).not.toMatch(/shorter is better if it is still complete/)
  })

  // Length has to be earned by coverage. Without this, a word target is
  // an instruction to pad, and padding in this prompt means hedges —
  // which is how an over-claim gets in past a reader's attention.
  it('forbids reaching the target by padding', () => {
    expect(P).toMatch(/That is a target, not a quota/)
    expect(P).toMatch(/never from restating a point, narrating your reasoning, or stacking qualifications/)
    expect(P).toMatch(/a shorter narrative is the correct answer/)
  })

  // The four budgets that bound length independently of the word count.
  // Any one of them left at its old value would bind first and the word
  // target would be unreachable.
  it('raises the per-item budgets that would otherwise bind first', () => {
    expect(P).not.toMatch(/at most three, most significant first/)
    expect(P).toMatch(/Cover every condition the assessment actually found/)

    expect(P).not.toMatch(/Keep each condition to two or three sentences/)
    expect(P).toMatch(/usually four to eight sentences/)

    expect(P).not.toMatch(/did NOT drive a finding, in one sentence, together/)
    expect(P).toMatch(/Close the section with a short paragraph on the parameters that did NOT drive a finding/)

    expect(P).not.toMatch(/at most about three bullets/)
    expect(P).toMatch(/Bullets only in Recommended Next Steps, one action each/)
  })

  // Reasoning at length is not the same as reporting at length. The
  // original instruction existed because the model narrated its own
  // exposure-science workup into a client narrative.
  it('still bars showing the workup, at any length', () => {
    expect(P).toMatch(/Do NOT put that workup in the output/)
    expect(P).toMatch(/Show the conclusion, not the derivation/)
    expect(P).toMatch(/Writing at length does not license showing the workup/)
  })

  // The extra room has to reach the recommendations too. Without this,
  // a raised word target lands entirely in Overall Finding and the
  // section the reader acts on stays a bare list.
  it('asks recommendations to carry their purpose', () => {
    expect(P).toMatch(/what finding it would establish or rule out/)
    expect(P).toMatch(/A one-line instruction with no stated purpose is not actionable/)
    expect(P).toMatch(/not licence to write a method/)
  })

  // Two sections, no more. Extra length must not become extra headings —
  // the narrative renders inside surfaces that expect this exact shape.
  it('keeps the structure fixed while the depth grows', () => {
    expect(P).toMatch(/The two bold section labels above and no others/)
    expect(P).toMatch(/No tables, no other headings/)
  })
})

describe('narrative prompt — surviving guardrails', () => {
  it('keeps the causation and regulatory-classification bans', () => {
    expect(P).toMatch(/Never state or imply causation/)
    expect(P).toMatch(/Never make a regulatory classification or compliance determination/)
    expect(P).toMatch(/Never originate a numeric threshold/)
    expect(P).toMatch(/Stay within the supplied evidence/)
  })

  it('keeps the ASHRAE 62.1 CO2 counter-example', () => {
    expect(P).toMatch(/no current ASHRAE standard contains an indoor CO2 limit/)
  })

  it('closes on the AI-provenance line, without the retired "screening" label', () => {
    expect(P).toContain('AI-assisted narrative — verify before issue; not a regulatory, compliance, or medical determination.')
  })

  it('does not reintroduce "screening" anywhere', () => {
    // Stripped platform-wide in 2026-08. This prompt was missed by that
    // sweep and went on instructing the model to emit "screening output"
    // in its mandated closing line.
    expect(P.toLowerCase()).not.toContain('screening')
  })
})
