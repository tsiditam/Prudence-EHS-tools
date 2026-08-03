/**
 * Tests for the Jasper (Field Assistant) role + style system prompt.
 *
 * Pins two things:
 *   1. The non-negotiable guardrails survive any edit — the You may /
 *      You may not lists, the four-section answer format, the literal
 *      generic AI-assisted disclaimer line, the "AI · Review required" framing,
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

  it('keeps a literal closing disclaimer line', () => {
    // Reworded from "IH Review Required" to a generic AI disclaimer: the
    // old line stamped even a pure standards lookup as pending IH
    // review. The exact string is pinned in
    // tests/api/jasper-disclaimer.test.ts against the linter's copy.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('AI-assisted response — verify before use.')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('IH Review Required')
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

describe('field-assistant role prompt — broad IAQ scope + citations', () => {
  it('answers any indoor-air-quality question, not just assessment-tied ones', () => {
    // Topical scope was widened (product decision): Jasper answers general
    // IAQ questions with or without an assessment loaded. The professional-
    // boundary "You may not" list is unchanged and still pinned above.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Answer ANY indoor-air-quality question')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('an active assessment is never a prerequisite')
  })

  it('does not re-narrow to assessment-only support (no blanket out-of-scope redirect)', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('If a question is outside IAQ / EHS scope, briefly say so and redirect.')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Any indoor-air-quality or EHS question is in scope')
  })

  it('keeps a hard citations / no-hallucination rule on every answer', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# Citations & no fabrication (hard rule)')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('No hallucinations')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Every substantive factual claim you make carries a source')
  })

  it('allows compliance, causation, and safe/unsafe conclusions (full removal)', () => {
    // Product decision 2026-08: the professional-boundary refusals for
    // compliance / causation / safe-unsafe were removed. These are now in the
    // "You may" list, governed by evidence proportionality in the prompt.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Assess regulatory compliance against a cited standard')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Suggest the likely cause(s)')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Offer a safe / unsafe / acceptable / not-acceptable conclusion')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('Determine OSHA / EPA / state regulatory compliance')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('Attribute causation between an exposure and a symptom')
  })

  it('keeps the medical-diagnosis boundary and the no-fabrication rule', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# You may not')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Diagnose a medical condition')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain(
      'Invent measurements, observations, calibration records, instrument serials, sample IDs, standard names, section numbers, threshold values, or citations.',
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
