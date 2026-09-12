// @vitest-environment node
/**
 * AI output is generated once and SAVED with the assessment, so reopening or
 * re-exporting a report never asks the model — or bills the credits — again.
 *
 * Two outputs, one discipline. The DOCX sections (`aiSections`) already
 * persisted through the draft autosave and the finalize body, but the Report
 * tab where both generate buttons live only exists for a finalized report,
 * and nothing wrote from there: the text lived in React state until the
 * report was closed. The standalone narrative had no write path at all.
 * Both now go through `persistAiOutput`, and each carries the fingerprint of
 * the evidence it was written from so a stored copy can be told apart from
 * one written for an assessment that has since changed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-ignore js
import { generateNarrative } from '../../src/engines/narrative.js'
// @ts-ignore js
import { fingerprintPackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { withAiSections, buildAiSectionsRecord } from '../../src/report/aiSections.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const AT = { assessmentDate: '2026-06-10' }

function build() {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const data = { building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains: [], recs: { imm: [], eng: [], adm: [], mon: [] }, id: 'AIQ-DEMO', ts: '2026-06-10' }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains: [] })
  return { data, pkg, zoneScores }
}

describe('the narrative carries the fingerprint of the evidence it was written from', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ narrative: 'Carbon dioxide stood out at this site.' }) })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns fingerprintPackage(evidence) beside the text', async () => {
    const { zoneScores } = build()
    const r = await generateNarrative(BLDG, ZONES, zoneScores, [], PRESURVEY, { id: 'AIQ-DEMO', ts: '2026-06-10' })
    expect(r.narrative).toBeTruthy()
    expect(r.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(r.fingerprint).toBe(fingerprintPackage(r.evidence))
  })

  it('matches the fingerprint the render path computes for the same assessment', async () => {
    const { data, zoneScores } = build()
    const r = await generateNarrative(BLDG, ZONES, zoneScores, data.recs, PRESURVEY, { id: 'AIQ-DEMO', ts: '2026-06-10', causalChains: [] })
    expect(withAiSections(data).evidenceFingerprint).toBe(r.fingerprint)
  })
})

describe('withAiSections exposes the current evidence fingerprint', () => {
  it('in every status, and it is the package fingerprint', () => {
    const { data, pkg } = build()
    expect(withAiSections(data).evidenceFingerprint).toBe(fingerprintPackage(pkg))
    const rec = buildAiSectionsRecord({ executive_summary: 'Carbon dioxide stood out at this site.' }, pkg)
    const active = withAiSections({ ...data, aiSections: rec })
    expect(active.aiSectionsStatus).toBe('active')
    expect(active.evidenceFingerprint).toBe(fingerprintPackage(pkg))
    const stale = withAiSections({ ...data, aiSections: { ...rec, fingerprint: '00000000' } })
    expect(stale.aiSectionsStatus).toBe('stale')
    expect(stale.evidenceFingerprint).toBe(fingerprintPackage(pkg))
  })
})

describe('the Report tab writes what it generates onto the stored record', () => {
  const app = read('../../src/components/MobileApp.jsx')

  it('both generate handlers persist through persistAiOutput', () => {
    expect(app).toMatch(/await persistAiOutput\(\{ narrative: text, narrativeMeta: meta \}\)/)
    expect(app).toMatch(/await persistAiOutput\(\{ aiSections: record \}\)/)
  })

  it('an issued report is reopened before its payload is re-saved (migration 034), and saved as complete', () => {
    const body = app.slice(app.indexOf('const persistAiOutput'), app.indexOf('const viewingIssuedReport'))
    expect(body).toMatch(/Storage\.reopenAssessment\(id\)/)
    expect(body).toMatch(/Storage\.saveAssessment\(\{ \.\.\.full, \.\.\.patch, ua, status: 'complete'/)
    expect(body).toMatch(/Storage\.getAssessment\(id\)/)
  })

  it('sections generated on an issued report are locked, as at finalize', () => {
    expect(app).toMatch(/viewingIssuedReport\(\) \? lockAiSections\(rec\) : rec/)
  })

  it('opening a report restores the narrative and its audit record', () => {
    expect(app).toMatch(/setNarrative\(rpt\.narrative\|\|null\); setNarrativeMeta\(rpt\.narrativeMeta\|\|null\)/)
  })

  it('re-finalize carries a narrative forward only on a fingerprint match', () => {
    expect(app).toMatch(/current === priorMeta\.fingerprint/)
    expect(app).toMatch(/report = \{ \.\.\.report, narrative: priorBody\.narrative, narrativeMeta: priorMeta \}/)
  })
})
