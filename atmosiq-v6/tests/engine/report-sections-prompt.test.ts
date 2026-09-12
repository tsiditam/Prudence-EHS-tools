/**
 * Structural pins on the report-sections system prompt
 * (src/engines/reportSections.js), mirroring
 * tests/engine/narrative-prompt.test.ts's role for the narrative prompt.
 * Fails loudly if a later edit drops one of the properties this feature's
 * correctness depends on: the closed-package framing, the boundaries shared
 * with the narrative prompt, the five-section contract, and the strict JSON
 * output format `api/report-sections.js` parses.
 */
import { describe, it, expect } from 'vitest'
import { REPORT_SECTIONS_SYSTEM_PROMPT as P } from '../../src/engines/reportSections.js'

describe('the report-sections prompt frames the evidence package as closed and read-only', () => {
  it('names the package a closed universe', () => {
    expect(P).toMatch(/CLOSED evidence package/)
    expect(P).toMatch(/READ-ONLY/)
  })

  it('explains may_assert as the sole permitted interpretation per finding', () => {
    expect(P).toMatch(/may_assert.*is the ONLY permitted interpretation/)
    expect(P).toMatch(/"exceedance"/)
    expect(P).toMatch(/"indication"/)
    expect(P).toMatch(/"observation"/)
  })

  it('states the pathway rule: never the cause, and never rated', () => {
    expect(P).toMatch(/never as the established cause/)
    // The prompt used to license the opposite — "at EXACTLY the confidence
    // stated" — because the package carried a confidence word and the report
    // printed one. Both stopped in 2026-09: a published Possible / Moderate /
    // Strong is a certainty rating over a methodology this report never
    // defines. The prompt must not invite it back, and must name the
    // superlative form too, which is what a writer reaches for when the word
    // "confidence" is forbidden.
    expect(P).not.toMatch(/at EXACTLY the confidence stated/)
    expect(P).toMatch(/Do NOT rate, rank, score or grade one/)
    expect(P).toMatch(/not "most likely"/)
    expect(P).toMatch(/no causal relationship has been established/)
    expect(P).toMatch(/`verification`/)
  })

  it('tells the model not to restate what the immutable sections already carry', () => {
    expect(P).toMatch(/sections\.immutable/)
    expect(P).toMatch(/measurement tables, the findings table, QA\/QC/)
  })

  it('tells the model the report already carries its Limitations list', () => {
    expect(P).toMatch(/the report's own Limitations section already carries it in full/)
  })

  it('states the required_limitations contract, because the audit enforces it section by section', () => {
    // The prompt used to close this bullet with "You do not need to restate
    // any of these lines yourself" — while auditSection (aiSections.js, with
    // requireUnconditional:false) discards any section that raises a
    // TOPIC-SCOPED limitation without its caveat. The writer was told one
    // thing and the gate enforced another, so on the first real production
    // run three of nine sections were thrown away, including the Executive
    // Summary. Whatever this prompt says, it must never say that again.
    expect(P).not.toMatch(/You do not need to restate any of these lines yourself/)
    expect(P).toMatch(/required_limitations/)
    expect(P).toMatch(/must_mention/)
  })

  it('names the topic triggers the package actually derives, inside that bullet', () => {
    // evidencePackage.js derives lim-tvoc with when ['tvoc','volatile
    // organic'] and lim-ventilation-inferred with when ['ventilation',
    // 'fresh air','outdoor air']. A writer never shown those exact words
    // cannot satisfy a gate that matches on them — which is how a paragraph
    // about PARTICULATE lost itself by saying "outdoor air" in passing.
    const start = P.indexOf('`required_limitations`')
    const bullet = P.slice(start, P.indexOf('`context_omitted`', start))
    expect(start).toBeGreaterThan(-1)
    for (const trigger of ['TVOC', 'ventilation', 'outdoor air', 'fresh air']) {
      expect(bullet, trigger).toContain(trigger)
    }
    // And the phrasings that satisfy them.
    expect(bullet).toMatch(/no applicable threshold/)
    expect(bullet).toMatch(/not measured directly|indicator|inferred/)
  })

  it('names context_standards, and boundary 1 admits them as a comparator source', () => {
    // The report's own deterministic prose names ASHRAE 62.1, ASHRAE 55, the
    // EPA NAAQS and the OSHA PELs for scale on EVERY report, while
    // `references` carries only the criteria that fired. So the package now
    // hands the writer that list — and boundary 1, which says every comparison
    // value comes from the package, has to admit it, or the prompt forbids
    // exactly what the bullet above permits. That contradiction is the same
    // shape as the required_limitations one: the writer told one thing, the
    // gate enforcing another.
    const start = P.indexOf('`context_standards`')
    expect(start).toBeGreaterThan(-1)
    const bullet = P.slice(start, P.indexOf('`context_omitted`', start))
    expect(bullet).toMatch(/for scale/)
    expect(bullet).toMatch(/never present one as a threshold this assessment met, cleared or exceeded/)
    // Boundary 1 must list it beside `criteria` and `references`.
    const b1 = P.slice(P.indexOf('1. Never originate a numeric threshold'))
    expect(b1.slice(0, 600)).toMatch(/`context_standards`/)
    expect(b1.slice(0, 600)).toMatch(/may only ever give scale, never a verdict/)
  })

  it('names context_omitted and forbids inventing what was left out', () => {
    expect(P).toMatch(/context_omitted/)
    expect(P).toMatch(/does not license inventing it/)
  })
})

describe('the report-sections prompt carries the same non-negotiable boundaries as the narrative prompt', () => {
  it('forbids originating a threshold', () => {
    expect(P).toMatch(/Never originate a numeric threshold/)
  })
  it('forbids causation language', () => {
    expect(P).toMatch(/Never state or imply causation/)
    expect(P).toMatch(/"caused by", "is responsible for", "is due to"/)
  })
  it('forbids a regulatory or compliance determination', () => {
    expect(P).toMatch(/Never make a regulatory classification or compliance determination/)
  })
  it('forbids describing the platform or its internal reasoning', () => {
    expect(P).toMatch(/Never describe AtmosFlow, its scoring, or its internal reasoning/)
  })
  it('forbids asserting an ASHRAE 55 compliance claim from two spot readings', () => {
    expect(P).toMatch(/Comfort parameters are not settled by two numbers/)
    expect(P).toMatch(/"fall within ASHRAE 55 ranges"/)
  })
})

describe('the report-sections prompt defines all five sections', () => {
  for (const key of ['executive_summary', 'discussion', 'conceptual_site_model', 'recommendations_prose', 'parameter_background']) {
    it(`documents ${key}`, () => {
      expect(P, key).toMatch(new RegExp(`\\*\\*${key}\\*\\*`))
    })
  }

  it('tells the writer to combine temperature and relative humidity into one "thermal" entry', () => {
    expect(P).toMatch(/`thermal` \(covering temperature AND relative humidity together, in ONE paragraph/)
    expect(P).toMatch(/never write them as two separate entries/)
  })

  it('says a key may be omitted when there is nothing distinct to add, but never to pad or skip material', () => {
    expect(P).toMatch(/never pad a thin section to fill space, and never skip one you do have material for/)
  })
})

describe('the report-sections prompt matches the newspaper voice the narrative prompt uses', () => {
  it('names the register and the sentence-length guidance', () => {
    expect(P).toMatch(/serious newspaper/)
    expect(P).toMatch(/15 to 20 words/)
  })
  it('bans the same consultant-register phrases', () => {
    for (const phrase of ['it should be noted', 'conduct an evaluation of', 'in order to', 'utilize']) {
      expect(P, phrase).toContain(phrase)
    }
  })
  it('bans the same AI-tell openers', () => {
    for (const tic of ['It is important to note', 'In conclusion', 'delve', 'plays a crucial role']) {
      expect(P, tic).toContain(tic)
    }
  })

  it('names where a comparison may come from, so "give the number scale" cannot be met by recalling a standard', () => {
    // "Give a number something to measure against" and boundary 1 ("Do not
    // recall limits from training data") pull opposite ways on a CLEAN
    // assessment, where nothing fired and `references` carries no criterion
    // for the parameter. The model resolved that by citing the NAAQS it knows
    // — caught by the audit (criterion-unattested) and the section discarded.
    // The voice rule must therefore name the comparators the package DOES
    // carry, and say what to do when it carries none.
    const start = P.indexOf('Give a number something to measure against')
    expect(start).toBeGreaterThan(-1)
    const rule = P.slice(start, start + 1400)
    expect(rule).toMatch(/outdoor_reference/)
    expect(rule).toMatch(/another zone's reading/)
    expect(rule).toMatch(/no criterion was applied/)
    // And it names the exact temptation by name.
    expect(rule).toMatch(/NAAQS/)
    expect(rule).toMatch(/is not a substitute/)
  })
})

describe('the report-sections prompt requires strict JSON, keyed exactly for buildAiSectionsRecord', () => {
  it('demands no preamble, no markdown, no code fence', () => {
    expect(P).toMatch(/Return ONLY a JSON object\. No preamble\. No markdown\. No code fence\./)
  })
  it('gives the exact schema keys aiSections.js expects', () => {
    for (const key of ['"executive_summary"', '"discussion"', '"conceptual_site_model"', '"recommendations_prose"', '"parameter_background"']) {
      expect(P, key).toContain(key)
    }
  })
})
