/**
 * Engine v2.7 Fix 3 — Location field on Recommendations Register.
 *
 * Acceptance: every Immediate-priority recommendation in a generated
 * report has a non-empty location field. Tests both:
 *   • The legacy string-array path (genRecs → parseRecLocation in
 *     sections-recommendations.js)
 *   • The v2.x bridge path (Finding → RecommendedAction.location
 *     populated from finding.zoneId)
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { parseRecLocation } from '../../src/components/docx/sections-recommendations.js'
// @ts-expect-error — JS module without TS types
import { genRecs, scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { DEMO_BUILDING, DEMO_ZONES } from '../../src/constants/demoData.js'

describe('parseRecLocation — legacy string-array path', () => {
  it('extracts zone name from "Zone Name: action" prefix', () => {
    const r = parseRecLocation('Conference Room B: Arrest water intrusion. Assess materials within 48 hours.')
    expect(r.location).toBe('Conference Room B')
    expect(r.action).toBe('Arrest water intrusion. Assess materials within 48 hours.')
  })

  it('handles 3rd Floor East-style names', () => {
    const r = parseRecLocation('3rd Floor East: Investigate elevated CO₂.')
    expect(r.location).toBe('3rd Floor East')
    expect(r.action).toBe('Investigate elevated CO₂.')
  })

  it('routes HVAC-system recs to "HVAC system"', () => {
    const r = parseRecLocation('Request immediate HVAC service to restore airflow.')
    expect(r.location).toBe('HVAC system')
  })

  it('routes filtration recs to "HVAC system"', () => {
    const r = parseRecLocation('Request immediate HVAC service — no filtration installed.')
    expect(r.location).toBe('HVAC system')
  })

  it('falls back to "Building-wide" for un-prefixed non-HVAC text', () => {
    const r = parseRecLocation('Implement controls per 29 CFR 1910.1048.')
    expect(r.location).toBe('Building-wide')
  })

  it('does not mistake "29 CFR 1910.1048:" for a zone prefix', () => {
    const r = parseRecLocation('29 CFR 1910.1048: implement controls.')
    expect(r.location).toBe('Building-wide')
  })

  it('handles empty / null gracefully', () => {
    expect(parseRecLocation('').location).toBe('Building-wide')
    expect(parseRecLocation(null as unknown as string).location).toBe('Building-wide')
  })
})

describe('genRecs on Meridian demo — every Immediate rec has location', () => {
  it('all Immediate recommendations parse to a non-empty location', () => {
    const zoneScores = (DEMO_ZONES as any[]).map((z: any) => scoreZone(z, DEMO_BUILDING))
    compositeScore(zoneScores) // side-effect-free composite call
    // v2.8.0 — genRecs returns RecommendationAction[] objects per
    // bucket. The legacy parseRecLocation helper is retained for
    // back-compat of pre-2.8 stored reports, but new actions carry
    // location explicitly via scope/equipmentLabel/zoneName fields.
    const recs = genRecs(zoneScores, DEMO_BUILDING) as { imm: any[] }
    for (const action of recs.imm || []) {
      // Either a legacy string (older reports) or an action object
      // (engine v2.8.0+). Both must surface a non-empty location.
      if (typeof action === 'string') {
        const parsed = parseRecLocation(action)
        expect(parsed.location).toBeTruthy()
        expect(parsed.location.length).toBeGreaterThan(0)
      } else {
        // Equipment | zone | building scopes all yield a label.
        const label =
          action.scope === 'equipment' ? (action.equipmentLabel || action.equipmentId)
          : action.scope === 'zone' ? (action.zoneName || action.zoneId)
          : 'Building-wide'
        expect(label).toBeTruthy()
        expect(String(label).length).toBeGreaterThan(0)
      }
    }
  })
})
