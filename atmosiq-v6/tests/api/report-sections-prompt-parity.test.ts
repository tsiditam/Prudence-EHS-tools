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
import {
  REPORT_SECTIONS_SYSTEM_PROMPT as CLIENT_PROMPT,
  REPORT_SECTION_REPAIR_SYSTEM_PROMPT as CLIENT_REPAIR_PROMPT,
} from '../../src/engines/reportSections.js'

const require = createRequire(import.meta.url)
const {
  REPORT_SECTIONS_SYSTEM_PROMPT: SERVER_PROMPT,
  REPORT_SECTION_REPAIR_SYSTEM_PROMPT: SERVER_REPAIR_PROMPT,
} = require('../../api/_report-sections-prompt.js')

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

describe('report-section repair prompt parity', () => {
  it('server copy equals the src/engines/reportSections.js constant byte-for-byte', () => {
    expect(SERVER_REPAIR_PROMPT).toBe(CLIENT_REPAIR_PROMPT)
  })

  it('inherits the same constitution and voice the authoring prompt uses', () => {
    // Not a second set of boundaries. A boundary tightened for generation has
    // to be tightened for repair in the same edit, which only holds while
    // both prompts read the same objects.
    expect(SERVER_REPAIR_PROMPT).toContain('# Non-negotiable boundaries')
    expect(SERVER_REPAIR_PROMPT).toContain('# Voice: write it the way a good newspaper would')
  })

  it('asks for a repair of one section, not a rewrite of five', () => {
    expect(SERVER_REPAIR_PROMPT).toContain('# This is a repair, not a rewrite')
    expect(SERVER_REPAIR_PROMPT).toContain('Return the COMPLETE section')
    expect(SERVER_REPAIR_PROMPT).toContain('"section": "the complete repaired section"')
    // The defect this replaced: the old Refine prompt told the model to keep
    // every limitation the section states, which says nothing about adding
    // one that is missing — the most common reason a section is blocked.
    expect(SERVER_REPAIR_PROMPT).toContain('add it in the words the finding quotes')
    expect(SERVER_REPAIR_PROMPT).toContain('Never drop a limitation')
    expect(SERVER_REPAIR_PROMPT).not.toContain('authoring_plan')
  })
})
