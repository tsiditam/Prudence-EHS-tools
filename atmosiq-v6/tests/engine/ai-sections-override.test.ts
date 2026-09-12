// @vitest-environment node
/**
 * The assessor may keep an AI section its own evidence check could not
 * support — at a price.
 *
 * The bargain is the calibration acknowledgement's, and it is deliberate:
 * a credentialed assessor owns defensibility (CLAUDE.md, on why the
 * issuance preflight was removed), so AtmosFlow surfaces the gap and lets
 * them proceed — but proceeding COSTS a written reason and ADDS a
 * disclosure printed in the report. It never removes one.
 *
 * Two limits are load-bearing and pinned here:
 *   • The banned-language gate is NOT assessor-waivable. Those sections are
 *     dropped client-side before the record exists, so an override has
 *     nothing to apply to — the liability floor stays absolute.
 *   • An override is scoped to the text it was written about. Regenerating,
 *     or changing the assessment underneath it, drops it rather than
 *     carrying a justification onto prose nobody approved.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import {
  buildAiSectionsRecord, applyOverride, removeOverride, isOverridden,
  overriddenSections, withAiSections, MIN_OVERRIDE_JUSTIFICATION,
} from '../../src/report/aiSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }
const REASON = 'The ventilation wording describes a particle pathway, not an adequacy claim.'

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains: [],
    recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10',
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains: [] })
  return { data, model, pkg }
}

/** A record whose executive_summary is blocked: a figure with no support. */
function blockedRecord(pkg: any) {
  const rec = buildAiSectionsRecord({
    executive_summary: 'Carbon dioxide measured 4242 ppm across the site, a figure this assessment never recorded.',
    discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
  }, pkg)
  expect(rec.auditSummary.executive_summary.supported).toBe(false)
  return rec
}

describe('an override needs a real reason', () => {
  it('is refused below the minimum length, and the record is returned untouched', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    expect(applyOverride(rec, 'executive_summary', { justification: 'fine' })).toBe(rec)
    expect(applyOverride(rec, 'executive_summary', { justification: '' })).toBe(rec)
    expect(isOverridden(applyOverride(rec, 'executive_summary', { justification: 'x'.repeat(MIN_OVERRIDE_JUSTIFICATION - 1) }), 'executive_summary')).toBe(false)
  })

  it('records who, when, why — and freezes what the check objected to', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    const out = applyOverride(rec, 'executive_summary', { justification: REASON, by: 'Tsidi Tamakloe', at: new Date('2026-06-12T09:00:00Z') })
    const o = out.overrides.executive_summary
    expect(o.justification).toBe(REASON)
    expect(o.by).toBe('Tsidi Tamakloe')
    expect(o.at).toBe('2026-06-12T09:00:00.000Z')
    expect(o.issues.length).toBeGreaterThan(0)
    expect(o.issues[0].message).toBeTruthy()
    // The input is never mutated.
    expect(rec.overrides).toBeUndefined()
  })

  it('cannot be recorded against a section that passed, or one that is absent', () => {
    const { pkg } = build()
    const rec = blockedRecord(pkg)
    expect(rec.auditSummary.discussion.supported).toBe(true)
    expect(applyOverride(rec, 'discussion', { justification: REASON })).toBe(rec)
    expect(applyOverride(rec, 'conceptual_site_model', { justification: REASON })).toBe(rec)
  })
})

describe('an override changes what the export renders', () => {
  it('a blocked section is excluded — until it is overridden, then it renders and is listed as AI-authored', () => {
    const { data, pkg } = build()
    const rec = blockedRecord(pkg)

    const before = withAiSections({ ...data, aiSections: rec })
    expect(before.aiAuthoredSections).not.toContain('executive_summary')
    expect(before.aiOverrides).toEqual([])

    const kept = applyOverride(rec, 'executive_summary', { justification: REASON, by: 'Tsidi Tamakloe' })
    const after = withAiSections({ ...data, aiSections: kept })
    expect(after.aiAuthoredSections).toContain('executive_summary')
    expect(after.execSummary.paragraphs.join(' ')).toContain('4242')
    expect(after.aiOverrides.map((o: any) => o.key)).toEqual(['executive_summary'])
    expect(after.aiOverrides[0].justification).toBe(REASON)
  })

  it('withdrawing it puts the deterministic text back', () => {
    const { data, pkg } = build()
    const kept = applyOverride(blockedRecord(pkg), 'executive_summary', { justification: REASON })
    const withdrawn = removeOverride(kept, 'executive_summary')
    const out = withAiSections({ ...data, aiSections: withdrawn })
    expect(out.aiAuthoredSections).not.toContain('executive_summary')
    expect(out.aiOverrides).toEqual([])
  })

  it('is dropped when the assessment moved underneath it — a stale record renders nothing, override or not', () => {
    const { data, pkg } = build()
    const kept = applyOverride(blockedRecord(pkg), 'executive_summary', { justification: REASON })
    const stale = withAiSections({ ...data, aiSections: { ...kept, fingerprint: '00000000' } })
    expect(stale.aiSectionsStatus).toBe('stale')
    expect(stale.aiAuthoredSections).toEqual([])
    expect(stale.aiOverrides).toEqual([])
  })

  it('does not survive a regeneration — a new record carries no overrides', () => {
    const { pkg } = build()
    const kept = applyOverride(blockedRecord(pkg), 'executive_summary', { justification: REASON })
    expect(isOverridden(kept, 'executive_summary')).toBe(true)
    const regenerated = blockedRecord(pkg)
    expect(regenerated.overrides).toBeUndefined()
    expect(isOverridden(regenerated, 'executive_summary')).toBe(false)
  })
})

describe('the liability floor is not assessor-waivable', () => {
  it('a banned-language section never reaches the record, so nothing can override it', () => {
    // generateReportSections drops `language_review === 'failed'` sections
    // BEFORE buildAiSectionsRecord runs, so they are absent from `sections`
    // and from `auditSummary` — applyOverride has nothing to apply to.
    const { pkg } = build()
    const rec = buildAiSectionsRecord({ discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.' }, pkg)
    expect(rec.sections.executive_summary).toBeUndefined()
    expect(applyOverride(rec, 'executive_summary', { justification: REASON })).toBe(rec)
  })

  it('the client drops them before the record is built — the structural reason the above holds', () => {
    const src = readFileSync(path.resolve('src/engines/reportSections.js'), 'utf8')
    expect(src).toMatch(/review\[key\] === 'failed'/)
    expect(src).toMatch(/buildAiSectionsRecord\(clean,/)
  })
})

describe('the override is disclosed in the report, not just honored', () => {
  it('the DOCX builder prints each one into the QA/QC notes with who, when, why and the objection', () => {
    const src = readFileSync(path.resolve('src/components/docx/sections-atmosflow.js'), 'utf8')
    expect(src).toMatch(/Evidence-check override/)
    expect(src).toMatch(/Assessor's reason/)
    expect(src).toMatch(/The check reported/)
    // Folded into the QA/QC table rather than tucked somewhere quieter.
    expect(src).toMatch(/const qaRows = \[\.\.\.\(M\.qaQc \|\| \[\]\), \.\.\.qaOverrides\]/)
  })

  it('the UI records a justification and cannot commit a short one', () => {
    const app = readFileSync(path.resolve('src/components/MobileApp.jsx'), 'utf8')
    expect(app).toMatch(/applyOverride\(aiSections, key, \{ justification/)
    expect(app).toMatch(/disabled=\{overrideDraft\.text\.trim\(\)\.length &lt; MIN_OVERRIDE_JUSTIFICATION\}|disabled=\{overrideDraft\.text\.trim\(\)\.length < MIN_OVERRIDE_JUSTIFICATION\}/)
    expect(app).toMatch(/ai_section_override_recorded/)
    // It persists like every other AI output, so reopening shows it.
    expect(app).toMatch(/await persistAiOutput\(\{ aiSections: next \}\)/)
  })
})
