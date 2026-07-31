/**
 * monitoringReportModel — the Indoor Environmental Monitoring Report as data.
 *
 * This is where report CONTENT is pinned: section presence, the status
 * vocabulary, which statistics each strip carries, edition differences, and
 * the defensibility rules that must hold in a client deliverable. The DOCX
 * layer is deliberately thin, so a content regression fails here rather than
 * inside a .docx nobody opens.
 */
import { describe, it, expect } from 'vitest'
import {
  buildMonitoringReportModel,
  statusFor,
  summaryStrip,
  MONITORING_REPORT_VERSION,
  LIMITATIONS,
} from '../../src/utils/monitoringReportModel.js'
import { createMonitoringSession } from '../../src/utils/monitoringSession.js'
import { parameterStats } from '../../src/utils/monitoringStats.js'
import { STD } from '../../src/constants/standards.js'
import * as mirrorNs from '../../api/_banned-language.js'

const mirror: any = (mirrorNs as any).default ?? mirrorNs
const { scan } = mirror

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

/** A three-day CO₂ + temperature dataset in the shape sensorParser emits. */
function dataset() {
  const points: any[] = []
  for (let i = 0; i < 3 * 24 * 6; i++) {
    const hour = (i / 6) % 24
    const occupied = hour >= 8 && hour < 18
    points.push({
      t: T0 + i * 10 * MIN,
      co2: occupied ? 900 + Math.round(hour) * 20 : 480,
      temp: occupied ? 73 : 70,
    })
  }
  return {
    fileName: 'qtrak.csv',
    params: ['co2', 'temp'],
    units: { co2: 'ppm', temp: '°F' },
    points,
    summary: { count: points.length, start: points[0].t, end: points[points.length - 1].t },
    quality: { flags: [{ level: 'minor', msg: 'Irregular sampling intervals / gaps detected.' }] },
  }
}

function session(over: any = {}) {
  return createMonitoringSession({
    objective: 'Continuous environmental monitoring was conducted to document indoor environmental conditions.',
    location: { building: 'Meridian Commerce Tower', floor: '3', room: 'Suite 300', sensorPosition: 'Desk height, 1.1 m' },
    instrument: { make: 'TSI', model: 'Q-Trak XP', serial: 'QT-XP-40718', timestampSource: 'device' },
    calibration: { date: '2026-03-12', dueDate: '2026-12-07', status: 'current' },
    assessor: { name: 'T. Tamakloe', credentials: 'CSP', company: 'Prudence EHS' },
    client: { preparedFor: 'Meridian Property Group' },
    datasets: [{ ...dataset(), role: 'indoor' }],
    events: [{ id: 'e1', t: T0 + 30 * 60 * MIN, type: 'windows_opened', note: 'East-facing windows.' }],
    occupancySchedule: [0, 1, 2].map((d) => ({ start: T0 + (d * 24 + 8) * 60 * MIN, end: T0 + (d * 24 + 18) * 60 * MIN })),
    ...over,
  })
}

const build = (over: any = {}, opts: any = {}) =>
  buildMonitoringReportModel(session(over), {
    generatedAt: '2026-07-31T14:20:00.000Z',
    datasetHash: 'a19dd790c8f4',
    softwareVersion: '6.0.0',
    ...opts,
  })

describe('status vocabulary', () => {
  it('never says "Elevated" — that is an interpretation, not a measurement', () => {
    const above = statusFor({ pctAbove: 5 } as never, { limit: 1000 } as never)!
    const review = statusFor({ pctAbove: 60 } as never, { limit: 1000 } as never)!
    const within = statusFor({ pctAbove: 0 } as never, { limit: 1000 } as never)!
    ;[above, review, within].forEach((s) => expect(s.label).not.toMatch(/elevated/i))
    expect(within.label).toBe('Within Reference')
    expect(above.label).toBe('Above Reference')
    expect(review.label).toBe('Review Suggested')
  })

  it('says "Outside" for a comfort band, which can be breached either way', () => {
    expect(statusFor({ pctInBand: 100 } as never, { band: [68, 76] } as never)!.label).toBe('Within Reference')
    expect(statusFor({ pctInBand: 93 } as never, { band: [68, 76] } as never)!.label).toBe('Outside Reference')
    expect(statusFor({ pctInBand: 50 } as never, { band: [68, 76] } as never)!.label).toBe('Review Suggested')
  })

  it('claims no status at all when no reference was selected', () => {
    expect(statusFor({ pctAbove: 5 } as never, null as never)).toBeNull()
    expect(statusFor(null as never, { limit: 1000 } as never)).toBeNull()
  })
})

describe('summary strip', () => {
  const pts = (v: number[], p = 'co2') => v.map((x, i) => ({ t: T0 + i * 10 * MIN, [p]: x }))

  it('asks the threshold questions for a threshold reference', () => {
    const st = parameterStats(pts([500, 1200, 700]), 'co2', { reference: { limit: 1000 } })!
    const keys = summaryStrip('co2', st, { limit: 1000 } as never, { co2: 'ppm' }).map((t) => t.key)
    expect(keys).toEqual(['mean', 'max', 'p95', 'pctAbove', 'timeAbove'])
  })

  it('asks the comfort questions for a band — a 95th percentile would be meaningless', () => {
    const st = parameterStats(pts([70, 79, 72], 'temp'), 'temp', { reference: { band: [68, 76] } })!
    const keys = summaryStrip('temp', st, { band: [68, 76] } as never, { temp: '°F' }).map((t) => t.key)
    expect(keys).toEqual(['mean', 'max', 'min', 'pctInBand', 'timeOutside'])
    expect(keys).not.toContain('p95')
  })

  it('carries units on the measured values', () => {
    const st = parameterStats(pts([500, 1200, 700]), 'co2', { reference: { limit: 1000 } })!
    expect(summaryStrip('co2', st, { limit: 1000 } as never, { co2: 'ppm' })[0].value).toMatch(/ppm$/)
  })
})

describe('the assembled report', () => {
  const model = build()

  it('reports on logger data alone — no score, no engine output', () => {
    expect(JSON.stringify(model)).not.toMatch(/composite|zoneScore|causalChain/i)
    expect(model.version).toBe(MONITORING_REPORT_VERSION)
  })

  it('carries the cover facts a deliverable needs', () => {
    expect(model.cover.site).toBe('Meridian Commerce Tower — Suite 300')
    expect(model.cover.preparedFor).toBe('Meridian Property Group')
    expect(model.cover.preparedBy).toBe('T. Tamakloe, CSP')
    expect(model.cover.periodStart).toBeTruthy()
    expect(model.cover.duration).toMatch(/h/)
    // A report DATE carries no time of day.
    expect(model.cover.reportDate).toBe('Jul 31, 2026')
    expect(model.cover.parameters).toEqual(['Carbon dioxide', 'Temperature'])
  })

  it('includes the location and instrument tables, omitting blank fields', () => {
    expect(model.location.map((r: any) => r.label)).toEqual(
      expect.arrayContaining(['Building', 'Floor', 'Room', 'Sensor position']),
    )
    expect(model.location.some((r: any) => r.label === 'Zone')).toBe(false) // not captured
    expect(model.instrument.map((r: any) => r.label)).toEqual(expect.arrayContaining(['Instrument', 'Serial', 'Calibration']))
  })

  it('builds one section per parameter, numbered for figure captions', () => {
    expect(model.parameters.map((x: any) => x.param)).toEqual(['co2', 'temp'])
    expect(model.parameters.map((x: any) => x.figureNumber)).toEqual([1, 2])
    model.parameters.forEach((x: any) => {
      // Mid-sentence label preserves acronyms so the section's opening line
      // never reads "measured pm2.5".
      expect(x.midLabel).toBeTruthy()
      expect(x.strip.length).toBe(5)
      expect(x.statement).toBeTruthy()
      expect(x.insights.length).toBeGreaterThan(0)
      expect(x.status).toBeTruthy()
    })
  })

  it('produces highlights, a reference table, integrity figures and events', () => {
    expect(model.highlights.length).toBeGreaterThan(0)
    expect(model.referenceRows.length).toBe(2)
    expect(model.dataQuality.map((r: any) => r.label)).toEqual(
      expect.arrayContaining(['Readings', 'Coverage', 'Gaps', 'Longest gap']),
    )
    expect(model.events[0].label).toBe('Windows opened')
    expect(model.events[0].time).toBeTruthy()
  })

  it('stamps the traceability metadata the report promises', () => {
    const meta = Object.fromEntries(model.metadata.map((m: any) => [m.label, m.value]))
    expect(meta['Dataset SHA-256']).toBe('a19dd790c8f4')
    expect(meta['Software']).toBe('6.0.0')
    expect(meta['Report version']).toContain(MONITORING_REPORT_VERSION)
    expect(meta['Edition']).toBe('Client')
  })

  it('uses one statistics pass, so the strip and the prose cannot disagree', () => {
    const co2 = model.parameters.find((x: any) => x.param === 'co2')!
    const timeAbove = co2.strip.find((t: any) => t.key === 'timeAbove')!.value
    const insight = co2.insights.find((i: any) => i.id === 'time-above')!
    expect(insight.text).toContain(timeAbove)
  })
})

describe('editions are one model, not two pipelines', () => {
  const client = build({}, { edition: 'client' })
  const technical = build({}, { edition: 'technical' })

  it('agree on every number', () => {
    expect(technical.parameters.map((x: any) => x.strip)).toEqual(client.parameters.map((x: any) => x.strip))
    expect(technical.highlights).toEqual(client.highlights)
  })

  it('differ only in the technical appendices', () => {
    expect(client.rawStatistics).toEqual([])
    expect(client.qualityFlags).toEqual([])
    expect(technical.rawStatistics.length).toBe(2)
    expect(technical.qualityFlags.length).toBe(1)
    expect(technical.rawStatistics[0]).toHaveProperty('stdDev')
    expect(technical.rawStatistics[0]).toHaveProperty('median')
  })

  it('falls back to the client edition for an unknown edition', () => {
    expect(build({}, { edition: 'nonsense' }).edition).toBe('client')
  })
})

describe('reference selection reaches the report', () => {
  it('re-computes the whole section when the profile changes', () => {
    const epa = build({ referenceProfiles: { pm25: 'epa' } })
    const co2Default = epa.parameters.find((x: any) => x.param === 'co2')!
    expect(co2Default.reference.limit).toBe(STD.v.co2.con)

    const action = build({ referenceProfiles: { co2: 'action-tier' } })
    const co2Action = action.parameters.find((x: any) => x.param === 'co2')!
    expect(co2Action.reference.limit).toBe(STD.v.co2.act)
    // A higher reference means less time above it — the statistics followed.
    expect(co2Action.stats.pctAbove).toBeLessThan(co2Default.stats.pctAbove)
    expect(co2Action.statement).toContain(String(STD.v.co2.act).replace(/\B(?=(\d{3})+(?!\d))/g, ','))
  })

  it('carries the CO₂ ventilation-indicator framing into the reference table', () => {
    expect(build().referenceRows.find((r: any) => r.param === 'co2')!.note).toMatch(/not a health limit/i)
  })

  it('labels reference rows for a reader, not with raw parameter keys', () => {
    // The table is read by a client: "Carbon dioxide", never "co2".
    const rows = build().referenceRows
    expect(rows.find((r: any) => r.param === 'co2')!.label).toBe('Carbon dioxide')
    expect(rows.find((r: any) => r.param === 'temp')!.label).toBe('Temperature')
  })
})

describe('defensibility', () => {
  it('states plainly when calibration was not documented', () => {
    const missing = build({ calibration: {} })
    expect(missing.calibrationNote).toMatch(/calibration was not documented/i)
    // …and stays silent when it was, because the table already shows it.
    expect(build().calibrationNote).toBeNull()
  })

  it('always carries the screening-only limitations', () => {
    const model = build()
    expect(model.limitations).toEqual(LIMITATIONS)
    expect(model.limitations.join(' ')).toMatch(/not constitute a compliance or regulatory determination/i)
    expect(model.limitations.join(' ')).toMatch(/ventilation adequacy/i)
  })

  it('passes the banned-language scanner across every generated string', () => {
    const model = build({}, { edition: 'technical' })
    const strings = [
      ...model.highlights.map((h: any) => h.text),
      ...model.parameters.flatMap((x: any) => [x.statement, ...x.insights.map((i: any) => i.text)]),
      ...model.limitations,
      model.calibrationNote,
    ].filter((s: any): s is string => typeof s === 'string' && s.length > 0)

    expect(strings.length).toBeGreaterThan(10)
    strings.forEach((text) => {
      expect(scan(text), `banned language in: "${text}"`).toEqual([])
    })
  })
})

describe('degraded inputs', () => {
  it('produces a report shell rather than throwing on an empty session', () => {
    const model = buildMonitoringReportModel(createMonitoringSession(), {})
    expect(model.parameters).toEqual([])
    expect(model.highlights).toEqual([])
    expect(model.limitations.length).toBeGreaterThan(0) // disclaimers still ship
    expect(model.calibrationNote).toBeTruthy() // and the gap is stated
  })

  it('survives entirely malformed input', () => {
    expect(() => buildMonitoringReportModel(null as never, {})).not.toThrow()
    expect(() => buildMonitoringReportModel({ datasets: 'nope' } as never, {})).not.toThrow()
  })

  it('omits a parameter with no usable readings instead of printing blanks', () => {
    const empty = { ...dataset(), params: ['co2', 'pm25'], points: dataset().points }
    const model = buildMonitoringReportModel(session({ datasets: [{ ...empty, role: 'indoor' }] }), {})
    expect(model.parameters.map((x: any) => x.param)).toEqual(['co2'])
  })
})
