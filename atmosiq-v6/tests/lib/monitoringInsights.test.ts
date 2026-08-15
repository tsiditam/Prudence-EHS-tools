/**
 * monitoringInsights — deterministic prose for the Indoor Environmental
 * Monitoring Report.
 *
 * Two things are pinned here:
 *
 *  1. The RULES — the right sentence for the data, and no sentence at all
 *     when the data doesn't support one.
 *  2. The BOUNDARY — every generated string is run through the shared
 *     banned-language scanners (`api/_banned-language.js`), so "facts only,
 *     no judgement, no causation, no compliance conclusion" is enforced by
 *     the suite rather than by reviewer memory. If someone later adds a
 *     bullet that says a reading was "unsafe" or "caused by" an event, these
 *     tests fail before it reaches a client deliverable.
 */
import { describe, it, expect } from 'vitest'
import {
  formatDuration,
  formatValue,
  formatTimestamp,
  proseName,
  proseNameShort,
  proseNameTitle,
  formatDateRange,
  formatGeneratedAt,
  formatGeneratedDate,
  parameterStatement,
  monitoringInsights,
  datasetHighlights,
} from '../../src/utils/monitoringInsights.js'
import { parameterStats } from '../../src/utils/monitoringStats.js'
import * as mirrorNs from '../../api/_banned-language.js'

const mirror: any = (mirrorNs as any).default ?? mirrorNs
const { scan, scanStyle } = mirror

const T0 = Date.UTC(2026, 6, 15, 0, 0, 0) // Jul 15 2026 00:00 UTC — fixed
const MIN = 60_000

function pts(values: (number | null)[], param = 'co2', stepMin = 10, start = T0) {
  return values.map((v, i) => ({ t: start + i * stepMin * MIN, [param]: v }))
}

/** A three-day CO₂ series with a daytime rise and an overnight floor. */
function co2Series() {
  const out: { t: number; co2: number }[] = []
  for (let i = 0; i < 3 * 24 * 6; i++) {
    const t = T0 + i * 10 * MIN
    const hour = (i / 6) % 24
    const occupied = hour >= 8 && hour < 18
    out.push({ t, co2: occupied ? 900 + Math.round(hour) * 20 : 480 })
  }
  return out
}
const OCC_WINDOWS = [0, 1, 2].map((d) => ({
  start: T0 + (d * 24 + 8) * 60 * MIN,
  end: T0 + (d * 24 + 18) * 60 * MIN,
}))

describe('formatters', () => {
  it('renders durations the way a client reads them', () => {
    expect(formatDuration(19 * 3600 + 10 * 60)).toBe('19 h 10 m')
    expect(formatDuration(30 * 3600)).toBe('30 h') // no meaningless " 0 m"
    expect(formatDuration(45 * 60)).toBe('45 m')
    expect(formatDuration(0)).toBe('0 m')
    expect(formatDuration(null as never)).toBeNull()
  })

  it('renders values at the precision the instrument reports', () => {
    expect(formatValue(1789.4, 'co2')).toBe('1,789') // whole ppm
    expect(formatValue(6.72, 'pm25')).toBe('6.7') // one decimal
    expect(formatValue(69.94, 'temp')).toBe('69.9')
  })

  it('formats timestamps independently of the host timezone', () => {
    // Applying the offset to the epoch and reading back with UTC getters means
    // the result depends only on (timestamp, offset). A toLocaleString
    // implementation would drift between the assessor's laptop and CI.
    expect(formatTimestamp(Date.UTC(2026, 6, 18, 14, 14))).toBe('Jul 18, 2:14 PM')
    expect(formatTimestamp(Date.UTC(2026, 6, 18, 14, 14), { utcOffsetMin: -300 })).toBe('Jul 18, 9:14 AM')
    expect(formatTimestamp(Date.UTC(2026, 6, 18, 0, 5))).toBe('Jul 18, 12:05 AM')
    expect(formatTimestamp(Date.UTC(2026, 6, 18, 12, 0))).toBe('Jul 18, 12:00 PM')
  })

  it('names parameters as a sentence would', () => {
    expect(proseName('co2')).toBe('Carbon dioxide')
    expect(proseName('rh')).toBe('Relative humidity')
    expect(proseName('pm25')).toBe('PM2.5')
  })
})

describe('parameterStatement', () => {
  it('leads with the exceedance whenever any reading was above the reference', () => {
    // 2 of 10 above 1,000 → the sentence states the exceedance, not a
    // reassuring "remained below during 80%" that contradicts the status chip.
    const st = parameterStats(pts([500, 600, 1200, 1400, 500, 500, 500, 500, 500, 500]), 'co2', {
      reference: { limit: 1000 },
    })
    expect(parameterStatement('co2', st, { limit: 1000 })).toBe(
      'Carbon dioxide concentrations exceeded the selected screening reference (1,000 ppm) during 20% of logged measurements.',
    )
  })

  it('states a MAJORITY exceedance as an exceedance, at one-decimal precision', () => {
    // The reviewer's case: a mostly-above result must never read as "remained
    // below during 7%". 15 of 16 above → the exceedance leads.
    const st = parameterStats(pts([10, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20], 'hcho'), 'hcho', {
      reference: { limit: 16 },
    })
    const s = parameterStatement('hcho', st, { limit: 16 })!
    expect(s).toMatch(/^Formaldehyde concentrations exceeded the selected screening reference \(16 ppb\) during /)
    expect(s).not.toContain('remained below')
    // one-decimal share, matching the "% Above" strip tile
    expect(s).toMatch(/during \d+(\.\d)?% of logged measurements\.$/)
  })

  it('says "throughout" rather than "0%" when never exceeded', () => {
    const st = parameterStats(pts([400, 450, 500]), 'co2', { reference: { limit: 1000 } })
    expect(parameterStatement('co2', st, { limit: 1000 })).toMatch(/remained below .*throughout the monitoring period\.$/)
  })

  it('leads with the out-of-band share when the band was mostly exceeded', () => {
    // Mostly outside a 68–76 band → "fell outside", not "remained within during X%".
    const st = parameterStats(pts([80, 82, 84, 81, 83, 66, 72, 85, 86, 84], 'temp'), 'temp', {
      reference: { band: [68, 76] },
    })
    const s = parameterStatement('temp', st, { band: [68, 76] })!
    expect(s).toMatch(/^Temperature fell outside the selected comfort range \(68–76 °F\) during /)
    expect(s).not.toContain('remained within')
  })

  it('uses comfort-range wording for a banded parameter', () => {
    const st = parameterStats(pts([70, 71, 66, 72, 73, 74, 79, 72, 71, 70], 'temp'), 'temp', {
      reference: { band: [68, 76] },
    })
    const s = parameterStatement('temp', st, { band: [68, 76] })
    expect(s).toContain('selected comfort range')
    expect(s).toContain('68–76 °F') // the cited standard, at its authored precision
    expect(s).not.toContain('screening reference')
  })

  it('invents no comparison when no reference is selected', () => {
    const st = parameterStats(pts([500, 600]), 'co2')
    expect(parameterStatement('co2', st, null)).toBeNull()
    expect(parameterStatement('co2', null, { limit: 1000 })).toBeNull()
  })
})

describe('monitoringInsights', () => {
  const points = co2Series()
  const stats = parameterStats(points, 'co2', {
    reference: { limit: 1000 },
    occupancyWindows: OCC_WINDOWS,
  })
  // Occupancy reaches the insights via stats.occupancy (computed by
  // parameterStats) — this function takes no occupancy option of its own.
  const insights = monitoringInsights('co2', stats, { limit: 1000 }, { points })
  const ids = insights.map((i) => i.id)

  it('reports when the maximum occurred', () => {
    expect(ids).toContain('peak-timing')
  })

  it('reports the measured overnight average rather than characterising it', () => {
    const overnight = insights.find((i) => i.id === 'overnight')!
    expect(overnight.text).toMatch(/Overnight readings \(22:00–05:00\) averaged [\d,]+ ppm\./)
  })

  it('reports the duration above the reference', () => {
    const above = insights.find((i) => i.id === 'time-above')!
    expect(above.text).toMatch(/above the selected screening reference for \d+ h( \d+ m)?\./)
  })

  it('states the occupied/unoccupied difference as a difference', () => {
    const delta = insights.find((i) => i.id === 'occupancy-delta')!
    expect(delta.text).toMatch(/higher during marked occupied hours than outside them\./)
  })

  it('states an event co-occurrence in time, never causation', () => {
    const withEvent = monitoringInsights('co2', stats, { limit: 1000 }, {
      points,
      events: [{ t: stats!.maxAt as number, label: 'Windows opened' }],
    })
    const co = withEvent.find((i) => i.id === 'event-cooccurrence')!
    expect(co.text).toContain('within 60 minutes of a logged event (Windows opened)')
    // The bullet must not attribute the reading to the event.
    expect(co.text).not.toMatch(/caused|due to|because|result of|attributable/i)
  })

  it('says so explicitly when the reference was never exceeded', () => {
    const calm = parameterStats(pts([400, 450, 500]), 'co2', { reference: { limit: 1000 } })
    const out = monitoringInsights('co2', calm, { limit: 1000 })
    expect(out.find((i) => i.id === 'time-above')!.text).toBe(
      'The selected screening reference was not exceeded during the monitoring period.',
    )
  })

  it('emits fewer bullets — not weaker ones — when data is thin', () => {
    const thin = parameterStats(pts([500, 600]), 'co2')
    const out = monitoringInsights('co2', thin, null)
    expect(out.length).toBeLessThan(insights.length)
    expect(out.every((i) => i.text.length > 0)).toBe(true)
  })

  it('returns nothing rather than guessing when there are no stats', () => {
    expect(monitoringInsights('co2', null, { limit: 1000 })).toEqual([])
  })
})

describe('datasetHighlights', () => {
  const points = co2Series()
  const co2 = parameterStats(points, 'co2', { reference: { limit: 1000 }, occupancyWindows: OCC_WINDOWS })
  const pm = parameterStats(pts([4, 5, 6, 5, 4], 'pm25'), 'pm25', { reference: { limit: 35 } })
  const temp = parameterStats(pts([70, 71, 66, 72, 73], 'temp'), 'temp', { reference: { band: [68, 76] } })

  const blocks = [
    { param: 'co2', stats: co2, reference: { limit: 1000 } },
    { param: 'pm25', stats: pm, reference: { limit: 35 } },
    { param: 'temp', stats: temp, reference: { band: [68, 76] } },
  ]
  const hl = datasetHighlights(blocks as never)

  it('leads with the peak of the parameter that spent most time above its reference', () => {
    expect(hl[0].id).toBe('peak-co2')
    expect(hl[0].text).toMatch(/^Highest carbon dioxide reading occurred Jul \d+, /)
  })

  it('states plainly when a parameter never exceeded its reference', () => {
    expect(hl.find((h) => h.id === 'within-pm25')!.text).toBe(
      'PM2.5 did not exceed the selected screening reference at any point during monitoring.',
    )
  })

  it('uses comfort-range wording for a banded parameter', () => {
    expect(hl.find((h) => h.id === 'within-temp')!.text).toBe(
      'Temperature remained within the selected comfort range for 80% of the monitoring period.',
    )
  })

  it('drops a meaningless trailing decimal but keeps a meaningful one', () => {
    // "80%" reads as written; "99.2%" carries information "99%" would lose.
    expect(hl.find((h) => h.id === 'within-temp')!.text).toContain('80%')
    const nearly = Array(1000).fill(400)
    nearly[0] = 1200 // 99.9% below the reference
    const st = parameterStats(pts(nearly), 'co2', { reference: { limit: 1000 } })
    const out = datasetHighlights([{ param: 'co2', stats: st, reference: { limit: 1000 } }] as never)
    expect(out.find((h) => h.id === 'within-co2')!.text).toContain('99.9%')
  })

  it('never rounds a percentage up to 100% when the reference WAS exceeded', () => {
    // 1 reading in 5,000 above the reference is 99.98% below it. Printing
    // "100%" would assert in a client record that it was never exceeded.
    const many = Array(5000).fill(400)
    many[0] = 1200
    const st = parameterStats(pts(many), 'co2', { reference: { limit: 1000 } })
    expect(st!.pctAbove).toBeGreaterThan(0)

    const highlight = datasetHighlights([{ param: 'co2', stats: st, reference: { limit: 1000 } }] as never)
      .find((h) => h.id === 'within-co2')!.text
    expect(highlight).not.toContain('100%')

    const statement = parameterStatement('co2', st, { limit: 1000 })!
    expect(statement).not.toContain('100%')
    // …and the section that IS clean still says so unambiguously.
    const clean = parameterStats(pts([400, 450]), 'co2', { reference: { limit: 1000 } })
    expect(parameterStatement('co2', clean, { limit: 1000 })).toMatch(/throughout the monitoring period\.$/)
  })

  it('respects the cap and never repeats an id', () => {
    const capped = datasetHighlights(blocks as never, { max: 2 })
    expect(capped).toHaveLength(2)
    const all = hl.map((h) => h.id)
    expect(new Set(all).size).toBe(all.length)
  })

  it('returns an empty list for an empty dataset', () => {
    expect(datasetHighlights([])).toEqual([])
    expect(datasetHighlights(null as never)).toEqual([])
  })

  it('is deterministic — identical input yields identical prose', () => {
    expect(datasetHighlights(blocks as never)).toEqual(datasetHighlights(blocks as never))
  })
})

describe('the language boundary (machine-enforced)', () => {
  // Every string this module can emit, gathered from a dataset exercising
  // every branch: above-reference, within-reference, banded, occupancy, event.
  const points = co2Series()
  const co2 = parameterStats(points, 'co2', { reference: { limit: 1000 }, occupancyWindows: OCC_WINDOWS })
  const pm = parameterStats(pts([4, 5, 6, 5, 4], 'pm25'), 'pm25', { reference: { limit: 35 } })
  const temp = parameterStats(pts([70, 71, 66, 72, 79], 'temp'), 'temp', { reference: { band: [68, 76] } })
  const events = [{ t: co2!.maxAt as number, label: 'Windows opened' }]

  const everyString: string[] = [
    parameterStatement('co2', co2, { limit: 1000 }),
    parameterStatement('pm25', pm, { limit: 35 }),
    parameterStatement('temp', temp, { band: [68, 76] }),
    ...monitoringInsights('co2', co2, { limit: 1000 }, { points, events }).map((i) => i.text),
    ...monitoringInsights('pm25', pm, { limit: 35 }).map((i) => i.text),
    ...monitoringInsights('temp', temp, { band: [68, 76] }).map((i) => i.text),
    ...datasetHighlights([
      { param: 'co2', stats: co2, reference: { limit: 1000 } },
      { param: 'pm25', stats: pm, reference: { limit: 35 } },
      { param: 'temp', stats: temp, reference: { band: [68, 76] } },
    ] as never).map((h) => h.text),
  ].filter((s): s is string => typeof s === 'string' && s.length > 0)

  it('generates prose from every branch (guards against a vacuous pass)', () => {
    expect(everyString.length).toBeGreaterThanOrEqual(12)
  })

  it('passes the defensibility scanner — no tone or compliance violations', () => {
    everyString.forEach((text) => {
      const hits = scan(text)
      expect(hits, `banned language in: "${text}" → ${JSON.stringify(hits)}`).toEqual([])
    })
  })

  it('passes the AI-tell style scanner', () => {
    everyString.forEach((text) => {
      const hits = scanStyle(text)
      expect(hits, `AI tell in: "${text}"`).toEqual([])
    })
  })

  it('contains no adjective of judgement', () => {
    // The words the report must never use about a measurement. "Elevated" is
    // included deliberately: it reads as an interpretation, which is why the
    // status vocabulary says "Above Reference" instead.
    const judgement = /\b(poor|concerning|excellent|inadequate|unacceptable|acceptable|elevated|severe|dangerous|healthy|unhealthy|good|bad|worrying|alarming)\b/i
    everyString.forEach((text) => {
      expect(judgement.test(text), `judgement word in: "${text}"`).toBe(false)
    })
  })

  it('asserts no causation and no health or compliance conclusion', () => {
    const forbidden = /\b(caused by|due to|because of|results? in|leads? to|exposure limit|complian|violat|hazard|risk to)\b/i
    everyString.forEach((text) => {
      expect(forbidden.test(text), `causal or compliance claim in: "${text}"`).toBe(false)
    })
  })
})

describe('parameter naming', () => {
  it('offers a short form for chips and captions, and a formal one for headings', () => {
    expect(proseNameShort('co2')).toBe('CO₂')
    expect(proseNameTitle('co2')).toBe('Carbon dioxide (CO₂)')
    expect(proseNameShort('temp')).toBe('Temp')
    // A quantity whose name IS its symbol does not repeat itself.
    expect(proseNameTitle('temp')).toBe('Temperature')
    expect(proseNameShort('pm25')).toBe('PM2.5')
    expect(proseNameTitle('pm25')).toBe('Particulate matter (PM2.5)')
  })

  it('falls back to the raw key for a parameter it has never seen', () => {
    expect(proseNameShort('radon')).toBe('radon')
    expect(proseNameTitle('radon')).toBe('radon')
  })

  it('every known parameter has all four forms', () => {
    for (const k of ['co2', 'pm25', 'pm10', 'tvoc', 'hcho', 'co', 'temp', 'rh', 'press']) {
      for (const name of [proseName(k), proseNameShort(k), proseNameTitle(k)]) {
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
        expect(name).not.toBe(k) // a raw key never reaches a client's page
      }
    }
  })
})

describe('cover date formatting', () => {
  const d = (y: number, m: number, day: number, h = 0) => Date.UTC(y, m, day, h)

  it('collapses a range to what actually differs', () => {
    expect(formatDateRange(d(2026, 6, 15), d(2026, 6, 18))).toBe('Jul 15 – 18, 2026')
    expect(formatDateRange(d(2026, 6, 28), d(2026, 7, 2))).toBe('Jul 28 – Aug 2, 2026')
    expect(formatDateRange(d(2026, 11, 30), d(2027, 0, 2))).toBe('Dec 30, 2026 – Jan 2, 2027')
    // A single-day campaign is one date, not a range from itself to itself.
    expect(formatDateRange(d(2026, 6, 15, 2), d(2026, 6, 15, 20))).toBe('Jul 15, 2026')
  })

  it('follows the declared site offset, not the host timezone', () => {
    // Midnight UTC on the 15th is still the 14th at a -05:00 site.
    expect(formatDateRange(d(2026, 6, 15), d(2026, 6, 18), { utcOffsetMin: -300 })).toBe('Jul 14 – 17, 2026')
  })

  it('returns nothing rather than a half-formed range', () => {
    expect(formatDateRange(NaN, d(2026, 6, 18))).toBeNull()
    expect(formatDateRange(undefined as never, undefined as never)).toBeNull()
  })

  it('stamps generation in a normal, local format with the real zone abbreviation', () => {
    // Same instant, the generator's own zone — and DST is handled by the
    // platform: EDT in summer, EST in winter, never a fixed guess.
    expect(formatGeneratedAt('2026-07-31T14:20:00.000Z', { timeZone: 'America/New_York' })).toBe('7-31-2026, 10:20 AM EDT')
    expect(formatGeneratedAt('2026-01-05T04:07:00.000Z', { timeZone: 'America/New_York' })).toBe('1-4-2026, 11:07 PM EST')
    expect(formatGeneratedAt('2026-07-31T14:20:00.000Z', { timeZone: 'UTC' })).toBe('7-31-2026, 2:20 PM UTC')
    // An unparseable stamp is passed through rather than turned into a lie.
    expect(formatGeneratedAt('not a date')).toBe('not a date')
    expect(formatGeneratedAt(null as never)).toBeNull()
  })

  it('gives the generation date alone in the same local, numeric form', () => {
    expect(formatGeneratedDate('2026-07-31T14:20:00.000Z', { timeZone: 'America/New_York' })).toBe('7-31-2026')
    // 04:07 UTC on the 5th is still the 4th at a US-Eastern (winter) clock.
    expect(formatGeneratedDate('2026-01-05T04:07:00.000Z', { timeZone: 'America/New_York' })).toBe('1-4-2026')
    expect(formatGeneratedDate('not a date')).toBe('not a date')
    expect(formatGeneratedDate(null as never)).toBeNull()
  })
})

describe('sub-unit magnitudes', () => {
  it('never rounds a real reading away to zero', () => {
    // DECIMALS is set for the unit each parameter is USUALLY logged in, and
    // for that unit it is right. But the same parameter arrives two or three
    // orders of magnitude smaller from other instruments — TVOC in ppm from
    // a PID, formaldehyde in mg/m³ from a Q-Trak — and the declared precision
    // then prints a real measurement as "0". A report stating the mean was
    // "0 mg/m³" when it was 0.020 is not imprecise, it is false.
    expect(formatValue(0.194, 'tvoc')).toBe('0.19') // ppm from a PID
    expect(formatValue(0.0201, 'hcho')).toBe('0.020') // mg/m³
    expect(formatValue(0.0163, 'hcho')).toBe('0.016') // ppm
    expect(formatValue(0.00042, 'co2')).toBe('0.00042')
  })

  it('leaves every reading that already prints as a number exactly alone', () => {
    // Over-claiming precision on a measurement is its own kind of defect, so
    // the widening applies ONLY where the declared precision would destroy
    // the value.
    expect(formatValue(194, 'tvoc')).toBe('194')
    expect(formatValue(443, 'tvoc')).toBe('443')
    expect(formatValue(16.3, 'hcho')).toBe('16')
    expect(formatValue(0.42, 'co')).toBe('0.4') // 1 dp is this sensor's resolution
    expect(formatValue(0.62, 'pm25')).toBe('0.6')
    expect(formatValue(512.4, 'co2')).toBe('512')
    expect(formatValue(1789.4, 'co2')).toBe('1,789')
    expect(formatValue(69.94, 'temp')).toBe('69.9')
    expect(formatValue(42.3, 'rh')).toBe('42')
  })

  it('handles zero and negatives without inventing precision', () => {
    expect(formatValue(0, 'tvoc')).toBe('0')
    expect(formatValue(0, 'temp')).toBe('0.0')
    expect(formatValue(-0.0201, 'hcho')).toBe('-0.020')
    expect(formatValue(null as never, 'co2')).toBeNull()
  })
})
