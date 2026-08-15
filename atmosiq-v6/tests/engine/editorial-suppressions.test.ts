/**
 * Editorial suppressions — data model + renderer "apply" mechanism.
 *
 * The pure helper is the persisted record of human-approved cuts; the
 * renderer honors it by omitting the targeted content. The engine model is
 * unchanged — only what the client DOCX emits changes.
 */
import { describe, it, expect } from 'vitest'
import { Document, Packer, SectionType } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { renderClientReport } from '../../src/engine/report/client'
// @ts-expect-error — JS module without types
import { buildClientDocx } from '../../src/components/docx/sections-v21client'
// @ts-expect-error — JS module without types
import { DOCX_STYLES } from '../../src/components/docx/styles'
import {
  makeTargetKey,
  buildEditorialSuppressions,
  normalizeEditorialSuppressions,
  makeSuppressionIndex,
  isSuppressed,
  EDITORIAL_SUPPRESSIONS_VERSION,
  // @ts-expect-error — JS module without types
} from '../../src/utils/editorialSuppressions'

const META: any = {
  siteName: 'Test Site', siteAddress: '123 Test St',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'J. Smith', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review',
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'PSEC-TEST-0001',
  transmittalRecipient: { fullName: 'Recipient', organization: 'Org' },
}
const PRESURVEY = {
  ps_assessor: 'J. Smith',
  ps_inst_iaq: 'TSI Q-Trak 7575',
  ps_inst_iaq_cal: '2026-01-15',
  ps_inst_iaq_cal_status: 'Calibrated',
}

function buildReport(): any {
  const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz], cs, [zone], { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  return result
}

async function renderXml(result: any, options: any): Promise<string> {
  const { cover, main } = buildClientDocx(result, options)
  const doc = new Document({
    creator: 'AtmosFlow', title: 'Test', styles: DOCX_STYLES,
    sections: [cover, { properties: { type: SectionType.NEXT_PAGE }, children: main }],
  })
  const buf = await Packer.toBuffer(doc)
  const zip = await JSZip.loadAsync(buf)
  return zip.file('word/document.xml')!.async('string')
}

describe('editorialSuppressions — pure helper', () => {
  it('makeTargetKey canonicalizes each supported kind and rejects malformed', () => {
    expect(makeTargetKey({ kind: 'finding', findingId: 'f1' })).toBe('finding:f1')
    expect(makeTargetKey({ kind: 'zone', zoneId: 'z1' })).toBe('zone:z1')
    expect(makeTargetKey({ kind: 'resultsSubsection', heading: '  Carbon  Dioxide ' })).toBe('results:carbon dioxide')
    expect(makeTargetKey({ kind: 'recommendation', priority: 'Immediate', action: 'Clean  pan.' })).toBe('rec:immediate:clean pan.')
    expect(makeTargetKey({ kind: 'section', anchorId: 'Benchmarks' })).toBe('section:benchmarks')
    expect(makeTargetKey({ kind: 'finding' })).toBeNull()
    expect(makeTargetKey({ kind: 'bogus', x: 1 } as any)).toBeNull()
    expect(makeTargetKey(null as any)).toBeNull()
  })

  it('buildEditorialSuppressions dedupes, drops malformed, returns null when empty', () => {
    expect(buildEditorialSuppressions({ cuts: [] })).toBeNull()
    expect(buildEditorialSuppressions({ cuts: [{ target: { kind: 'finding' } }] })).toBeNull()
    const rec = buildEditorialSuppressions({
      cuts: [
        { target: { kind: 'finding', findingId: 'f1' }, label: 'over-reaching' },
        { target: { kind: 'finding', findingId: 'f1' } }, // dup
        { target: { kind: 'zone', zoneId: 'z9' } },
      ],
      approvedBy: 'J. Smith, CIH',
      approvedAt: '2026-08-15T00:00:00Z',
    })
    expect(rec.version).toBe(EDITORIAL_SUPPRESSIONS_VERSION)
    expect(rec.targets.length).toBe(2)
    expect(rec.approvedBy).toBe('J. Smith, CIH')
    expect(rec.targets[0].label).toBe('over-reaching')
  })

  it('normalizeEditorialSuppressions tolerates a bare array and drops junk', () => {
    const rec = normalizeEditorialSuppressions([
      { kind: 'finding', findingId: 'f1' },
      { kind: 'nope' },
      { kind: 'zone', zoneId: 'z1' },
    ])
    expect(rec.targets.length).toBe(2)
    expect(normalizeEditorialSuppressions(null)).toBeNull()
    expect(normalizeEditorialSuppressions({ targets: [{ kind: 'x' }] })).toBeNull()
  })

  it('makeSuppressionIndex gives an O(1) membership test; empty is safe', () => {
    const idx = makeSuppressionIndex({ targets: [{ kind: 'finding', findingId: 'f1' }] })
    expect(idx.size).toBe(1)
    expect(idx.has({ kind: 'finding', findingId: 'f1' })).toBe(true)
    expect(idx.has({ kind: 'finding', findingId: 'other' })).toBe(false)
    const empty = makeSuppressionIndex(null)
    expect(empty.size).toBe(0)
    expect(isSuppressed(empty, { kind: 'finding', findingId: 'f1' })).toBe(false)
  })
})

describe('editorialSuppressions — renderer honors approved cuts', () => {
  it('absent suppressions render the full report (baseline)', async () => {
    const result = buildReport()
    const xml = await renderXml(result, {})
    const firstHeading = result.report.resultsSection.subsections[0].heading
    expect(xml).toContain(firstHeading)
  })

  it('suppressing a results subsection removes its measurement summary from the DOCX', async () => {
    const result = buildReport()
    // Pick a subsection that has a measurement summary (unique to Results;
    // the parameter heading itself also appears in Appendix A tables).
    const sub = result.report.resultsSection.subsections.find((s: any) => s.measurementSummary)
    expect(sub).toBeTruthy()
    const base = await renderXml(result, {})
    expect(base).toContain(sub.measurementSummary)
    const cut = await renderXml(result, {
      editorialSuppressions: { targets: [{ kind: 'resultsSubsection', heading: sub.heading }] },
    })
    expect(cut).not.toContain(sub.measurementSummary)
  })

  it('suppressing a recommendation removes its action text from the register', async () => {
    const result = buildReport()
    const reg = result.report.recommendationsRegister
    const firstBucket = [reg.immediate, reg.shortTerm, reg.furtherEvaluation, reg.longTermOptional]
      .find((l: any[]) => Array.isArray(l) && l.length > 0)
    if (!firstBucket) return // fixture produced no recommendations; nothing to assert
    const action = firstBucket[0].action
    const priority = firstBucket[0].priority
    const base = await renderXml(result, {})
    expect(base).toContain(action)
    const cut = await renderXml(result, {
      editorialSuppressions: { targets: [{ kind: 'recommendation', priority, action }] },
    })
    expect(cut).not.toContain(action)
  })

  it('suppressing a finding removes its narrative from the DOCX', async () => {
    const result = buildReport()
    const zoneWithFinding = (result.report.zoneSections || []).find(
      (z: any) => Array.isArray(z.findings) && z.findings.length > 0,
    )
    if (!zoneWithFinding) return // no findings in fixture; nothing to assert
    const finding = zoneWithFinding.findings[0]
    const narrativeSnippet = (finding.narrative || '').slice(0, 40)
    const base = await renderXml(result, {})
    expect(base).toContain(narrativeSnippet)
    const cut = await renderXml(result, {
      editorialSuppressions: { targets: [{ kind: 'finding', findingId: finding.findingId }] },
    })
    expect(cut).not.toContain(narrativeSnippet)
  })
})
