import { describe, it, expect } from 'vitest'
import { deriveEvidenceStrength } from '../../lib/investigation/evidenceStrength'
import { EvidenceItem, EvidenceType, EvidenceStrength } from '../../lib/investigation/types'

function ev(type: EvidenceType, extra: Partial<EvidenceItem> = {}): EvidenceItem {
  return { id: 'e1', type, source: 's', observation: 'o', ...extra }
}

describe('deterministic evidence strength (Phase 8)', () => {
  it('no evidence → insufficient', () => {
    expect(deriveEvidenceStrength({ evidence: [], requiredEvidencePresent: true })).toBe(
      EvidenceStrength.INSUFFICIENT,
    )
  })

  it('required evidence missing → insufficient', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT)],
        requiredEvidencePresent: false,
      }),
    ).toBe(EvidenceStrength.INSUFFICIENT)
  })

  it('representative direct measurement → strong', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'current' })],
        requiredEvidencePresent: true,
        representative: true,
      }),
    ).toBe(EvidenceStrength.STRONG)
  })

  it('directly observed active leak → strong', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.VISUAL_OBSERVATION)],
        requiredEvidencePresent: true,
        representative: true,
      }),
    ).toBe(EvidenceStrength.STRONG)
  })

  it('direct measurement but not representative → moderate', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'current' })],
        requiredEvidencePresent: true,
        representative: false,
      }),
    ).toBe(EvidenceStrength.MODERATE)
  })

  it('conflicting evidence caps a direct measurement at moderate', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'current' })],
        requiredEvidencePresent: true,
        representative: true,
        conflictingEvidence: true,
      }),
    ).toBe(EvidenceStrength.MODERATE)
  })

  it('surrogate-only (e.g. CO2 for ventilation) is limited unless representative + corroborated', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'current' })],
        requiredEvidencePresent: true,
        surrogateOnly: true,
      }),
    ).toBe(EvidenceStrength.LIMITED)
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'current' })],
        requiredEvidencePresent: true,
        surrogateOnly: true,
        representative: true,
        corroborated: true,
      }),
    ).toBe(EvidenceStrength.MODERATE)
  })

  it('uncorroborated occupant report → limited; corroborated → moderate', () => {
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.OCCUPANT_REPORT)],
        requiredEvidencePresent: true,
      }),
    ).toBe(EvidenceStrength.LIMITED)
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.OCCUPANT_REPORT)],
        requiredEvidencePresent: true,
        corroborated: true,
      }),
    ).toBe(EvidenceStrength.MODERATE)
  })

  it('an expired-calibration measurement does not automatically outrank contextual evidence', () => {
    // Only evidence is a measurement with expired calibration → not valid direct evidence.
    expect(
      deriveEvidenceStrength({
        evidence: [ev(EvidenceType.DIRECT_MEASUREMENT, { calibrationStatus: 'expired' })],
        requiredEvidencePresent: true,
        representative: true,
      }),
    ).toBe(EvidenceStrength.LIMITED)
  })
})
