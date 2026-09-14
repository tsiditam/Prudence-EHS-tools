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
 * Splitting it changed nothing the model received, and "nothing" had to be
 * proven rather than claimed — so the hash below was CAPTURED FROM THE
 * SINGLE LITERAL BEFORE it was split.
 *
 * ── The hash moved once, deliberately ──────────────────────────────────
 * The authoring plan then added a fifth contract and changed the output
 * schema to admit it, so the ASSEMBLY is no longer that literal. Rather
 * than re-baseline the whole thing and lose what the hash protected, it now
 * pins the three contracts the plan did NOT touch — constitution, section
 * contracts, style — which are still byte-for-byte what they were before
 * the split. A change to any of those is a regression; a change to the
 * output contract or the assembly is the plan, and is pinned separately.
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
/**
 * Constitution + section contracts + style, hashed from the single literal
 * BEFORE it was split and unchanged since — captured from the old constant,
 * not computed from the new assembly and written down afterwards.
 *
 * (The whole pre-plan literal was `f3ef0ce1…`, 14711 characters. The
 * authoring plan rewrote the output contract, so the full assembly no
 * longer matches it; see the header.)
 */
const UNTOUCHED_SHA256 = '34289fd6e41fc9d6037d472ad186a442f86fa0bf7fd4d20bccccd36d7bd664c7'

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Every named part, both copies, so parity is checked piece by piece. */
const PARTS = [
  'ROLE', 'EVIDENCE_CONTRACT', 'BOUNDARIES', 'AUTHORING_CONSTITUTION',
  'PLANNING_CONTRACT', 'SECTIONS_PREAMBLE', 'STYLE_CONTRACT', 'OUTPUT_CONTRACT',
]

describe('the contracts the plan did not touch are byte-for-byte unchanged', () => {
  it('the three contracts the plan did not touch are byte-for-byte unchanged', () => {
    const untouched = wire.AUTHORING_CONSTITUTION
      + wire.SECTIONS_PREAMBLE
      + wire.SECTION_CONTRACT_ORDER.map((k: string) => wire.SECTION_CONTRACTS[k]).join('')
      + wire.STYLE_CONTRACT
    expect(
      sha(untouched),
      'a contract the authoring plan was not supposed to touch has drifted',
    ).toBe(UNTOUCHED_SHA256)
  })

  it('assembles by plain concatenation, inserting no separators of its own', () => {
    // Each part carries the blank lines that followed it in the original.
    // A join with '\n\n' would look right and be wrong by ten characters.
    const byHand = wire.AUTHORING_CONSTITUTION
      + wire.PLANNING_CONTRACT
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
    ['PLANNING_CONTRACT', wire.PLANNING_CONTRACT],
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

describe('the planning contract agrees with the plan schema it asks for', () => {
  it('names every field the schema defines, and invents none', async () => {
    // @ts-ignore js
    const { PLAN_KEYS, SOURCE_STATUSES } = await import('../../src/report/authoringPlan.js')
    for (const key of PLAN_KEYS) expect(wire.PLANNING_CONTRACT, key).toContain(key)
    for (const status of SOURCE_STATUSES) expect(wire.PLANNING_CONTRACT, status).toContain(status)
  })

  it('the output schema admits the plan, so the two contracts do not contradict', () => {
    // The defect this avoids is the one this whole split exists for: a
    // planning contract asking for `authoring_plan` while the output
    // contract declares an exact schema that has no such key would make
    // every compliant reply violate the schema it was handed.
    expect(wire.OUTPUT_CONTRACT).toContain('authoring_plan')
    expect(wire.OUTPUT_CONTRACT).toContain('"sections"')
    expect(wire.OUTPUT_CONTRACT).toMatch(/Both keys are required/)
  })

  it('says the plan never prints', () => {
    expect(wire.PLANNING_CONTRACT).toMatch(/never appears in the report/)
    expect(wire.OUTPUT_CONTRACT).toMatch(/read first and never printed/)
  })

  it('forbids the plan creating anything', () => {
    expect(wire.PLANNING_CONTRACT).toMatch(/it creates nothing/)
    expect(wire.PLANNING_CONTRACT).toMatch(/An id you did not read there is dropped/)
  })
})
