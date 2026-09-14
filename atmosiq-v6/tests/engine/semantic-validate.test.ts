/**
 * The trust boundary, attacked.
 *
 * One question decides whether Semantic Report QA is safe to build on:
 *
 *     can an untrusted candidate become a trusted finding without trusting
 *     any of its references?
 *
 * So this suite is written adversarially. Most of it feeds the validator
 * responses a bad or confused model would produce — fabricated quotes,
 * quotes from the wrong section, invented identifiers, rules that do not
 * exist, severities the product forbids, fields nobody designed — and proves
 * none of them reaches an assessor. The few positive cases exist to show the
 * gate is not simply closed.
 *
 * Every rejection is a DIAGNOSTIC and never a report defect. "The reviewer
 * quoted something that is not in your report" is a fact about the reviewer,
 * and an assessor must never be shown it as a problem with their work.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-expect-error js
import { checkRenderModel } from '../../src/report/modelConsistency.js'
// @ts-expect-error js
import { detectReportConsistency } from '../../src/engines/integrity/report-consistency.js'
import {
  buildSemanticPackage, packageForReviewer, packageEvidenceIndex, packageSectionIndex,
  buildReferenceContext, appliedCriterionIds, SEMANTIC_PACKAGE_VERSION, EVIDENCE_KINDS,
// @ts-expect-error js
} from '../../src/engines/integrity/semantic-package.js'
import {
  checkCandidateShape, checkCandidates,
  SEMANTIC_RULES, SEMANTIC_ISSUE_TYPES, SEMANTIC_SEVERITIES, RULE_SPEC,
  CANDIDATE_KEYS, MAX_EXPLANATION_CHARS, MAX_QUOTE_CHARS, MAX_CANDIDATES,
// @ts-expect-error js
} from '../../src/engines/integrity/semantic-schema.js'
import {
  validateSemanticResponse, resolveQuote, resolveEvidence,
  SEMANTIC_VALIDATOR_VERSION, DETECTOR, SOURCE_LAYER, REJECTIONS, RULE_EVIDENCE_KINDS,
// @ts-expect-error js
} from '../../src/engines/integrity/semantic-validate.js'
// @ts-expect-error js
import { integrityIdentity, INTEGRITY_ISSUE_TYPES } from '../../src/engines/integrity/finding.js'

const BLDG = { fn: 'Consistency Tower', ft: 'Commercial Office', ht: 'Central AHU — VAV', sa: 'Weak / reduced', od: 'Closed / minimum' }
const COMPLAINT = {
  zn: '4th Floor Open Office — North', su: 'office', sf: '8200', oc: '46',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '6-10', cc: 'Yes — this zone',
  tc: 'Slightly warm', wd: 'Old staining', wl: ['Ceiling'],
  co2: '1385', co2o: '430', tf: '76.8', tfo: '84', rh: '63', rho: '70', pm: '19', pmo: '9', co: '1.5', tv: '850', hc: '0.03',
  meas_duration: '5-minute average', znt: 'Diffusers read low at the north bank.',
}
const CLEAN = { zn: 'Conf 4C', su: 'conference', co2: '600', co2o: '420', co: '2', tf: '74', rh: '45', pm: '5', cx: 'No complaints' }

function buildAll(zones: any[] = [COMPLAINT, CLEAN]) {
  const presurvey = { ps_survey_date: '2026-07-15', ps_assessor: 'T. Tester, CIH' }
  const bldg = { ...BLDG, assessmentDate: presurvey.ps_survey_date }
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  const data = {
    id: 'rpt-x', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: genRecs(zoneScores, bldg, { zones, equipment: [] }),
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'T. Tester, CIH', certs: ['CIH'] },
  }
  const model = assembleRenderModel(data, { now: new Date('2026-09-01T12:00:00Z') })
  const evidence = buildEvidencePackage(model, { zoneScores, causalChains: data.causalChains })
  const deterministic = detectReportConsistency({
    model, consistency: checkRenderModel(model), assessment: { zones, zoneScores, recs: data.recs, presurvey },
  })
  const pkg = buildSemanticPackage({ model, evidence, deterministicFindings: deterministic })
  return { model, evidence, deterministic, pkg }
}

const FIXTURE = buildAll()
const PKG = FIXTURE.pkg

/** Two real quotes, from two different sections of the real report. */
const firstBlock = (id: string) => PKG.sections.find((s: any) => s.section_id === id).blocks[0].text

const SUMMARY_QUOTE = firstBlock('executive_summary')
const LIMITATION_QUOTE = firstBlock('limitations')

const contradiction = (over: any = {}) => ({
  semantic_rule: 'cross_section_contradiction',
  issue_type: 'contradiction',
  severity: 'warning',
  primary: { section_id: 'executive_summary', quote: SUMMARY_QUOTE },
  comparison: { section_id: 'limitations', quote: LIMITATION_QUOTE },
  explanation: 'These two statements appear to describe the same subject differently.',
  ...over,
})

const overstatement = (over: any = {}) => ({
  semantic_rule: 'evidence_overstatement',
  issue_type: 'unsupported_conclusion',
  severity: 'warning',
  primary: { section_id: 'executive_summary', quote: SUMMARY_QUOTE },
  comparison: { evidence_id: PKG.structured_facts.findings[0].id },
  explanation: 'The sentence states more than the finding behind it records.',
  ...over,
})

const run = (response: any, over: any = {}) => validateSemanticResponse({
  response, pkg: PKG, deterministic: FIXTURE.deterministic,
  meta: { provider: 'anthropic', model: 'a-model', promptVersion: 'v1', generatedAt: '2026-09-14T08:00:00.000Z' },
  ...over,
})

const reasons = (r: any) => r.rejected.map((x: any) => x.reason)

// ── The package is closed, and shows the model nothing internal ───────────

describe('the package is a closed surface of prose and identifiers', () => {
  it('carries section text from the collector, and never renderer internals', () => {
    const wire = packageForReviewer(PKG)
    const json = JSON.stringify(wire)
    expect(wire.sections.length).toBeGreaterThan(3)
    for (const s of wire.sections) {
      expect(Object.keys(s).sort()).toEqual(['section_id', 'section_name', 'text'])
      expect(s.text.length).toBeGreaterThan(0)
    }
    // No docx primitive, no render model, no image, no assessment record.
    for (const forbidden of ['rootKey', 'w:t', 'TextRun', 'Paragraph', 'imageDataUrl', 'data:image', 'zoneScores', 'presurvey', 'photos']) {
      expect(json.includes(forbidden), `wire form leaked ${forbidden}`).toBe(false)
    }
  })

  it('drops empty sections, so a reviewer is never invited to read an absence', () => {
    const empty = buildSemanticPackage({ model: {} })
    expect(empty.sections.length).toBeGreaterThan(0)
    expect(packageForReviewer(empty).sections).toEqual([])
  })

  it('hands out an id for every fact a reviewer may name', () => {
    const index = packageEvidenceIndex(PKG)
    expect(index.size).toBeGreaterThan(5)
    for (const [, v] of index) expect(EVIDENCE_KINDS).toContain(v.kind)
    expect(PKG.structured_facts.findings[0].id.startsWith('finding-')).toBe(true)
    expect(PKG.package_version).toBe(SEMANTIC_PACKAGE_VERSION)
    expect(PKG.report_fingerprint).toBeTruthy()
  })

  it('is deterministic, so the same report yields the same package', () => {
    expect(JSON.stringify(buildAll().pkg)).toBe(JSON.stringify(buildAll().pkg))
  })
})

// ── Standards grounding is earned ─────────────────────────────────────────

describe('a standards judgment is grounded in approved context or refused', () => {
  it('resolves reference context through the criterion, never a citation string', () => {
    const applied = appliedCriterionIds(FIXTURE.evidence)
    expect(applied.size).toBeGreaterThan(0)
    const ctx = buildReferenceContext(FIXTURE.evidence)
    for (const entry of ctx) {
      expect(entry.text.length).toBeGreaterThan(50)
      expect(entry.citation).toBeTruthy()
      // Every entry earns its place by documenting a criterion this
      // assessment actually applied.
      expect(entry.criterion_ids.some((id: string) => applied.has(id))).toBe(true)
    }
  })

  it('supplies no context when no criterion was applied, rather than guessing', () => {
    expect(buildReferenceContext(null)).toEqual([])
    expect(buildReferenceContext({})).toEqual([])
    expect(buildReferenceContext({ findings: [], measurements: [] })).toEqual([])
  })

  it('REFUSES a reference claim when context is unavailable', () => {
    // The acceptance property: removing the grounding must prevent the
    // finding, never force the reviewer to answer from memory.
    const bare = buildSemanticPackage({ model: FIXTURE.model, evidence: null })
    const claim = {
      semantic_rule: 'reference_claim_mismatch',
      issue_type: 'unsupported_conclusion',
      severity: 'warning',
      primary: { section_id: 'executive_summary', quote: SUMMARY_QUOTE },
      comparison: { evidence_id: 'reference_context-anything' },
      explanation: 'The claim goes beyond the cited reference.',
    }
    const out = validateSemanticResponse({ response: { issues: [claim] }, pkg: bare })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['reference_context_unavailable'])
  })
})

// ── The twelve proofs ─────────────────────────────────────────────────────

describe('a fabricated reference never becomes a finding', () => {
  it('1. rejects a fabricated quote', () => {
    const out = run({ issues: [contradiction({ primary: { section_id: 'executive_summary', quote: 'A sentence this report has never contained.' } })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['quote_not_found'])
  })

  it('2. rejects a real quote attributed to the wrong section', () => {
    // The quote exists — in limitations. Naming it as the summary's is a
    // reviewer that lost track of where it was reading, and the diagnostic
    // says so rather than calling it a fabrication.
    const out = run({ issues: [contradiction({ primary: { section_id: 'executive_summary', quote: LIMITATION_QUOTE } })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['quote_in_wrong_section'])
  })

  it('3. rejects an ambiguous quote rather than picking an occurrence', () => {
    const repeated = 'The same sentence twice.'
    const pkg = buildSemanticPackage({ model: { limitations: [repeated, 'Another limitation.'], execSummary: { paragraphs: [repeated] } } })
    // It appears once in each of two sections; within ONE section a repeat is
    // what cannot be pinned, so build that case directly.
    const dupe = buildSemanticPackage({ model: { execSummary: { paragraphs: [`${repeated} ${repeated}`] } } })
    const sections = packageSectionIndex(dupe)
    const resolved = resolveQuote({ section_id: 'executive_summary', quote: repeated }, sections)
    expect(resolved.ok).toBe(false)
    expect(resolved.reason).toBe('quote_ambiguous')
    // And it is refused end to end, not merely by the helper.
    const out = validateSemanticResponse({
      response: { issues: [contradiction({
        primary: { section_id: 'executive_summary', quote: repeated },
        comparison: { section_id: 'limitations', quote: 'Another limitation.' },
      })] },
      pkg: dupe,
    })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toContain('quote_ambiguous')
    expect(pkg.sections.length).toBeGreaterThan(0)
  })

  it('4. rejects an unknown evidence id', () => {
    const out = run({ issues: [overstatement({ comparison: { evidence_id: 'finding-deadbeef' } })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['unknown_evidence_id'])
  })

  it('4b. rejects a real id of the wrong kind for the rule that cited it', () => {
    const recommendationId = PKG.structured_facts.recommendations[0]?.id
    if (!recommendationId) return
    // `evidence_overstatement` compares prose against a finding or a
    // measurement context, never against an action.
    const out = run({ issues: [overstatement({ comparison: { evidence_id: recommendationId } })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['wrong_evidence_kind'])
  })

  it('5. rejects an unknown semantic rule', () => {
    const out = run({ issues: [contradiction({ semantic_rule: 'find_anything_wrong' })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['schema'])
    expect(out.rejected[0].detail).toContain('unknown_semantic_rule')
  })

  it('6. rejects an unknown issue type, and a type that is not the rule’s', () => {
    expect(checkCandidateShape(contradiction({ issue_type: 'stale_content' })).reason).toBe('unknown_issue_type')
    // A real contract type, but not the one this rule concludes.
    expect(checkCandidateShape(contradiction({ issue_type: 'missing_context' })).reason).toBe('issue_type_not_the_rule_s')
    expect(run({ issues: [contradiction({ issue_type: 'missing_context' })] }).findings).toEqual([])
  })

  it('7. rejects blocking severity, by name', () => {
    const checked = checkCandidateShape(contradiction({ severity: 'blocking' }))
    expect(checked.ok).toBe(false)
    // Named separately from a typo, because this one is the product rule.
    expect(checked.reason).toBe('blocking_severity')
    expect(run({ issues: [contradiction({ severity: 'blocking' })] }).findings).toEqual([])
    expect(SEMANTIC_SEVERITIES).not.toContain('blocking')
  })

  it('8. rejects a candidate carrying a field nobody designed', () => {
    for (const extra of [
      { suggested_text: 'Replace this paragraph with...' },
      { id: 'model-minted-id' },
      { generated_at: '2026-09-14' },
      { zone_id: 'invented-zone' },
      { confidence: 0.9 },
    ]) {
      const out = run({ issues: [contradiction(extra)] })
      expect(out.findings, JSON.stringify(extra)).toEqual([])
      expect(out.rejected[0].detail).toContain('unknown_key')
    }
    // Including inside the nested locators.
    expect(checkCandidateShape(contradiction({ primary: { section_id: 'executive_summary', quote: SUMMARY_QUOTE, offset: 3 } })).reason).toBe('unknown_key')
  })

  it('9. rejects an explanation the report’s own language gate would refuse', () => {
    const out = run({ issues: [contradiction({ explanation: 'The elevated carbon dioxide is caused by inadequate ventilation and presents a health risk.' })] })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['banned_language'])
  })

  it('9b. discards rather than sanitizes, so nothing unreviewed is published', () => {
    // The behavioral form of the rule, rather than a pin on a comment. A
    // candidate that fails the language gate yields no finding at all, and a
    // candidate that passes reaches the reader with its explanation BYTE
    // IDENTICAL. Between those two there is no third path where words were
    // softened into something the reviewer never said.
    const flagged = 'Carbon dioxide is caused by inadequate ventilation.'
    const bad = run({ issues: [contradiction({ explanation: flagged })] })
    expect(bad.findings).toEqual([])
    // Nothing anywhere in the result carries a repaired version of it.
    expect(JSON.stringify(bad.findings)).not.toContain('ventilation')

    const texts = [
      'These two statements appear to describe the same subject differently.',
      'The summary and the limitations section describe the same area in different terms.',
    ]
    for (const explanation of texts) {
      const out = run({ issues: [contradiction({ explanation })] })
      expect(out.findings).toHaveLength(1)
      expect(out.findings[0].description).toBe(explanation)
    }
  })

  it('10. lets a valid two-sided contradiction through', () => {
    const out = run({ issues: [contradiction()] })
    expect(out.rejected).toEqual([])
    expect(out.findings).toHaveLength(1)
    const f: any = out.findings[0]
    expect(f.issue_type).toBe('contradiction')
    expect(f.severity).toBe('warning')
    expect(f.source_layer).toBe(SOURCE_LAYER)
    expect(f.actionability).toBe('before_signoff')
    expect(f.resolution_status).toBe('open')
    expect(f.provenance.detector).toBe(DETECTOR)
    expect(f.anchor.rule).toBe('cross_section_contradiction')
    expect(f.anchor.ref).toBe('executive_summary')
    expect(f.description).toBe('These two statements appear to describe the same subject differently.')
  })

  it('11. lets a one-sided overstatement through only with resolvable evidence', () => {
    const ok = run({ issues: [overstatement()] })
    expect(ok.rejected).toEqual([])
    expect(ok.findings).toHaveLength(1)
    expect(ok.findings[0].issue_type).toBe('unsupported_conclusion')
    // Same candidate, evidence removed: the schema refuses it before any
    // lookup, because a bare one-sided claim points at nothing.
    const bare: any = { ...overstatement() }
    delete bare.comparison
    expect(checkCandidateShape(bare).reason).toBe('missing_comparison')
    expect(run({ issues: [bare] }).findings).toEqual([])
  })

  it('12. mints the same id whatever model, order or clock produced it', () => {
    const a = run({ issues: [contradiction(), overstatement()] })
    const b = validateSemanticResponse({
      response: { issues: [overstatement(), contradiction()] },
      pkg: PKG,
      meta: { provider: 'openai', model: 'another-model', promptVersion: 'v9', generatedAt: '2027-01-01T23:59:59.000Z' },
    })
    expect(a.findings).toHaveLength(2)
    expect(new Set(a.findings.map((f: any) => f.id))).toEqual(new Set(b.findings.map((f: any) => f.id)))
    const byId = (list: any[]) => new Map(list.map((f) => [f.id, f]))
    const bMap = byId(b.findings)
    for (const f of a.findings) {
      expect(integrityIdentity(f)).toBe(integrityIdentity(bMap.get(f.id)))
    }
    // The run IS recorded, which is why carrying it is worth anything.
    expect(a.findings[0].provenance.review.provider).toBe('anthropic')
    expect(bMap.get(a.findings[0].id).provenance.review.provider).toBe('openai')
    expect(a.findings[0].provenance.review.validator_version).toBe(SEMANTIC_VALIDATOR_VERSION)
    expect(a.findings[0].provenance.review.report_fingerprint).toBe(PKG.report_fingerprint)
  })
})

// ── It never suppresses the deterministic layer ───────────────────────────

describe('deduplication runs one way', () => {
  it('drops a semantic candidate covering ground a deterministic finding holds', () => {
    // A deterministic finding anchored to the executive summary, of the same
    // issue type as the candidate.
    const deterministic = [{
      id: 'intg-report_consistency-aaaa',
      issue_type: 'contradiction',
      anchor: { section: 'Executive Summary', rule: 'summary-scope', kind: 'section', ref: null },
    }]
    const pkg = buildSemanticPackage({ model: FIXTURE.model, evidence: FIXTURE.evidence, deterministicFindings: deterministic })
    const out = validateSemanticResponse({ response: { issues: [contradiction()] }, pkg })
    expect(out.findings).toEqual([])
    expect(reasons(out)).toEqual(['duplicate_of_deterministic'])
  })

  it('keeps the candidate when the deterministic finding is a different kind', () => {
    const deterministic = [{
      id: 'intg-report_consistency-bbbb',
      issue_type: 'orphaned_evidence',
      anchor: { section: 'Executive Summary', rule: 'reference-orphan', kind: 'reference', ref: null },
    }]
    const pkg = buildSemanticPackage({ model: FIXTURE.model, evidence: FIXTURE.evidence, deterministicFindings: deterministic })
    expect(validateSemanticResponse({ response: { issues: [contradiction()] }, pkg }).findings).toHaveLength(1)
  })

  it('collapses two candidates that resolve to one finding', () => {
    const out = run({ issues: [contradiction(), contradiction({ explanation: 'Worded differently, pointing at the same two passages.' })] })
    expect(out.findings).toHaveLength(1)
    expect(reasons(out)).toContain('duplicate_candidate')
  })
})

// ── Failure is open, and the vocabulary is closed ─────────────────────────

describe('it fails open and states its vocabulary', () => {
  it('returns nothing rather than throwing on anything a provider might send', () => {
    for (const bad of [null, undefined, '', 'not json', 42, [], {}, { issues: null }, { issues: 'x' }, { issues: [null, 1, 'x'] }]) {
      const out = run(bad)
      expect(out.findings, JSON.stringify(bad)).toEqual([])
      expect(Array.isArray(out.rejected)).toBe(true)
    }
    expect(validateSemanticResponse()).toEqual({ findings: [], rejected: [{ reason: 'unknown_section', detail: 'no package' }] })
  })

  it('caps the response, the quote and the explanation', () => {
    expect(checkCandidates({ issues: new Array(MAX_CANDIDATES + 1).fill(contradiction()) }).rejected[0].reason).toBe('too_many_candidates')
    expect(checkCandidateShape(contradiction({ explanation: 'x'.repeat(MAX_EXPLANATION_CHARS + 1) })).reason).toBe('explanation_too_long')
    expect(checkCandidateShape(contradiction({ primary: { section_id: 'executive_summary', quote: 'x'.repeat(MAX_QUOTE_CHARS + 1) } })).reason).toBe('quote_too_long')
    expect(checkCandidateShape(contradiction({ primary: { section_id: 'executive_summary', quote: '  ' } })).reason).toBe('missing_quote')
  })

  it('uses only vocabulary the shared contract declares', () => {
    for (const rule of SEMANTIC_RULES) {
      const spec = RULE_SPEC[rule]
      expect(INTEGRITY_ISSUE_TYPES).toContain(spec.issue_type)
      expect(SEMANTIC_ISSUE_TYPES).toContain(spec.issue_type)
      expect(['quote', 'evidence', 'reference']).toContain(spec.comparison)
      if (spec.comparison !== 'quote') expect(RULE_EVIDENCE_KINDS[rule]).toBeTruthy()
    }
    expect(Object.keys(RULE_SPEC).sort()).toEqual([...SEMANTIC_RULES].sort())
    expect(CANDIDATE_KEYS).toEqual(['semantic_rule', 'issue_type', 'severity', 'primary', 'comparison', 'explanation'])
    // Every reason the validator can give is declared.
    expect(Object.isFrozen(REJECTIONS)).toBe(true)
  })

  it('never emits a severity that could gate anything', () => {
    const out = run({ issues: [contradiction(), contradiction({ severity: 'advisory', explanation: 'A second, milder observation about the same report.' })] })
    for (const f of out.findings) expect(['advisory', 'warning']).toContain(f.severity)
  })

  it('resolves evidence only through the index the package handed out', () => {
    const index = packageEvidenceIndex(PKG)
    const findingId = PKG.structured_facts.findings[0].id
    expect(resolveEvidence(findingId, 'evidence_overstatement', index).ok).toBe(true)
    expect(resolveEvidence('', 'evidence_overstatement', index).reason).toBe('unknown_evidence_id')
    expect(resolveEvidence(findingId, 'reference_claim_mismatch', index).reason).toBe('wrong_evidence_kind')
  })
})
