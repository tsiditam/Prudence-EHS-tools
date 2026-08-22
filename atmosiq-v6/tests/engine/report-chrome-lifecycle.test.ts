// @vitest-environment node
/**
 * Report chrome and the signature block, across the whole lifecycle.
 *
 * reportLifecycle.test.ts pins the pure state machine. This pins what a
 * reader actually SEES once that state reaches the renderer — which is
 * where the original defect lived: every report, however finished,
 * carried a DRAFT watermark and a sentence saying it needed a
 * professional before it could be issued.
 *
 * Two regressions this is here to prevent:
 *
 *   • A finished screening report growing a watermark or "pending"
 *     wording again. That is the bug the refactor exists to fix.
 *   • The legacy `mode: 'final'` consultant path quietly losing its
 *     professional accountability statement. api/report-pdf.js and
 *     src/utils/downloadReportPdf.js still call that way, and swapping
 *     their signature block would be a silent change to a shipped
 *     deliverable.
 */
import { describe, it, expect } from 'vitest'
import { assembleRenderModel } from '../../src/report/reportModel.js'
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
import { DEMO_FINDINGS_BUILDING as DEMO_BUILDING, DEMO_FINDINGS_ZONES as DEMO_ZONES, DEMO_FINDINGS_PRESURVEY as DEMO_PRESURVEY } from '../../src/constants/demoDataFindings'
import {
  REPORT_PROFILES, REPORT_STATUS, REPORT_PROFILE_VALUES, REPORT_STATUS_VALUES,
  SCREENING_LIMITATION,
} from '../../src/constants/reportLifecycle'

const { SCREENING, PROFESSIONAL, COMPLIANCE } = REPORT_PROFILES
const { DRAFT, IN_REVIEW, REVIEWED, FINAL } = REPORT_STATUS

function demoData() {
  const zoneScores = (DEMO_ZONES as any[]).map((z) => scoreZone(z, DEMO_BUILDING))
  return {
    building: DEMO_BUILDING, presurvey: DEMO_PRESURVEY, zones: DEMO_ZONES, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH', 'CSP'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }
}

const model = (opts: Record<string, unknown>) => assembleRenderModel(demoData(), opts) as any

const REVIEWER = {
  name: 'Tsidi Tamakloe',
  credentials: 'CSP, BCSP #38426',
  organization: 'Prudence EHS',
  reviewDate: 'August 2, 2026',
  approvalId: 'APR-2026-0417',
}

/** Everything a reader sees, as one searchable string. */
const surface = (m: any) =>
  [m.meta.headerLabel, m.meta.watermark, m.meta.coverStatusChip, m.meta.footerNote,
    m.meta.coverDisclaimer, m.review.statement, m.review.signatureMeta].filter(Boolean).join(' | ')

describe('a finished screening report looks finished', () => {
  it('carries no watermark and no pending language', () => {
    for (const status of [REVIEWED, FINAL]) {
      const m = model({ reportProfile: SCREENING, reportStatus: status })
      expect(m.meta.watermark, `${status} grew a watermark`).toBeNull()
      expect(m.meta.coverDisclaimer).toBeNull()
      expect(surface(m)).not.toMatch(/IH Review Required|pending professional review|requires review/i)
    }
  })

  it('states its scope instead, verbatim', () => {
    const m = model({ reportProfile: SCREENING, reportStatus: FINAL })
    expect(m.review.statement).toBe(SCREENING_LIMITATION)
  })

  it('never claims the assessor accepted responsibility for a professional opinion', () => {
    // Screening-only positioning: a screening report is a record of
    // measurements, not a professional interpretation someone signed for.
    const m = model({ reportProfile: SCREENING, reportStatus: FINAL })
    expect(m.review.statement).not.toMatch(/accepts responsibility/i)
  })

  it('still says Draft while it genuinely is one — without "pending review"', () => {
    const m = model({ reportProfile: SCREENING, reportStatus: DRAFT })
    expect(m.meta.watermark).toBe('DRAFT')
    expect(m.meta.headerLabel).toBe('Draft')
    expect(surface(m)).not.toMatch(/pending professional review/i)
  })
})

describe('professional and compliance reports', () => {
  it('say pending review while in draft, where it is true', () => {
    const m = model({ reportProfile: PROFESSIONAL, reportStatus: DRAFT })
    expect(m.meta.headerLabel).toBe('Draft — Pending Professional Review')
    expect(m.review.statement).toMatch(/has not completed professional review/i)
  })

  it('mark the in-review state as not for distribution', () => {
    const m = model({ reportProfile: PROFESSIONAL, reportStatus: IN_REVIEW })
    expect(m.meta.watermark).toBe('IN REVIEW')
    expect(m.meta.coverDisclaimer).toMatch(/should not be distributed/i)
  })

  it('sign a reviewed report with the REVIEWER, not the preparer', () => {
    const m = model({ reportProfile: PROFESSIONAL, reportStatus: REVIEWED, reviewer: REVIEWER })
    expect(m.meta.watermark).toBeNull()
    expect(m.review.signatureName).toBe('Tsidi Tamakloe')
    expect(m.review.signatureTitle).toBe('CSP, BCSP #38426')
    expect(m.review.signatureFirm).toBe('Prudence EHS')
    expect(m.review.signatureName).not.toBe('John Smith')
  })

  it('record the approval id and review date in the signature block', () => {
    const m = model({ reportProfile: COMPLIANCE, reportStatus: REVIEWED, reviewer: REVIEWER })
    expect(m.review.signatureMeta).toContain('APR-2026-0417')
    expect(m.review.signatureMeta).toContain('August 2, 2026')
  })

  it('do NOT claim a professional review when no reviewer was recorded', () => {
    // Final with no reviewer row: the assessor signs their own work.
    // Printing a reviewer block here would fabricate an approval.
    const m = model({ reportProfile: PROFESSIONAL, reportStatus: FINAL })
    expect(m.review.signatureName).toBe('John Smith')
    expect(m.review.signatureMeta).not.toMatch(/Approval/i)
  })
})

describe('backward compatibility', () => {
  it('leaves the legacy consultant final path exactly as it shipped', () => {
    const m = model({ mode: 'final' })
    expect(m.meta.headerLabel).toBe('Confidential — Final')
    expect(m.meta.watermark).toBeNull()
    expect(m.review.statement).toMatch(/undersigned has reviewed/i)
    expect(m.review.statement).toMatch(/accepts responsibility/i)
  })

  it('treats a legacy mode caller as professional, not screening', () => {
    // A caller passing the old `mode` switch is the consultant report
    // path. Reclassifying it as screening would swap its signature block.
    const m = model({ mode: 'final' })
    expect(m.meta.reportProfile).toBe(PROFESSIONAL)
  })

  it('keeps the sample artifact self-consistent', () => {
    // Header said "Sample" while the signature said "Draft" — a reader
    // reasonably reads that as a mistake in the document.
    const m = model({ mode: 'sample' })
    expect(m.meta.watermark).toBe('SAMPLE')
    expect(m.meta.headerLabel).toMatch(/^Sample/)
    expect(m.review.signatureMeta).toMatch(/Sample$/)
    expect(m.review.signatureMeta).not.toMatch(/Draft/)
  })

  it('reads a record that predates the lifecycle from its legacy status', () => {
    const m = assembleRenderModel({ ...demoData(), status: 'complete' } as any, {}) as any
    expect(m.meta.reportStatus).toBe(FINAL)
    expect(m.meta.watermark).toBeNull()
  })
})

describe('no combination is left unrendered', () => {
  it('produces complete chrome for every profile × status', () => {
    for (const reportProfile of REPORT_PROFILE_VALUES) {
      for (const reportStatus of REPORT_STATUS_VALUES) {
        const m = model({ reportProfile, reportStatus, reviewer: REVIEWER })
        expect(m.meta.headerLabel, `${reportProfile}/${reportStatus}`).toBeTruthy()
        expect(m.meta.coverStatusChip).toBeTruthy()
        expect(m.meta.footerNote).toBeTruthy()
        expect(m.review.statement).toBeTruthy()
        expect(m.review.signatureName).toBeTruthy()
      }
    }
  })

  it('never emits the old blanket stamp in any combination', () => {
    for (const reportProfile of REPORT_PROFILE_VALUES) {
      for (const reportStatus of REPORT_STATUS_VALUES) {
        const m = model({ reportProfile, reportStatus, reviewer: REVIEWER })
        expect(surface(m), `${reportProfile}/${reportStatus}`).not.toMatch(/IH Review Required/i)
      }
    }
  })
})
