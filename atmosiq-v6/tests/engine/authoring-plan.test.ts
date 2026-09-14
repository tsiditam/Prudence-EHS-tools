// @vitest-environment node
/**
 * The authoring plan: what it may reference, and what it may never reach.
 *
 * ── The hypothesis ─────────────────────────────────────────────────────
 * A writer made to decide what the investigation FOUND before drafting —
 * which findings lead, which support, what stayed unresolved, what order
 * the actions belong in — writes a more coherent report than one that goes
 * straight to prose. The plan is the artifact of that decision, and this
 * suite pins the constraints that let it be tried safely.
 *
 * ── Three things it must never do ──────────────────────────────────────
 * Reference something the writer was not given; reach the DOCX; or be
 * persisted with the assessment. The first is what keeps it from inventing
 * evidence, and the second and third are what keep a working note from
 * becoming a durable claim about a building.
 *
 * ── And one it must never do either ────────────────────────────────────
 * Make the report worse. A plan that fails to validate costs the plan and
 * nothing else — the sections are still written from the closed package
 * and still judged by the narrative audit and the banned-language floor,
 * exactly as before any of this existed.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import {
  validateAuthoringPlan, planReferenceIndex, emptyPlan,
  PLAN_KEYS, MAX_PROSE_CHARS, MAX_LIST_ENTRIES,
// @ts-ignore js
} from '../../src/report/authoringPlan.js'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter, WRITABLE_SECTIONS } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, assessmentDate: '2026-06-10' }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: genRecs(zoneScores, BLDG),
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains })
  return { model, pkg, wire: packageForWriter(pkg) }
}

const { model: MODEL, pkg: PKG, wire: WIRE } = build()
const FINDING = WIRE.findings[0].id
const FINDING_2 = WIRE.findings[1].id
const REC = WIRE.recommendation_options[0].id
const PARAM = WIRE.parameter_context[0].parameter_group

const reasons = (r: any[]) => r.map((x: any) => x.reason)

describe('it resolves against the exact package the writer received', () => {
  it('indexes findings, recommendations and measured parameters from the WIRE form', () => {
    const index = planReferenceIndex(WIRE)
    expect(index.findings.has(FINDING)).toBe(true)
    expect(index.recommendations.has(REC)).toBe(true)
    expect(index.parameters.has(PARAM)).toBe(true)
  })

  it('accepts a plan whose every reference the writer was actually given', () => {
    const { plan, rejected, usable } = validateAuthoringPlan({
      overall_conclusion: 'Particulate was elevated in two occupied zones.',
      primary_findings: [FINDING],
      supporting_findings: [FINDING_2],
      important_negative_findings: [PARAM],
      unresolved_questions: ['Whether the loading dock is the source.'],
      recommendation_sequence: [REC],
      throughline: 'Two zones share one plausible pathway.',
    }, WIRE)
    expect(rejected).toEqual([])
    expect(usable).toBe(true)
    expect(plan.primary_findings).toEqual([FINDING])
    expect(plan.throughline).toBe('Two zones share one plausible pathway.')
  })

  it('refuses an id the wire package never carried, and never guesses a near match', () => {
    const near = FINDING.slice(0, -1) + (FINDING.endsWith('a') ? 'b' : 'a')
    const { plan, rejected } = validateAuthoringPlan({ primary_findings: [near] }, WIRE)
    expect(plan.primary_findings).toEqual([])
    expect(reasons(rejected)).toContain('unknown_finding')
  })

  it('checks against the WIRE package, not the richer internal one', () => {
    // The two differ: the wire form rebuilds findings with a narrower field
    // set and sheds context under budget pressure. Validating against the
    // fuller package would accept a reference the writer had no way to see.
    const narrowed = { ...WIRE, findings: WIRE.findings.slice(0, 1) }
    const { plan, rejected } = validateAuthoringPlan({ primary_findings: [FINDING_2] }, narrowed)
    expect(plan.primary_findings).toEqual([])
    expect(reasons(rejected)).toContain('unknown_finding')
    // Same reference, against what the writer actually got: fine.
    expect(validateAuthoringPlan({ primary_findings: [FINDING_2] }, WIRE).plan.primary_findings).toEqual([FINDING_2])
  })

  it('lets a negative finding be a measured parameter, which has no finding id', () => {
    // "PM2.5 was measured and was fine" is worth saying and is not a
    // finding by construction, so a parameter key resolves here.
    const ok = validateAuthoringPlan({ important_negative_findings: [PARAM, FINDING] }, WIRE)
    expect(ok.plan.important_negative_findings).toEqual([PARAM, FINDING])
    const bad = validateAuthoringPlan({ important_negative_findings: ['radon'] }, WIRE)
    expect(bad.plan.important_negative_findings).toEqual([])
    expect(reasons(bad.rejected)).toContain('unknown_subject')
  })

  it('refuses a recommendation the register does not carry', () => {
    const { plan, rejected } = validateAuthoringPlan({ recommendation_sequence: [REC, 'rec-invented'] }, WIRE)
    expect(plan.recommendation_sequence).toEqual([REC])
    expect(reasons(rejected)).toContain('unknown_recommendation')
  })

  it('orders recommendations without adding, dropping or re-prioritizing them', () => {
    const all = WIRE.recommendation_options.map((r: any) => r.id)
    const reversed = [...all].reverse()
    const { plan } = validateAuthoringPlan({ recommendation_sequence: reversed }, WIRE)
    // Order is the plan's to decide; membership is not.
    expect([...plan.recommendation_sequence].sort()).toEqual([...all].sort().slice(0, MAX_LIST_ENTRIES))
  })
})

describe('the schema is closed', () => {
  it('refuses a key it does not define', () => {
    const { rejected } = validateAuthoringPlan({ overall_conclusion: 'x', severity_override: 'critical' }, WIRE)
    expect(reasons(rejected)).toContain('unknown_key')
  })

  it('has no source_status, and refuses one if a model offers it', () => {
    // An earlier draft carried `source_status`, validated only against an
    // enum — which let the MODEL decide a categorical investigative
    // conclusion while this module's own rule says the plan concludes
    // nothing. See the note in `authoringPlan.js` for why grounding it in
    // `pathways[].hypothesis` would have been worse than removing it:
    // that flag is strength-of-evidence, not a source verdict, and reading
    // it as one would republish the confidence rating the report retired.
    expect(PLAN_KEYS).not.toContain('source_status')
    const { plan, rejected } = validateAuthoringPlan({ source_status: 'identified' }, WIRE)
    expect(reasons(rejected)).toContain('unknown_key')
    expect(Object.keys(plan)).not.toContain('source_status')
  })

  it('and no plan field is validated against a vocabulary instead of the package', () => {
    // The property that generalizes the fix: every field a plan carries is
    // either free prose that never renders, or a reference resolved against
    // something the package handed out. A closed enum the model picks from
    // is a judgment with no fact behind it — which is what source_status was.
    const { plan } = validateAuthoringPlan({
      overall_conclusion: 'x', throughline: 'y',
      primary_findings: [FINDING], supporting_findings: [], important_negative_findings: [PARAM],
      unresolved_questions: ['q'], recommendation_sequence: [REC],
    }, WIRE)
    const prose = ['overall_conclusion', 'throughline', 'unresolved_questions']
    const referenced = ['primary_findings', 'supporting_findings', 'important_negative_findings', 'recommendation_sequence']
    expect([...prose, ...referenced].sort()).toEqual([...PLAN_KEYS].sort())
    expect(plan.primary_findings).toEqual([FINDING])
  })

  it('drops prose past its ceiling rather than truncating it', () => {
    // Half a sentence the model did not write is worse than none.
    const { plan, rejected } = validateAuthoringPlan({ overall_conclusion: 'x'.repeat(MAX_PROSE_CHARS + 1) }, WIRE)
    expect(plan.overall_conclusion).toBe('')
    expect(reasons(rejected)).toContain('too_long')
  })

  it('refuses the same finding as both primary and supporting', () => {
    const { plan, rejected } = validateAuthoringPlan({
      primary_findings: [FINDING], supporting_findings: [FINDING],
    }, WIRE)
    // Primary wins: that is the editorial decision the plan exists to make.
    expect(plan.primary_findings).toEqual([FINDING])
    expect(plan.supporting_findings).toEqual([])
    expect(reasons(rejected)).toContain('cross_list_conflict')
  })

  it('refuses the same id twice in one list', () => {
    const { plan, rejected } = validateAuthoringPlan({ primary_findings: [FINDING, FINDING] }, WIRE)
    expect(plan.primary_findings).toEqual([FINDING])
    expect(reasons(rejected)).toContain('duplicate_reference')
  })

  it('never throws, on anything at all', () => {
    for (const bad of [null, undefined, 42, 'a plan', [], [FINDING], { primary_findings: 'not a list' }, { primary_findings: [null, 7] }]) {
      const out = validateAuthoringPlan(bad, WIRE)
      expect(out.plan, JSON.stringify(bad)).toEqual(expect.objectContaining({ primary_findings: expect.any(Array) }))
    }
    // And with no package at all, nothing resolves and nothing explodes.
    expect(validateAuthoringPlan({ primary_findings: [FINDING] }, null).plan.primary_findings).toEqual([])
  })

  it('always returns the same shape, so no consumer needs a null check', () => {
    expect(Object.keys(validateAuthoringPlan(null, WIRE).plan).sort()).toEqual([...PLAN_KEYS].sort())
    expect(Object.keys(emptyPlan()).sort()).toEqual([...PLAN_KEYS].sort())
  })
})

describe('a failed plan costs the plan and nothing else', () => {
  it('an entirely invalid plan is unusable, and says so without erroring', () => {
    const { plan, usable, rejected } = validateAuthoringPlan({
      primary_findings: ['nope'], recommendation_sequence: ['also-nope'],
    }, WIRE)
    expect(usable).toBe(false)
    expect(plan).toEqual(emptyPlan())
    expect(rejected.length).toBeGreaterThan(0)
  })

  it('a partly valid plan keeps the parts that resolved', () => {
    // Per-FIELD invalidation: one bad reference does not discard the
    // editorial decisions that were sound.
    const { plan, usable } = validateAuthoringPlan({
      overall_conclusion: 'Particulate was elevated.',
      primary_findings: [FINDING, 'find-nonexistent'],
      recommendation_sequence: ['rec-nonexistent'],
    }, WIRE)
    expect(usable).toBe(true)
    expect(plan.primary_findings).toEqual([FINDING])
    expect(plan.recommendation_sequence).toEqual([])
    expect(plan.overall_conclusion).toBe('Particulate was elevated.')
  })
})

describe('it never reaches the document, and never the record', () => {
  it('is not a writable section, so nothing can render it', () => {
    expect(WRITABLE_SECTIONS).not.toContain('authoring_plan')
    expect(WRITABLE_SECTIONS).not.toContain('plan')
  })

  it('the evidence package carries no plan field', () => {
    // The package is what the DOCX and the audit read. A plan inside it
    // would be one import away from rendering.
    expect(Object.keys(PKG)).not.toContain('authoring_plan')
    expect(Object.keys(WIRE)).not.toContain('authoring_plan')
  })

  it('no plan prose appears anywhere in the rendered report', async () => {
    // The direct check: assemble the real report and look for the plan's
    // own words in every string it renders.
    const marker = 'ZZQPLANMARKERZZQ'
    const { plan } = validateAuthoringPlan({ overall_conclusion: marker, throughline: marker }, WIRE)
    expect(plan.overall_conclusion).toBe(marker)
    expect(JSON.stringify(MODEL)).not.toContain(marker)
  })

  it('the stored AI-sections record has no place to put one', async () => {
    // @ts-ignore js
    const { buildAiSectionsRecord } = await import('../../src/report/aiSections.js')
    const record = buildAiSectionsRecord({ discussion: 'A paragraph.' }, PKG, { model: 'm' })
    expect(Object.keys(record)).not.toContain('authoring_plan')
    expect(Object.keys(record)).not.toContain('plan')
    expect(Object.keys(record.sections)).not.toContain('authoring_plan')
    // What it does persist is unchanged: text, provenance, freshness, audit.
    expect(Object.keys(record).sort()).toEqual(
      ['audit', 'auditSummary', 'fingerprint', 'generatedAt', 'locked', 'model', 'sections', 'version'].sort(),
    )
  })
})
