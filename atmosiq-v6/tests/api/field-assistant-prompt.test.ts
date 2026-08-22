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

/**
 * The report-drafting layout.
 *
 * Asked to draft a report, Jasper picked its section numbering fresh each
 * time — a draft came back as "1. SCOPE AND PURPOSE / 2. BACKGROUND AND
 * REASON FOR ASSESSMENT / 3. BUILDING AND HVAC DESCRIPTION / …" and then
 * stopped before it reached any recommendations at all. The layout is now
 * fixed in the prompt, and section 6 is the part that must always be
 * written.
 *
 * These are assertions about instructions, not model output — they can
 * only prove the instruction is still there, which is the thing a later
 * edit would silently drop.
 */
describe('field-assistant role prompt — report drafting', () => {
  const P = FIELD_ASSISTANT_ROLE_PROMPT

  const HEADINGS = [
    '# INDOOR AIR QUALITY INVESTIGATION REPORT',
    '## 1. SCOPE AND PURPOSE',
    '## 2. BACKGROUND AND REASON FOR ASSESSMENT',
    '## 3. BUILDING AND HVAC DESCRIPTION',
    '## 4. ENVIRONMENTAL CONDITIONS',
    '## 5. CONTAMINANT MEASUREMENTS',
    '## 6. RECOMMENDATIONS',
  ]

  it('carries a report-drafting mode distinct from the four-section shape', () => {
    expect(P).toContain('# Drafting a report')
    // The default for ordinary questions is untouched — the report layout
    // applies only when a report is what was asked for.
    expect(P).toContain('## Assessment context')
    expect(P).toContain('## Recommended next steps')
  })

  it('fixes every heading, in order', () => {
    let cursor = -1
    for (const h of HEADINGS) {
      const at = P.indexOf(h)
      expect(at, `prompt should carry "${h}"`).toBeGreaterThan(-1)
      expect(at, `"${h}" should come after the heading before it`).toBeGreaterThan(cursor)
      cursor = at
    }
  })

  it('skips a section it has no data for rather than inventing one', () => {
    expect(P).toMatch(/Skip any section you have no data for rather than inventing content/)
    expect(P).toMatch(/omit a line you do not have rather than writing "N\/A" or guessing/)
  })

  // The reason this work exists: the draft that prompted it never reached
  // recommendations. Every other section may be dropped for want of data;
  // this one may not.
  it('makes section 6 unskippable, with its three tiers', () => {
    expect(P).toMatch(/except section 6, which is always written/)
    expect(P).toMatch(/Always written; never skipped, never left for later, and never trailed off mid-list/)
    for (const tier of ['**Immediate (0–7 days)**', '**Short term (7–30 days)**', '**Medium term (30–90 days)**']) {
      expect(P, `should name the tier ${tier}`).toContain(tier)
    }
  })

  it('attributes the recommendations to the assistant, not the engine', () => {
    // Product decision: Jasper writes its own rather than restating the
    // engine's. That makes provenance the guardrail — a reader must not
    // mistake a drafted list for the scored artifact.
    expect(P).toMatch(/These are your own drafted recommendations, not the engine's/)
  })

  it('keeps investigation ahead of intervention in the drafted recommendations', () => {
    expect(P).toMatch(/recommend a control only where the evidence identifies the thing being corrected/)
    expect(P).toMatch(/named laboratory method a conditional escalation rather than the opening step/)
  })

  it('does not put a "Screening" mode label in the report header', () => {
    // The uploaded draft carried "Assessment Mode: Screening". That
    // labelling was stripped platform-wide in 2026-08 and must not come
    // back through a report template.
    const block = P.slice(P.indexOf('# Drafting a report'), P.indexOf('## 1. SCOPE AND PURPOSE'))
    expect(block).not.toMatch(/Assessment Mode/)
    expect(block.toLowerCase()).not.toContain('screening')
  })

  // The first draft titled itself "Summani Plaza — Zone 1 Screening
  // Assessment" and called itself a "screening assessment" three more
  // times. Dropping the "Assessment Mode: Screening" metadata line did
  // not stop that — the label has to be barred, not just left out of the
  // field list. "Screening" was stripped platform-wide in 2026-08.
  it('bars the report from labelling itself "screening"', () => {
    expect(P).toMatch(/Do not label the report or the assessment "screening"/)
    expect(P).toMatch(/not in the title, not in the metadata block, not in the scope paragraph/)
    // …and says what to do instead, so the boundary is not simply lost.
    expect(P).toMatch(/State the limitation substantively instead, once, in section 1/)
    expect(P).toMatch(/Repeating a label is not the same as stating a boundary/)
  })

  it('restates the hard rules that a long draft is most likely to drift past', () => {
    expect(P).toMatch(/invent no measurement, record, or citation/)
    expect(P).toMatch(/state a numeric limit only from a tool result this turn/)
    expect(P).toMatch(/make no compliance, causation, or medical determination/)
  })

  it('tells a draft that cannot fit to name what is outstanding', () => {
    // The ceiling is 8000 tokens now, but a marker beats a cliff: an
    // answer that stops mid-sentence reads as finished.
    expect(P).toMatch(/name the sections still outstanding at the end rather than stopping mid-sentence/)
  })
})
