/**
 * The report-sections system prompt is server-owned
 * (api/_report-sections-prompt.js). The SPA copy in
 * src/engines/reportSections.js exists only so
 * tests/engine/report-sections-prompt.test.ts can pin its structural
 * requirements without dragging in Vite import machinery — so the two must
 * stay byte-identical or the prompt the tests describe is not the prompt the
 * server sends. Mirrors tests/api/narrative-prompt-parity.test.ts exactly.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { REPORT_SECTIONS_SYSTEM_PROMPT as CLIENT_PROMPT } from '../../src/engines/reportSections.js'

const require = createRequire(import.meta.url)
const { REPORT_SECTIONS_SYSTEM_PROMPT: SERVER_PROMPT } = require('../../api/_report-sections-prompt.js')

describe('report-sections system prompt parity', () => {
  it('server copy equals the src/engines/reportSections.js constant byte-for-byte', () => {
    expect(SERVER_PROMPT).toBe(CLIENT_PROMPT)
  })

  it('carries the boundaries and the output-format contract the handler relies on', () => {
    expect(SERVER_PROMPT).toContain('# Non-negotiable boundaries')
    expect(SERVER_PROMPT).toContain('# Output format — STRICT')
    expect(SERVER_PROMPT).toContain('Return ONLY a JSON object')
  })
})
