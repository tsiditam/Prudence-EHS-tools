import { describe, it, expect } from 'vitest'
import { deriveConfidence, confidenceCeiling } from '../../lib/investigation/confidence'
import { ConfidenceLevel, EvidenceStrength } from '../../lib/investigation/types'

describe('deterministic confidence (Phase 9)', () => {
  it('strong evidence with no uncertainty → high', () => {
    expect(deriveConfidence({ evidenceStrength: EvidenceStrength.STRONG, reasons: [] })).toBe(
      ConfidenceLevel.HIGH,
    )
  })

  it('one uncertainty driver steps confidence down once', () => {
    expect(
      deriveConfidence({
        evidenceStrength: EvidenceStrength.STRONG,
        reasons: ['OUTDOOR_AIRFLOW_NOT_MEASURED'],
      }),
    ).toBe(ConfidenceLevel.MODERATE)
  })

  it('two independent uncertainty drivers step confidence down twice', () => {
    expect(
      deriveConfidence({
        evidenceStrength: EvidenceStrength.STRONG,
        reasons: ['OUTDOOR_AIRFLOW_NOT_MEASURED', 'OCCUPANCY_ESTIMATED'],
      }),
    ).toBe(ConfidenceLevel.LIMITED)
  })

  it('duplicate reason codes count once', () => {
    expect(
      deriveConfidence({
        evidenceStrength: EvidenceStrength.STRONG,
        reasons: ['SHORT_MEASUREMENT_DURATION', 'SHORT_MEASUREMENT_DURATION'],
      }),
    ).toBe(ConfidenceLevel.MODERATE)
  })

  it('required evidence missing floors confidence at insufficient regardless of strength', () => {
    expect(
      deriveConfidence({
        evidenceStrength: EvidenceStrength.STRONG,
        reasons: ['REQUIRED_EVIDENCE_MISSING'],
      }),
    ).toBe(ConfidenceLevel.INSUFFICIENT)
  })

  it('confidence ceiling never exceeds the evidence-strength ceiling', () => {
    expect(confidenceCeiling(EvidenceStrength.MODERATE)).toBe(ConfidenceLevel.MODERATE)
    expect(
      deriveConfidence({ evidenceStrength: EvidenceStrength.MODERATE, reasons: [] }),
    ).toBe(ConfidenceLevel.MODERATE)
    expect(confidenceCeiling(EvidenceStrength.LIMITED)).toBe(ConfidenceLevel.LIMITED)
  })
})
