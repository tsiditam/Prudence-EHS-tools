/**
 * The forensic-interpretation system prompt is server-owned
 * (api/_forensic-interpret-prompt.js). The SPA copy in
 * src/engines/forensicInterpret.js exists only so
 * tests/engine/forensic-interpret-prompt.test.ts can pin its structural
 * requirements without dragging in Vite import machinery — so the two must
 * stay byte-identical or the prompt those tests describe is not the prompt the
 * server sends. Mirrors tests/api/report-sections-prompt-parity.test.ts exactly.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { FORENSIC_INTERPRET_SYSTEM_PROMPT as CLIENT_PROMPT } from '../../src/engines/forensicInterpret.js'

const require = createRequire(import.meta.url)
const { FORENSIC_INTERPRET_SYSTEM_PROMPT: SERVER_PROMPT } = require('../../api/_forensic-interpret-prompt.js')

describe('forensic-interpretation system prompt parity', () => {
  it('server copy equals the src/engines/forensicInterpret.js constant byte-for-byte', () => {
    expect(SERVER_PROMPT).toBe(CLIENT_PROMPT)
  })

  it('carries the boundaries and the output-format contract the handler relies on', () => {
    expect(SERVER_PROMPT).toContain('# What you may never do')
    expect(SERVER_PROMPT).toContain('# Output format — STRICT')
    expect(SERVER_PROMPT).toContain('Return ONLY a JSON object')
  })
})
