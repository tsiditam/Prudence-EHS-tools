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

  it('states the pathway rule: exact confidence, never the cause, hypothesis never promoted', () => {
    expect(P).toMatch(/never as the established cause/)
    expect(P).toMatch(/Strong is unreachable for a hypothesis by construction/)
  })

  it('tells the model not to restate what the immutable sections already carry', () => {
    expect(P).toMatch(/sections\.immutable/)
    expect(P).toMatch(/measurement tables, the findings table, QA\/QC/)
  })

  it('tells the model the report already discloses its Limitations, unconditionally', () => {
    expect(P).toMatch(/the report's own Limitations section states them, unconditionally/)
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
