import { describe, it, expect } from 'vitest'
import { assessVentilation } from '../../lib/investigation/rules/ventilation'
import { InvestigationContext } from '../../lib/investigation/rules/common'
import {
  ComparisonApplicability,
  FindingStatus,
  InvestigationPriority,
} from '../../lib/investigation/types'

const CTX: InvestigationContext = {
  engineVersion: '3.0.0-alpha',
  now: '2026-08-11T00:00:00Z',
  calibrationStatus: 'current',
  occupancyDocumented: false,
}

describe('ventilation domain — CO₂-as-surrogate discipline (Phase 14)', () => {
  it('measured cfm/person above the ASHRAE 62.1 minimum → no concern, high-quality basis', () => {
    const f = assessVentilation({ zn: 'Z', su: 'office', cfm_person: '20', co2: '1500' }, CTX)
    expect(f).toHaveLength(1)
    // Even with CO₂ = 1500, an adequate measured OA delivery is the basis.
    expect(f[0].parameter).toBe('outdoor_air_cfm_per_person')
    expect(f[0].findingStatus).toBe(FindingStatus.NO_CONCERN_IDENTIFIED)
  })

  it('measured cfm/person below the minimum → condition identified, priority', () => {
    const f = assessVentilation({ zn: 'Z', su: 'office', cfm_person: '2' }, CTX)
    expect(f[0].findingStatus).toBe(FindingStatus.CONDITION_IDENTIFIED)
    expect(f[0].investigationPriority).toBe(InvestigationPriority.PRIORITY)
  })

  it('CO₂-only elevated → further evaluation, never "inadequate outdoor air" and never a health limit', () => {
    const f = assessVentilation({ zn: 'Z', su: 'office', co2: '1180', co2o: '415' }, CTX)
    expect(f[0].parameter).toBe('co2_ventilation_surrogate')
    expect(f[0].findingStatus).toBe(FindingStatus.FURTHER_EVALUATION_WARRANTED)
    expect(f[0].referenceAssessment?.applicability).toBe(ComparisonApplicability.SCREENING_COMPARISON_ONLY)
    // Prohibited interpretations must forbid a CO₂ health-limit / adequacy conclusion.
    expect(f[0].prohibitedInterpretations.join(' ').toLowerCase()).toContain('co₂ exceeded the safe limit')
    expect(f[0].confidenceReasons).toContain('SURROGATE_INDICATOR_ONLY')
    expect(f[0].confidenceReasons).toContain('OUTDOOR_AIRFLOW_NOT_MEASURED')
    // Next action drives toward the measurement that would resolve it.
    expect(f[0].recommendedNextActions.some((a) => a.actionType === 'MEASURE')).toBe(true)
  })

  it('CO₂-only without an outdoor reference records the missing baseline', () => {
    const f = assessVentilation({ zn: 'Z', su: 'office', co2: '1180' }, CTX)
    expect(f[0].confidenceReasons).toContain('OUTDOOR_REFERENCE_NOT_AVAILABLE')
  })
})
