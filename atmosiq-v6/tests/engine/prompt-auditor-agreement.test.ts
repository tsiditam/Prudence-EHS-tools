// @vitest-environment node
/**
 * The writer prompt and the auditor that judges its output must agree.
 *
 * ── The defect class ───────────────────────────────────────────────────
 * CLAUDE.md names prompt/auditor disagreement a THREE-TIME defect class.
 * This suite exists because it happened a fourth time, and the fourth
 * instance is the one that motivates a general guard rather than another
 * per-instance fix.
 *
 * `_report-sections-prompt.js` told the model, for `conceptual_site_model`:
 *
 *     Frame why this pathway is the leading explanation
 *
 * while `narrativeAudit.js`'s `pathway-rated` rule matches
 * `(the) leading explanation` and rates it BLOCKING. So the prompt asked
 * for the sentence the gate throws away, in the one section whose entire
 * job is to introduce the pathway table — and the rule only fires when the
 * package carries a pathway, which is the same condition under which that
 * section has anything to say. The failure is silent by design: the
 * section falls back to deterministic prose, which is never worse and
 * never announces that anything happened.
 *
 * The existing guard (`report-sections-prompt.test.ts`) pinned that the
 * prohibition is STATED. It did not check the rest of the prompt for text
 * the auditor would reject, so the prompt contradicted itself forty lines
 * apart and every gate stayed green.
 *
 * ── Use versus mention ─────────────────────────────────────────────────
 * A whole-prompt lexical scan cannot be the guard: the prompt legitimately
 * QUOTES the forbidden phrases in order to forbid them — `not "most
 * likely", not "the strongest hypothesis"` — and a scan that flagged those
 * would be demanding the prohibition delete its own examples.
 *
 * So the rule is the use/mention distinction, and it is mechanical: a
 * forbidden phrase may be EXHIBITED inside quotation marks and may never
 * appear in the prompt's own instructing voice. `normativeText` strips
 * quoted spans; what remains is what the prompt tells the model to
 * produce. That split is not a convenience — measured against the prompt
 * as it stood, the raw text carried five matches, four of them the
 * legitimate quoted exhibits and one the defect, and the stripped text
 * carried exactly the defect.
 *
 * Both halves are asserted below, because a guard that passed by deleting
 * the prohibition examples would be worse than no guard.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { normativeText } from '../helpers/promptAgreement'
// @ts-ignore js
import { REPORT_SECTIONS_SYSTEM_PROMPT } from '../../src/engines/reportSections.js'
// @ts-ignore js
import { REASONING_SYSTEM_PROMPT } from '../../src/engines/narrative.js'
// @ts-ignore js
import { auditNarrative } from '../../src/report/narrativeAudit.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

// The wire copies are CommonJS; same `createRequire` idiom the parity
// suites use to reach them.
const require = createRequire(import.meta.url)
const { REPORT_SECTIONS_SYSTEM_PROMPT: SERVER_SECTIONS_PROMPT } = require('../../api/_report-sections-prompt.js')
const { REASONING_SYSTEM_PROMPT: SERVER_NARRATIVE_PROMPT } = require('../../api/_narrative-prompt.js')


/** A real package off the demo assessment, so the pathway rule is live. */
function realPackage() {
  const at = { assessmentDate: '2026-06-10' }
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...at }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  return buildEvidencePackage(model, { zoneScores, causalChains })
}

/** Every `pathway-rated` finding the REAL auditor raises over some text. */
const ranked = (text: string, pkg: any) =>
  auditNarrative(text, pkg).filter((i: any) => i.id === 'pathway-rated')

const WRITER_PROMPTS: Array<[string, string]> = [
  ['reportSections.js (SPA copy)', REPORT_SECTIONS_SYSTEM_PROMPT],
  ['api/_report-sections-prompt.js (wire copy)', SERVER_SECTIONS_PROMPT],
  ['narrative.js (SPA copy)', REASONING_SYSTEM_PROMPT],
  ['api/_narrative-prompt.js (wire copy)', SERVER_NARRATIVE_PROMPT],
]

describe('no writer prompt instructs prose the pathway rule discards', () => {
  const pkg = realPackage()

  it('the demo package really does carry a pathway, so the rule is live', () => {
    // Without this the whole suite could pass by never arming the gate —
    // `pathwaysAreNotRated` returns [] when no pathway subject exists.
    expect((pkg.allowed_interpretations || []).some((a: any) => a.subject_kind === 'pathway')).toBe(true)
    expect(ranked('This is the leading explanation for the pattern.', pkg)).toHaveLength(1)
  })

  for (const [label, prompt] of WRITER_PROMPTS) {
    it(`${label} — its instructing voice carries no pathway ranking`, () => {
      const hits = ranked(normativeText(prompt), pkg)
      expect(
        hits.map((h: any) => h.where),
        'the prompt instructs the model to write prose its own auditor rates blocking; '
        + 'quote the phrase if you mean to forbid it, and reword if you mean to ask for it',
      ).toEqual([])
    })
  }

  it('the audit rule itself never errors over prompt text', () => {
    // A thrown rule degrades to a `rule-error` warning rather than a
    // `pathway-rated` finding, which would make every assertion above pass
    // for the wrong reason.
    for (const [, prompt] of WRITER_PROMPTS) {
      const errs = auditNarrative(normativeText(prompt), pkg)
        .filter((i: any) => i.id === 'rule-error' && i.where === 'pathwaysAreNotRated')
      expect(errs).toEqual([])
    }
  })
})

describe('the prohibition keeps its own examples', () => {
  const pkg = realPackage()

  it('the sections prompt still forbids each form BY NAME', () => {
    // The cheapest way to pass the suite above is to delete the examples.
    // That would weaken the prompt to make a test green, so the raw text is
    // pinned here in the opposite direction.
    for (const phrase of ['"moderate confidence"', '"high likelihood"', '"most likely"', '"the strongest hypothesis"']) {
      expect(SERVER_SECTIONS_PROMPT).toContain(phrase)
    }
  })

  it('those examples are genuinely of the forbidden class — quoting is what saves them', () => {
    // If the exhibits did NOT trip the rule when unquoted, the stripper
    // would be doing no work and the guard above would be vacuous. This
    // asserts the split is load-bearing: raw text fires, stripped does not.
    expect(ranked(SERVER_SECTIONS_PROMPT, pkg).length).toBeGreaterThan(0)
    expect(ranked(normativeText(SERVER_SECTIONS_PROMPT), pkg)).toEqual([])
  })

  it('a quoted exhibit inside a prohibition is allowed; the same words unquoted are not', () => {
    const forbidding = 'Do not characterize any one pathway as "the leading explanation".'
    const instructing = 'Frame why this pathway is the leading explanation.'
    expect(ranked(normativeText(forbidding), pkg)).toEqual([])
    expect(ranked(normativeText(instructing), pkg)).toHaveLength(1)
  })
})

describe('the conceptual-site-model contract, both sides', () => {
  const pkg = realPackage()

  it('accepts a compliant CSM paragraph', () => {
    // What a conceptual site model is actually supposed to do: state the
    // source-pathway-receptor logic, name the evidence behind it, say
    // nothing has been established, and name the verification. No winner.
    const compliant = 'The observations are consistent with migration of particulate from the '
      + 'adjacent loading area into the occupied space. No causal relationship has been '
      + 'established between the two. Paired indoor and outdoor sampling during comparable '
      + 'traffic would distinguish this pathway from an indoor source.'
    expect(ranked(compliant, pkg)).toEqual([])
  })

  it('rejects the same paragraph once it names a winner', () => {
    const ranking = 'Migration from the adjacent loading area is the leading explanation for the '
      + 'particulate observed in the occupied space.'
    const hits = ranked(ranking, pkg)
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('blocking')
    expect(hits[0].where.toLowerCase()).toBe('the leading explanation')
  })

  it('the retired instruction is gone from both copies of the prompt', () => {
    for (const [label, prompt] of WRITER_PROMPTS) {
      expect(prompt, label).not.toMatch(/Frame why this pathway is the leading explanation/)
    }
  })

  it('and what replaced it asks for the evidence and the verification instead', () => {
    for (const prompt of [REPORT_SECTIONS_SYSTEM_PROMPT, SERVER_SECTIONS_PROMPT]) {
      expect(prompt).toMatch(/Do not rank them or characterize any one as/)
      expect(prompt).toMatch(/what verification would distinguish between them/)
      // The immutable-content constraint the rewrite had to carry forward.
      expect(prompt).toMatch(/Do not restate the table's own rows verbatim/)
    }
  })
})
