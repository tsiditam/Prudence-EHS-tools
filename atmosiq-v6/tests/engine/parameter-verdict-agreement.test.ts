/**
 * Results prose and Zone Findings must never disagree about the same
 * measurement.
 *
 * This is the guard for the defect that prompted the whole change: a
 * shipped report that said, of one 72 °F reading,
 *
 *   Results:       "Conditions are within the ASHRAE 55 comfort range…"
 *   Zone Findings: "Measured temperature was outside typical comfort
 *                   ranges defined by ASHRAE 55."
 *
 * Two threshold engines, one in `src/engines/scoring.js` and a hardcoded
 * copy in the renderer's `parameter-ranges.ts`. The copy is gone; this
 * sweeps a value matrix per parameter and asserts the surviving surface
 * agrees with the engine on every one — including the boundaries, where
 * two implementations of "the same" rule diverge first.
 *
 * A failure here means someone reintroduced an independent threshold.
 */
import { describe, it, expect } from 'vitest'
import { computeParameterRanges, type ParameterKey } from '../../src/engine/report/parameter-ranges'
import { deriveParameterVerdicts } from '../../src/engine/report/parameter-verdicts'
import { scoreZone } from '../../src/engines/scoring.js'

// Seasonal comfort bands make an unpinned date non-deterministic.
const DATES = ['2026-07-15', '2026-01-15'] as const

const MATRIX: ReadonlyArray<{ param: ParameterKey; field: string; values: number[]; extra?: Record<string, string> }> = [
  // Straddles the summer optimal band (73–79) and the winter one (68.5–74),
  // plus the wider acceptable ranges either side.
  { param: 'temperature', field: 'tf', values: [60, 66, 67, 68, 68.5, 70, 72, 73, 74, 76, 79, 80, 82, 83, 90] },
  { param: 'rh', field: 'rh', values: [10, 19, 20, 25, 29, 30, 31, 45, 59, 60, 61, 70, 71, 85] },
  { param: 'co', field: 'co', values: [0, 1, 5, 6, 7, 9, 10, 30, 35, 36, 50, 51, 200, 250] },
  { param: 'hcho', field: 'hc', values: [0, 0.01, 0.016, 0.05, 0.1, 0.5, 0.75, 1, 2, 3] },
  { param: 'tvoc', field: 'tv', values: [0, 100, 200, 300, 500, 501, 1000, 3000, 25000] },
  { param: 'pm25', field: 'pm', values: [0, 5, 9, 12, 15, 16, 35, 36, 55, 150] },
  { param: 'co2', field: 'co2', values: [400, 600, 800, 1000, 1100, 1200, 1500, 1600, 2500] },
  // Same CO2 sweep with an outdoor baseline, which switches the engine on
  // to the differential branch.
  { param: 'co2', field: 'co2', values: [400, 800, 1000, 1120, 1121, 1500, 2500], extra: { co2o: '420' } },
  // PM2.5 with an outdoor reference engages the I/O ratio branch.
  { param: 'pm25', field: 'pm', values: [1, 6, 7, 12, 13, 40], extra: { pmo: '6' } },
]

describe('parameter verdicts agree with the engine', () => {
  for (const { param, field, values, extra } of MATRIX) {
    for (const assessmentDate of DATES) {
      const label = `${param}${extra ? ` (+${Object.keys(extra).join(',')})` : ''} on ${assessmentDate}`
      it(`never contradicts scoreZone for ${label}`, () => {
        for (const value of values) {
          const zone: Record<string, string> = { zn: 'Z1', [field]: String(value), ...(extra || {}) }
          const zoneScores = [scoreZone(zone, { assessmentDate })]
          const ranges = computeParameterRanges([zone], zoneScores as never)

          // What the engine concluded, read straight off its findings.
          const engineFlagged = zoneScores.some((zs: any) =>
            zs.cats.some((c: any) =>
              c.r.some((f: any) => f.p === param && f.sev !== 'pass' && f.sev !== 'info')))

          const range = ranges[param]
          expect(range, `${label}: ${value} produced no range entry`).toBeDefined()
          expect(
            range!.withinStandards,
            `${label}: ${value} — engine ${engineFlagged ? 'flagged' : 'passed'} it, Results said ${range!.withinStandards ? 'within' : 'outside'}`,
          ).toBe(!engineFlagged)
        }
      })
    }
  }

  it('names exactly the zones the engine flagged', () => {
    const zones = [
      { zn: 'Lobby', rh: '45' },
      { zn: 'Server Room', rh: '72' },
      { zn: 'Break Room', rh: '68' },
    ]
    const zoneScores = zones.map((z) => scoreZone(z, { assessmentDate: '2026-07-15' }))
    const ranges = computeParameterRanges(zones, zoneScores as never)
    expect(ranges.rh!.elevatedInZones).toEqual(['Server Room', 'Break Room'])
    expect(ranges.rh!.elevatedInZones).not.toContain('Lobby')
  })
})

describe('deriveParameterVerdicts', () => {
  it('treats pass and info as "evaluated, nothing to report"', () => {
    const verdicts = deriveParameterVerdicts([
      { zoneName: 'Z1', cats: [{ r: [
        { p: 'co2', sev: 'pass' },
        { p: 'co2', sev: 'info' },
        { p: 'pm25', sev: 'medium' },
      ] }] },
    ])
    expect(verdicts.co2!.hasFinding).toBe(false)
    expect(verdicts.co2!.zones).toEqual([])
    expect(verdicts.pm25!.hasFinding).toBe(true)
    expect(verdicts.pm25!.zones).toEqual(['Z1'])
  })

  it('ignores untagged findings rather than guessing a parameter', () => {
    const verdicts = deriveParameterVerdicts([
      { zoneName: 'Z1', cats: [{ r: [{ sev: 'high' }, { p: '', sev: 'high' }] }] },
    ])
    expect(Object.keys(verdicts)).toEqual([])
  })

  it('de-duplicates a zone flagged twice for one parameter', () => {
    const verdicts = deriveParameterVerdicts([
      { zoneName: 'Z1', cats: [{ r: [{ p: 'pm25', sev: 'high' }] }, { r: [{ p: 'pm25', sev: 'medium' }] }] },
    ])
    expect(verdicts.pm25!.zones).toEqual(['Z1'])
  })

  it('falls back to the zone-data name, then to a placeholder', () => {
    expect(deriveParameterVerdicts(
      [{ cats: [{ r: [{ p: 'co', sev: 'high' }] }] }],
      [{ zn: 'From intake' }],
    ).co!.zones).toEqual(['From intake'])
    expect(deriveParameterVerdicts(
      [{ cats: [{ r: [{ p: 'co', sev: 'high' }] }] }],
    ).co!.zones).toEqual(['Unnamed zone'])
  })

  it('survives missing / malformed input', () => {
    expect(deriveParameterVerdicts(undefined)).toEqual({})
    expect(deriveParameterVerdicts([])).toEqual({})
    expect(deriveParameterVerdicts([{}, { cats: [] }, { cats: [{}] }] as never)).toEqual({})
  })
})
