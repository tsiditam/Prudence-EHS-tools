/**
 * Tests for the Jasper (Field Assistant) role + style system prompt.
 *
 * Pins two things:
 *   1. The non-negotiable guardrails survive any edit — the You may /
 *      You may not lists, the four-section answer format, the literal
 *      "IH Review Required" line, the "AI · Review required" framing,
 *      and the verbatim push-back boundary.
 *   2. The anti-robotic / human-voice style guidance is present and is
 *      explicitly marked style-only so it never loosens a factual rule.
 */

import { describe, it, expect } from 'vitest'
import { FIELD_ASSISTANT_ROLE_PROMPT } from '../../src/constants/field-assistant-prompt.js'

describe('field-assistant role prompt — preserved guardrails', () => {
  it('keeps the You may / You may not boundary lists', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# You may')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# You may not')
  })

  it('keeps the invent-nothing factual guardrail verbatim', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain(
      'Invent measurements, observations, calibration records, instrument serials, sample IDs, standard names, section numbers, threshold values, or citations.',
    )
  })

  it('keeps the four-section answer format', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Assessment context')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Screening interpretation')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Recommended next steps')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Defensibility note')
  })

  it('keeps the literal IH Review Required line', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('IH Review Required')
  })

  it('keeps the AI · Review required output-labeling framing', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('AI · Review required')
  })

  it('keeps the push-back boundary verbatim line', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain(
      "I'm the field assistant, not the engine. Finalize the walkthrough and AtmosFlow's deterministic scoring will produce the number. That's the artifact that holds up under review.",
    )
  })
})

describe('field-assistant role prompt — human-voice style', () => {
  it('carries the anti-robotic / human-voice style guidance', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('not like a chatbot')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Vary sentence length and rhythm')
  })

  it('bans the AI-tell phrases', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('It is important to note')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Furthermore')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('plays a crucial/vital role')
  })

  it('marks the humanization as style-only so guardrails are not loosened', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Invent nothing')
  })
})
