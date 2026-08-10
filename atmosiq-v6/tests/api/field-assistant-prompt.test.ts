/**
 * Tests for the Jasper (Field Assistant) role + style system prompt.
 *
 * Pins two things:
 *   1. The INTEGRITY guardrails survive any edit — invent-nothing,
 *      tool-backed numeric thresholds, no overriding the engine, the
 *      literal AI-assisted disclaimer line, and the "AI · Review required"
 *      framing. These are factual/provenance rules, not screening-
 *      positioning, and are never loosened.
 *   2. The interpretive posture (product decision 2026-08, owner Tsidi
 *      Tamakloe, CSP): the assistant gives a DIRECT professional read to a
 *      credentialed audience rather than deflecting cause/compliance/health
 *      questions. The former hard prohibitions on those are intentionally
 *      GONE; this test pins that they stay gone.
 *   3. The anti-robotic / human-voice style guidance is present and is
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

  it('keeps the four-section shape available as a default (not mandated)', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Assessment context')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Interpretation')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Recommended next steps')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('What would confirm it')
    // It is a tool, not a mandate — the assistant leads with the answer.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('is a tool, not a mandate')
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

  it('does not impersonate the engine, but no longer refuses to interpret', () => {
    // The old verbatim "I'm the field assistant, not the engine" refusal is
    // gone. The retained boundary is only against presenting a read AS the
    // engine's final scored artifact; a provisional read is explicitly allowed.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain(
      "I'm the field assistant, not the engine. Finalize the walkthrough",
    )
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('provisional read of where a zone is likely to score')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain("don't impersonate the engine")
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

  it('keeps the integrity moat (no fabrication, tool-backed numbers, no engine override)', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# You may not')
    // Numbers must be tool-backed; you may name a standard, not recall its value.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('you did not retrieve from a tool THIS turn')
    // The deterministic engine / calibration gate cannot be overridden or mutated.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Override or silently mutate the deterministic engine')
  })

  it('grants direct interpretive latitude (the former prohibitions are gone)', () => {
    // Product decision 2026-08: the assistant interprets for its credentialed
    // reader instead of deflecting. The old blanket prohibitions are removed.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('Determine OSHA / EPA / state regulatory compliance')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).not.toContain('Attribute causation between an exposure and a symptom')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('Offer a direct professional interpretation')
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('do not withhold the interpretation')
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
