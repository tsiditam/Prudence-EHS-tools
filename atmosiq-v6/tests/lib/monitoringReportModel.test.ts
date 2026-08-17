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
  buildLimitations,
  loggingLabel,
  intervalLabel,
  calibrationLabel,
  calibrationIntegrity,
  figureCaption,
} from '../../src/utils/monitoringReportModel.js'
import { CAL_VALIDITY_DAYS } from '../../src/utils/instrumentRegistry.js'
import { monitoringReportChildren } from '../../src/components/docx/sections-monitoring.js'
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
    // Pin the generation zone so the date/time stamp is deterministic in CI.
    timeZone: 'America/New_York',
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

  it('carries the unit beside the figure, not inside it', () => {
    // Separate fields so the renderer can set the unit smaller and quieter
    // than the number; joining them here would take that decision away.
    const st = parameterStats(pts([500, 1200, 700]), 'co2', { reference: { limit: 1000 } })!
    const strip = summaryStrip('co2', st, { limit: 1000 } as never, { co2: 'ppm' })
    expect(strip[0].value).not.toMatch(/ppm/)
    expect(strip[0].unit).toBe('ppm')
    // A percentage carries its own unit, and a duration carries none.
    expect(strip.find((t: any) => t.key === 'pctAbove')!.unit).toBe('%')
    expect(strip.find((t: any) => t.key === 'timeAbove')!.unit).toBe('')
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
    // A report DATE carries no time of day, in the generator's local zone
    // (14:20 UTC is 10:20 EDT, still the 31st).
    expect(model.cover.reportDate).toBe('7-31-2026')
    // The cover lists what was measured in the compact form, so the row reads
    // as a set of symbols rather than a wrapped line of full names.
    expect(model.cover.parameters).toEqual(['CO₂', 'Temp'])
    // And the period is one range, not two timestamps run together.
    expect(model.cover.period).toMatch(/^[A-Z][a-z]{2} \d+ – \d+, \d{4}$/)
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
    // The hash travels with what it covers: two datasets can share a prefix,
    // not a reading count.
    expect(meta['Dataset SHA-256']).toBe('a19dd790c8f4 (432 readings)')
    expect(meta['Software']).toBe('AtmosFlow 6.0.0')
    expect(meta['Report version']).toContain(MONITORING_REPORT_VERSION)
    expect(meta['Report version']).toContain('Client Edition')
    // Generated is legible and local — normal date/time with the real zone
    // abbreviation, not a raw UTC machine string.
    expect(meta['Generated']).toBe('7-31-2026, 10:20 AM EDT')
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

  it('no longer carries the CO₂ ventilation-indicator framing into the reference table (removed 2026-08)', () => {
    expect(build().referenceRows.find((r: any) => r.param === 'co2')!.note).toBeNull()
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

  it('carries the screening-and-documentation limitation statement', () => {
    const model = build()
    const all = model.limitations.join(' ')
    expect(all).toMatch(/documentation and interpretation purposes/i)
    expect(all).not.toMatch(/not constitute a compliance or regulatory determination/i)
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

describe('sampling cadence', () => {
  it('reads as an instrument spec in the header and as prose in the table', () => {
    expect(loggingLabel(60)).toBe('1-min logging')
    expect(loggingLabel(600)).toBe('10-min logging')
    expect(loggingLabel(30)).toBe('30-sec logging')
    expect(intervalLabel(60)).toBe('1 minute')
    expect(intervalLabel(600)).toBe('10 minutes')
    expect(intervalLabel(1)).toBe('1 second')
  })

  it('says nothing rather than guessing when the cadence is unknown', () => {
    for (const bad of [null, undefined, NaN, 0, -60]) {
      expect(loggingLabel(bad as never)).toBeNull()
      expect(intervalLabel(bad as never)).toBeNull()
    }
  })

  it('falls back to seconds for a cadence that is not a whole number of minutes', () => {
    expect(loggingLabel(90)).toBe('90-sec logging')
    expect(intervalLabel(90)).toBe('90 seconds')
  })
})

describe('calibration currency', () => {
  const gen = '2026-08-01T00:00:00.000Z'

  it('states where the calibration stands, not just when it happened', () => {
    expect(calibrationLabel('2026-03-12', gen)).toBe('2026-03-12 · current')
  })

  it('says past due once the live gate window has elapsed', () => {
    // The window is the gate's own constant — a second copy of that number is
    // exactly how a gate and the report describing it drift apart.
    const stale = new Date(Date.parse(gen) - (CAL_VALIDITY_DAYS + 1) * 86400000).toISOString().slice(0, 10)
    expect(calibrationLabel(stale, gen)).toBe(`${stale} · past due`)
  })

  it('makes no claim it cannot verify', () => {
    // Unreadable date or no reference date: the date is reported unchanged
    // rather than annotated with a guess.
    expect(calibrationLabel('sometime last spring', gen)).toBe('sometime last spring')
    expect(calibrationLabel('2026-03-12', undefined as never)).toBe('2026-03-12')
    expect(calibrationLabel('', gen)).toBeNull()
  })

  it('never prints a future/post-dated calibration bare — it flags it for review', () => {
    // A date AFTER the reference cannot be "current"; printing it bare reads as
    // verified. It is marked for review instead (the period check carries why).
    expect(calibrationLabel('2027-01-01', gen)).toBe('2027-01-01 · verify date')
  })
})

describe('calibration integrity vs the monitoring period', () => {
  // Period: 2026-06-01 → 2026-06-04.
  const start = Date.UTC(2026, 5, 1)
  const end = Date.UTC(2026, 5, 4)

  it('passes a calibration that precedes the window and is still current', () => {
    const r = calibrationIntegrity('2026-05-15', start, end)
    expect(r.status).toBe('ok')
    expect(r.qualitativeOnly).toBe(false)
    expect(r.note).toBeNull()
  })

  it('flags a calibration dated AFTER the monitoring period (the reviewer gap)', () => {
    // The exact failure from the reviewed report: cal 2026-10-30, data in June.
    const r = calibrationIntegrity('2026-10-30', start, end)
    expect(r.status).toBe('post_dates_period')
    expect(r.qualitativeOnly).toBe(true)
    expect(r.note).toMatch(/after the monitoring period/i)
    expect(r.note).toMatch(/qualitative only/i)
  })

  it('flags a calibration whose validity had lapsed before the window began', () => {
    // > CAL_VALIDITY_DAYS before start.
    const staleIso = new Date(start - (CAL_VALIDITY_DAYS + 30) * 86400000).toISOString().slice(0, 10)
    const r = calibrationIntegrity(staleIso, start, end)
    expect(r.status).toBe('expired_before_period')
    expect(r.qualitativeOnly).toBe(true)
    expect(r.note).toMatch(/qualitative only/i)
  })

  it('flags a calibration that lapsed part-way through the window', () => {
    // Validity expires between start and end.
    const midIso = new Date(start - (CAL_VALIDITY_DAYS - 1) * 86400000).toISOString().slice(0, 10)
    const r = calibrationIntegrity(midIso, start, end)
    expect(r.status).toBe('lapsed_mid_period')
    expect(r.qualitativeOnly).toBe(true)
  })

  it('states the absence plainly when no calibration was documented', () => {
    const r = calibrationIntegrity('', start, end)
    expect(r.status).toBe('absent')
    expect(r.qualitativeOnly).toBe(true)
    expect(r.note).toMatch(/not documented/i)
  })

  it('makes no currency claim it cannot verify (unreadable date or no period)', () => {
    expect(calibrationIntegrity('not a date', start, end).status).toBe('unverifiable')
    expect(calibrationIntegrity('2026-05-15', NaN, NaN).status).toBe('unverifiable')
    expect(calibrationIntegrity('2026-05-15', NaN, NaN).note).toBeNull()
  })

  it('every anomaly note passes the banned-language scanner', () => {
    for (const cal of ['2026-10-30', new Date(start - (CAL_VALIDITY_DAYS + 30) * 86400000).toISOString().slice(0, 10), '']) {
      const { note } = calibrationIntegrity(cal, start, end)
      if (note) expect(scan(note), `banned language in: "${note}"`).toEqual([])
    }
  })

  it('surfaces the anomaly on the assembled model (note + status + prominence)', () => {
    const model = build({ calibration: { date: '2027-11-01', dueDate: '' } })
    expect(model.calibrationStatus).toBe('post_dates_period')
    expect(model.calibrationAlert).toBe(true)
    expect(model.qualitativeOnly).toBe(true)
    expect(model.calibrationNote).toMatch(/after the monitoring period/i)
    // A clean calibration stays silent and non-alerting.
    const ok = build()
    expect(ok.calibrationStatus).toBe('ok')
    expect(ok.calibrationAlert).toBe(false)
    expect(ok.qualitativeOnly).toBe(false)
    expect(ok.calibrationNote).toBeNull()
  })
})

describe('below-detection-limit flagging (screening floor)', () => {
  function hchoDataset(maxPpb: number) {
    const points: any[] = []
    for (let i = 0; i < 60; i++) points.push({ t: T0 + i * 10 * MIN, hcho: maxPpb * (0.5 + 0.5 * (i / 59)) })
    return {
      fileName: 'graywolf.csv',
      params: ['hcho'],
      units: { hcho: 'ppb' },
      points,
      summary: { count: points.length, start: points[0].t, end: points[points.length - 1].t },
    }
  }
  const buildHcho = (maxPpb: number) =>
    buildMonitoringReportModel(session({ datasets: [{ ...hchoDataset(maxPpb), role: 'indoor' }] }), {
      generatedAt: '2026-07-31T14:20:00.000Z',
    })

  it('flags a formaldehyde series that tops out below the detection floor', () => {
    // The reviewer gap: HCHO max ~0.044 ppb presented as a measured value.
    const model = buildHcho(0.05)
    const hcho: any = model.parameters.find((x: any) => x.param === 'hcho')
    expect(hcho.belowDetection).toBe(true)
    expect(hcho.detectionNote).toMatch(/detection floor/i)
    expect(hcho.detectionNote).toMatch(/qualitative only/i)
    expect(model.qualitativeOnly).toBe(true)
    expect(model.dataQualityNotes).toHaveLength(1)
    // The caveat is client-facing prose — it must pass the scanner.
    expect(scan(hcho.detectionNote)).toEqual([])
  })

  it('does not flag a plausible formaldehyde series', () => {
    const model = buildHcho(18) // ~9–18 ppb, an ordinary indoor range
    const hcho: any = model.parameters.find((x: any) => x.param === 'hcho')
    expect(hcho.belowDetection).toBe(false)
    expect(hcho.detectionNote).toBeNull()
    expect(model.dataQualityNotes).toHaveLength(0)
    expect(model.qualitativeOnly).toBe(false)
  })
})

describe('outdoor baseline absence', () => {
  it('no longer prints an outdoor-baseline note (removed by product decision 2026-08)', () => {
    // The fixture monitors CO₂ with no outdoor dataset; the note that used to
    // flag that was removed along with the §Limitations screening caveats.
    const model = build()
    expect(model.outdoorBaselineNote).toBeNull()
    // The limitations are unaffected — still the standing purpose statement.
    expect(model.limitations.join(' ')).toMatch(/documentation and interpretation purposes/i)
  })

  it('stays null when an outdoor dataset was captured', () => {
    const model = build({ datasets: [{ ...dataset(), role: 'indoor' }, { ...dataset(), role: 'outdoor' }] })
    expect(model.outdoorBaselineNote).toBeNull()
  })
})

describe('figure captions', () => {
  const base = { figureNumber: 3, shortLabel: 'CO₂' }

  it('names the reference in the form the figure draws it', () => {
    expect(figureCaption({ ...base, reference: { limit: 1000, unit: 'ppm' } }, {})).toBe(
      'Figure 3. CO₂ over the monitoring period. Dashed line = 1,000 ppm reference.',
    )
    expect(
      figureCaption({ ...base, shortLabel: 'Temp', reference: { band: [68, 76], unit: '°F' } }, {}),
    ).toContain('Shaded band = 68–76 °F comfort range.')
  })

  it('claims only the marks the figure actually carries', () => {
    const both = figureCaption({ ...base, reference: { limit: 1000, unit: 'ppm' } }, {
      hasOccupancy: true,
      hasEvents: true,
    })
    expect(both).toContain('Shaded columns = marked occupied hours; ▲ = logged events (Appendix A).')

    const occOnly = figureCaption(base, { hasOccupancy: true })
    expect(occOnly).toContain('Shaded columns = marked occupied hours.')
    expect(occOnly).not.toContain('logged events')

    const evOnly = figureCaption(base, { hasEvents: true })
    expect(evOnly).toContain('▲ = logged events (Appendix A).')
    expect(evOnly).not.toContain('occupied hours')
  })

  it('omits the reference clause entirely when no reference was resolved', () => {
    const none = figureCaption(base, {})
    expect(none).toBe('Figure 3. CO₂ over the monitoring period.')
    expect(figureCaption(null as never, {})).toBe('')
  })

  it('explains the amber trace only when a reading actually crossed the reference', () => {
    // No excursion → no amber legend (it would describe a colour never drawn).
    expect(
      figureCaption({ ...base, reference: { limit: 1000, unit: 'ppm' }, stats: { pctAbove: 0 } }, {}),
    ).not.toContain('Amber')
    // Some readings above → the amber legend is earned.
    expect(
      figureCaption({ ...base, reference: { limit: 1000, unit: 'ppm' }, stats: { pctAbove: 4.2 } }, {}),
    ).toContain('Amber trace = readings above the reference.')
    // A defined action tier that is actually REACHED (rolling mean) → the red
    // legend too, naming the criterion and its source.
    const withAction = {
      ...base,
      reference: { limit: 1000, unit: 'ppm', action: { limit: 1500, label: 'WHO 1-hour acute', source: 'WHO 2010' } },
      stats: { pctAbove: 4.2 },
    }
    expect(figureCaption({ ...withAction, actionTierReached: true }, {})).toContain('red = WHO 1-hour acute (WHO 2010)')
    // Defined but NOT reached → no red clause (it would describe a span never drawn).
    expect(figureCaption({ ...withAction, actionTierReached: false }, {})).not.toContain('red =')
    // Band: amber legend only when time fell outside the band.
    expect(
      figureCaption({ ...base, shortLabel: 'Temp', reference: { band: [68, 76], unit: '°F' }, stats: { pctInBand: 100 } }, {}),
    ).not.toContain('Amber')
    expect(
      figureCaption({ ...base, shortLabel: 'Temp', reference: { band: [68, 76], unit: '°F' }, stats: { pctInBand: 88 } }, {}),
    ).toContain('Amber trace = readings outside the band.')
  })
})

describe('the §Limitations statement', () => {
  it('states the screening purpose plus the spatial, measurement and reference caveats, and passes the scanner', () => {
    const model = build() // fixture monitors CO₂ + temperature
    expect(model.disclaimer).toBeUndefined()

    const all = model.limitations.join(' ')
    expect(all).toMatch(/documentation and interpretation purposes/i)
    // Spatial/temporal representativeness + the measurement base clause.
    expect(all).toMatch(/conditions at the instrument location during the times sampled/i)
    expect(all).toMatch(/instrument accuracy, calibration status, sensor response, detection limits/i)
    // Only the sensors present get their measurement note — CO₂ yes, TVOC/PM2.5 no.
    expect(all).toMatch(/CO₂ informs occupancy and air-exchange patterns but does not by itself establish ventilation adequacy/i)
    expect(all).not.toMatch(/TVOC represents an aggregate sensor response/i)
    expect(all).not.toMatch(/PM2\.5 is measured by light scattering/i)
    // The reference caveat appears (references are compared), but the
    // occupational-limit sentence does NOT — no OSHA/NIOSH reference was selected.
    expect(all).toMatch(/references shown are used for interpretation only/i)
    expect(all).not.toMatch(/Occupational exposure limits shown were developed for adult workers/i)
    // Fixed-location interpretation clause.
    expect(all).toMatch(/fixed-location monitoring, not breathing-zone sampling/i)
    expect(all).toMatch(/do not by themselves establish sources, causation, exposure, or adverse health effects/i)
    // The compliance/health-determination framing stays out.
    expect(all).not.toMatch(/not constitute a compliance or regulatory determination/i)
    expect(all).not.toMatch(/health-based exposure limit/i)

    expect(scan(all)).toEqual([])
    expect(model.statementNote).toBeNull()
  })

  it('includes a sensor note only when that sensor is present, and the occupational caveat only for an OSHA/NIOSH reference', () => {
    // CO₂ present, TVOC/PM2.5 absent → only the CO₂ note.
    const co2Only = buildLimitations(['co2', 'temp'], { co2: { limit: 1000, profileId: 'ashrae-advisory' } }).join(' ')
    expect(co2Only).toMatch(/CO₂ informs occupancy/i)
    expect(co2Only).not.toMatch(/TVOC represents/i)
    expect(co2Only).not.toMatch(/PM2\.5 is measured/i)
    expect(co2Only).not.toMatch(/Occupational exposure limits/i)

    // TVOC + PM2.5 present → both notes; a NIOSH REL reference → occupational caveat.
    const full = buildLimitations(['pm25', 'tvoc', 'hcho'], {
      pm25: { limit: 35, profileId: 'epa' },
      hcho: { limit: 16, profileId: 'niosh-rel' },
    }).join(' ')
    expect(full).toMatch(/TVOC represents an aggregate sensor response/i)
    expect(full).toMatch(/PM2\.5 is measured by light scattering/i)
    expect(full).not.toMatch(/CO₂ informs occupancy/i) // no CO₂ in this report
    expect(full).toMatch(/Occupational exposure limits shown were developed for adult workers/i)

    // No references at all → no reference paragraph.
    const noRefs = buildLimitations(['temp'], {}).join(' ')
    expect(noRefs).not.toMatch(/references shown are used for interpretation/i)
    expect(noRefs).not.toMatch(/Occupational exposure limits/i)
  })

  it('never repeats itself in the colophon', () => {
    // Saying the same thing twice in one document weakens it rather than
    // reinforcing it, and invites the two copies to drift apart.
    const children = JSON.stringify(monitoringReportChildren(build()))
    expect(children).not.toContain('Screening & documentation only')
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

describe('PM10 as a reported parameter', () => {
  const pm10Dataset = () => {
    const points: any[] = []
    for (let i = 0; i < 3 * 24 * 6; i++) {
      const hour = (i / 6) % 24
      points.push({ t: T0 + i * 10 * MIN, pm10: hour >= 8 && hour < 18 ? 180 : 22 })
    }
    return {
      fileName: 'dusttrak.csv',
      params: ['pm10'],
      units: { pm10: 'µg/m³' },
      points,
      summary: { count: points.length, start: points[0].t, end: points[points.length - 1].t },
      quality: { flags: [] },
    }
  }

  const model = () =>
    buildMonitoringReportModel(
      createMonitoringSession({ datasets: [{ ...pm10Dataset(), role: 'indoor' }] }),
      { generatedAt: '2026-08-01T00:00:00.000Z' },
    )

  it('becomes a full parameter section, named as a client would read it', () => {
    const pm = model().parameters.find((x: any) => x.param === 'pm10')!
    expect(pm.titleLabel).toBe('Particulate matter (PM10)')
    expect(pm.shortLabel).toBe('PM10')
    expect(pm.unit).toBe('µg/m³')
    // The acronym survives the mid-sentence form.
    expect(pm.midLabel).toBe('PM10')
    expect(pm.strip.length).toBe(5)
    expect(pm.statement).toBeTruthy()
    expect(pm.insights.length).toBeGreaterThan(0)
  })

  it('resolves a reference by default, and reports against it', () => {
    const pm = model().parameters.find((x: any) => x.param === 'pm10')!
    expect(pm.reference.limit).toBe(150)
    // Occupied hours sit at 180 µg/m³ — above the EPA screening value.
    expect(pm.status.label).toBe('Review Suggested')
    expect(pm.stats.pctAbove).toBeGreaterThan(0)
  })

  it('no longer carries the NAAQS form caveat into the report’s reference table (removed 2026-08)', () => {
    const row = model().referenceRows.find((r: any) => r.param === 'pm10')!
    expect(row.label).toBe('PM10')
    expect(row.value).toBe('150 µg/m³')
    expect(row.note).toBeNull()
  })

  it('says nothing a measurement cannot support', () => {
    const m = model()
    const strings = [
      ...m.highlights.map((h: any) => h.text),
      ...m.parameters.flatMap((x: any) => [x.statement, ...x.insights.map((i: any) => i.text)]),
    ].filter(Boolean)
    expect(strings.length).toBeGreaterThan(3)
    strings.forEach((t: string) => expect(scan(t), `banned language in: "${t}"`).toEqual([]))
  })
})
