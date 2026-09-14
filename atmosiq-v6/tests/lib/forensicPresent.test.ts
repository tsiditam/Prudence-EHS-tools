/**
 * The evidence line is the ONLY place a figure becomes text for the card, and
 * every number on it is copied from the bundle. These tests pin that: the line
 * reads off the record, the labels cover the vocabularies they render, and
 * nothing here interprets.
 */
import { describe, it, expect } from 'vitest'
import { buildForensicBundle } from '../../src/utils/forensicBundle.js'
import {
  patternEvidence, patternTitle, fmtFigure, interpretationsByPattern,
  PATTERN_LABELS, EVENT_LABELS, IMPORTANCE_LABELS, REJECTION_LABELS,
} from '../../src/utils/forensicPresent.js'
import { REJECTION_REASONS, IMPORTANCE_VALUES } from '../../src/utils/forensicValidate.js'
import { CONTEXT_RULES } from '../../src/utils/forensicPatterns.js'

const DAY = 86400_000
const T0 = Date.UTC(2026, 2, 2, 0, 0, 0)
const Q = 15 * 60_000
const multiDay = (days: number, f: (d: number, h: number, i: number) => any) => {
  const pts: any[] = []
  for (let d = 0; d < days; d++) for (let i = 0; i < 96; i++) pts.push({ t: T0 + d * DAY + i * Q, ...f(d, Math.floor((i * 15) / 60), i) })
  return pts
}
const mk = (id: string, role: string, label: string, points: any[], params: string[], units: any = {}) => ({
  id, role, label, points, params, units, hasTimestamps: true, fileName: `${id}.csv`,
  summary: { start: points[0]?.t, end: points[points.length - 1]?.t, intervalSec: 900, count: points.length },
})
const bundle: any = buildForensicBundle({
  sensorData: {
    version: 2,
    datasets: [
      mk('primary', 'indoor', 'Indoor', multiDay(4, (_d, h, i) => ({ co2: 500 + 200 * Math.cos(((h - 14) / 24) * 2 * Math.PI), pm: i === 50 ? 180 : 10 + (i % 5) })), ['co2', 'pm'], { co2: 'ppm', pm: 'µg/m³' }),
      mk('ds-out', 'outdoor', 'Outdoor', multiDay(4, (_d, _h, i) => ({ pm: 9 + (i % 5) })), ['pm'], { pm: 'µg/m³' }),
    ],
    occupancyWindows: [{ id: 'occ-1', start: T0 + 9 * 3600_000, end: T0 + 17 * 3600_000, kind: 'occupied' }],
    graphs: {}, thresholds: {},
  },
  annotations: [{ id: 'e1', t: T0 + 50 * Q, type: 'hvac_adjusted', label: 'HVAC adjusted' }],
  utcOffsetMin: 0,
})
const find = (kind: string) => bundle.patterns.find((p: any) => p.kind === kind)

describe('the evidence line is copied from the bundle', () => {
  it('states a recurring cycle as days, peak hour and amplitude in the parameter unit', () => {
    const p = find('recurring_cycle')
    const line = patternEvidence(p, bundle)
    expect(line).toEqual([`${p.summary.daysAgreeing} of ${p.summary.daysObserved} days`, 'peak hour 14:00', 'amplitude 400 ppm'])
  })

  it('states an indoor/outdoor comparison with the correlation as a figure', () => {
    const p = find('indoor_outdoor_comparison')
    const line = patternEvidence(p, bundle)
    expect(line[0]).toMatch(/^indoor [\d.]+ µg\/m³$/)
    expect(line[1]).toMatch(/^outdoor [\d.]+ µg\/m³$/)
    expect(line[2]).toBe(`correlation r = ${p.summary.r.toFixed(2)}`)
    expect(line[3]).toBe(`${p.summary.pairedSamples} paired readings`)
  })

  it('states an occupancy comparison with a signed difference', () => {
    const p = find('occupancy_comparison')
    const line = patternEvidence(p, bundle)
    expect(line.some((s) => /^difference [+-]/.test(s))).toBe(true)
    expect(line).toContain('1 occupied window')
  })

  it('states the no-outdoor-match pattern with what the outdoor logger did cover', () => {
    const p = find('no_matching_outdoor_event')
    const line = patternEvidence(p, bundle)
    expect(line[0]).toMatch(/^indoor (peak|sustained shift) \+/)
    expect(line).toContain('outdoor logger covered the window')
    expect(line).toContain('no matching outdoor event')
  })

  it('names the annotation an excursion sat near', () => {
    const p = find('event_proximity')
    expect(patternEvidence(p, bundle)).toEqual([EVENT_LABELS[p.summary.eventKind], 'near “HVAC adjusted”'])
  })

  it('returns nothing for an unknown kind or a missing bundle, rather than guessing', () => {
    expect(patternEvidence({ kind: 'novel', summary: { x: 1 } }, bundle)).toEqual([])
    expect(patternEvidence(null as never, null as never)).toEqual([])
  })

  it('formats a figure as a reading, not a calculation', () => {
    expect(fmtFigure(1451.83, 'ppm')).toBe('1452 ppm')
    expect(fmtFigure(13.749, 'µg/m³')).toBe('13.7 µg/m³')
    expect(fmtFigure(0.314)).toBe('0.31')
    expect(fmtFigure(null as never)).toBe(null)
  })
})

describe('titles and labels', () => {
  it('titles a pattern by its kind and the parameters it concerns', () => {
    expect(patternTitle(find('recurring_cycle'))).toBe('Recurring daily cycle — CO₂')
    expect(patternTitle(find('indoor_outdoor_comparison'))).toMatch(/^Indoor against outdoor — /)
    expect(patternTitle({ kind: 'novel' })).toBe('Pattern')
  })

  it('has a label for every pattern kind the detector can emit', () => {
    Object.keys(CONTEXT_RULES).forEach((kind) => expect(PATTERN_LABELS, kind).toHaveProperty(kind))
    bundle.patterns.forEach((p: any) => expect(PATTERN_LABELS, p.kind).toHaveProperty(p.kind))
  })

  it('has a label for every importance value and every rejection reason', () => {
    IMPORTANCE_VALUES.forEach((v) => expect(IMPORTANCE_LABELS, v).toHaveProperty(v))
    REJECTION_REASONS.forEach((r) => expect(REJECTION_LABELS, r).toHaveProperty(r))
    expect(Object.keys(REJECTION_LABELS).sort()).toEqual([...REJECTION_REASONS].sort())
  })

  it('never lets a label read as a verdict', () => {
    const all = [...Object.values(PATTERN_LABELS), ...Object.values(IMPORTANCE_LABELS), ...Object.values(REJECTION_LABELS)].join(' ')
    for (const banned of ['unsafe', ' safe', 'compliant', 'exceeds', 'inadequate', 'caused', 'proves']) expect(all).not.toContain(banned)
  })

  it('keys a record’s interpretations by pattern', () => {
    const m = interpretationsByPattern({ interpretations: [{ pattern_id: 'a', title: 'x' }, { pattern_id: 'b' }, { nope: 1 }] })
    expect([...m.keys()]).toEqual(['a', 'b'])
    expect(interpretationsByPattern(null).size).toBe(0)
  })
})
