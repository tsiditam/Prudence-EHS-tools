// @vitest-environment node
/**
 * AI-authored sections of the AtmosFlow DOCX — src/report/aiSections.js.
 *
 * The property that matters most: `render-determinism.test.ts` requires the
 * same stored assessment to render identically whenever it is exported.
 * These tests establish the piece that guarantees it for AI text — a
 * fingerprint that goes stale the moment the underlying assessment changes,
 * and a fallback to deterministic prose that is silent in the document and
 * never partial about which section it applies to.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import {
  buildAiSectionsRecord, isAiSectionsFresh, lockAiSections, applyAiSections,
  withAiSections, splitParagraphs, AI_SECTIONS_VERSION,
} from '../../src/report/aiSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

function build(extra: Record<string, unknown> = {}) {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: { imm: [{ text: 'Verify supply airflow to the flagged zone.', scope: 'zone', zoneName: 'Zone 1', controlTier: 'engineering_control' }], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10', ...extra,
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains })
  return { data, model, pkg, zoneScores, causalChains }
}

/** A clean five-section response, written the way the prompt asks. */
function goodResponse(pkg: any) {
  const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
  return {
    executive_summary: `Carbon dioxide stood out at this site. In ${co2.zone} it measured ${co2.value} ppm.\n\nThe source was not identified during the assessment.`,
    discussion: 'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
    conceptual_site_model: 'The evidence points to reduced outdoor-air delivery reaching the flagged zone.',
    recommendations_prose: 'The steps below verify the suspected cause before any corrective work begins.',
    parameter_background: {
      co2: 'Carbon dioxide is a gauge of how much fresh air is reaching a room. No ventilation rate was measured directly; the reading is an indicator only.',
      thermal: 'Temperature did not identify a notable condition during the assessment. Relative humidity measured above the moisture-control range in both zones.',
    },
  }
}

describe('buildAiSectionsRecord', () => {
  it('builds a record with a fingerprint, per-section audit, and starts unlocked', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg, { model: 'claude-test' })
    expect(rec.version).toBe(AI_SECTIONS_VERSION)
    expect(rec.locked).toBe(false)
    expect(rec.model).toBe('claude-test')
    expect(typeof rec.fingerprint).toBe('string')
    expect(rec.fingerprint.length).toBeGreaterThan(0)
    expect(Object.keys(rec.sections).sort()).toEqual(['conceptual_site_model', 'discussion', 'executive_summary', 'parameter_background', 'recommendations_prose'])
    expect(rec.sections.parameter_background).toEqual(goodResponse(pkg).parameter_background)
  })

  it('audits every section independently, keyed by parameter for the background entries', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    for (const key of ['executive_summary', 'discussion', 'conceptual_site_model', 'recommendations_prose']) {
      expect(rec.auditSummary[key], key).toBeTruthy()
      expect(rec.auditSummary[key].supported).toBe(true)
    }
    expect(rec.auditSummary['parameter_background.co2'].supported).toBe(true)
    expect(rec.auditSummary['parameter_background.thermal'].supported).toBe(true)
  })

  it('does not require the statutory limitation inside each two-sentence section', () => {
    // The report's own Limitations section carries it unconditionally.
    // Demanding it from a short Conceptual Site Model paragraph would fail
    // every embedded section for a disclosure the document already has.
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    expect(rec.audit.conceptual_site_model.some((i: any) => i.id === 'limitation-missing')).toBe(false)
    expect(rec.audit.recommendations_prose.some((i: any) => i.id === 'limitation-missing')).toBe(false)
  })

  it('drops an empty or missing section rather than storing a blank string', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord({ ...goodResponse(pkg), discussion: '   ', conceptual_site_model: undefined }, pkg)
    expect('discussion' in rec.sections).toBe(false)
    expect('conceptual_site_model' in rec.sections).toBe(false)
  })

  it('catches an altered figure in one section without touching the record structure', () => {
    const { pkg } = build()
    const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
    const bad = { ...goodResponse(pkg), executive_summary: goodResponse(pkg).executive_summary.replace(`${co2.value} ppm`, `${co2.value + 400} ppm`) }
    const rec = buildAiSectionsRecord(bad, pkg)
    expect(rec.auditSummary.executive_summary.supported).toBe(false)
    expect(rec.audit.executive_summary.some((i: any) => i.id === 'figure-unsupported')).toBe(true)
    // The other sections are unaffected.
    expect(rec.auditSummary.discussion.supported).toBe(true)
  })
})

describe('isAiSectionsFresh', () => {
  it('is fresh against the package it was built from', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    expect(isAiSectionsFresh(rec, pkg)).toBe(true)
  })

  it('goes stale the moment the underlying assessment changes', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const { pkg: pkg2 } = build({ zones: ZONES.map((z: any, i: number) => (i === 0 ? { ...z, co2: '2200' } : z)) })
    expect(isAiSectionsFresh(rec, pkg2)).toBe(false)
  })

  it('is never fresh with no record or no package', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    expect(isAiSectionsFresh(null, pkg)).toBe(false)
    expect(isAiSectionsFresh(rec, null)).toBe(false)
  })
})

describe('lockAiSections', () => {
  it('sets locked without disturbing anything else', () => {
    const { pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const locked = lockAiSections(rec)
    expect(locked.locked).toBe(true)
    expect(locked.fingerprint).toBe(rec.fingerprint)
    expect(locked.sections).toEqual(rec.sections)
    expect(rec.locked).toBe(false) // pure — the input is untouched
  })

  it('passes through null', () => {
    expect(lockAiSections(null)).toBe(null)
  })
})

describe('applyAiSections', () => {
  it('with no record, the model is untouched and status is none', () => {
    const { model, pkg } = build()
    const out = applyAiSections(model, null, pkg)
    expect(out.aiSectionsStatus).toBe('none')
    expect(out.execSummary).toEqual(model.execSummary)
    expect(out.discussion).toBeUndefined()
  })

  it('with a stale record, the model is untouched and status is stale', () => {
    const { model, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const { pkg: staleAgainst } = build({ zones: ZONES.map((z: any, i: number) => (i === 0 ? { ...z, co2: '2200' } : z)) })
    const out = applyAiSections(model, rec, staleAgainst)
    expect(out.aiSectionsStatus).toBe('stale')
    expect(out.execSummary).toEqual(model.execSummary)
  })

  it('with a fresh, fully-supported record, every eligible section is overridden', () => {
    const { model, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const out = applyAiSections(model, rec, pkg)
    expect(out.aiSectionsStatus).toBe('active')
    expect(out.execSummary.paragraphs).toEqual(splitParagraphs(goodResponse(pkg).executive_summary))
    expect(out.discussion.paragraphs).toEqual(splitParagraphs(goodResponse(pkg).discussion))
    expect(out.conceptualModel.intro).toEqual(splitParagraphs(goodResponse(pkg).conceptual_site_model))
    expect(out.recommendations.intro).toEqual(splitParagraphs(goodResponse(pkg).recommendations_prose))
    // The deterministic table/register/rows underneath are untouched.
    expect(out.conceptualModel.rows).toEqual(model.conceptualModel.rows)
    expect(out.recommendations.register).toEqual(model.recommendations.register)
    expect(out.findings).toEqual(model.findings)
    expect(out.limitations).toEqual(model.limitations)
  })

  it('overrides parameter background by key, leaving parameters the response omitted deterministic', () => {
    const { model, pkg } = build()
    const raw = goodResponse(pkg)
    delete raw.parameter_background.thermal
    const rec = buildAiSectionsRecord(raw, pkg)
    const out = applyAiSections(model, rec, pkg)
    const co2Entry = out.results.parameters.find((p: any) => p.key === 'co2')
    const thermalEntry = out.results.parameters.find((p: any) => p.key === 'thermal')
    const detThermal = model.results.parameters.find((p: any) => p.key === 'thermal')
    expect(co2Entry.body).toEqual(splitParagraphs(raw.parameter_background.co2))
    expect(thermalEntry.body).toEqual(detThermal.body)
  })

  it('falls back to deterministic content for ONLY the section a blocking audit finding hits', () => {
    const { model, pkg } = build()
    const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
    const raw = goodResponse(pkg)
    raw.executive_summary = raw.executive_summary.replace(`${co2.value} ppm`, `${co2.value + 400} ppm`)
    const rec = buildAiSectionsRecord(raw, pkg)
    const out = applyAiSections(model, rec, pkg)
    // Blocked section: deterministic fallback, exactly what assembleRenderModel produced.
    expect(out.execSummary).toEqual(model.execSummary)
    // Every other section still uses its AI text.
    expect(out.discussion.paragraphs).toEqual(splitParagraphs(raw.discussion))
    expect(out.conceptualModel.intro).toEqual(splitParagraphs(raw.conceptual_site_model))
  })

  it('is a no-op when the deterministic model has no slot for a section (e.g. no conceptual model)', () => {
    // A two-zone survey with one mechanism does not earn a conceptual site
    // model (reportModel.js siteModelEarnsIts). AI text for it must not
    // manufacture a section the deterministic report chose not to build.
    const zoneScores = [ZONES[0]].map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
    const data = { building: BLDG, presurvey: PRESURVEY, zones: [ZONES[0]], zoneScores, causalChains: [], recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'X', ts: '2026-06-10' }
    const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
    expect(model.conceptualModel).toBeNull()
    const pkg = buildEvidencePackage(model, { zoneScores, causalChains: [] })
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const out = applyAiSections(model, rec, pkg)
    expect(out.conceptualModel).toBeNull()
  })
})

describe('withAiSections — the call-site wrapper every export uses', () => {
  it('matches assembleRenderModel exactly when there is no aiSections record', () => {
    const { data, model } = build()
    const out = withAiSections(data, { now: new Date('2026-06-11T12:00:00Z') })
    const { aiSectionsStatus, aiAuthoredSections, aiOverrides, evidenceFingerprint, ...rest } = out
    expect(aiOverrides).toEqual([])
    expect(aiSectionsStatus).toBe('none')
    expect(aiAuthoredSections).toEqual([])
    expect(evidenceFingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(rest).toEqual(model)
  })

  it('folds in a fresh record end to end', () => {
    const { data, model, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const out = withAiSections({ ...data, aiSections: rec }, { now: new Date('2026-06-11T12:00:00Z') })
    expect(out.aiSectionsStatus).toBe('active')
    expect(out.execSummary.paragraphs).toEqual(splitParagraphs(goodResponse(pkg).executive_summary))
    expect(out.findings).toEqual(model.findings)
  })

  it('renders identically under two different clocks with a fresh AI record — render-determinism holds', () => {
    const { data, pkg } = build()
    const rec = buildAiSectionsRecord(goodResponse(pkg), pkg)
    const withData = { ...data, aiSections: rec }
    const a = withAiSections(withData, { now: new Date('2026-06-11T12:00:00Z') })
    const b = withAiSections(withData, { now: new Date('2027-02-01T09:00:00Z') })
    const strip = (m: any) => { const c = JSON.parse(JSON.stringify(m)); delete c.review.signatureMeta; return c }
    expect(JSON.stringify(strip(a))).toBe(JSON.stringify(strip(b)))
  })
})

describe('splitParagraphs', () => {
  it('splits on blank lines and trims each paragraph', () => {
    expect(splitParagraphs('One.\n\nTwo.\n\n\nThree.')).toEqual(['One.', 'Two.', 'Three.'])
    expect(splitParagraphs('  Single paragraph.  ')).toEqual(['Single paragraph.'])
    expect(splitParagraphs('')).toEqual([])
    expect(splitParagraphs(null)).toEqual([])
  })
})

describe('the wiring reaches every production export site', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

  it('the DOCX builder, the PDF export and the Report tab preview all call withAiSections', () => {
    expect(read('../../src/components/DocxReport.js')).toMatch(/withAiSections\(data \|\| \{\}, undefined\)/)
    expect(read('../../src/utils/downloadReportPdf.js')).toMatch(/withAiSections\(reportData, opts\)/)
    const app = read('../../src/components/MobileApp.jsx')
    expect(app).toMatch(/reportModel = withAiSections\(\{/)
    expect(app).toMatch(/checkRenderModel\(reportModel\)/)
  })

  it('the draft autosave carries the live aiSections state, not a stale copy off `prev`', () => {
    const src = read('../../src/components/MobileApp.jsx')
    // `...prev` alone would silently carry forward whatever aiSections the
    // PREVIOUS save wrote, even after the assessor regenerated — the same
    // staleness bug the fingerprint check exists to catch, reintroduced one
    // layer up. The literal must set it explicitly, same as every other
    // field a live edit can change.
    expect(src).toMatch(/const draft = \{ \.\.\.prev,[\s\S]{0,400}aiSections \}/)
  })

  it('finalize locks whatever aiSections currently holds, into the issued report', () => {
    const src = read('../../src/components/MobileApp.jsx')
    expect(src).toMatch(/aiSections: lockAiSections\(aiSections\)/)
  })

  it('every export literal prefers the stored, locked record over live draft state', () => {
    const src = read('../../src/components/MobileApp.jsx')
    // Same precedence as calibrationAcknowledgement and standardsManifest:
    // an archived/finalized report's OWN stored record wins over whatever
    // the live state happens to hold.
    const matches = src.match(/aiSections: viewRpt\?\.aiSections \|\| aiSections/g) || []
    expect(matches.length).toBe(3)
  })

  it('AssessmentContext restores aiSections on both the draft and the report load paths, and clears it on reset', () => {
    const src = read('../../src/contexts/AssessmentContext.jsx')
    expect(src).toMatch(/setAiSections\(d\.aiSections \|\| null\)/)
    expect(src).toMatch(/setAiSections\(rpt\.aiSections \|\| null\)/)
    expect(src).toMatch(/setAiSections\(null\)/)
  })

  it('the cloud round trip needs no dedicated column — aiSections rides the generic payload path', () => {
    // See tests/lib/supabase-storage-cloud-shape.test.ts for the behavioral
    // proof. This just confirms nobody added a bespoke `ai_sections` mapping
    // that could drift from toPayload/fromCloudRow's generic spread.
    const src = read('../../src/utils/supabaseStorage.js')
    expect(src).not.toMatch(/ai_sections/)
  })
})
