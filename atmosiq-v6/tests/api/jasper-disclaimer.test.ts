/**
 * The Jasper closing disclaimer.
 *
 * Every chat answer used to end with the literal line "IH Review
 * Required" — including a pure standards lookup, which stamped a
 * definition of ASHRAE 62.1 as pending industrial-hygienist review. That
 * was untrue, and it was the same "everything is unfinished" problem the
 * report lifecycle removed, in miniature.
 *
 * It is now a GENERIC AI disclaimer: a statement about who wrote the
 * text, which is true of every answer.
 *
 * Two things this file defends:
 *
 *   1. The screening-only boundary did NOT move. It is carried
 *      structurally by the required "## Defensibility note" section, not
 *      by the closing line — which is what made the swap safe.
 *   2. The literal cannot drift. It is duplicated in a CommonJS module
 *      on the serverless path and an ES module in the SPA, because
 *      requiring across that boundary is the exact interop trap that has
 *      broken this handler before (CLAUDE.md pitfalls 4 and 5).
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { FIELD_ASSISTANT_ROLE_PROMPT } from '../../src/constants/field-assistant-prompt.js'

const require = createRequire(import.meta.url)
const { AI_DISCLAIMER_LINE, SAFE_FALLBACK, buildRevisionInstruction } =
  require('../../api/_jasper-lint.js')

describe('the disclaimer line itself', () => {
  it('is a statement about authorship, not a review verdict', () => {
    expect(AI_DISCLAIMER_LINE).toBe('AI-assisted response — verify before use.')
    expect(AI_DISCLAIMER_LINE).not.toMatch(/IH Review Required/i)
    // "Required" would re-introduce the sense that something is pending.
    expect(AI_DISCLAIMER_LINE).not.toMatch(/\brequired\b/i)
  })

  it('names the AI and asks for verification', () => {
    expect(AI_DISCLAIMER_LINE).toMatch(/AI/)
    expect(AI_DISCLAIMER_LINE).toMatch(/verify/i)
  })
})

describe('the two copies cannot drift apart', () => {
  it('the prompt instructs the model to end with exactly the linted line', () => {
    // The linter REWRITES answers that do not end with its literal. If
    // the prompt asked for a different string, every answer would be
    // rewritten — a silent, expensive, invisible failure.
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain(AI_DISCLAIMER_LINE)
  })

  it('the safe fallback closes with the same line', () => {
    expect(SAFE_FALLBACK.trim().endsWith(AI_DISCLAIMER_LINE)).toBe(true)
  })

  it('the revision instruction asks for the same line', () => {
    const instruction = buildRevisionInstruction([{ recommendedFix: 'x' }])
    expect(instruction).toContain(AI_DISCLAIMER_LINE)
  })

  it('no path still demands the old stamp', () => {
    for (const text of [FIELD_ASSISTANT_ROLE_PROMPT, SAFE_FALLBACK, buildRevisionInstruction([])]) {
      expect(text).not.toMatch(/IH Review Required/i)
    }
  })
})

describe('the screening-only boundary is unchanged', () => {
  it('the four-section contract still requires a defensibility note', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('## Defensibility note')
    expect(SAFE_FALLBACK).toContain('## Defensibility note')
  })

  it('the fallback still says a licensed professional owns the determinations', () => {
    // This sentence — not the closing line — is what carries the
    // screening-only positioning the MSA recitals depend on.
    expect(SAFE_FALLBACK).toMatch(
      /screening-level support only; causal, compliance, and health determinations require a licensed professional/i,
    )
  })

  it('the prompt still refuses causation, compliance and health calls', () => {
    expect(FIELD_ASSISTANT_ROLE_PROMPT).toContain('# You may not')
  })
})
