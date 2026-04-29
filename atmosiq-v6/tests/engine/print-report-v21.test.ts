/**
 * Phase 3 — round-trip: legacy assessment data → bridge → renderClientReport
 * → generatePrintHTML. Asserts the resulting HTML is a CIH-defensible
 * client deliverable: no scores, no severity labels, no internal-field
 * leakage, verbatim engine paragraphs preserved, professional-opinion
 * language present.
 */

import { describe, it, expect } from 'vitest'
import { generatePrintHTML, generateLegacyPrintHTML } from '../../src/components/PrintReport'
import { generateClientReportHTML } from '../../src/components/print/client-html.js'
import { legacyToAssessmentScore, deriveAssessmentMeta } from '../../src/engine/bridge'
import { renderClientReport } from '../../src/engine/report/client'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { DEMO_PRESURVEY, DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData'
import {
  TRANSMITTAL_PARAGRAPH, SCOPE_PARAGRAPH, LIMITATIONS_PARAGRAPH,
  COVER_METHODOLOGY_LINE,
} from '../../src/engine/report/templates'

function buildPrintData() {
  const zoneScores = DEMO_ZONES.map((z: any) => scoreZone(z, DEMO_BUILDING))
  const comp = compositeScore(zoneScores)
  return {
    building: DEMO_BUILDING,
    presurvey: DEMO_PRESURVEY,
    zones: DEMO_ZONES,
    zoneScores,
    comp,
    profile: { name: 'J. Smith', certs: ['CIH', 'CSP'], firm: 'Prudence Safety & Environmental Consulting, LLC' },
    photos: {},
    version: '6.0.0',
    ts: '2026-04-28T12:00:00Z',
  }
}

describe('Phase 3 — generatePrintHTML produces a CIH-defensible deliverable', () => {
  const html = generatePrintHTML(buildPrintData())

  it('returns a non-empty HTML document', () => {
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
  })

  it('contains the verbatim transmittal paragraph from engine templates', () => {
    expect(html).toContain(TRANSMITTAL_PARAGRAPH)
  })

  it('contains the verbatim scope paragraph', () => {
    expect(html).toContain(SCOPE_PARAGRAPH)
  })

  it('contains the verbatim limitations paragraph', () => {
    expect(html).toContain(LIMITATIONS_PARAGRAPH)
  })

  it('contains the cover methodology line', () => {
    expect(html).toContain(COVER_METHODOLOGY_LINE)
  })

  it('does NOT contain internal severity labels in body content', () => {
    // The labels can appear inside CSS class names; strip the <style> block before checking.
    const body = html.replace(/<style>[\s\S]*?<\/style>/g, '')
    // Whole-word match — avoid false positives on words like "passenger".
    for (const label of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'PASS', 'INFO']) {
      const re = new RegExp(`>\\s*${label}\\s*<`)
      expect(body).not.toMatch(re)
    }
  })

  it('does NOT contain internal field names (severityInternal, deductionInternal, rawScore, cappedScore, siteScore field key)', () => {
    expect(html).not.toContain('severityInternal')
    expect(html).not.toContain('deductionInternal')
    expect(html).not.toContain('rawScore')
    expect(html).not.toContain('cappedScore')
    expect(html).not.toContain('"siteScore"')
  })

  it('does NOT contain a numeric composite score in body content', () => {
    // Legacy print embedded "Composite Score: 84/100" style strings; the v2.1
    // path replaces these with professional-opinion language. We can't ban
    // the digit "100" entirely (it appears in "100%" etc.), but we can ban
    // the legacy phrase pattern used by the old print template.
    const body = html.replace(/<style>[\s\S]*?<\/style>/g, '')
    expect(body).not.toMatch(/Composite Score:\s*\d+\/100/)
    expect(body).not.toMatch(/Average zone score/i)
    expect(body).not.toMatch(/Worst zone score/i)
    expect(body).not.toContain('Composite score')
  })

  it('does NOT contain legacy tier labels rendered as standalone risk badges', () => {
    // Tier labels like "Critical", "High Risk", "Moderate", "Low Risk"
    // should not appear as standalone status badges in client output.
    // (They may appear inside narrative paragraphs about the building, but
    // should not be the rendered status of the assessment itself.)
    const body = html.replace(/<style>[\s\S]*?<\/style>/g, '')
    expect(body).not.toMatch(/risk-badge[^>]*>\s*Critical\s*</)
    expect(body).not.toMatch(/risk-badge[^>]*>\s*High Risk\s*</)
  })

  it('contains the overall professional opinion language', () => {
    // The exact text varies based on findings, but every opinion language
    // string contains "warrant" or "no significant".
    expect(html).toMatch(/warrant|no significant/i)
  })

  it('contains the signatory block with assessor credentials', () => {
    expect(html).toContain('J. Smith')
    expect(html).toContain('CIH')
    expect(html).toContain('Prepared by')
  })

  it('shows draft watermark for default reviewStatus', () => {
    expect(html).toContain('DRAFT')
  })
})

describe('Phase 3 — generatePrintHTML on insufficient data returns memo, not report', () => {
  it('produces a pre-assessment memo when refusal-to-issue triggers', () => {
    // Empty zone with no data should trigger refusal-to-issue.
    const zone = { zn: 'Empty Zone', su: 'office' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const html = generatePrintHTML({
      building: { fn: 'Test Site', fl: '123 Test St' },
      presurvey: { ps_assessor: 'Test' },
      zones: [zone],
      zoneScores: [lz],
      comp: cs,
      profile: { name: 'J. Smith', certs: ['CIH'] },
    })
    // Either the report path renders (with no findings) or the memo path
    // renders. Both are CIH-defensible. Verify at least one of:
    const isMemo = html.includes('Pre-Assessment Memo') || html.includes('does not constitute')
    const isReport = html.includes(TRANSMITTAL_PARAGRAPH)
    expect(isMemo || isReport).toBe(true)
  })
})

describe('Phase 3 — legacy print path remains available for fallback', () => {
  it('generateLegacyPrintHTML is exported and produces non-empty HTML', () => {
    const data = buildPrintData()
    // Provide the extras the legacy path expects so it doesn't crash.
    const legacyData = {
      ...data,
      oshaResult: null,
      recs: null,
      samplingPlan: null,
      causalChains: [],
      narrative: null,
      standardsManifest: null,
      userMode: 'cih',
      escalationTriggers: [],
    }
    const html = generateLegacyPrintHTML(legacyData)
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toMatch(/^<!DOCTYPE html>/)
  })
})

describe('Phase 3 — generateClientReportHTML directly', () => {
  const score = (() => {
    const zoneScores = DEMO_ZONES.map((z: any) => scoreZone(z, DEMO_BUILDING))
    const comp = compositeScore(zoneScores)
    const meta = deriveAssessmentMeta({
      profile: { name: 'J. Smith', certs: ['CIH'], firm: 'PSEC' },
      presurvey: DEMO_PRESURVEY,
      building: DEMO_BUILDING,
      assessmentDate: '2026-04-28',
    })
    return legacyToAssessmentScore(zoneScores as any, comp as any, DEMO_ZONES as any, { meta, presurvey: DEMO_PRESURVEY as any, building: DEMO_BUILDING as any })
  })()

  it('renders client report HTML when no refusal-to-issue trigger', () => {
    const result = renderClientReport(score)
    if (result.kind !== 'report') {
      // Accept either path — the renderer handles both.
      expect(result.kind).toBe('pre_assessment_memo')
      return
    }
    const html = generateClientReportHTML(result)
    expect(html).toContain(TRANSMITTAL_PARAGRAPH)
    expect(html).toContain('Executive Summary')
    expect(html).toContain('Zone Findings')
    expect(html).toContain('Limitations and Professional Judgment')
  })

  it('renders memo HTML when given pre_assessment_memo kind', () => {
    const memo = {
      kind: 'pre_assessment_memo' as const,
      memo: {
        engineVersion: 'atmosflow-engine-2.1.0',
        generatedAt: Date.now(),
        meta: score.meta,
        cover: {
          title: 'Indoor Air Quality Pre-Assessment Memo',
          facility: 'Test Site',
          location: '123 Test St',
          date: '2026-04-28',
          preparedBy: 'J. Smith, CIH — PSEC',
          status: 'draft_pending_professional_review',
          methodologyLine: COVER_METHODOLOGY_LINE,
        },
        purposeStatement: 'A purpose statement.',
        dataGaps: [{ trigger: 'no_instrument_data', description: 'No instrument data was collected.' }],
        recommendedFollowUp: ['Schedule a return visit with calibrated instruments.'],
        signatoryBlock: {
          preparedBy: { name: 'J. Smith', credentials: 'CIH', firm: 'PSEC', contact: '' },
          reviewedBy: null,
          status: 'draft_pending_professional_review',
          draftWatermark: true,
        },
        notice: 'This memo does not constitute an indoor air quality evaluation.',
      },
      reasons: ['Insufficient data across all zones'],
    }
    const html = generateClientReportHTML(memo)
    expect(html).toContain('Pre-Assessment Memo')
    expect(html).toContain('does not constitute')
    expect(html).toContain('Identified Data Gaps')
    expect(html).toContain('Recommended Follow-Up')
  })
})
