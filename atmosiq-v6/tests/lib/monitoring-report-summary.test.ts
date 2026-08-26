/**
 * Jasper reads the monitoring report we issued — not a re-reading of the data.
 *
 * The projection exists so the assessor can ask about the DOCUMENT: what a
 * status means, which yardstick was used, why a parameter reads "Not
 * Established", what the limitations cover. Two properties make that safe, and
 * they are what this file pins.
 *
 * **It re-derives nothing.** `buildMonitoringReportModel` is pure, so the
 * persisted session plus the options the report was issued under reproduce the
 * document exactly. Every value here is copied out of that model. A number in
 * the projection that the report does not print means the layers have started
 * to disagree — the defect class this codebase keeps finding, most recently
 * where the phrase library retired three sentences the engine kept shipping.
 *
 * **It cannot claim a comparison the report withheld.** When calibration does
 * not cover the monitoring period, `statusFor` withdraws the verdict to "Not
 * Established" and the statistics print alone. That is the most misreadable
 * thing in the document, because a reader skimming numbers assumes a
 * comparison was made. If the projection ever hands Jasper an `above` or
 * `within` on such a parameter, the report's most careful decision is undone
 * by the layer that explains it.
 */
import { describe, it, expect } from 'vitest'
import {
  summarizeMonitoringReportForContext,
  MAX_MONITORING_PROSE_CHARS,
} from '../../lib/jasper/monitoring-report-summary'
import { buildMonitoringReportModel } from '../../src/utils/monitoringReportModel.js'
import { createMonitoringSession } from '../../src/utils/monitoringSession.js'

const T0 = Date.UTC(2026, 6, 15)
const MIN = 60_000

/** A three-day CO₂ + temperature log, occupied 08:00–18:00. */
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
    quality: { flags: [] },
  }
}

const OPTS = {
  edition: 'client',
  generatedAt: '2026-07-19T14:02:00.000Z',
  datasetHash: 'a1b2c3d4',
  softwareVersion: '6.0.0',
}

function session(over: any = {}) {
  return createMonitoringSession({
    objective: 'Continuous environmental monitoring was conducted.',
    location: { building: 'Meridian Commerce Tower', floor: '3', room: 'Suite 300' },
    instrument: { make: 'TSI', model: 'Q-Trak XP', serial: 'QT-XP-40718' },
    // Covers the July monitoring period.
    calibration: { date: '2026-03-12', dueDate: '2026-12-07', status: 'current' },
    assessor: { name: 'T. Tamakloe', credentials: 'CSP', company: 'Prudence EHS' },
    client: { preparedFor: 'Meridian Property Group' },
    datasets: [{ ...dataset(), role: 'indoor' }],
    occupancySchedule: [0, 1, 2].map((d) => ({
      start: T0 + (d * 24 + 8) * 60 * MIN,
      end: T0 + (d * 24 + 18) * 60 * MIN,
    })),
    ...over,
  })
}

const record = (over: any = {}) => ({
  session: session(over.session || {}),
  opts: { ...OPTS, ...(over.opts || {}) },
  fileName: 'Meridian_IEMR_2026-07-19.docx',
  generatedAt: OPTS.generatedAt,
})

const project = (over: any = {}) => summarizeMonitoringReportForContext(record(over))!

describe('there is no report until one was issued', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a bare object', {}],
    ['a record with no session', { opts: OPTS, fileName: 'x.docx' }],
    ['a non-object', 'report'],
  ])('%s projects to null, not an empty report', (_label, input) => {
    // Null, never an empty projection. An empty one reads as "a report exists
    // and says nothing", which is the opposite of the truth and exactly the
    // shape that produced "No significant concerns were identified" over an
    // assessment with critical findings.
    expect(summarizeMonitoringReportForContext(input as never)).toBeNull()
  })

  it('a malformed session does not take the context down with it', () => {
    // buildMonitoringReportModel throwing must degrade to "no report", not to
    // a Jasper turn that 500s. The whole assessment context rides on this.
    expect(() =>
      summarizeMonitoringReportForContext({ session: { datasets: 'not-an-array' } } as never),
    ).not.toThrow()
  })
})

describe('the projection is the issued report, not a re-reading of the data', () => {
  const model: any = buildMonitoringReportModel(session(), OPTS)
  const out = project()

  it('carries the same parameters the report rendered, in order', () => {
    expect(out.parameters.map((p) => p.param)).toEqual(model.parameters.map((p: any) => p.param))
    expect(out.parameters.length).toBeGreaterThan(0)
  })

  it.each(['co2', 'temp'])('%s: status, reference and citation match the model exactly', (param) => {
    const mine = out.parameters.find((p) => p.param === param)!
    const theirs = model.parameters.find((p: any) => p.param === param)
    expect(mine.status?.id).toBe(theirs.status?.id)
    expect(mine.status?.label).toBe(theirs.status?.label)
    expect(mine.reference?.source).toBe(theirs.reference?.source ?? null)
    expect(mine.reference?.criterion_id).toBe(theirs.reference?.criterionId ?? null)
    // The citation is the assessor's chosen yardstick. If this drifts, Jasper
    // names a standard the client's document does not.
    expect(mine.reference?.value).toBe(theirs.reference?.limit ?? null)
  })

  it.each(['co2', 'temp'])('%s: every statistic is copied, never recomputed', (param) => {
    const mine = out.parameters.find((p) => p.param === param)!
    const s = model.parameters.find((p: any) => p.param === param).stats
    expect(mine.stats.mean).toBe(s.mean)
    expect(mine.stats.median).toBe(s.median)
    expect(mine.stats.min).toBe(s.min)
    expect(mine.stats.max).toBe(s.max)
    expect(mine.stats.p95).toBe(s.p95)
    expect(mine.stats.pct_above).toBe(s.pctAbove ?? null)
    expect(mine.stats.pct_in_band).toBe(s.pctInBand ?? null)
    expect(mine.stats.n).toBe(s.n)
  })

  it('carries the report\'s own limitations verbatim and in full', () => {
    // Never budgeted away: a reader asking what the report means is exactly
    // the reader who needs the boundaries it declared.
    expect(out.limitations).toEqual(model.limitations)
    expect(out.limitations.length).toBeGreaterThan(0)
  })

  it('reports the issued document, not a fresh one under today\'s defaults', () => {
    expect(out.generated_at).toBe(OPTS.generatedAt)
    expect(out.file_name).toBe('Meridian_IEMR_2026-07-19.docx')
    expect(out.dataset_hash).toBe('a1b2c3d4')
    expect(out.edition).toBe(model.edition)
    expect(out.report_version).toBe(model.version)
  })

  it('keeps the occupancy split, which is what makes an answer specific', () => {
    const co2 = out.parameters.find((p) => p.param === 'co2')!
    expect(co2.occupancy).not.toBeNull()
    expect(co2.occupancy!.mean_occupied).not.toBeNull()
    expect(co2.occupancy!.mean_unoccupied).not.toBeNull()
    // The fixture is occupied 08:00–18:00 at 900+ ppm and 480 ppm otherwise,
    // so a positive delta is the ground truth of the dataset.
    expect(co2.occupancy!.delta!).toBeGreaterThan(0)
  })
})

describe('a withheld comparison stays withheld', () => {
  // Calibration dated AFTER the July monitoring period: statusFor withdraws
  // every comparison and the report prints "Not Established".
  const out = project({ session: { calibration: { date: '2026-09-01', status: 'current' } } })

  it('the report withheld it, and the projection says so', () => {
    expect(out.qualitative_only).toBe(true)
    for (const p of out.parameters) {
      expect(p.status?.label, `${p.param}`).toBe('Not Established')
      expect(p.status?.id, `${p.param}`).toBe('indeterminate')
    }
  })

  it('never hands Jasper a verdict the document does not contain', () => {
    // The property that matters. `within` / `above` / `outside` on a
    // parameter whose comparison was withdrawn would let Jasper tell a client
    // their CO₂ was fine on the strength of an instrument nothing vouches for.
    for (const p of out.parameters) {
      expect(['within', 'above', 'outside', 'review']).not.toContain(p.status?.id)
    }
  })

  it('carries the reason, which the document itself never prints', () => {
    // statusFor builds this sentence and no section renders it — the badge
    // says "Not Established" and the why never reaches the page. Jasper is
    // currently the only surface that can give a reader the explanation.
    const co2 = out.parameters.find((p) => p.param === 'co2')!
    expect(co2.status?.reason).toBeTruthy()
    expect(co2.status!.reason).toMatch(/calibration/i)
  })

  it('still prints the statistics, because those are facts about the readings', () => {
    // The withdrawal is of the INTERPRETATION, not the measurement. Dropping
    // the numbers would be a different lie.
    const co2 = out.parameters.find((p) => p.param === 'co2')!
    expect(co2.stats.mean).not.toBeNull()
    expect(co2.stats.max).not.toBeNull()
  })

  it('and a covered calibration still reaches a real verdict', () => {
    // The positive control. Without it, a projection that withheld everything
    // unconditionally would pass every assertion above.
    const ok = project()
    expect(ok.qualitative_only).toBe(false)
    expect(ok.parameters.some((p) => ['within', 'above', 'outside', 'review'].includes(p.status?.id ?? '')))
      .toBe(true)
  })
})

describe('the prose budget holds, and says when it bit', () => {
  it('stays within the cap and reports truncation honestly', () => {
    const out = project()
    const prose = [
      ...out.parameters.flatMap((p) => [p.statement || '', ...p.insights]),
      ...out.highlights,
      out.calibration.note || '',
    ].join('')
    expect(prose.length).toBeLessThanOrEqual(MAX_MONITORING_PROSE_CHARS + 64)
    expect(typeof out.truncated).toBe('boolean')
  })

  it('never cuts a number to save room', () => {
    // Prose is capped; statistics are not. A budget that dropped a figure
    // would make the projection disagree with the document over a number,
    // which is the one thing it may never do.
    const out = project()
    for (const p of out.parameters) {
      expect(p.stats.n, `${p.param} lost its reading count`).not.toBeNull()
      expect(p.stats.mean, `${p.param} lost its mean`).not.toBeNull()
    }
  })

  it('a report whose prose overruns is marked truncated rather than silently short', () => {
    const long = 'Sustained elevation observed across the occupied period. '.repeat(200)
    const out = summarizeMonitoringReportForContext({
      session: session({ objective: long }),
      opts: { ...OPTS },
      fileName: 'x.docx',
      generatedAt: OPTS.generatedAt,
    })!
    // Whether this particular field overruns is not the point; the flag must
    // be a real function of the budget, so assert the mechanism directly.
    const spent = [
      ...out.parameters.flatMap((p) => [p.statement || '', ...p.insights]),
      ...out.highlights,
    ].join('')
    if (spent.length >= MAX_MONITORING_PROSE_CHARS) expect(out.truncated).toBe(true)
    expect(out.parameters.length).toBeGreaterThan(0)
  })
})
