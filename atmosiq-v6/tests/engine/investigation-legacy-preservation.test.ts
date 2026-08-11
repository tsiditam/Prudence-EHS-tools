/**
 * AtmosFlow 3.0 migration — legacy preservation regression pin (Phase 2).
 *
 * The Investigation Decision Framework is additive. Engine < 3.0 assessments
 * MUST keep producing their original numeric scores, risk bands, and composite
 * logic. This test pins the canonical legacy outputs that the AIHA Technical
 * Review Package documents, so any accidental change to the legacy scoring
 * path is caught immediately.
 *
 * These values were produced by executing src/engines/scoring.js and are the
 * figures cited in docs/AIHA-Technical-Review-Package.md §6–§7.
 */

import { describe, it, expect } from 'vitest'
// eslint-disable-next-line import/extensions
import { scoreZone, compositeScore } from '../../src/engines/scoring'
// eslint-disable-next-line import/extensions
import { DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData'
import { isLegacyEngine } from '../../lib/investigation/version'

describe('legacy engine preservation (engine < 3.0)', () => {
  it('routes 2.9 assessments to the legacy scoring engine', () => {
    expect(isLegacyEngine('2.9.0')).toBe(true)
  })

  it('canonical Meridian Commerce Tower composite is unchanged (19 / Critical / worst-zone-override)', () => {
    const zoneScores = (DEMO_ZONES as any[]).map((z) => scoreZone(z, DEMO_BUILDING as any))
    const composite = compositeScore(zoneScores as any)
    expect(composite.tot).toBe(19)
    expect(composite.risk).toBe('Critical')
    expect(composite.logic).toBe('worst-zone-override')
    expect(composite.confidence).toBe('Medium')
    // Per-zone scores unchanged.
    expect(zoneScores[0].tot).toBe(19)
    expect(zoneScores[0].risk).toBe('Critical')
    expect(zoneScores[1].tot).toBe(27)
    expect(zoneScores[1].risk).toBe('Critical')
  })

  it('canonical clean control zone is unchanged (89 / Low Risk / High confidence)', () => {
    const control = {
      zn: 'Z', su: 'office', cfm_person: '20', co2: '650', co2o: '420',
      tf: '73', rh: '45', pm: '8', pmo: '6', co: '1', tv: '150', tvo: '80', hc: '0.005',
      hm: 'Within 6 months', fc: 'Clean', fm: 'MERV 13', sa: 'Normal', dp: 'Dry / clean',
      cx: 'No complaints',
    }
    const z = scoreZone(control as any, {} as any)
    expect(z.tot).toBe(89)
    expect(z.risk).toBe('Low Risk')
    expect(z.confidence).toBe('High')
  })

  it('multiple-contaminant exceedance override still caps the zone at Critical (≤39)', () => {
    const zone = {
      zn: 'Z', su: 'office', cfm_person: '20', co2: '650', co2o: '420',
      tf: '73', rh: '45', pm: '8', pmo: '6', co: '60', hc: '0.9',
      hm: 'Within 6 months', fc: 'Clean', fm: 'MERV 13', sa: 'Normal', dp: 'Dry / clean',
      cx: 'No complaints',
    }
    const z = scoreZone(zone as any, {} as any)
    expect(z.tot).toBeLessThanOrEqual(39)
    expect(z.risk).toBe('Critical')
  })
})
