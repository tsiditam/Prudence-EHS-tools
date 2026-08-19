/**
 * Parameter ranges — arithmetic here, interpretation from the engine.
 *
 * This file used to assert that `computeParameterRanges` applied its own
 * thresholds (700 ppm CO2 differential, 68–78 °F, 30–60 % RH). Those
 * assertions were the bug, not the guard: they pinned a SECOND threshold
 * engine living in the renderer, which disagreed with `scoreZone` on a
 * live report — the same 72 °F reading was reported "within the ASHRAE 55
 * comfort range" in Results and "outside typical comfort ranges defined by
 * ASHRAE 55" in Zone Findings.
 *
 * The contract now: ranges are arithmetic (low/high/average/outdoor), and
 * `withinStandards` / `elevatedInZones` are read from the engine's own
 * findings. Agreement between the two surfaces is proven in
 * tests/engine/parameter-verdict-agreement.test.ts.
 */

import { describe, it, expect } from 'vitest'
import { computeParameterRanges } from '../../src/engine/report/parameter-ranges'
import { scoreZone } from '../../src/engines/scoring.js'

// Pin the date: the comfort band is seasonal, so an unpinned test would
// change verdict in November. July → summer band (optimal 73–79 °F).
const SUMMER = { assessmentDate: '2026-07-15' }
const score = (zones: any[]) => zones.map((z) => scoreZone(z, SUMMER))
const ranges = (zones: any[]) => computeParameterRanges(zones, score(zones) as any)

describe('computeParameterRanges — arithmetic', () => {
  it('computes low / high / average / unit across zones', () => {
    const r = ranges([
      { zn: 'Z1', co2: '800', co2o: '420' },
      { zn: 'Z2', co2: '950', co2o: '420' },
      { zn: 'Z3', co2: '1050', co2o: '420' },
    ])
    expect(r.co2!.low).toBe(800)
    expect(r.co2!.high).toBe(1050)
    expect(r.co2!.average).toBeCloseTo(933.33, 1)
    expect(r.co2!.unit).toBe('ppm')
    expect(r.co2!.outdoorReference).toBe(420)
    expect(r.co2!.count).toBe(3)
  })

  it('produces no entry for a parameter measured in no zone', () => {
    const r = ranges([{ zn: 'Z1', co2: '900' }])
    expect(r.co).toBeUndefined()
    expect(r.hcho).toBeUndefined()
    expect(r.tvoc).toBeUndefined()
  })

  it('rounds the average to 2 decimal places', () => {
    const r = ranges([{ zn: 'A', co2: '800' }, { zn: 'B', co2: '801' }, { zn: 'C', co2: '802' }])
    expect(Math.abs(r.co2!.average - 801)).toBeLessThan(0.01)
  })
})

describe('computeParameterRanges — interpretation comes from the engine', () => {
  it('reports within range when the engine flagged nothing', () => {
    // 45–52 % RH and 75 °F: inside the summer optimal band, no finding.
    const r = ranges([{ zn: 'Z1', rh: '45', tf: '75' }, { zn: 'Z2', rh: '52', tf: '76' }])
    expect(r.rh!.withinStandards).toBe(true)
    expect(r.temperature!.withinStandards).toBe(true)
    expect(r.rh!.elevatedInZones).toBeUndefined()
  })

  it('reports out of range, and names the zone, when the engine flagged one', () => {
    const r = ranges([{ zn: 'Z1', rh: '45' }, { zn: 'Z2', rh: '68' }])
    expect(r.rh!.withinStandards).toBe(false)
    expect(r.rh!.elevatedInZones).toEqual(['Z2'])
  })

  it('follows the engine on a CO2 differential exceedance', () => {
    const r = ranges([{ zn: 'Z1', co2: '800', co2o: '420' }, { zn: 'Z2', co2: '1400', co2o: '420' }])
    expect(r.co2!.withinStandards).toBe(false)
    expect(r.co2!.elevatedInZones).toEqual(['Z2'])
  })

  it('makes no within/outside claim when no engine output is supplied', () => {
    // The renderer is not permitted to invent an interpretation, so the
    // arithmetic-only call yields null rather than a guess.
    const r = computeParameterRanges([{ zn: 'Z1', tf: '79' }, { zn: 'Z2', tf: '80' }])
    expect(r.temperature!.withinStandards).toBeNull()
    expect(r.temperature!.high).toBe(80)
  })
})

describe('the regression this replaced', () => {
  it('does not call 72 °F both within and outside the comfort band', () => {
    // The Lakeside report: 72 °F and 73 °F, surveyed in August. The old
    // hardcoded 68–78 said "within"; scoreEnv's summer optimal band
    // (73–79) emitted a finding. Now there is one answer.
    const zones = [{ zn: '2nd Floor Open Office', tf: '72' }, { zn: 'Main Conference Room', tf: '73' }]
    const zoneScores = zones.map((z) => scoreZone(z, { assessmentDate: '2026-08-19' }))
    const r = computeParameterRanges(zones, zoneScores as any)

    const engineFlagged = zoneScores.some((zs: any) =>
      zs.cats.some((c: any) => c.r.some((f: any) => f.p === 'temperature' && f.sev !== 'pass' && f.sev !== 'info')))

    expect(r.temperature!.withinStandards).toBe(!engineFlagged)
    expect(engineFlagged).toBe(true)                      // 72 °F is below the summer optimal band
    expect(r.temperature!.withinStandards).toBe(false)
    expect(r.temperature!.elevatedInZones).toEqual(['2nd Floor Open Office'])
  })
})
