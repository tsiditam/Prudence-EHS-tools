/**
 * The narrative system prompt is server-owned (api/_narrative-prompt.js,
 * audit 2026-09 H1). The SPA still exports REASONING_SYSTEM_PROMPT because
 * tests/engine/narrative-prompt.test.ts pins its CIH corrections there —
 * so the two copies must stay byte-identical or the prompt the tests
 * describe is not the prompt the server sends.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { REASONING_SYSTEM_PROMPT as CLIENT_PROMPT } from '../../src/engines/narrative.js'

const require = createRequire(import.meta.url)
const { REASONING_SYSTEM_PROMPT: SERVER_PROMPT } = require('../../api/_narrative-prompt.js')

describe('narrative system prompt parity', () => {
  it('server copy equals the src/engines/narrative.js constant byte-for-byte', () => {
    expect(SERVER_PROMPT).toBe(CLIENT_PROMPT)
  })

  it('carries the boundaries the handler relies on', () => {
    expect(SERVER_PROMPT).toContain('# Non-negotiable boundaries')
    expect(SERVER_PROMPT).toContain('AI-assisted narrative — verify before issue; not a regulatory, compliance, or medical determination.')
  })
})
