import { describe, it, expect } from 'vitest'
import { renderInternalReport } from '../../src/engine/report/internal'
import { renderClientReport } from '../../src/engine/report/client'
import { assertNoInternalFields } from '../../src/engine/report/validators'
import { TRANSMITTAL_PARAGRAPH, SCOPE_PARAGRAPH, LIMITATIONS_PARAGRAPH, ASSESSMENT_INDEX_DISCLAIMER } from '../../src/engine/report/templates'
import type { AssessmentScore, Finding, FindingId, ZoneId, CategoryScore, ZoneScore } from '../../src/engine/types/domain'

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'F-01' as FindingId, category: 'Contaminants', zoneId: 'Z-01' as ZoneId,
    scope: 'zone',
    severityInternal: 'high', titleInternal: 'CO screening elevated',
    observationInternal: 'CO at 45 ppm via grab sample', deductionInternal: 12,
    conditionType: 'co_screening_elevated', confidenceTier: 'provisional_screening_level',
    definitiveConclusionAllowed: false, causationSupported: false, regulatoryConclusionAllowed: false,
    approvedNarrativeIntent: 'Carbon monoxide was detected at levels that warrant further investigation.',
    evidenceBasis: { kind: 'screening_grab', rationale: 'Grab sample', citationRefs: [] },
    samplingAdequacy: { forConclusion: false, forScreening: true, forHypothesis: true, rationale: [] },
    instrumentAccuracyConsidered: { checked: true, withinNoiseFloor: false },
    limitations: ['Screening only — not 8-hour TWA'],
    recommendedActions: [{ priority: 'short_term', timeframe: '7–30 days', action: 'Investigate combustion source.' }],
    thresholdSource: '29 CFR 1910.1000', observedValue: '45 ppm', thresholdValue: '50 ppm',
    ...overrides,
  }
}

function makeScore(): AssessmentScore {
  const finding = makeFinding()
  const cat: CategoryScore = {
    category: 'Contaminants', rawScore: 13, cappedScore: 13, maxScore: 25,
    status: 'scored', findings: [finding], sufficiencyRatio: 0.7,
  }
  const zone: ZoneScore = {
    zoneId: 'Z-01' as ZoneId, zoneName: 'Boiler Room', composite: 52, tier: 'Moderate',
    confidence: 'provisional_screening_level',
    categories: [cat],
    professionalOpinion: 'conditions_warrant_further_investigation',
  }
  return {
    siteScore: 52, siteTier: 'Moderate', zones: [zone],
    confidenceValue: 0.7, confidenceBand: 'provisional_screening_level',
    defensibilityFlags: { hasInstrumentData: true, hasCalibrationRecords: true, hasSufficientZoneCoverage: true, hasQualifiedAssessor: true, overallDefensible: true },
    meta: {
      siteName: 'Test Facility', siteAddress: '123 Main St', assessmentDate: '2026-04-28',
      preparingAssessor: { fullName: 'Tsidi Tamakloe', credentials: ['CSP'] },
      reviewStatus: 'draft_pending_professional_review',
      issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC', contact: { email: 'tsidi@prudenceehs.com', phone: '301-541-8362' } },
      projectNumber: 'PSEC-TEST-0001',
      transmittalRecipient: { fullName: 'Test Recipient', organization: 'Test Client Org' },
    },
  }
}

describe('Dual Render — Internal Report', () => {
  const score = makeScore()
  const internal = renderInternalReport(score)

  it('contains siteScore', () => {
    expect(internal.siteScore).toBe(52)
  })

  it('contains siteTier', () => {
    expect(internal.siteTier).toBe('Moderate')
  })

  it('contains severityInternal on findings', () => {
    const f = internal.zones[0].categories[0].findings[0]
    expect(f.severityInternal).toBe('high')
    expect(f.deductionInternal).toBe(12)
    expect(f.titleInternal).toBe('CO screening elevated')
  })

  it('contains prioritization queue', () => {
    expect(internal.prioritizationQueue.length).toBeGreaterThan(0)
    expect(internal.prioritizationQueue[0].deduction).toBe(12)
  })

  it('contains permissions on findings', () => {
    const f = internal.zones[0].categories[0].findings[0]
    expect(f.permissions.definitiveConclusionAllowed).toBe(false)
  })
})

describe('Dual Render — Client Report', () => {
  const score = makeScore()
  const result = renderClientReport(score)

  it('returns report kind', () => {
    expect(result.kind).toBe('report')
  })

  it('client report has NO internal fields (recursive traversal)', () => {
    if (result.kind === 'report') {
      expect(() => assertNoInternalFields(result.report)).not.toThrow()
    }
  })

  it('contains verbatim transmittal', () => {
    if (result.kind === 'report') {
      expect(result.report.transmittal).toBe(TRANSMITTAL_PARAGRAPH)
    }
  })

  it('contains verbatim scope', () => {
    if (result.kind === 'report') {
      expect(result.report.scopeAndMethodology).toBe(SCOPE_PARAGRAPH)
    }
  })

  it('contains limitations', () => {
    if (result.kind === 'report') {
      expect(result.report.limitationsAndProfessionalJudgment).toContain(LIMITATIONS_PARAGRAPH)
    }
  })

  it('executive summary has professional opinion language', () => {
    if (result.kind === 'report') {
      expect(result.report.executiveSummary.overallProfessionalOpinionLanguage.length).toBeGreaterThan(20)
    }
  })

  it('zone sections use approved narrative intent, not internal titles', () => {
    if (result.kind === 'report') {
      const zoneSection = result.report.zoneSections[0]
      expect(zoneSection.observedConditions.some(c => c.includes('warrant further investigation'))).toBe(true)
      const fullJson = JSON.stringify(result.report)
      expect(fullJson).not.toContain('CO screening elevated')
      expect(fullJson).not.toContain('deductionInternal')
    }
  })

  it('signatory block renders preparedBy', () => {
    if (result.kind === 'report') {
      expect(result.report.signatoryBlock.preparedBy.name).toBe('Tsidi Tamakloe')
      expect(result.report.signatoryBlock.preparedBy.credentials).toContain('CSP')
    }
  })

  it('draft report shows watermark', () => {
    if (result.kind === 'report') {
      expect(result.report.signatoryBlock.draftWatermark).toBe(true)
    }
  })
})

describe('Dual Render — Assessment Index Appendix', () => {
  const score = makeScore()

  it('assessment index NOT included by default', () => {
    const result = renderClientReport(score)
    if (result.kind === 'report') {
      expect(result.report.appendix.assessmentIndexInformationalOnly).toBeUndefined()
    }
  })

  it('assessment index included when option set', () => {
    const result = renderClientReport(score, { includeAssessmentIndexAppendix: true })
    if (result.kind === 'report') {
      const idx = result.report.appendix.assessmentIndexInformationalOnly
      expect(idx).toBeDefined()
      expect(idx!.disclaimer).toBe(ASSESSMENT_INDEX_DISCLAIMER)
      expect(idx!.siteScore).toBe(52)
    }
  })
})

describe('Dual Render — same input, different outputs', () => {
  const score = makeScore()
  const internal = renderInternalReport(score)
  const clientResult = renderClientReport(score)

  it('internal has numeric scores, client does not', () => {
    expect(internal.siteScore).toBe(52)
    if (clientResult.kind === 'report') {
      const clientJson = JSON.stringify(clientResult.report)
      // siteScore should not appear as a field
      expect(clientJson).not.toContain('"siteScore"')
      expect(clientJson).not.toContain('"rawScore"')
      expect(clientJson).not.toContain('"cappedScore"')
    }
  })

  it('internal has severity labels, client does not', () => {
    const internalJson = JSON.stringify(internal)
    expect(internalJson).toContain('"severityInternal":"high"')

    if (clientResult.kind === 'report') {
      const clientJson = JSON.stringify(clientResult.report)
      expect(clientJson).not.toContain('severityInternal')
    }
  })
})
