/**
 * The semantic reviewer's prompt: parity, and agreement with the validator.
 *
 * ── Parity ─────────────────────────────────────────────────────────────
 * `api/_semantic-review-prompt.js` is server-owned and is what crosses the
 * wire; `src/engines/integrity/semantic-prompt.js` exists so tests can read
 * it without Vite import machinery. They must stay byte-identical or the
 * prompt these tests describe is not the prompt the server sends. Mirrors
 * `report-sections-prompt-parity.test.ts` exactly.
 *
 * ── Agreement ──────────────────────────────────────────────────────────
 * The more important half. CLAUDE.md names writer/gate disagreement a
 * three-time defect class, and a fourth instance was found in the report-
 * sections prompt: it asked for "the leading explanation" in the conceptual
 * site model while the narrative auditor rated that phrase blocking, so the
 * section was silently discarded.
 *
 * This prompt has three gates behind it, and asking for something any of
 * them refuses would waste the call the same silent way:
 *   • the SCHEMA — rules, issue types, severities, candidate keys;
 *   • the VALIDATOR — which comparison kind each rule must produce;
 *   • the PROSE SCANNER — run over the reviewer's own explanation.
 *
 * Every assertion below reads the real constants and the real scanner
 * rather than restating them, so the prompt follows when a rule moves.
 *
 * The use/mention split is the same one `prompt-auditor-agreement.test.ts`
 * establishes for the writer prompts: a forbidden phrase may be EXHIBITED
 * inside quotes or backticks and may never appear in the prompt's own
 * instructing voice. When that suite lands on main these two should share
 * one helper; today they are on separate branches and the duplication is
 * deliberate rather than an oversight.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
// @ts-ignore js
import { SEMANTIC_REVIEW_SYSTEM_PROMPT as CLIENT_PROMPT, SEMANTIC_PROMPT_VERSION } from '../../src/engines/integrity/semantic-prompt.js'
// @ts-ignore js
import { SEMANTIC_RULES, SEMANTIC_SEVERITIES, SEMANTIC_ISSUE_TYPES, CANDIDATE_KEYS, RULE_SPEC } from '../../src/engines/integrity/semantic-schema.js'
// @ts-ignore js
import { REPORT_SECTIONS } from '../../src/report/reportText.js'
import { scanProseForBannedLanguage } from '../../src/engine/report/cih-validation'

const require = createRequire(import.meta.url)
const { SEMANTIC_REVIEW_SYSTEM_PROMPT: SERVER_PROMPT, SEMANTIC_PROMPT_VERSION: SERVER_VERSION } =
  require('../../api/_semantic-review-prompt.js')

/**
 * The prompt in its own instructing voice: quoted spans and backticked
 * identifiers blanked, since both are things the prompt EXHIBITS rather
 * than says. Neither pattern spans a line break — an unbalanced delimiter
 * must blank one phrase, never swallow the document and report it clean.
 */
const normativeText = (p: string) =>
  String(p).replace(/"[^"\n]*"/g, '""').replace(/`[^`\n]*`/g, '``')

describe('parity', () => {
  it('the wire copy and the SPA copy are byte-identical', () => {
    expect(SERVER_PROMPT).toBe(CLIENT_PROMPT)
    expect(SERVER_VERSION).toBe(SEMANTIC_PROMPT_VERSION)
  })

  it('the version is recorded, so a finding traces to the wording that proposed it', () => {
    expect(typeof SEMANTIC_PROMPT_VERSION).toBe('number')
    expect(SEMANTIC_PROMPT_VERSION).toBeGreaterThan(0)
  })
})

describe('the prompt asks for exactly what the schema accepts', () => {
  it('names every rule, and invents none', () => {
    for (const rule of SEMANTIC_RULES) expect(SERVER_PROMPT, rule).toContain(rule)
    // A rule named in the prompt but absent from the schema would be asked
    // for on every call and rejected on every call. Every snake_case token
    // the prompt uses must be something the contract actually knows: a rule,
    // an issue type, a candidate key, or a package field.
    const PACKAGE_FIELDS = [
      'section_id', 'section_name', 'structured_facts', 'reference_context',
      'deterministic_findings', 'evidence_id', 'package_version', 'report_fingerprint',
    ]
    // Section ids come from the collector, so the JSON example cannot name a
    // section the report does not have — which would teach the model an id
    // that resolves to `unknown_section` on every use.
    const SECTION_IDS = REPORT_SECTIONS.map((s: any) => s.id)
    const known = new Set([...SEMANTIC_RULES, ...SEMANTIC_ISSUE_TYPES, ...CANDIDATE_KEYS, ...PACKAGE_FIELDS, ...SECTION_IDS])
    for (const token of new Set(SERVER_PROMPT.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || [])) {
      expect(known, `prompt uses "${token}", which the contract does not define`).toContain(token)
    }
  })

  it('names both permitted severities and never offers a third', () => {
    for (const sev of SEMANTIC_SEVERITIES) expect(SERVER_PROMPT).toContain(sev)
    // `blocking` may be DISCUSSED — the prompt explains that there is none —
    // but must never be offered as a value.
    expect(normativeText(SERVER_PROMPT)).toMatch(/no blocking severity/)
    expect(SERVER_PROMPT).not.toMatch(/"severity":\s*"blocking"/)
    expect(SERVER_PROMPT).not.toMatch(/severity.*\bblocking\b.*permitted/i)
  })

  it('states the issue type each rule is fixed to, matching RULE_SPEC', () => {
    // Over the types a rule can actually PRODUCE, not the whole contract
    // vocabulary. `missing_context` is declared in SEMANTIC_ISSUE_TYPES but
    // no RULE_SPEC entry projects into it, so it is unreachable from the
    // reviewer today — and a prompt naming a type no rule can carry would be
    // offering the model a value that fails shape validation every time.
    const reachable = new Set(Object.values(RULE_SPEC).map((s: any) => s.issue_type))
    for (const t of reachable) expect(SERVER_PROMPT, t as string).toContain(t as string)
    for (const t of SEMANTIC_ISSUE_TYPES) {
      if (!reachable.has(t)) expect(SERVER_PROMPT, `${t} is unreachable`).not.toContain(t)
    }
    for (const [rule, spec] of Object.entries(RULE_SPEC) as Array<[string, { issue_type: string }]>) {
      // The prompt's closing paragraph pairs each rule with its type; a
      // mismatch would have every candidate of that rule rejected on shape.
      const pairing = new RegExp(`${rule}[^.]*?${spec.issue_type}|${spec.issue_type}[^.]*?${rule}`)
      expect(SERVER_PROMPT, `${rule} → ${spec.issue_type}`).toMatch(pairing)
    }
  })

  it('describes the candidate keys the schema allows and forbids extras', () => {
    for (const key of CANDIDATE_KEYS) expect(SERVER_PROMPT, key).toContain(key)
    // Unknown keys are a rejection, not a field to ignore, so the prompt has
    // to say so rather than leave the model to guess.
    expect(SERVER_PROMPT).toMatch(/No other keys are permitted/)
  })

  it('tells the model which comparison each rule must carry', () => {
    // A rule whose comparison is an identifier cannot be answered with a
    // quote, and vice versa; the validator refuses either mix-up.
    for (const [rule, spec] of Object.entries(RULE_SPEC) as Array<[string, { comparison: string }]>) {
      const window = SERVER_PROMPT.slice(SERVER_PROMPT.indexOf(`**${rule}**`))
      const sentence = window.slice(0, window.indexOf('\n-') + 1 || 600)
      expect(sentence, rule).toMatch(spec.comparison === 'quote' ? /SECOND QUOTE/ : /evidence_id/)
    }
  })
})

describe('the prompt asks for nothing the gates discard', () => {
  it('its instructing voice would itself pass the prose scanner', () => {
    // The explanation a reviewer returns is scanned, and a candidate that
    // fails is discarded whole rather than edited. A prompt that instructed
    // that language in its own voice would be asking for discarded work —
    // the defect class that shipped four times in the writer path.
    const hits = scanProseForBannedLanguage(normativeText(SERVER_PROMPT))
    expect(
      hits.map((h) => h.term),
      'the prompt instructs language the reviewer-prose scanner refuses; quote it if you mean to forbid it',
    ).toEqual([])
  })

  it('and it tells the model that an explanation is discarded, not repaired', () => {
    expect(SERVER_PROMPT).toMatch(/discarded whole rather than edited/)
  })
})

describe('the two absolutes the whole layer rests on', () => {
  it('states that absence proves nothing, in terms a model can apply', () => {
    expect(SERVER_PROMPT).toMatch(/ABSENCE PROVES NOTHING/)
    // Not just the slogan — the operational form, since "a report that does
    // not mention X" is exactly the inference a reviewer reaches for.
    expect(SERVER_PROMPT).toMatch(/Never raise an issue because a topic is missing/)
    expect(SERVER_PROMPT).toMatch(/cannot tell what was left out/)
  })

  it('states that an empty reference context is not a bad citation', () => {
    expect(SERVER_PROMPT).toMatch(/empty .{0,40}reference_context.{0,80}not evidence of a bad citation|not evidence of a bad citation/)
    expect(SERVER_PROMPT).toMatch(/only against an entry that is actually present/)
  })

  it('demands verbatim quotes and forbids repair', () => {
    expect(SERVER_PROMPT).toMatch(/character for character/)
    expect(SERVER_PROMPT).toMatch(/Do not paraphrase/)
    expect(SERVER_PROMPT).toMatch(/do not fix what looks like a typo/i)
  })

  it('says a proposal is a proposal, and that an empty review is normal', () => {
    expect(SERVER_PROMPT).toMatch(/You PROPOSE issues/)
    expect(SERVER_PROMPT).toMatch(/no issues is a normal and frequent outcome/)
  })

  it('never asks for the report to be held, because review does not gate', () => {
    expect(SERVER_PROMPT).toMatch(/never stops a report being written, finalized, exported or issued/)
    expect(normativeText(SERVER_PROMPT)).not.toMatch(/\bmust be fixed before\b|\bblock (?:the )?(?:report|issuance)\b/i)
  })
})
