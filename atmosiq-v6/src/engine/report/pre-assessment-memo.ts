/**
 * AtmosFlow Engine v2.1 — Pre-Assessment Memo (Refusal to Issue)
 * When data is insufficient for a professional report, the engine
 * returns a memo instead — never a report with insufficient backing.
 */

import type { AssessmentScore } from '../types/domain'
import type { PreAssessmentMemo, CoverPage, SignatoryBlock } from './types'
import { ENGINE_VERSION } from '../types/citation'
import { PRE_ASSESSMENT_MEMO_NOTICE, DRAFT_WATERMARK, COVER_METHODOLOGY_LINE } from './templates'

export interface RefusalTrigger {
  readonly id: string
  readonly description: string
  readonly fired: boolean
}

export function evaluateRefusalTriggers(score: AssessmentScore): RefusalTrigger[] {
  const triggers: RefusalTrigger[] = []

  // 1. No-measurement trigger
  const hasAnyMeasurement = score.zones.some(z =>
    z.categories.some(c => c.findings.some(f => f.evidenceBasis.kind !== 'visual_olfactory_screening' && f.evidenceBasis.kind !== 'occupant_report_anecdotal'))
  )
  triggers.push({
    id: 'no_measurement',
    description: 'No zones have direct-reading instrument measurements of any contaminant or environmental parameter.',
    fired: !hasAnyMeasurement,
  })

  // 2. Bulk-insufficiency trigger
  const totalCells = score.zones.length * 5
  const insufficientCells = score.zones.reduce((sum, z) =>
    sum + z.categories.filter(c => c.status === 'insufficient' || c.status === 'data_gap').length, 0
  )
  triggers.push({
    id: 'bulk_insufficiency',
    description: `More than 50% of zone×category cells have insufficient data (${insufficientCells}/${totalCells}).`,
    fired: totalCells > 0 && (insufficientCells / totalCells) > 0.5,
  })

  // 3. Confidence-collapse trigger
  const hasAnyScreeningOrBetter = score.zones.some(z =>
    z.categories.flatMap(c => c.findings).some(f =>
      f.confidenceTier === 'validated_defensible' || f.confidenceTier === 'provisional_screening_level'
    )
  )
  triggers.push({
    id: 'confidence_collapse',
    description: 'No findings with validated or provisional screening confidence exist across the entire assessment.',
    fired: !hasAnyScreeningOrBetter && score.zones.some(z => z.categories.flatMap(c => c.findings).length > 0),
  })

  // 4. Calibration-absence trigger
  triggers.push({
    id: 'calibration_absence',
    description: 'No referenced instrument has a documented calibration record.',
    fired: !score.defensibilityFlags.hasCalibrationRecords,
  })

  // 5. Credential-absence trigger
  const hasCredentials = score.meta.preparingAssessor.credentials.length > 0 || !!score.meta.reviewingProfessional
  triggers.push({
    id: 'credential_absence',
    description: 'Preparing assessor has no listed credentials and no reviewing professional is designated.',
    fired: !hasCredentials,
  })

  // 6. Insufficient-opinion trigger
  const allInsufficient = score.zones.every(z =>
    z.categories.flatMap(c => c.findings).every(f => f.confidenceTier === 'insufficient_data')
  )
  triggers.push({
    id: 'insufficient_opinion',
    description: 'All findings across all zones are at insufficient-data confidence. No professional opinion can be rendered.',
    fired: allInsufficient && score.zones.some(z => z.categories.flatMap(c => c.findings).length > 0),
  })

  return triggers
}

export function shouldRefuseToIssue(score: AssessmentScore): { refuse: boolean; reasons: string[] } {
  const triggers = evaluateRefusalTriggers(score)
  const fired = triggers.filter(t => t.fired)
  return {
    refuse: fired.length > 0,
    reasons: fired.map(t => t.description),
  }
}

export function buildPreAssessmentMemo(score: AssessmentScore, reasons: string[]): PreAssessmentMemo {
  const meta = score.meta

  const cover: CoverPage = {
    title: 'Pre-Assessment Site Visit Memo',
    facility: meta.siteName,
    location: meta.siteAddress,
    date: meta.assessmentDate,
    preparedBy: `${meta.preparingAssessor.fullName}, ${meta.preparingAssessor.credentials.join(', ')}`,
    status: meta.reviewStatus,
    methodologyLine: COVER_METHODOLOGY_LINE,
    draftNotice: DRAFT_WATERMARK,
  }

  const signatoryBlock: SignatoryBlock = {
    preparedBy: {
      name: meta.preparingAssessor.fullName,
      credentials: meta.preparingAssessor.credentials.join(', '),
      firm: meta.issuingFirm.name,
      contact: [meta.issuingFirm.contact?.email, meta.issuingFirm.contact?.phone].filter(Boolean).join(' | '),
    },
    reviewedBy: meta.reviewingProfessional ? {
      name: meta.reviewingProfessional.fullName,
      credentials: meta.reviewingProfessional.credentials.join(', '),
      licenseNumbers: (meta.reviewingProfessional.licenseNumbers || []).join(', '),
    } : null,
    status: meta.reviewStatus,
    draftWatermark: true,
  }

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: Date.now(),
    meta,
    cover,
    purposeStatement: 'This document summarizes a preliminary site visit. The data collected during this visit is insufficient to support a formal indoor air quality evaluation.',
    dataGaps: reasons.map((r, i) => ({
      trigger: `Gap ${i + 1}`,
      description: r,
    })),
    recommendedFollowUp: [
      'Schedule a comprehensive site assessment with calibrated direct-reading instrumentation.',
      'Obtain HVAC system documentation including maintenance records, filter specifications, and design outdoor air rates.',
      'If occupant complaints exist, administer a structured symptom survey (NIOSH IEQ questionnaire or equivalent).',
      'Ensure all instruments are calibrated within manufacturer specifications prior to assessment.',
    ],
    signatoryBlock,
    notice: PRE_ASSESSMENT_MEMO_NOTICE,
  }
}
