/**
 * /api/narrative — the output ceiling must clear what the prompt asks for.
 *
 * Narrative length is set by the prompt, not by this ceiling: the prompt
 * used to ask for "about 150 to 250 words" while max_tokens allowed
 * roughly 600 words, so the cap was slack and raising it alone changed
 * nothing. When the prompt's target moved to ~600-900 words the cap
 * became the thing that could bite, and a cap that bites does not
 * shorten the narrative — it truncates it mid-sentence, in the middle of
 * a recommendation, with no marker that anything was lost.
 *
 * No test asserted any max_tokens value anywhere in this codebase before
 * this one, so the two halves of the length contract could drift apart
 * silently. These pin them together.
 *
 * The request body is asserted, not the constant: what ships to Anthropic
 * is the thing that matters.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createRequire } from 'node:module'
import { REASONING_SYSTEM_PROMPT } from '../../src/engines/narrative.js'

// api/narrative.js is CommonJS; createRequire is how the other API tests
// cross that boundary (see tests/api/jasper-disclaimer.test.ts).
const require = createRequire(import.meta.url)
const handler: any = require('../../api/narrative.js')

/** Tokens needed for the prompt's stated word target, at ~1.35 tokens/word. */
const TARGET_WORDS_MAX = 900
const TOKENS_PER_WORD = 1.35
const TOKENS_FOR_TARGET = Math.ceil(TARGET_WORDS_MAX * TOKENS_PER_WORD)  // 1215

function captureRequestBody(): { body: () => any } {
  let captured: any = null
  handler.__test.setFetch(async (_url: string, init: any) => {
    captured = JSON.parse(init.body)
    return {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'ok' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }
  })
  return { body: () => captured }
}

afterEach(() => { handler.__test.resetFetch() })

describe('narrative output ceiling', () => {
  it('sends a ceiling that clears the prompt word target with headroom', async () => {
    const cap = captureRequestBody()
    await handler.__test.callAnthropic('key', REASONING_SYSTEM_PROMPT, { zones: [] })

    const maxTokens = cap.body().max_tokens
    expect(typeof maxTokens).toBe('number')
    // Clears the target at all — below this a full-length narrative is
    // guaranteed to be cut off rather than merely at risk.
    expect(maxTokens).toBeGreaterThanOrEqual(TOKENS_FOR_TARGET)
    // And clears it with real slack, because token-per-word varies with
    // how technical the prose is and a narrative naming criteria and
    // units runs denser than plain text.
    expect(maxTokens).toBeGreaterThanOrEqual(2 * TOKENS_FOR_TARGET)
  })

  it('keeps the prompt target and the ceiling in the same units of reality', () => {
    // If someone edits the prompt's word target, this reads the new
    // number out of the prompt itself rather than trusting the constant
    // above, so the pair cannot drift apart unnoticed.
    const m = /about (\d+) to (\d+) words/.exec(REASONING_SYSTEM_PROMPT)
    expect(m, 'prompt should state a word target').not.toBeNull()
    const promptMaxWords = Number((m as RegExpExecArray)[2])
    expect(promptMaxWords).toBe(TARGET_WORDS_MAX)
  })

  it('still sends the system prompt and the payload it was given', async () => {
    // Guards against a "raise the cap" edit that drops something else in
    // the same body — the boundaries live in the system prompt.
    const cap = captureRequestBody()
    await handler.__test.callAnthropic('key', REASONING_SYSTEM_PROMPT, { facility: 'Test Site' })

    const body = cap.body()
    expect(body.system).toBe(REASONING_SYSTEM_PROMPT)
    expect(body.messages[0].content).toContain('Test Site')
    expect(body.model).toBe(handler.__test.ANTHROPIC_MODEL)
  })
})
