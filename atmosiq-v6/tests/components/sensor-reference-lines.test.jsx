// @vitest-environment jsdom
/**
 * Logger Studio — togglable standards reference lines (Phase A).
 *
 * Pins (1) the reference-line catalogue logic — which lines apply for a
 * given parameter set + units, including the TVOC µg/m³-only gate — and
 * (2) that the charts draw their STD-sourced advisory line only when
 * showRefs is on. Threshold values come from STD (standards.js), never
 * hardcoded, so the labels must echo STD.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import {
  GRAPH_DEFS, REF_LINE_DEFS, CO2TimelineChart, COTimelineChart, TVOCTimelineChart,
} from '../../src/components/sensor/SensorCharts'
import { STD } from '../../src/constants/standards'

afterEach(() => cleanup())

const series = (param, n = 4) =>
  Array.from({ length: n }, (_, i) => ({ t: 1714550400000 + i * 60000, [param]: 400 + i * 200 }))

describe('REF_LINE_DEFS catalogue', () => {
  it('exposes a key + source standard for every parameter family', () => {
    const keys = REF_LINE_DEFS.map((d) => d.key)
    expect(keys).toEqual(expect.arrayContaining(['co2', 'rh', 'pm', 'co']))
    // No 'tvoc' key: removed in 2026-08 with every TVOC threshold. Absent
    // rather than present-and-never-applicable, so the toggle list does not
    // advertise a reference the reader can never turn on.
    expect(keys).not.toContain('tvoc')
    REF_LINE_DEFS.forEach((d) => expect(typeof d.std).toBe('string'))
  })

  it('applies only to the parameters actually present', () => {
    const def = (k) => REF_LINE_DEFS.find((d) => d.key === k)
    expect(def('co2').applies(['co2'], {})).toBe(true)
    expect(def('co2').applies(['temp'], {})).toBe(false)
    expect(def('rh').applies(['rh'], {})).toBe(true)
    expect(def('pm').applies(['pm25'], {})).toBe(true)
    expect(def('co').applies(['co'], {})).toBe(true)
  })

  it('offers no TVOC line to gate', () => {
    // This pinned the unit gate: the two tiers are published in µg/m³ and
    // loggers often report ppb, so the line only applied to a mass-based
    // series. The gate was correct and the tiers behind it were not — see
    // tests/engine/no-molhave.test.ts — so the whole entry went rather than
    // the gate being widened.
    expect(REF_LINE_DEFS.find((d) => d.key === 'tvoc')).toBeUndefined()
  })
})

describe('GRAPH_DEFS', () => {
  it('adds dedicated CO and TVOC timelines, each carrying a refKey', () => {
    const byId = Object.fromEntries(GRAPH_DEFS.map((g) => [g.id, g]))
    expect(byId.co).toBeTruthy()
    expect(byId.tvoc).toBeTruthy()
    // CO has an STD reference line, so it carries a refKey.
    expect(typeof byId.co.refKey).toBe('string')
    // HCHO has no fixed reference line (unit-ambiguous) → no refKey, by design.
    expect(byId.hcho).toBeTruthy()
    expect(byId.hcho.refKey).toBeUndefined()
    // TVOC joined it in 2026-08. Its chart is still drawn — the series is
    // still worth seeing — but a refKey with no catalogue entry behind it
    // would put an empty toggle in front of the reader.
    expect(byId.tvoc.refKey).toBeUndefined()
  })
})

describe('chart reference lines render from STD when showRefs is on', () => {
  it('CO₂ chart shows the ASHRAE advisory line (and its STD value) only when enabled', () => {
    const on = render(<CO2TimelineChart data={series('co2')} width={500} height={240} showRefs />)
    expect(on.container.textContent).toContain(String(STD.v.co2.con))
    expect(on.container.textContent).toContain(STD.v.ref)
    cleanup()
    const off = render(<CO2TimelineChart data={series('co2')} width={500} height={240} showRefs={false} />)
    expect(off.container.textContent).not.toContain(`${STD.v.co2.con} ppm`)
  })

  it('CO chart shows OSHA PEL + NIOSH REL from STD', () => {
    const { container } = render(<COTimelineChart data={series('co')} units={{ co: 'ppm' }} width={500} height={240} showRefs />)
    expect(container.textContent).toContain(`OSHA PEL ${STD.c.co.osha}`)
    expect(container.textContent).toContain(`NIOSH REL ${STD.c.co.niosh}`)
  })

  it('TVOC chart draws the series and no reference line, in either unit', () => {
    // A reference line is the most consequential mark on a chart — it is what
    // a reader judges the trace against. `showRefs` is still accepted so the
    // call site needs no special case; on this chart it has nothing to turn
    // on.
    for (const unit of ['µg/m³', 'ppb']) {
      const r = render(<TVOCTimelineChart data={series('tvoc')} units={{ tvoc: unit }} width={500} height={240} showRefs />)
      const text = r.container.textContent
      // Match the LABEL a reference line carries, not a bare number: the Y
      // axis legitimately ticks through 500 when the series spans it, and a
      // guard that could not tell a tick from a threshold would be unusable.
      expect(text, unit).not.toMatch(/Mølhave|Molhave/)
      expect(text, unit).not.toMatch(/(?:500|3,?000|25,?000)\s*(?:µg\/m³|ug\/m3|ppb)/)
      // The series itself is still charted.
      expect(text, unit).toContain(unit)
      cleanup()
    }
  })
})
