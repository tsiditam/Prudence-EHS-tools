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

// ── Temporal provenance ────────────────────────────────────────────────
import {
  patternWhen, patternOccurrences, patternTiming, occurrenceNavigation, representativeOccurrence,
  formatWindow, formatHourRange, typicalHours,
} from '../../src/utils/forensicPresent.js'
import { formatTimestamp, formatDateRange } from '../../src/utils/monitoringInsights.js'
import { monitoringPatternReview, acceptInterpretation, emptyForensicReview } from '../../src/utils/forensicReview.js'
import { validateForensicOutput, buildForensicInterpretationRecord } from '../../src/utils/forensicValidate.js'

const H = 3600_000
/** The occupancy pattern as it would be with two contributing windows. */
const twoWindowOccupancy = () => {
  const p = find('occupancy_comparison')
  const [w] = p.occurrenceWindows
  return { ...p, occurrenceWindows: [w, { ...w, id: 'occ-second', start: w.start + DAY, end: w.end + DAY }] }
}

describe('windows and ranges are formatted in the site’s clock', () => {
  it('formats a window compactly, collapsing a shared meridiem', () => {
    const start = Date.UTC(2026, 8, 11, 10, 14)
    expect(formatWindow(start, start + 17 * 60_000)).toBe('Sep 11 · 10:14–10:31 AM')
    expect(formatWindow(Date.UTC(2026, 8, 11, 11, 50), Date.UTC(2026, 8, 11, 13, 10))).toBe('Sep 11 · 11:50 AM–1:10 PM')
    expect(formatWindow(Date.UTC(2026, 8, 11, 23, 50), Date.UTC(2026, 8, 12, 0, 20))).toBe('Sep 11, 11:50 PM – Sep 12, 12:20 AM')
    expect(formatWindow(start, start)).toBe('Sep 11 · 10:14 AM')
    expect(formatWindow(start, null)).toBe('Sep 11 · 10:14 AM')
    expect(formatWindow(start, start + 60_000, { sep: ', ' })).toBe('Sep 11, 10:14–10:15 AM')
    expect(formatWindow(null as never, 1)).toBeNull()
  })

  it('applies the site offset the way the monitoring report does, never the host zone', () => {
    const t = Date.UTC(2026, 8, 11, 14, 14)
    const off = { utcOffsetMin: -300 }
    expect(formatWindow(t, t, off)).toBe(formatTimestamp(t, off)!.replace(', ', ' · '))
    expect(formatWindow(t, t, off)).toBe('Sep 11 · 9:14 AM')
    expect(formatWindow(t, t, { utcOffsetMin: 0 })).toBe('Sep 11 · 2:14 PM')
    expect(formatWindow(t, t, { utcOffsetMin: 600 })).toBe('Sep 12 · 12:14 AM')
  })

  it('formats an hour range as a reader says it', () => {
    expect(formatHourRange(13, 15)).toBe('1–3 PM')
    expect(formatHourRange(11, 13)).toBe('11 AM–1 PM')
    expect(formatHourRange(22, 23)).toBe('10–11 PM')
    expect(formatHourRange(23, 25)).toBe('11 PM–1 AM')
    expect(formatHourRange(0, 1)).toBe('12–1 AM')
    expect(formatHourRange(14, 14)).toBe('2 PM')
    expect(formatHourRange(null as never, 1)).toBeNull()
  })

  it('reads the typical hours off the summary’s agreeing days', () => {
    expect(typicalHours({ summary: { peakHour: 14, days: [{ peakHour: 14 }, { peakHour: 14 }] } }).label).toBe('2–3 PM')
    expect(typicalHours({ summary: { peakHour: 14, days: [{ peakHour: 13 }, { peakHour: 14 }, { peakHour: 15 }] } }).label).toBe('1–4 PM')
    expect(typicalHours({ summary: { peakHour: 0, days: [{ peakHour: 23 }, { peakHour: 0 }] } }).label).toBe('11 PM–1 AM')
    expect(typicalHours({ summary: {} })).toBeNull()
  })
})

describe('the When line is compact, deterministic, and shaped by the kind', () => {
  it('a recurring cycle states its usual hours and one representative day, and counts the rest', () => {
    const p = find('recurring_cycle')
    const when = patternWhen(p, bundle)!
    expect(when.mode).toBe('recurring')
    expect(when.primary).toMatch(/^Usually \d{1,2}(–\d{1,2})? [AP]M · [A-Z][a-z]{2} \d{1,2} representative$/)
    expect(when.primary).toBe('Usually 2–3 PM · Mar 2 representative')
    expect(when.count).toBe(p.occurrenceWindows.length)
    expect(when.secondary).toBe(`+ ${p.occurrenceWindows.length - 1} more occurrences`)
    expect(when.representative!.representative).toBe(true)
    // Compact: the line names ONE day, whatever the run length.
    expect(when.primary.match(/[A-Z][a-z]{2} \d{1,2}/g)).toHaveLength(1)
  })

  it('the full occurrence list is available separately, in order, with labels', () => {
    const occ = patternOccurrences(find('recurring_cycle'), bundle)
    expect(occ.map((w) => w.dayLabel)).toEqual(['Mar 2', 'Mar 3', 'Mar 4', 'Mar 5'])
    occ.forEach((w) => expect(w.label).toMatch(/^Mar \d · 2:00–2:45 PM$/))
    expect(occ.filter((w) => w.representative)).toHaveLength(1)
    expect(occ.map((w) => w.start)).toEqual(occ.map((w) => w.start).slice().sort((a, b) => a - b))
  })

  it('an event-backed pattern states its exact window', () => {
    const p = find('no_matching_outdoor_event')
    const when = patternWhen(p, bundle)!
    expect(when.mode).toBe('single')
    expect(when.primary).toBe(formatWindow(p.occurrenceWindows[0].start, p.occurrenceWindows[0].end))
    expect(when.primary).toBe('Mar 2 · 12:30 PM')
    expect(when.secondary).toBeNull()
    expect(when.representative!.id).toBe(p.occurrenceWindows[0].id)
    expect(patternWhen(find('event_proximity'), bundle)!.primary).toMatch(/^Mar 2 · /)
  })

  it('an occupancy comparison states a count and a span, and singles out no window among several', () => {
    const when = patternWhen(find('occupancy_comparison'), bundle)!
    expect(when.mode).toBe('aggregate')
    expect(when.primary).toBe('Across 1 occupied window · Mar 2, 2026')
    // One contributing window is showable; several are an aggregate.
    expect(when.representative!.id).toBe(find('occupancy_comparison').occurrenceWindows[0].id)
    const many = patternWhen(twoWindowOccupancy(), bundle)!
    expect(many.primary).toBe('Across 2 occupied windows · Mar 2 – 3, 2026')
    expect(many.representative).toBeNull()
    expect(many.count).toBe(2)
  })

  it('an indoor/outdoor comparison states the aligned interval actually used', () => {
    const p = find('indoor_outdoor_comparison')
    const when = patternWhen(p, bundle)!
    expect(when.mode).toBe('interval')
    const w = p.occurrenceWindows[0]
    expect(when.primary).toBe(`Aligned readings · ${formatWindow(w.start, w.end)}`)
    expect(when.primary).toBe('Aligned readings · Mar 2, 12:00 AM – Mar 5, 11:45 PM')
    expect(when.representative!.id).toBe(w.id)
  })

  it('uses the bundle’s own offset by default and the caller’s when given', () => {
    const p = find('no_matching_outdoor_event')
    const local = buildForensicBundle({ sensorData: {
      version: 2, datasets: [mk('primary', 'indoor', 'Indoor', multiDay(1, (_d, _h, i) => ({ pm: i === 50 ? 180 : 10 + (i % 5) })), ['pm'], { pm: 'µg/m³' }), mk('ds-out', 'outdoor', 'Outdoor', multiDay(1, (_d, _h, i) => ({ pm: 9 + (i % 5) })), ['pm'], { pm: 'µg/m³' })],
      occupancyWindows: [], graphs: {}, thresholds: {},
    }, utcOffsetMin: -300 })
    const q = (local as any).patterns.find((x: any) => x.kind === 'no_matching_outdoor_event')
    expect(patternWhen(q, local)!.primary).toBe('Mar 2 · 7:30 AM')
    expect(patternWhen(p, bundle, { utcOffsetMin: -300 })!.primary).toBe('Mar 2 · 7:30 AM')
    expect(patternWhen(p, bundle, { utcOffsetMin: 0 })!.primary).toBe('Mar 2 · 12:30 PM')
  })

  it('returns null for a pattern with no windows, never a guess', () => {
    expect(patternWhen({ kind: 'coincidence', id: 'x' }, bundle)).toBeNull()
    expect(patternOccurrences(null as never, bundle)).toEqual([])
    expect(patternTiming({ kind: 'recurring_cycle' }, bundle)).toBeNull()
  })
})

describe('the report’s timing phrase', () => {
  it('is one clause per kind, from the same windows as the card', () => {
    expect(patternTiming(find('recurring_cycle'), bundle)).toBe('Typically 2–3 PM across 4 observed days.')
    expect(patternTiming(find('no_matching_outdoor_event'), bundle)).toBe('Mar 2, 12:30 PM.')
    expect(patternTiming(find('occupancy_comparison'), bundle)).toBe(`Across 1 occupied window, ${formatDateRange(T0 + 9 * H, T0 + 17 * H)}.`)
    expect(patternTiming(find('indoor_outdoor_comparison'), bundle)).toBe('Aligned readings, Mar 2, 12:00 AM – Mar 5, 11:45 PM.')
    bundle.patterns.forEach((p: any) => {
      const t = patternTiming(p, bundle)
      expect(typeof t).toBe('string')
      expect(t).not.toContain('\n')
      expect(t!.length).toBeLessThan(90) // a clause, never an occurrence list
    })
  })

  it('rides the report row, and never comes from the prose', () => {
    const cycle = find('recurring_cycle')
    // A reading that DESCRIBES a time. Validated, accepted, and still not the
    // source of the timing shown anywhere.
    const reading = {
      pattern_id: cycle.id, title: 'Repeating afternoon swing', importance: 'worth_review',
      interpretation: 'The swing recurs each December afternoon around teatime and is consistent with scheduled occupancy; it requires confirmation.',
      alternative_explanations: [], missing_context_ids: [], recommended_reviews: [], report_candidate: true, evidence_ids: [],
    }
    const validation = validateForensicOutput({ interpretations: [reading] }, bundle)
    expect(validation.status).toBe('validated')
    const record = buildForensicInterpretationRecord({ bundle, validation })
    const review = acceptInterpretation(emptyForensicReview(), { patternId: cycle.id, interpretation: reading, fingerprint: bundle.fingerprint })
    const rows = monitoringPatternReview({ bundle, record, review })
    expect(rows).toHaveLength(1)
    expect(rows[0].timing).toBe(patternTiming(cycle, bundle))
    expect(rows[0].timing).not.toMatch(/December|teatime/)
    expect(patternWhen(cycle, bundle)!.primary).not.toMatch(/December|teatime/)
  })
})

describe('navigation requests resolve against the current pattern only', () => {
  it('defaults to the representative occurrence and carries every window', () => {
    const cycle = find('recurring_cycle')
    const req = occurrenceNavigation(cycle)!
    const rep = representativeOccurrence(cycle)!
    expect(req).toMatchObject({ patternId: cycle.id, occurrenceId: rep.id, start: rep.start, end: rep.end, params: ['co2'], datasetIds: ['primary'] })
    expect(req.windows).toHaveLength(cycle.occurrenceWindows.length)
    expect(req.windows.filter((w) => w.representative)).toHaveLength(1)
  })

  it('resolves a named occurrence, and refuses one the pattern does not have', () => {
    const cycle = find('recurring_cycle')
    const other = cycle.occurrenceWindows.find((w: any) => !w.representative)
    expect(occurrenceNavigation(cycle, other.id)!.start).toBe(other.start)
    // A stale link — an id minted against earlier data — goes nowhere.
    expect(occurrenceNavigation(cycle, 'occ-00000000')).toBeNull()
    expect(occurrenceNavigation(find('no_matching_outdoor_event'), other.id)).toBeNull()
  })

  it('offers no default for a multi-window aggregate, and nothing for a pattern without windows', () => {
    const many = twoWindowOccupancy()
    expect(representativeOccurrence(many)).toBeNull()
    expect(occurrenceNavigation(many)).toBeNull()
    // A named window of it still resolves; the sole window of a one-window
    // comparison is its default.
    expect(occurrenceNavigation(many, 'occ-second')!.start).toBe(many.occurrenceWindows[1].start)
    const named = find('occupancy_comparison').occurrenceWindows[0]
    expect(occurrenceNavigation(find('occupancy_comparison'))!.occurrenceId).toBe(named.id)
    expect(occurrenceNavigation(find('occupancy_comparison'), named.id)!.occurrenceId).toBe(named.id)
    expect(occurrenceNavigation({ id: 'pat-x', kind: 'coincidence' })).toBeNull()
    expect(occurrenceNavigation(null as never)).toBeNull()
  })
})
