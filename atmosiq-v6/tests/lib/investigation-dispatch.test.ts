import { describe, it, expect, vi } from 'vitest'
import { dispatchAssessment, assessWithRouting } from '../../lib/investigation/dispatch'
import { resolveEngineVersionForNewAssessment } from '../../lib/investigation/engineSelection'
import { INVESTIGATION_ENGINE_VERSION } from '../../lib/investigation/version'
import { InvestigationContext, ZoneObservation } from '../../lib/investigation/rules/common'
import { AssessmentStatus } from '../../lib/investigation/types'

const CTX: InvestigationContext = {
  engineVersion: '3.0.0-alpha',
  now: '2026-08-11T00:00:00Z',
  calibrationStatus: 'current',
  occupancyDocumented: false,
}

describe('version-routed dispatch (Phase 3)', () => {
  it('2.x assessments run the legacy thunk and never the framework', () => {
    const legacy = vi.fn(() => ({ tot: 19, risk: 'Critical' }))
    const investigation = vi.fn(() => {
      throw new Error('framework must not run for legacy engineVersion')
    })
    const out = dispatchAssessment('2.9.0', { legacy, investigation })
    expect(out.kind).toBe('legacy')
    expect(legacy).toHaveBeenCalledOnce()
    expect(investigation).not.toHaveBeenCalled()
    if (out.kind === 'legacy') expect(out.result).toEqual({ tot: 19, risk: 'Critical' })
  })

  it('3.x assessments run the framework and never the legacy thunk', () => {
    const legacy = vi.fn(() => {
      throw new Error('legacy must not run for 3.x engineVersion')
    })
    const zones: ZoneObservation[] = [{ zn: 'Z', su: 'office', co2: '1180', co2o: '415', pm: '28', pmo: '12' }]
    const out = assessWithRouting('3.0.0', zones, CTX, legacy)
    expect(out.kind).toBe('investigation')
    expect(legacy).not.toHaveBeenCalled()
    if (out.kind === 'investigation') {
      expect(out.building.summary.status).toBe(AssessmentStatus.CONDITIONS_IDENTIFIED)
      // The framework result carries no numeric composite score.
      expect(Object.keys(out.building.summary)).not.toContain('score')
    }
  })

  it('unknown engineVersion fails safe to legacy', () => {
    const legacy = vi.fn(() => 'legacy-ran')
    const out = dispatchAssessment(null, { legacy, investigation: () => { throw new Error('no') } })
    expect(out.kind).toBe('legacy')
  })
})

describe('engine-version selection for new assessments (Phase 3)', () => {
  it('defaults to the legacy version when the framework flag is off (production posture)', () => {
    const v = resolveEngineVersionForNewAssessment({ frameworkEnabled: false, legacyVersion: '2.9.0' })
    expect(v).toBe('2.9.0')
  })

  it('stamps the framework version only when the flag is on', () => {
    const v = resolveEngineVersionForNewAssessment({ frameworkEnabled: true, legacyVersion: '2.9.0' })
    expect(v).toBe(INVESTIGATION_ENGINE_VERSION)
  })
})
