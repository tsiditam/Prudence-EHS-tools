// @vitest-environment node
/**
 * The authoring prompt as contracts: unchanged when assembled, and now
 * checkable one contract at a time.
 *
 * ── The refactor this guards ───────────────────────────────────────────
 * The prompt was one fifteen-kilobyte literal. Everything a test could say
 * about it had to be said by matching a substring of the whole, which is
 * how the conceptual-site-model defect survived: the prompt forbade ranking
 * a pathway in one place and asked for "the leading explanation" forty
 * lines later, and nothing was scoped tightly enough to see both at once.
 *
 * Splitting it changes nothing the model receives, and "nothing" has to be
 * proven rather than claimed — so the first assertion below is against a
 * sha256 CAPTURED FROM THE SINGLE LITERAL BEFORE it was split. If the
 * assembly ever drifts by one character, that hash says so.
 *
 * ── What the split buys ────────────────────────────────────────────────
 * The auditor-agreement check now runs against each NORMATIVE contract on
 * its own, so a failure names the contract that instructs prose its own
 * gate discards instead of pointing at fifteen kilobytes.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { normativeText, withPathwaySubject } from '../helpers/promptAgreement'
// @ts-ignore js
import * as spa from '../../src/engines/reportSections.js'
// @ts-ignore js
import { auditNarrative } from '../../src/report/narrativeAudit.js'
// @ts-ignore js
import { WRITABLE_SECTIONS } from '../../src/report/evidencePackage.js'

const require = createRequire(import.meta.url)
const wire = require('../../api/_report-sections-prompt.js')

/**
 * The assembled prompt exactly as it stood as one literal, on the commit
 * before the split. Captured by hashing the old constant, not by hashing
 * the new assembly and writing the answer down.
 */
const GOLDEN_SHA256 = 'f3ef0ce180b96dece009a257b2d572b4cb6dd9d5c66536df2927122edc944e80'
const GOLDEN_CHARS = 14711

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Every named part, both copies, so parity is checked piece by piece. */
const PARTS = [
  'ROLE', 'EVIDENCE_CONTRACT', 'BOUNDARIES', 'AUTHORING_CONSTITUTION',
  'SECTIONS_PREAMBLE', 'STYLE_CONTRACT', 'OUTPUT_CONTRACT',
]

describe('the assembled prompt is byte-identical to the literal it replaces', () => {
  it('matches the sha256 captured before the split', () => {
    expect(wire.REPORT_SECTIONS_SYSTEM_PROMPT.length).toBe(GOLDEN_CHARS)
    expect(
      sha(wire.REPORT_SECTIONS_SYSTEM_PROMPT),
      'the assembled prompt drifted from the single literal it replaced',
    ).toBe(GOLDEN_SHA256)
  })

  it('assembles by plain concatenation, inserting no separators of its own', () => {
    // Each part carries the blank lines that followed it in the original.
    // A join with '\n\n' would look right and be wrong by ten characters.
    const byHand = wire.AUTHORING_CONSTITUTION
      + wire.SECTIONS_PREAMBLE
      + wire.SECTION_CONTRACT_ORDER.map((k: string) => wire.SECTION_CONTRACTS[k]).join('')
      + wire.STYLE_CONTRACT
      + wire.OUTPUT_CONTRACT
    expect(byHand).toBe(wire.REPORT_SECTIONS_SYSTEM_PROMPT)
  })

  it('the constitution is role + package + boundaries and nothing else', () => {
    expect(wire.AUTHORING_CONSTITUTION).toBe(wire.ROLE + wire.EVIDENCE_CONTRACT + wire.BOUNDARIES)
  })
})

describe('the wire copy and the SPA copy agree part by part', () => {
  it('every named part is byte-identical', () => {
    for (const part of PARTS) {
      expect(spa[part], part).toBe(wire[part])
    }
  })

  it('every section contract is byte-identical, and the key sets match', () => {
    expect(spa.SECTION_CONTRACT_ORDER).toEqual(wire.SECTION_CONTRACT_ORDER)
    for (const key of wire.SECTION_CONTRACT_ORDER) {
      expect(spa.SECTION_CONTRACTS[key], key).toBe(wire.SECTION_CONTRACTS[key])
    }
  })

  it('and so is the assembly', () => {
    expect(spa.REPORT_SECTIONS_SYSTEM_PROMPT).toBe(wire.REPORT_SECTIONS_SYSTEM_PROMPT)
  })
})

describe('the section contracts cover exactly the writable sections', () => {
  it('one contract per section the package says may be written', () => {
    // A contract for a section nobody renders is dead prompt text; a
    // writable section with no contract is a section written to no spec.
    expect([...wire.SECTION_CONTRACT_ORDER].sort()).toEqual([...WRITABLE_SECTIONS].sort())
  })

  it('each contract announces the key it governs', () => {
    for (const key of wire.SECTION_CONTRACT_ORDER) {
      expect(wire.SECTION_CONTRACTS[key], key).toContain(`**${key}**`)
    }
  })

  it('and no contract spills into another section spec', () => {
    for (const key of wire.SECTION_CONTRACT_ORDER) {
      const others = wire.SECTION_CONTRACT_ORDER.filter((k: string) => k !== key)
      for (const other of others) {
        expect(wire.SECTION_CONTRACTS[key], `${key} contains ${other}'s heading`)
          .not.toContain(`**${other}** —`)
      }
    }
  })
})

describe('each normative contract agrees with the auditor on its own', () => {
  const pkg = withPathwaySubject()
  const ranked = (text: string) =>
    auditNarrative(text, pkg).filter((i: any) => i.id === 'pathway-rated').map((i: any) => i.where)

  it('the gate is armed, or everything below passes for the wrong reason', () => {
    expect(ranked('This is the leading explanation.')).toHaveLength(1)
  })

  const contracts: Array<[string, string]> = [
    ['ROLE', wire.ROLE],
    ['EVIDENCE_CONTRACT', wire.EVIDENCE_CONTRACT],
    ['BOUNDARIES', wire.BOUNDARIES],
    ['SECTIONS_PREAMBLE', wire.SECTIONS_PREAMBLE],
    ['STYLE_CONTRACT', wire.STYLE_CONTRACT],
    ['OUTPUT_CONTRACT', wire.OUTPUT_CONTRACT],
  ]

  for (const [name, text] of contracts) {
    it(`${name} instructs no pathway ranking`, () => {
      expect(
        ranked(normativeText(text)),
        `${name} instructs prose the narrative auditor rates blocking; `
        + 'quote the phrase if you mean to forbid it, and reword if you mean to ask for it',
      ).toEqual([])
    })
  }

  for (const key of wire.SECTION_CONTRACT_ORDER) {
    it(`the ${key} contract instructs no pathway ranking`, () => {
      // This is the assertion that would have caught the shipped defect at
      // the contract that carried it, rather than somewhere in a
      // fifteen-kilobyte string.
      expect(ranked(normativeText(wire.SECTION_CONTRACTS[key])), key).toEqual([])
    })
  }

  it('the prohibition keeps its own examples, which live in the evidence contract', () => {
    // The exhibits must survive the split — a contract that lost them while
    // passing the checks above would be weaker prompt for a greener suite.
    for (const phrase of ['"moderate confidence"', '"high likelihood"', '"most likely"', '"the strongest hypothesis"']) {
      expect(wire.EVIDENCE_CONTRACT, phrase).toContain(phrase)
    }
    // Raw text trips the rule; its own voice does not. That split is what
    // the whole agreement check rests on.
    expect(ranked(wire.EVIDENCE_CONTRACT).length).toBeGreaterThan(0)
    expect(ranked(normativeText(wire.EVIDENCE_CONTRACT))).toEqual([])
  })
})
