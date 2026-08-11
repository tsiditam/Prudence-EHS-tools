import { describe, it, expect } from 'vitest'
import { deriveAssessmentSummary } from '../../lib/investigation/summary'
import {
  AssessmentStatus,
  ConfidenceLevel,
  DataQualityAssessment,
  EvidenceStrength,
  FindingStatus,
  InvestigationDomain,
  InvestigationFinding,
  InvestigationPriority,
} from '../../lib/investigation/types'

const DQ_OK: DataQualityAssessment = {
  requiredEvidencePresent: true,
  presentEvidence: ['x'],
  missingRequiredEvidence: [],
  missingDesirableEvidence: [],
  interpretationConstraints: [],
}

function mkFinding(p: Partial<InvestigationFinding> = {}): InvestigationFinding {
  return {
    id: p.id ?? 'F1',
    ruleId: 'AF-RULE-001',
    engineVersion: '3.0.0-alpha',
    domain: p.domain ?? InvestigationDomain.VENTILATION_AND_AIR_DISTRIBUTION,
    observedCondition: p.observedCondition ?? 'observed condition',
    evidence: [],
    evidenceStrength: p.evidenceStrength ?? EvidenceStrength.MODERATE,
    dataQuality: p.dataQuality ?? DQ_OK,
    findingStatus: p.findingStatus ?? FindingStatus.CONDITION_IDENTIFIED,
    confidence: p.confidence ?? ConfidenceLevel.MODERATE,
    confidenceReasons: [],
    investigationPriority: p.investigationPriority ?? InvestigationPriority.ATTENTION,
    limitations: [],
    prohibitedInterpretations: [],
    recommendedNextActions: p.recommendedNextActions ?? [],
    citations: [],
    professionalReviewRequired: false,
    createdAt: '2026-08-11T00:00:00Z',
    ...p,
  }
}

describe('conservative assessment summary (Phase 18)', () => {
  it('has no numeric risk-score field', () => {
    const s = deriveAssessmentSummary([mkFinding()])
    expect(Object.keys(s)).not.toContain('score')
    expect(Object.keys(s)).not.toContain('riskScore')
    expect(Object.keys(s)).not.toContain('composite')
  })

  it('a single condition-identified finding sets CONDITIONS_IDENTIFIED', () => {
    const s = deriveAssessmentSummary([
      mkFinding({ findingStatus: FindingStatus.CONDITION_IDENTIFIED }),
    ])
    expect(s.status).toBe(AssessmentStatus.CONDITIONS_IDENTIFIED)
  })

  it('one PRIORITY finding sets highestPriority=PRIORITY but does not create a building-wide risk grade', () => {
    const s = deriveAssessmentSummary([
      mkFinding({ id: 'A', investigationPriority: InvestigationPriority.ROUTINE }),
      mkFinding({ id: 'B', investigationPriority: InvestigationPriority.PRIORITY }),
    ])
    expect(s.highestPriority).toBe(InvestigationPriority.PRIORITY)
    expect(s.priorityFindingCount).toBe(1)
  })

  it('overall confidence is the lowest among condition/further-eval findings', () => {
    const s = deriveAssessmentSummary([
      mkFinding({ id: 'A', confidence: ConfidenceLevel.HIGH }),
      mkFinding({ id: 'B', confidence: ConfidenceLevel.LIMITED }),
    ])
    expect(s.overallConfidence).toBe(ConfidenceLevel.LIMITED)
  })

  it('all no-concern findings → NO_SIGNIFICANT_CONDITIONS_IDENTIFIED', () => {
    const s = deriveAssessmentSummary([
      mkFinding({ findingStatus: FindingStatus.NO_CONCERN_IDENTIFIED, investigationPriority: InvestigationPriority.ROUTINE }),
    ])
    expect(s.status).toBe(AssessmentStatus.NO_SIGNIFICANT_CONDITIONS_IDENTIFIED)
  })

  it('no findings at all → INSUFFICIENT_INFORMATION (never "no concerns")', () => {
    const s = deriveAssessmentSummary([])
    expect(s.status).toBe(AssessmentStatus.INSUFFICIENT_INFORMATION)
  })

  it('an important data gap without a condition → INSUFFICIENT_INFORMATION', () => {
    const s = deriveAssessmentSummary([
      mkFinding({
        findingStatus: FindingStatus.INSUFFICIENT_INFORMATION,
        investigationPriority: InvestigationPriority.ROUTINE,
        dataQuality: {
          ...DQ_OK,
          requiredEvidencePresent: false,
          missingRequiredEvidence: ['outdoor airflow'],
        },
      }),
    ])
    expect(s.status).toBe(AssessmentStatus.INSUFFICIENT_INFORMATION)
    expect(s.importantDataGapCount).toBe(1)
  })

  it('further-evaluation findings surface without being downgraded to no-concern', () => {
    const s = deriveAssessmentSummary([
      mkFinding({ findingStatus: FindingStatus.FURTHER_EVALUATION_WARRANTED }),
    ])
    expect(s.status).toBe(AssessmentStatus.FURTHER_EVALUATION_WARRANTED)
  })
})
