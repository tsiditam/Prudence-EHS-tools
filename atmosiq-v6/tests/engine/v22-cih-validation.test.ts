/**
 * CIH defensibility validation layer — regression tests.
 *
 * Validates the 13 categories of post-render checks in
 * src/engine/report/cih-validation.ts plus integration with
 * renderClientReport.
 */

import { describe, it, expect } from 'vitest'
import { validateReportContent } from '../../src/engine/report/cih-validation'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import type { AssessmentMeta } from '../../src/engine/types/domain'
import type { ClientReport } from '../../src/engine/report/types'

const META: AssessmentMeta = {
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

function buildReport(): ClientReport {
  const zone = {
    zn: 'Z1', su: 'office',
    co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12',
  }
  const lz = scoreZone(zone, {})
  const cs = compositeScore([lz])
  const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
  const result = renderClientReport(score)
  if (result.kind !== 'report') throw new Error('Expected report')
  return result.report
}

describe('CIH validation — clean report passes', () => {
  it('renderClientReport on a normal fixture produces clientFacingSafe=true', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.validation).toBeDefined()
    expect(result.validation.passed).toBe(true)
    expect(result.validation.clientFacingSafe).toBe(true)
    expect(result.validation.blockingIssues.length).toBe(0)
    expect(result.validation.blockedTermsFound.length).toBe(0)
  })
})

describe('CIH validation — §1 quantified counts', () => {
  it('Detects "11 conditions warrant attention" in overview', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      executiveSummary: {
        ...report.executiveSummary,
        overview: '11 conditions warrant attention across the assessed zones.',
      },
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
    expect(v.blockingIssues.some(s => s.includes('§1'))).toBe(true)
  })

  it('Detects "5 findings identified" in scope of work', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      executiveSummary: {
        ...report.executiveSummary,
        scopeOfWork: 'PSEC performed an evaluation. 5 findings identified across zones.',
      },
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
  })

  it('Allows narrative without quantified count', () => {
    const report = buildReport()
    const v = validateReportContent(report)
    expect(v.blockingIssues.some(s => s.includes('§1'))).toBe(false)
  })
})

describe('CIH validation — §5 building contradiction', () => {
  it('Flags "no conditions identified" with HVAC recommendations present', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      buildingAndSystemConditions: {
        observedConditions: ['No building or system conditions identified within the stated limitations.'],
        dataLimitations: ['HVAC system performance was not independently verified.'],
        recommendedActions: [
          { priority: 'short_term', timeframe: '7–30 days', action: 'Verify outdoor air damper position.' },
        ],
      },
    }
    const v = validateReportContent(tampered)
    expect(v.blockingIssues.some(s => s.includes('§5'))).toBe(true)
  })

  it('Allows the qualified wording when no findings present', () => {
    const report = buildReport()
    // The current renderer produces this wording by default — verify
    // the validator does NOT flag it.
    const v = validateReportContent(report)
    expect(v.blockingIssues.some(s => s.includes('§5'))).toBe(false)
  })
})

describe('CIH validation — §6 results redundancy', () => {
  it('Warns when Results narrative literally starts with the Opinion language', () => {
    const report = buildReport()
    const opinionLang = report.executiveSummary.overallProfessionalOpinionLanguage
    const tampered: ClientReport = {
      ...report,
      executiveSummary: {
        ...report.executiveSummary,
        resultsNarrative: opinionLang + ' And then some additional text.',
      },
    }
    const v = validateReportContent(tampered)
    expect(v.issues.some(i => i.category.includes('§6'))).toBe(true)
  })
})

describe('CIH validation — §8 corrosion language', () => {
  it('Detects the legacy "professional judgment based on visual/olfactory" phrase', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      buildingAndSystemConditions: {
        ...report.buildingAndSystemConditions,
        dataLimitations: [
          'Gaseous corrosion severity is professional judgment based on visual/olfactory indicators — not instrument measurement.',
        ],
      },
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
    expect(v.blockingIssues.some(s => s.includes('§8'))).toBe(true)
  })
})

describe('CIH validation — §9 recommendation cap', () => {
  it('Warns when Executive Summary has more than 5 recommendations', () => {
    const report = buildReport()
    const action = { priority: 'short_term' as const, timeframe: '7–30 days', action: 'Stub action' }
    const tampered: ClientReport = {
      ...report,
      executiveSummary: {
        ...report.executiveSummary,
        recommendations: [action, action, action, action, action, action, action],
      },
    }
    const v = validateReportContent(tampered)
    expect(v.issues.some(i => i.category.includes('§9'))).toBe(true)
  })

  it('Default render caps at 5', () => {
    // Force significant findings across many ConditionTypes so the
    // engine produces > 5 recommendations.
    const zone = {
      zn: 'Z1', su: 'office',
      co2: '1500', co2o: '420',
      co: '60',           // CO above PEL
      hc: '0.5',          // HCHO action level
      tv: '1500',         // TVOC elevated
      tf: '85', rh: '75', // temp + humidity out of range
      pm: '50',           // PM elevated
      mi: 'Small (< 10 sq ft)',
      wd: 'Active leak',
    }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    expect(result.report.executiveSummary.recommendations.length).toBeLessThanOrEqual(5)
  })
})

describe('CIH validation — §10 tone bans', () => {
  it('Detects banned terms in zone-section observed conditions', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      zoneSections: report.zoneSections.map((z, i) => i === 0 ? {
        ...z,
        observedConditions: ['CO levels are unsafe and confirmed above health risk threshold.'],
      } : z),
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
    expect(v.blockedTermsFound.length).toBeGreaterThan(0)
    const terms = v.blockedTermsFound.map(b => b.term)
    expect(terms).toContain('unsafe')
    expect(terms).toContain('confirmed')
  })

  it('Allows preferred screening-level language', () => {
    const report = buildReport()
    const v = validateReportContent(report)
    // The default phrase library uses "screening-level" / "may be
    // consistent with" / "warrants further evaluation" — none of
    // the banned terms should fire.
    expect(v.blockedTermsFound.length).toBe(0)
  })
})

describe('CIH validation — §11 required statements', () => {
  it('Flags missing methodology disclosure', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      methodologyDisclosure: '',
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
    expect(v.blockingIssues.some(s => s.includes('§11'))).toBe(true)
  })

  it('Flags missing limitations paragraph', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      limitationsAndProfessionalJudgment: 'Some unrelated text',
    }
    const v = validateReportContent(tampered)
    expect(v.passed).toBe(false)
    expect(v.blockingIssues.some(s => s.includes('§11'))).toBe(true)
  })

  it('Default render passes the §11 check', () => {
    const report = buildReport()
    const v = validateReportContent(report)
    expect(v.blockingIssues.filter(s => s.includes('§11'))).toEqual([])
  })
})

describe('CIH validation — §2 duplicate findings', () => {
  it('Warns when zone observedConditions contain identical entries', () => {
    const report = buildReport()
    const tampered: ClientReport = {
      ...report,
      zoneSections: report.zoneSections.map((z, i) => i === 0 ? {
        ...z,
        observedConditions: [
          'Multiple occupants in the same area reported similar symptoms.',
          'Multiple occupants in the same area reported similar symptoms.',
        ],
      } : z),
    }
    const v = validateReportContent(tampered)
    expect(v.issues.some(i => i.category.includes('§2'))).toBe(true)
    expect(v.duplicateFindingsMerged.length).toBeGreaterThan(0)
  })
})

describe('CIH validation — integration', () => {
  it('renderClientReport attaches validation to the result envelope', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '900', co2o: '420', tf: '74', rh: '52', pm: '12' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    expect(result.validation).toBeDefined()
    expect(typeof result.validation.passed).toBe('boolean')
    expect(typeof result.validation.clientFacingSafe).toBe('boolean')
    expect(Array.isArray(result.validation.issues)).toBe(true)
    expect(Array.isArray(result.validation.blockingIssues)).toBe(true)
    expect(Array.isArray(result.validation.blockedTermsFound)).toBe(true)
    expect(Array.isArray(result.validation.duplicateFindingsMerged)).toBe(true)
    expect(Array.isArray(result.validation.autoFixesApplied)).toBe(true)
    expect(Array.isArray(result.validation.recommendedFixes)).toBe(true)
  })

  it('Default-rendered report has no quantified counts in overview', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '74', rh: '52' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const ov = result.report.executiveSummary.overview
    // Must NOT contain "<digit> conditions warrant"
    expect(ov).not.toMatch(/\b\d+\s+conditions?\s+warrant/i)
    expect(ov).not.toMatch(/\b\d+\s+findings?\s+identified/i)
  })

  it('Default-rendered report uses qualified building/system wording', () => {
    const zone = { zn: 'Z1', su: 'office', co2: '600', co2o: '420', tf: '72', rh: '45', pm: '5' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz] as any, cs as any, [zone] as any, { meta: META, presurvey: PRESURVEY })
    const result = renderClientReport(score)
    if (result.kind !== 'report') return
    const conditions = result.report.buildingAndSystemConditions.observedConditions
    // Default text should include the qualifying clause about HVAC
    // performance not independently verified.
    expect(conditions.some(c => /not independently verified/i.test(c))).toBe(true)
  })
})
