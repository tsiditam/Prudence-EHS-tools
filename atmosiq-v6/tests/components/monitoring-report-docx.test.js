/**
 * Indoor Environmental Monitoring Report — DOCX layer.
 *
 * The content rules live in tests/lib/monitoringReportModel.test.ts. What is
 * verified here is that the model actually becomes a document: sections are
 * built in the right order, empty sections are omitted rather than rendered
 * blank, appendices are lettered, a broken chart cannot abort generation, and
 * the packed file is a real .docx.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import {
  overviewCard,
  splitObservation,
  buildMonitoringSections,
  monitoringReportChildren,
  buildParameterSection,
  buildReferenceSection,
  buildEventsAppendix,
  buildRawStatisticsAppendix,
} from '../../src/components/docx/sections-monitoring'
import {
  buildMonitoringReportDocument,
  monitoringReportFileName,
  attachMonitoringCharts,
} from '../../src/components/docx/monitoring-report'
import { buildMonitoringReportModel, statusFor } from '../../src/utils/monitoringReportModel'
import { createMonitoringSession } from '../../src/utils/monitoringSession'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function dataset() {
  const points = []
  for (let i = 0; i < 288; i++) {
    const hour = (i / 6) % 24
    const occupied = hour >= 8 && hour < 18
    points.push({ t: T0 + i * 10 * MIN, co2: occupied ? 1100 : 480, temp: occupied ? 73 : 70, pm25: occupied ? 7.5 : 4.2 })
  }
  return {
    fileName: 'qtrak.csv',
    params: ['co2', 'temp', 'pm25'],
    units: { co2: 'ppm', temp: '°F', pm25: 'µg/m³' },
    points,
    summary: { count: points.length, start: points[0].t, end: points[points.length - 1].t },
    quality: { flags: [{ level: 'minor', msg: 'Irregular sampling intervals.' }] },
  }
}

const session = (over = {}) =>
  createMonitoringSession({
    objective: 'Document indoor environmental conditions.',
    location: { building: 'Meridian Commerce Tower', room: 'Suite 300' },
    instrument: { make: 'TSI', model: 'Q-Trak XP', serial: 'QT-1' },
    calibration: { date: '2026-03-12' },
    assessor: { name: 'T. Tamakloe', credentials: 'CSP' },
    client: { preparedFor: 'Meridian Property Group' },
    datasets: [{ ...dataset(), role: 'indoor' }],
    events: [{ id: 'e1', t: T0 + 300 * MIN, type: 'cleaning', note: 'After hours.' }],
    ...over,
  })

const statusForProbe = (pctAbove) => statusFor({ pctAbove }, { limit: 1000 })

const model = (over = {}, opts = {}) =>
  buildMonitoringReportModel(session(over), {
    generatedAt: '2026-07-31T14:20:00.000Z',
    datasetHash: 'a19dd790',
    softwareVersion: '6.0.0',
    charts: { co2: PNG },
    ...opts,
  })

describe('section assembly', () => {
  it('builds the body in report order', () => {
    const { body } = buildMonitoringSections(model())
    const titles = body.map((s) => s.title)
    expect(titles[0]).toBe('Indoor Environmental Monitoring Report')
    expect(titles).toEqual(
      expect.arrayContaining([
        'Monitoring objective',
        'Location & instrument',
        'Key dataset highlights',
        'Screening reference values',
        // Parameter sections take the formal heading: the quantity in full,
        // with its symbol, so a reader who knows only one of the two finds it.
        'Carbon dioxide (CO₂)',
        'Temperature',
        'Dataset integrity',
        'Limitations',
        'Report metadata',
      ]),
    )
    // Limitations must never be buried after the metadata block.
    expect(titles.indexOf('Limitations')).toBeLessThan(titles.indexOf('Report metadata'))
  })

  it('closes the document with the colophon, after the appendices', () => {
    const m = model({}, { edition: 'technical' })
    const { body } = buildMonitoringSections(m)
    const footer = body.find((s) => s.footer)
    expect(footer.title).toBe('Report metadata')
    expect(footer.num).toBeUndefined() // the colophon carries no section number

    // In the flattened output the footer follows the appendices, not the
    // numbered body — a traceability block above Appendix B would read as a
    // section of the argument rather than the end of the document.
    const text = JSON.stringify(monitoringReportChildren(m))
    expect(text).toContain('DATASET SHA-256') // meta-grid keys render as small caps
    expect(text.indexOf('Appendix B')).toBeLessThan(text.indexOf('DATASET SHA-256'))
  })

  it('letters the appendices, and keeps raw statistics out of the client edition', () => {
    const client = buildMonitoringSections(model())
    expect(client.appendices.map((a) => a.title)).toEqual(['Monitoring events'])

    const technical = buildMonitoringSections(model({}, { edition: 'technical' }))
    expect(technical.appendices.map((a) => a.title)).toEqual(['Monitoring events', 'Raw statistics'])

    const children = monitoringReportChildren(model({}, { edition: 'technical' }))
    const text = JSON.stringify(children)
    expect(text).toContain('Appendix A - Monitoring events')
    expect(text).toContain('Appendix B - Raw statistics')
  })

  it('omits a section with no data rather than rendering an empty heading', () => {
    const bare = buildMonitoringReportModel(createMonitoringSession(), {})
    const { body, appendices } = buildMonitoringSections(bare)
    const titles = body.map((s) => s.title)
    expect(titles).not.toContain('Monitoring objective')
    expect(titles).not.toContain('Key dataset highlights')
    expect(titles).not.toContain('Screening reference values')
    expect(appendices).toEqual([]) // no events, no technical appendix
    // The disclaimers still ship — they are not conditional on data.
    expect(titles).toContain('Limitations')
  })

  it('returns empty structures for a null model instead of throwing', () => {
    expect(buildMonitoringSections(null)).toEqual({ body: [], appendices: [] })
    expect(buildParameterSection(null)).toBeNull()
    expect(buildReferenceSection({})).toBeNull()
    expect(buildEventsAppendix({})).toBeNull()
    expect(buildRawStatisticsAppendix({})).toBeNull()
  })
})

describe('parameter section', () => {
  const entry = model().parameters.find((x) => x.param === 'co2')
  const section = buildParameterSection(entry)

  it('never lowercases an acronym in the opening line', () => {
    const pm = buildParameterSection(model().parameters.find((x) => x.param === 'pm25'))
    const text = JSON.stringify(pm.children)
    expect(text).toContain('measured PM2.5')
    expect(text).not.toContain('measured pm2.5')
  })

  it('labels reference-table rows for a reader', () => {
    const text = JSON.stringify(buildReferenceSection(model()).children)
    expect(text).toContain('Carbon dioxide')
    expect(text).not.toMatch(/"co2"/)
  })

  it('renders status, strip, chart, statement and insights', () => {
    const text = JSON.stringify(section.children)
    expect(section.title).toBe('Carbon dioxide (CO₂)')
    // The status renders as a tinted chip carrying the label itself, not a
    // "Status:" prefix line.
    expect(text).toContain(entry.status.label)
    expect(text).toContain('KEY OBSERVATIONS')
    expect(text).toContain('Figure 1.')
    // The summary strip renders its labels as small caps above the figures.
    expect(text).toContain('95TH PCT')
    expect(text).toContain('TIME ABOVE')
    // The parameter header carries the short name and the sampling cadence.
    expect(text).toContain('CO₂')
    expect(text).toContain('10-min logging')
  })

  it('describes only the marks the figure actually carries', () => {
    // A caption that explains occupancy shading on a chart with no marked
    // occupancy teaches the reader to distrust the captions.
    const withMarks = model().parameters.find((x) => x.param === 'co2')
    expect(withMarks.caption).toContain('Dashed line = 1,000 ppm screening reference')
    expect(withMarks.caption).toContain('logged events (Appendix A)')

    const bare = buildMonitoringReportModel(
      createMonitoringSession({ datasets: [{ ...dataset(), role: 'indoor' }] }),
      {},
    ).parameters.find((x) => x.param === 'co2')
    expect(bare.caption).not.toContain('occupied hours')
    expect(bare.caption).not.toContain('logged events')
  })

  it('sets the statement lead and its standing note as one paragraph', () => {
    const text = JSON.stringify(buildParameterSection({ ...entry, statementNote: 'NOTE-SENTINEL' }).children)
    expect(text).toContain('NOTE-SENTINEL')
    expect(text).toContain(entry.statement.slice(0, 40))
  })

  it('numbers the body sections in an unbroken sequence', () => {
    // A report that skipped from 03 to 05 would look like a page went missing,
    // so numbering is applied after empty sections are dropped.
    const { body } = buildMonitoringSections(model())
    expect(body[0].num).toBeUndefined() // the cover is unnumbered
    // The colophon is excluded: it is the end of the document, not a section.
    const nums = body.slice(1).filter((s) => !s.footer).map((s) => s.num)
    expect(nums).toEqual([...Array(nums.length).keys()].map((i) => i + 1))
  })

  it('keeps the numbering unbroken when sections are omitted', () => {
    // No objective and no events: the sections that remain still run 01,02,03…
    const sparse = buildMonitoringReportModel(
      createMonitoringSession({ datasets: [{ ...dataset(), role: 'indoor' }] }),
      {},
    )
    const { body } = buildMonitoringSections(sparse)
    // The colophon is excluded: it is the end of the document, not a section.
    const nums = body.slice(1).filter((s) => !s.footer).map((s) => s.num)
    expect(nums).toEqual([...Array(nums.length).keys()].map((i) => i + 1))
    expect(body.some((s) => s.title === 'Monitoring objective')).toBe(false)
  })

  it('survives an unreadable chart rather than aborting the report', () => {
    const broken = buildParameterSection({ ...entry, chart: 'data:image/png;base64,@@@not-base64@@@' })
    expect(broken).toBeTruthy()
    expect(broken.children.length).toBeGreaterThan(2)
  })

  it('renders without a chart at all', () => {
    const noChart = buildParameterSection({ ...entry, chart: null })
    expect(noChart.children.length).toBeGreaterThan(2)
    expect(JSON.stringify(noChart.children)).not.toContain('Figure 1.')
  })
})

describe('document packaging', () => {
  it('packs a real .docx', async () => {
    const doc = buildMonitoringReportDocument(model())
    const buf = await Packer.toBuffer(doc)
    expect(buf.length).toBeGreaterThan(2000)
    // A .docx is a zip: the local file header magic is "PK\x03\x04".
    expect(buf[0]).toBe(0x50)
    expect(buf[1]).toBe(0x4b)
  }, 30_000)

  it('packs the technical edition too', async () => {
    const buf = await Packer.toBuffer(buildMonitoringReportDocument(model({}, { edition: 'technical' })))
    expect(buf.length).toBeGreaterThan(2000)
  }, 30_000)

  it('names the file from the site and edition, safely for any OS', () => {
    // The em-dash in "Tower — Suite 300" is stripped and the surrounding
    // whitespace collapses to a single hyphen, not a doubled one.
    expect(monitoringReportFileName(model())).toBe(
      'AtmosFlow-Monitoring-Report-Meridian-Commerce-Tower-Suite-300.docx',
    )
    expect(monitoringReportFileName(model({}, { edition: 'technical' }))).toContain('-Technical.docx')
    // No characters that break a filesystem.
    expect(monitoringReportFileName(model())).not.toMatch(/[/\\:*?"<>|]/)
  })

  it('falls back to a usable name when the site is unknown', () => {
    const bare = buildMonitoringReportModel(createMonitoringSession(), {})
    expect(monitoringReportFileName(bare)).toBe('AtmosFlow-Monitoring-Report-Monitoring.docx')
  })
})

describe('figures', () => {
  it('leaves supplied charts alone', () => {
    const m = model()
    expect(attachMonitoringCharts(m, session(), { charts: { co2: PNG } })).toBe(m)
  })

  it('degrades to a text-only report where no canvas exists', () => {
    // Node test env has no canvas. The report must still build — the sections
    // omit a missing figure rather than reserving a blank.
    const m = buildMonitoringReportModel(session(), { generatedAt: '2026-07-31T14:20:00.000Z' })
    const out = attachMonitoringCharts(m, session(), {})
    expect(out.parameters.every((p) => !p.chart)).toBe(true)
  })

  it('carries the site offset on the model, so figures label the same clock as the tables', () => {
    const m = buildMonitoringReportModel(session({ utcOffsetMin: -300 }), {})
    expect(m.utcOffsetMin).toBe(-300)
  })

  it('does not throw on a model with no parameters', () => {
    const bare = buildMonitoringReportModel(createMonitoringSession(), {})
    expect(attachMonitoringCharts(bare, createMonitoringSession(), {})).toBe(bare)
    expect(attachMonitoringCharts(null, null, {})).toBeNull()
  })
})

describe('the cover’s at-a-glance panel', () => {
  it('lists every parameter that has a resolved status', () => {
    const m = model()
    const text = JSON.stringify(overviewCard(m.overview))
    expect(text).toContain('OVERALL MONITORING SUMMARY')
    m.overview.forEach((o) => {
      expect(text, `missing ${o.param}`).toContain(o.label)
      expect(text).toContain(o.status.label)
    })
    expect(m.overview.length).toBeGreaterThan(1)
  })

  it('cannot tell a different story from the parameter sections', () => {
    // The panel is built from the SAME status object each section renders, so
    // a cover claiming "Within Reference" over a section reading otherwise is
    // not a mistake this can make.
    const m = model()
    m.overview.forEach((o) => {
      const section = m.parameters.find((p) => p.param === o.param)
      expect(o.status).toBe(section.status)
    })
  })

  it('omits a parameter with no resolved reference rather than inventing one', () => {
    const m = model()
    const withoutRef = m.parameters.filter((p) => !p.status).map((p) => p.param)
    withoutRef.forEach((param) => {
      expect(m.overview.some((o) => o.param === param)).toBe(false)
    })
  })

  it('renders nothing at all when no parameter has a status', () => {
    expect(overviewCard([])).toBeNull()
    expect(overviewCard(null)).toBeNull()
    expect(overviewCard([{ param: 'co2', label: 'Carbon dioxide' }])).toBeNull()
  })
})

describe('key observations', () => {
  it('sets the phrase a reader scans for apart, without rewording the sentence', () => {
    // Presentation only. The split must never change what the model produced —
    // lead + rest recombine to exactly the original text.
    const cases = [
      'Highest concentration recorded on Jul 17, 8:10 AM (1,789 ppm).',
      'Overnight readings (22:00–05:00) averaged 595 ppm.',
      'Readings were above the selected screening reference for 19 h 30 m.',
      'The selected screening reference was not exceeded during the monitoring period.',
    ]
    cases.forEach((text) => {
      const { lead, rest } = splitObservation(text)
      expect(lead.length).toBeGreaterThan(0)
      expect(`${lead} ${rest}`.trim().replace(/\s+/g, ' ')).toBe(text)
    })
  })

  it('leaves a short sentence whole rather than splitting it awkwardly', () => {
    const { lead, rest } = splitObservation('No gaps recorded.')
    expect(lead).toBe('No gaps recorded.')
    expect(rest).toBe('')
  })

  it('survives empty and non-string input', () => {
    expect(splitObservation('')).toEqual({ lead: '', rest: '' })
    expect(splitObservation(null)).toEqual({ lead: '', rest: '' })
  })
})

describe('the status colour scale', () => {
  it('gives a section heading the dot its status carries', () => {
    const entry = model().parameters.find((x) => x.param === 'co2')
    const text = JSON.stringify(buildParameterSection(entry, 5).children)
    // The dot is what lets a reader flip through and see which parameters
    // need a second look without reading a word.
    expect(text).toContain('●')
  })

  it('scales in four steps while the words stay the locked three', () => {
    const tones = new Set()
    const labels = new Set()
    ;[0, 3, 10, 40].forEach((pctAbove) => {
      const s = statusForProbe(pctAbove)
      tones.add(s.tone)
      labels.add(s.label)
    })
    expect(tones.size).toBe(4)
    // "Elevated" and "Investigation Recommended" would be interpretations of
    // what a measurement means; these say only where it sat.
    labels.forEach((l) => {
      expect(l).not.toMatch(/elevated|investigat/i)
    })
    expect([...labels].sort()).toEqual(['Above Reference', 'Review Suggested', 'Within Reference'])
  })
})
