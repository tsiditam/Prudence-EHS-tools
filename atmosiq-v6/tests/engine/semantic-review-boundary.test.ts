// @vitest-environment node
/**
 * The generation boundary, end to end — the four proofs required before any
 * of this reaches a surface, plus the ordering property.
 *
 * The path under test is the whole one, with only the network faked:
 *
 *   assembled report → semantic package → (provider) → complete response →
 *   validation → IntegrityFinding projection → one-way dedup
 *
 * The provider is a function returning bytes. Nothing else is stubbed —
 * the package is real, the validator is real, the findings are real
 * contract objects — because the thing worth proving is that an untrusted
 * proposal cannot cross, and a test that mocked the validator would be
 * proving nothing at all.
 *
 * 1. A valid proposal is promoted, and becomes the expected finding.
 * 2. An unsupported proposal dies at the boundary — invented quotes,
 *    unknown identifiers, wrong evidence kinds, prohibited severity,
 *    malformed shapes, unknown keys.
 * 3. Equivalent proposals collapse deterministically: one issue described
 *    twice in different words is one finding, and WHICH prose survives does
 *    not depend on the order the provider sent them.
 * 4. Model failure is non-destructive: timeout, malformed JSON, outage or
 *    an empty review all leave the deterministic report exactly as it was
 *    and produce no phantom defect.
 *
 * And the ordering property that protects all four: the same candidate set
 * in any permutation projects to identical findings. Provider
 * nondeterminism must not reach the assessor as rows that reshuffle.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import { runSemanticReview, COMPLETED, UNAVAILABLE, UNAVAILABLE_REASONS, isSemanticReviewFresh } from '../../src/engines/integrity/semantic-review.js'
// @ts-ignore js
import { buildSemanticPackage } from '../../src/engines/integrity/semantic-package.js'
// @ts-ignore js
import { validateSemanticResponse } from '../../src/engines/integrity/semantic-validate.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { detectReportConsistency } from '../../src/engines/integrity/report-consistency.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

function buildReport() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  return { model, zoneScores, causalChains }
}

const { model: MODEL } = buildReport()
const PKG = buildSemanticPackage({ model: MODEL, deterministicFindings: [] })

/** Two real sections with distinct prose, for building resolvable quotes. */
function twoSections() {
  const withText = PKG.sections.filter((s: any) => (s.text || '').length > 80)
  expect(withText.length, 'the demo report must carry prose to quote').toBeGreaterThan(1)
  return [withText[0], withText[1]]
}

/** A sentence that occurs exactly once in the given section. */
function uniqueQuote(section: any): string {
  const text: string = section.text
  for (const piece of text.split(/(?<=\.)\s+/)) {
    const q = piece.trim()
    if (q.length > 25 && q.length < 200 && text.indexOf(q) === text.lastIndexOf(q)) return q
  }
  throw new Error(`no unique sentence in ${section.section_id}`)
}

const [SEC_A, SEC_B] = twoSections()
const QUOTE_A = uniqueQuote(SEC_A)
const QUOTE_B = uniqueQuote(SEC_B)

/** A well-formed contradiction candidate between the two real sections. */
const validCandidate = (explanation = 'The two sections describe the same zone differently.') => ({
  semantic_rule: 'cross_section_contradiction',
  issue_type: 'contradiction',
  severity: 'warning',
  primary: { section_id: SEC_A.section_id, quote: QUOTE_A },
  comparison: { section_id: SEC_B.section_id, quote: QUOTE_B },
  explanation,
})

/** A provider that answers with exactly this response object. */
const providerReturning = (response: unknown) => async () => ({
  ok: true, status: 200,
  json: async () => ({ status: 'completed', candidates: response, provenance: { provider: 'anthropic', model: 'test-model', prompt_version: 1 } }),
})

const validate = (issues: unknown[]) =>
  validateSemanticResponse({ response: { issues }, pkg: PKG, meta: { provider: 'anthropic', model: 'test-model' } })

// ── Proof 1 ────────────────────────────────────────────────────────────

describe('1. a valid proposal is promoted, and becomes the expected finding', () => {
  it('survives the whole path and arrives as a contract finding', async () => {
    const out = await runSemanticReview({
      model: MODEL,
      fetchFn: providerReturning({ issues: [validCandidate()] }),
      generatedAt: '2026-06-11T12:00:00Z',
    })
    expect(out.status).toBe(COMPLETED)
    expect(out.findings).toHaveLength(1)

    const f = out.findings[0]
    // `detector` lives in provenance; `source_layer` is top-level. The
    // contract puts the two in different places on purpose — the layer is
    // part of what a finding IS, the detector is where it came from.
    expect(f.provenance.detector).toBe('semantic_report_review')
    expect(f.source_layer).toBe('report_package')
    expect(f.issue_type).toBe('contradiction')
    expect(f.severity).toBe('warning')
    // The reviewer's explanation reaches the reader unedited or not at all.
    expect(f.description).toBe('The two sections describe the same zone differently.')
    expect(f.anchor.ref).toBe(SEC_A.section_id)
  })

  it('records provider and model as provenance, and keeps them OUT of identity', async () => {
    const one = validate([validCandidate()])
    const other = validateSemanticResponse({
      response: { issues: [validCandidate()] }, pkg: PKG,
      meta: { provider: 'someone-else', model: 'a-different-model' },
    })
    // Two providers noticing one contradiction produce ONE finding, so a
    // consumer can follow an issue rather than watch rows appear and vanish
    // as availability shifts.
    expect(one.findings[0].id).toBe(other.findings[0].id)
    expect(one.findings[0].provenance.review.model).toBe('test-model')
    expect(other.findings[0].provenance.review.model).toBe('a-different-model')
  })

  it('the same report reviewed twice produces the same id, at a different time', async () => {
    const a = await runSemanticReview({ model: MODEL, fetchFn: providerReturning({ issues: [validCandidate()] }), generatedAt: '2026-06-11T12:00:00Z' })
    const b = await runSemanticReview({ model: MODEL, fetchFn: providerReturning({ issues: [validCandidate()] }), generatedAt: '2027-01-02T03:04:05Z' })
    expect(a.findings[0].id).toBe(b.findings[0].id)
  })
})

// ── Proof 2 ────────────────────────────────────────────────────────────

describe('2. an unsupported proposal dies at the boundary', () => {
  const REFUSED: Array<[string, Record<string, unknown>, string]> = [
    ['an invented quote', { ...validCandidate(), primary: { section_id: SEC_A.section_id, quote: 'The building was found to be unsafe on inspection.' } }, 'quote_not_found'],
    ['a quote from the wrong section', { ...validCandidate(), primary: { section_id: SEC_B.section_id, quote: QUOTE_A } }, 'quote_in_wrong_section'],
    ['a section that does not exist', { ...validCandidate(), primary: { section_id: 'chapter_seven', quote: QUOTE_A } }, 'unknown_section'],
    ['an unknown evidence id', {
      ...validCandidate(), semantic_rule: 'evidence_overstatement', issue_type: 'unsupported_conclusion',
      comparison: { evidence_id: 'finding-does-not-exist' },
    }, 'unknown_evidence_id'],
    ['a standards judgment with no approved reference behind it', {
      ...validCandidate(), semantic_rule: 'reference_claim_mismatch', issue_type: 'unsupported_conclusion',
      comparison: { evidence_id: 'ref-anything' },
    }, 'reference_context_unavailable'],
  ]

  for (const [label, candidate, reason] of REFUSED) {
    it(`${label} → no finding, diagnosed as ${reason}`, () => {
      const out = validate([candidate])
      expect(out.findings).toEqual([])
      expect(out.rejected.map((r: any) => r.reason)).toContain(reason)
    })
  }

  it('a prohibited severity is refused rather than clamped', () => {
    // Report review has no blocking tier, and the answer to a candidate
    // asking for one is no finding — not the same finding at a lower rating,
    // which would be the platform inventing a severity nobody proposed.
    const out = validate([{ ...validCandidate(), severity: 'blocking' }])
    expect(out.findings).toEqual([])
  })

  it('no finding from any input carries a blocking severity', () => {
    for (const sev of ['blocking', 'critical', 'BLOCKING', '', null, 7]) {
      const out = validate([{ ...validCandidate(), severity: sev }])
      for (const f of out.findings) expect(f.severity).not.toBe('blocking')
    }
  })

  it('an unknown key is a rejection, not a field to ignore', () => {
    const out = validate([{ ...validCandidate(), auto_fix: 'rewrite the section' }])
    expect(out.findings).toEqual([])
  })

  it('an explanation that over-claims is discarded whole, never sanitized', () => {
    // A layer checking a document for over-claiming may not over-claim in
    // the checking. Rewriting the sentence would publish a criticism nobody
    // made, so the candidate goes instead.
    const out = validate([validCandidate('This confirmed exposure is a health risk to occupants.')])
    expect(out.findings).toEqual([])
    expect(out.rejected.map((r: any) => r.reason)).toContain('banned_language')
  })

  it('malformed responses of every shape produce zero findings and never throw', () => {
    for (const response of [null, undefined, 42, 'issues', [], {}, { issues: null }, { issues: 'nope' }, { issues: [null, 3, 'x'] }, { wrong_key: [] }]) {
      const out = validateSemanticResponse({ response, pkg: PKG })
      expect(out.findings, JSON.stringify(response)).toEqual([])
    }
  })

  it('the deterministic layer keeps its ground — dedup runs one way only', () => {
    // Dedup reads the CLOSED package, not a side argument: the reviewer is
    // shown the deterministic findings and is checked against the same list.
    const collidingPkg = buildSemanticPackage({
      model: MODEL,
      deterministicFindings: [{ id: 'det-1', issue_type: 'contradiction', anchor: { section: SEC_A.section_name } }],
    })
    const before = validate([validCandidate()])
    const after = validateSemanticResponse({ response: { issues: [validCandidate()] }, pkg: collidingPkg })

    expect(before.findings).toHaveLength(1)
    expect(after.findings).toEqual([])
    expect(after.rejected.map((r: any) => r.reason)).toContain('duplicate_of_deterministic')
  })

  it('and a real deterministic run never loses a finding to the semantic layer', () => {
    // The one-way property stated over the real detector rather than a
    // fixture: whatever it reports is unchanged by the semantic pass.
    const deterministic = detectReportConsistency({ model: MODEL }) || []
    const pkg = buildSemanticPackage({ model: MODEL, deterministicFindings: deterministic })
    const out = validateSemanticResponse({ response: { issues: [validCandidate()] }, pkg })
    expect(detectReportConsistency({ model: MODEL })).toEqual(deterministic)
    expect(out.findings.every((f: any) => f.provenance.detector === 'semantic_report_review')).toBe(true)
  })
})

// ── Proof 3 ────────────────────────────────────────────────────────────

describe('3. equivalent proposals collapse deterministically', () => {
  it('one issue described twice in different words is one finding', () => {
    const out = validate([
      validCandidate('The two sections describe the same zone differently.'),
      validCandidate('These passages disagree about the same area.'),
    ])
    expect(out.findings).toHaveLength(1)
    expect(out.rejected.map((r: any) => r.reason)).toContain('duplicate_candidate')
  })

  it('and WHICH wording survives does not depend on the order they arrived in', () => {
    // The real risk: two candidates with one identity and different prose.
    // Without a canonical order the provider's sequencing decides what the
    // reader sees, so the same unchanged report reviewed twice shows
    // different sentences for the same issue.
    const a = validCandidate('Alpha wording for this disagreement.')
    const b = validCandidate('Zulu wording for this disagreement.')
    const forward = validate([a, b])
    const backward = validate([b, a])
    expect(forward.findings).toHaveLength(1)
    expect(forward.findings[0].description).toBe(backward.findings[0].description)
  })
})

// ── The ordering property ──────────────────────────────────────────────

describe('candidate ordering cannot reach the report', () => {
  /** Distinct, individually valid candidates over the two real sections. */
  const distinct = () => {
    const sentences = (s: any) => s.text.split(/(?<=\.)\s+/)
      .map((x: string) => x.trim())
      .filter((q: string) => q.length > 25 && q.length < 200 && s.text.indexOf(q) === s.text.lastIndexOf(q))
    const a = sentences(SEC_A)
    expect(a.length, 'need several quotable sentences').toBeGreaterThan(2)
    return a.slice(0, 3).map((q: string, i: number) => ({
      semantic_rule: 'cross_section_contradiction',
      issue_type: 'contradiction',
      severity: i % 2 ? 'advisory' : 'warning',
      primary: { section_id: SEC_A.section_id, quote: q },
      comparison: { section_id: SEC_B.section_id, quote: QUOTE_B },
      explanation: `Difference number ${i} between the sections.`,
    }))
  }

  /** Every permutation of a small array. */
  function permutations<T>(xs: T[]): T[][] {
    if (xs.length <= 1) return [xs]
    return xs.flatMap((x, i) =>
      permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]))
  }

  it('every permutation of the same candidate set projects to identical findings', () => {
    const base = distinct()
    const perms = permutations(base)
    expect(perms).toHaveLength(6)

    const reference = validate(perms[0])
    expect(reference.findings.length).toBeGreaterThan(1)

    for (const perm of perms.slice(1)) {
      const out = validate(perm)
      // Identical: same findings, same order, same ids, same prose. Not
      // "the same set" — the ARRAY, because the array is what a surface
      // renders in order.
      expect(out.findings).toEqual(reference.findings)
    }
  })

  it('and the rejection diagnostics are stable too', () => {
    const withJunk = [...distinct(), { ...validCandidate(), primary: { section_id: 'nowhere', quote: 'x' } }]
    const a = validate(withJunk)
    const b = validate([...withJunk].reverse())
    expect(a.rejected).toEqual(b.rejected)
  })

  it('findings come back in reading order, not arrival order', () => {
    const base = distinct()
    const out = validate([...base].reverse())
    const offsets = out.findings.map((f: any) => SEC_A.text.indexOf(
      base.find((c: any) => f.id === validate([c]).findings[0]?.id)?.primary.quote ?? '',
    ))
    const sorted = [...offsets].sort((x, y) => x - y)
    expect(offsets).toEqual(sorted)
  })
})

// ── Proof 4 ────────────────────────────────────────────────────────────

describe('4. model failure is non-destructive', () => {
  const FAILURES: Array<[string, () => unknown]> = [
    ['the request throws', () => { throw new Error('ECONNRESET') }],
    ['the endpoint reports a timeout', () => ({ ok: true, status: 200, json: async () => ({ status: 'unavailable', reason: 'timed_out' }) })],
    ['the endpoint reports an outage', () => ({ ok: true, status: 200, json: async () => ({ status: 'unavailable', reason: 'upstream_error' }) })],
    ['the provider is not configured', () => ({ ok: true, status: 200, json: async () => ({ status: 'unavailable', reason: 'not_configured' }) })],
    ['the body is not JSON', () => ({ ok: true, status: 200, json: async () => { throw new Error('bad json') } })],
    ['the endpoint 500s', () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })],
    ['the budget is spent', () => ({ ok: false, status: 429, json: async () => ({ retry_after_seconds: 30 }) })],
  ]

  for (const [label, impl] of FAILURES) {
    it(`${label} → unavailable, zero findings, nothing said about the report`, async () => {
      const out = await runSemanticReview({ model: MODEL, fetchFn: (async () => impl()) as any })
      expect(out.status).toBe(UNAVAILABLE)
      expect(out.findings).toEqual([])
      expect(UNAVAILABLE_REASONS).toContain(out.reason)
    })
  }

  it('an unavailable review is never a finding about the document', async () => {
    const out = await runSemanticReview({ model: MODEL, fetchFn: (async () => { throw new Error('down') }) as any })
    // "Semantic review not completed" is a technical status. A provider
    // outage must never become a warning about the report, so there is
    // nothing here a consistency surface could render as one.
    expect(out.findings).toEqual([])
    expect(out).not.toHaveProperty('severity')
    expect(JSON.stringify(out)).not.toMatch(/contradiction|unsupported_conclusion|coverage_mismatch/)
  })

  it('the deterministic report is byte-identical whether or not the review ran', async () => {
    const before = JSON.stringify(detectReportConsistency({ model: MODEL }))
    await runSemanticReview({ model: MODEL, fetchFn: (async () => { throw new Error('down') }) as any })
    await runSemanticReview({ model: MODEL, fetchFn: providerReturning({ issues: [validCandidate()] }) })
    const after = JSON.stringify(detectReportConsistency({ model: MODEL }))
    expect(after).toBe(before)
  })

  it('an empty review is completed, not unavailable — they mean different things', async () => {
    const out = await runSemanticReview({ model: MODEL, fetchFn: providerReturning({ issues: [] }) })
    expect(out.status).toBe(COMPLETED)
    expect(out.findings).toEqual([])
  })
})

// ── Freshness ──────────────────────────────────────────────────────────

describe('a review stops applying when the text it quotes changes', () => {
  it('is fresh against the package it was run on, stale against another', async () => {
    const out = await runSemanticReview({ model: MODEL, fetchFn: providerReturning({ issues: [validCandidate()] }) })
    expect(isSemanticReviewFresh(out, PKG)).toBe(true)
    expect(isSemanticReviewFresh(out, { ...PKG, report_fingerprint: 'something-else' })).toBe(false)
  })

  it('an unavailable review is never fresh, so it cannot be cached as a result', async () => {
    const out = await runSemanticReview({ model: MODEL, fetchFn: (async () => { throw new Error('down') }) as any })
    expect(isSemanticReviewFresh(out, PKG)).toBe(false)
  })
})
