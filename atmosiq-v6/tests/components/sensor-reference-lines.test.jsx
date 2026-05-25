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
    expect(keys).toEqual(expect.arrayContaining(['co2', 'rh', 'pm', 'co', 'tvoc']))
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

  it('gates the TVOC tiers to mass-based (µg/m³) series only — Mølhave tiers are µg/m³', () => {
    const tvoc = REF_LINE_DEFS.find((d) => d.key === 'tvoc')
    expect(tvoc.applies(['tvoc'], { tvoc: 'µg/m³' })).toBe(true)
    expect(tvoc.applies(['tvoc'], { tvoc: 'ug/m3' })).toBe(true)
    expect(tvoc.applies(['tvoc'], { tvoc: 'ppb' })).toBe(false)
    expect(tvoc.applies(['tvoc'], { tvoc: 'ppm' })).toBe(false)
  })
})

describe('GRAPH_DEFS', () => {
  it('adds dedicated CO and TVOC timelines, each carrying a refKey', () => {
    const byId = Object.fromEntries(GRAPH_DEFS.map((g) => [g.id, g]))
    expect(byId.co).toBeTruthy()
    expect(byId.tvoc).toBeTruthy()
    // CO and TVOC have STD reference lines, so they carry a refKey.
    expect(typeof byId.co.refKey).toBe('string')
    expect(typeof byId.tvoc.refKey).toBe('string')
    // HCHO has no fixed reference line (unit-ambiguous) → no refKey, by design.
    expect(byId.hcho).toBeTruthy()
    expect(byId.hcho.refKey).toBeUndefined()
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

  it('TVOC chart shows Mølhave tiers for µg/m³ but not for ppb', () => {
    const mass = render(<TVOCTimelineChart data={series('tvoc')} units={{ tvoc: 'µg/m³' }} width={500} height={240} showRefs />)
    expect(mass.container.textContent).toContain(`${STD.c.tvoc.con} µg/m³`)
    cleanup()
    const ppb = render(<TVOCTimelineChart data={series('tvoc')} units={{ tvoc: 'ppb' }} width={500} height={240} showRefs />)
    expect(ppb.container.textContent).not.toContain(`${STD.c.tvoc.con} µg/m³`)
  })
})
