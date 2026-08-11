import { describe, it, expect } from 'vitest'
import { assessContaminants, multipleTier1Exceedance } from '../../lib/investigation/rules/contaminants'
import { InvestigationContext } from '../../lib/investigation/rules/common'
import { FindingStatus, InvestigationPriority } from '../../lib/investigation/types'

const CTX: InvestigationContext = {
  engineVersion: '3.0.0-alpha',
  now: '2026-08-11T00:00:00Z',
  calibrationStatus: 'current',
  occupancyDocumented: false,
}

function byParam(z: any, param: string) {
  return assessContaminants(z, CTX).find((f) => f.parameter === param)!
}

describe('contaminants domain (Phase 15)', () => {
  it('spot CO above the OSHA PEL → condition + priority + professional review, but never a TWA exceedance', () => {
    const f = byParam({ zn: 'Z', co: '60' }, 'co')
    expect(f.findingStatus).toBe(FindingStatus.CONDITION_IDENTIFIED)
    expect(f.investigationPriority).toBe(InvestigationPriority.PRIORITY)
    expect(f.professionalReviewRequired).toBe(true)
    expect(f.prohibitedInterpretations.some((p) => /8-hour twa exceeded/i.test(p))).toBe(true)
    expect(f.prohibitedInterpretations.some((p) => /osha violation/i.test(p))).toBe(true)
  })

  it('CO below the PEL → no concern', () => {
    const f = byParam({ zn: 'Z', co: '2' }, 'co')
    expect(f.findingStatus).toBe(FindingStatus.NO_CONCERN_IDENTIFIED)
    expect(f.investigationPriority).toBe(InvestigationPriority.ROUTINE)
  })

  it('formaldehyde above the advisory NIOSH ceiling (but below OSHA AL) → attention, not priority', () => {
    const f = byParam({ zn: 'Z', hc: '0.022' }, 'hcho')
    expect(f.investigationPriority).toBe(InvestigationPriority.ATTENTION)
  })

  it('formaldehyde above the OSHA PEL → priority (mandatory reference)', () => {
    const f = byParam({ zn: 'Z', hc: '0.9' }, 'hcho')
    expect(f.investigationPriority).toBe(InvestigationPriority.PRIORITY)
  })

  it('spot PM2.5 above the 24-hr NAAQS number → screening only, never an exceedance', () => {
    const f = byParam({ zn: 'Z', pm: '42' }, 'pm2.5')
    expect(f.prohibitedInterpretations.some((p) => /pm2\.5 standard exceeded/i.test(p))).toBe(true)
    expect(f.referenceAssessment?.applicability).toBe('screening_comparison_only')
  })

  it('indoor PM2.5 with I/O ratio > 2 and low outdoor → indoor-source condition, priority', () => {
    const f = byParam({ zn: 'Z', pm: '28', pmo: '12' }, 'pm2.5')
    expect(f.findingStatus).toBe(FindingStatus.CONDITION_IDENTIFIED)
    expect(f.investigationPriority).toBe(InvestigationPriority.PRIORITY)
    expect(f.limitations.join(' ')).toMatch(/indoor particulate source/i)
  })

  it('TVOC elevated → investigative only; never a toxicity claim', () => {
    const f = byParam({ zn: 'Z', tv: '680' }, 'tvoc')
    expect(f.findingStatus).toBe(FindingStatus.FURTHER_EVALUATION_WARRANTED)
    expect(f.prohibitedInterpretations.some((p) => /toxic/i.test(p))).toBe(true)
    expect(f.recommendedNextActions.some((a) => a.actionType === 'SAMPLE')).toBe(true)
  })

  it('multiple Tier-1 exceedance detector fires only when ≥2 contaminants exceed their PEL', () => {
    expect(multipleTier1Exceedance({ co: '60' })).toBe(false)
    expect(multipleTier1Exceedance({ co: '60', hc: '0.9' })).toBe(true)
  })
})
