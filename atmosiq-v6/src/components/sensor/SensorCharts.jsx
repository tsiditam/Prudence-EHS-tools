/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SensorCharts — report-ready IAQ timelines (Recharts). Colours are
 * passed as RESOLVED hex (not CSS vars): Recharts emits SVG presentation
 * attributes where var() does not resolve, and a resolved palette also
 * lets us render a light "report" palette off-screen and serialize it to
 * a clean PNG for DOCX embedding. Screening / documentation only — the
 * togglable reference lines are labelled advisories / context values
 * sourced from STD (standards.js), never an automated compliance verdict.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, Legend,
} from 'recharts'
import dayjs from 'dayjs'
import { normalizeForCompare, SENSOR_PARAMS } from '../../utils/sensorParser'
import { STD } from '../../constants/standards'
import { paramLabel } from './sensorHelpers'

// Series hues — one fixed hue per parameter (colour follows the entity, never
// its position in a chart), stepped separately for the white report surface
// and the dark app surface. Both sets were run through the data-viz palette
// validator (OKLab CVD separation, normal-vision floor, lightness band,
// contrast) against their surface, 2026-09: the light set passes every hard
// gate; the dark set passes with CO↔formaldehyde in the CVD warn band, which
// is legal because every multi-series chart carries a legend and a tooltip.
// The previous set failed outright — RH blue and PM2.5 violet measured
// ΔE 0.4 under deuteranopia, i.e. the same colour to a colour-blind reader.
export const LIGHT_SERIES = { co2: '#2a78d6', temp: '#eb6834', rh: '#1baf7a', pm25: '#4a3aa7', pm10: '#e87ba4', tvoc: '#008300', co: '#eda100', hcho: '#e34948' }
export const DARK_SERIES  = { co2: '#3987e5', temp: '#d95926', rh: '#199e70', pm25: '#9085e9', pm10: '#d55181', tvoc: '#008300', co: '#c98500', hcho: '#e34948' }
// Distinct per-zone line colours for the multi-zone overlay — the first six
// series slots in validated adjacent order.
const LIGHT_ZONES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
const DARK_ZONES  = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300']

// Resolved palettes (no CSS vars — see header). DARK mirrors the app's
// neutral dark tokens (index.html --sub / --border / --text / --card);
// LIGHT is the white-document palette used for report images. Grid and
// axis are one step off the surface and drawn solid — recessive chrome so
// the trace is the only loud mark.
export const DARK_PALETTE = { axis: '#8A8A8A', grid: '#262626', text: '#F2F2F2', card: '#161616', series: DARK_SERIES, zones: DARK_ZONES }
export const LIGHT_PALETTE = { axis: '#475569', grid: '#E6EAEE', text: '#0F172A', card: '#FFFFFF', series: LIGHT_SERIES, zones: LIGHT_ZONES }

// Resolved palette for the live theme (Recharts needs hex, not CSS vars).
// Shared by LoggerGraphsTab + SensorDataPage.
export const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_PALETTE : DARK_PALETTE)

// The white-paper hues, for callers that colour something destined for a
// report image. On-screen surfaces read `currentPalette().series` so the
// dot beside a stat and the trace in the chart are the same colour.
export const SERIES = LIGHT_SERIES

const fmtTime = (hasTs) => (v) => (hasTs ? dayjs(v).format('MMM D HH:mm') : `#${v}`)

// Tooltip chrome shared by every chart: a flat card, a hairline, the time as
// a quiet header, then one row per series keyed by a short stroke of its
// colour. The VALUE is the strong element and the series name secondary —
// the reader already knows which line they are on and wants the number.
const tipBox = (pal) => ({ background: pal.card, border: `1px solid ${pal.grid}`, borderRadius: 10, padding: '8px 11px', fontSize: 12, color: pal.text, boxShadow: '0 6px 20px rgba(0,0,0,0.28)', fontFamily: 'var(--font-sans)' })
const tipHead = (pal) => ({ color: pal.axis, marginBottom: 5, fontSize: 11, fontVariantNumeric: 'tabular-nums' })
function TipRow({ color, name, value, unit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, lineHeight: 1.5 }}>
      <span aria-hidden="true" style={{ width: 12, height: 2, borderRadius: 1, background: color, display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value == null ? '—' : value}{unit ? <span style={{ fontWeight: 400, opacity: 0.75 }}> {unit}</span> : null}</span>
      <span style={{ opacity: 0.7 }}>{name}</span>
    </div>
  )
}
// A hairline crosshair that snaps to the nearest reading, so the reader
// aims at a time rather than at a 2px line.
const cursorLine = (pal) => ({ stroke: pal.axis, strokeWidth: 1, strokeOpacity: 0.6 })

function ChartTooltip({ active, payload, label, hasTs, units, pal }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={tipBox(pal)}>
      <div style={tipHead(pal)}>{hasTs ? dayjs(label).format('MMM D, YYYY HH:mm') : `Reading #${label}`}</div>
      {payload.map((p) => (
        <TipRow key={p.dataKey} color={p.stroke} name={p.name} value={p.value} unit={units?.[p.dataKey]} />
      ))}
    </div>
  )
}

// Render either responsive (on-screen) or fixed-size (capture).
function Shell({ width, height = 240, children }) {
  if (width) return <div style={{ width, height }}>{children(width, height)}</div>
  return <div role="img" style={{ width: '100%', height, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%">{children('100%', height)}</ResponsiveContainer></div>
}

const axis = (pal) => ({ stroke: pal.axis, tick: { fill: pal.axis, fontSize: 10.5, fontFamily: 'var(--font-sans)' }, tickLine: false, axisLine: { stroke: pal.grid } })

// Trace spec shared by every series line: 2px, round joins, no per-point
// dots, and an 8px end-marker with a surface ring on hover so the active
// reading stays legible where lines cross.
const trace = (pal) => ({ type: 'monotone', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', dot: false, connectNulls: true, activeDot: { r: 4, strokeWidth: 2, stroke: pal.card } })

// Legend keyed by short strokes (mirrors the line marks). The label text
// wears the axis tone, not the series colour — identity comes from the
// stroke beside it, and a light series hue is illegible as text.
const legendProps = (pal) => ({
  iconType: 'plainline', iconSize: 14,
  formatter: (value) => <span style={{ color: pal.axis }}>{value}</span>,
  wrapperStyle: { fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)', paddingTop: 4 },
})

// Shared config for the time X-axis of every timeline. Centralised so all nine
// charts stay identical AND so the overlap guard below can't be forgotten on a
// new chart.
//
// `minTickGap` is the fix for garbled/overlapping x-axis labels: the timestamps
// are wide ("Aug 1 03:24" ≈ 60px), and Recharts' 5px default lets a wide
// desktop axis pack a dozen-plus of them until they collide into an unreadable
// smear (the wider the axis, the more it crams in — so it bites hardest on
// desktop). A gap on the order of a label width keeps adjacent labels from
// touching at any width — Recharts simply shows fewer on a phone, more on a
// monitor — and is robust even when the tick font hasn't been measured yet.
// `preserveStartEnd` pins the first and last timestamps so the axis always
// states its full range.
export const X_AXIS_MIN_TICK_GAP = 64
export const timeAxis = (pal, hasTs) => ({
  dataKey: 't', type: 'number', domain: ['dataMin', 'dataMax'], scale: 'time',
  tickFormatter: fmtTime(hasTs), minTickGap: X_AXIS_MIN_TICK_GAP, interval: 'preserveStartEnd',
  ...axis(pal),
})

// Y-axis title — unit only (the chart card already names the parameter), set
// in the app font so chart type matches the rest of the UI. `right` flips it
// for the secondary axis on dual-axis charts. Generous default `width` so the
// rotated title and the tick numbers don't collide.
const yLabel = (pal, value, opts = {}) => ({ value, angle: opts.right ? 90 : -90, position: opts.right ? 'insideRight' : 'insideLeft', fill: pal.axis, fontSize: 11, fontFamily: 'var(--font-sans)' })

// A labelled, dashed advisory/context reference line. Values come from STD
// (standards.js) — never hardcoded — and the label always names its source
// standard so the line never reads as an automated compliance verdict.
// Drawn in the neutral axis tone (not the series hue) so the threshold never
// impersonates a series; the label sits INSIDE the plot, just above the
// line at its right end — `position: 'right'` hung it in the 16px margin,
// where a phone clipped it to its first two characters. (For a horizontal
// ReferenceLine the label's box has zero height, so Recharts' "insideBottom"
// is the position that lands ABOVE the line.)
const refLine = (pal, { key, y, label, dash = '4 4', opacity = 0.75, yAxisId }) => (
  <ReferenceLine
    key={key}
    {...(yAxisId ? { yAxisId } : {})}
    y={y}
    stroke={pal.axis}
    strokeDasharray={dash}
    strokeOpacity={opacity}
    label={{ value: label, fill: pal.axis, fontSize: 10, position: 'insideBottomRight', offset: 4, fontFamily: 'var(--font-sans)' }}
  />
)

// Occupancy shading: a vertical band per tagged window on the time axis.
// Occupied vs unoccupied read by fill colour; the editor list carries the
// labels. `ifOverflow="hidden"` clips bands to each chart's own domain so a
// window clamped to the indoor range still renders on overlay charts.
const OCC_TONE = { occupied: '#0ca30c', unoccupied: '#8A8A8A' }
function occupancyAreas(windows, yAxisId) {
  if (!Array.isArray(windows) || !windows.length) return null
  return windows.map((w) => (
    <ReferenceArea
      key={w.id}
      {...(yAxisId ? { yAxisId } : {})}
      x1={w.start}
      x2={w.end}
      ifOverflow="hidden"
      fill={OCC_TONE[w.kind] || OCC_TONE.occupied}
      fillOpacity={0.09}
      stroke="none"
    />
  ))
}

// Formaldehyde timeline. No fixed reference line — loggers report HCHO in
// ppb / µg/m³ / mg/m³ / ppm, so a hardcoded guideline line would be
// unit-ambiguous and misleading. The Y-axis label carries the detected unit.
export function HCHOTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.hcho || 'ppb')} />
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line {...trace(pal)} dataKey="hcho" name="Formaldehyde" stroke={pal.series.hcho} isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function CO2TimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={52} label={yLabel(pal, 'ppm')} />
      {showRefs && refLine(pal, { key: 'co2adv', y: STD.v.co2.con, label: `${STD.v.co2.con} ppm · ${STD.v.ref} advisory` })}
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line {...trace(pal)} dataKey="co2" name="CO₂" stroke={pal.series.co2} isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// Small multiples: N panels stacked on one shared time axis, each with its
// own y-scale. Replaces the dual-axis charts (two y-scales on one plot),
// whose arbitrary alignment invents a correlation the data may not hold —
// a reader sees temperature "cross" humidity where nothing crossed. Only the
// bottom panel prints its time ticks; the others keep the same axis width
// so every trace lines up.
const STACK_H = 300
function Stacked({ width, height = STACK_H, panels }) {
  const n = panels.length
  const each = Math.floor(height / n)
  if (width) return <div style={{ width, height }}>{panels.map((p, i) => <div key={i} style={{ height: each }}>{p(width, each, i === n - 1)}</div>)}</div>
  return (
    <div role="img" style={{ width: '100%', height, minWidth: 0 }}>
      {panels.map((p, i) => (
        <div key={i} style={{ width: '100%', height: each, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">{p('100%', each, i === n - 1)}</ResponsiveContainer>
        </div>
      ))}
    </div>
  )
}
// Time axis for a non-final panel: same scale and width, no printed ticks.
const quietTimeAxis = (pal, hasTs) => ({ ...timeAxis(pal, hasTs), tick: false, height: 4 })
const panelLegend = (pal) => ({ ...legendProps(pal), verticalAlign: 'top', align: 'left', height: 18, wrapperStyle: { ...legendProps(pal).wrapperStyle, paddingTop: 0, paddingLeft: 48 } })
const Y_W = 48

export function TempHumidityChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const size = (w, h) => (width ? { width: w, height: h } : {})
  const temp = (w, h) => (
    <LineChart data={data} {...size(w, h)} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...quietTimeAxis(pal, hasTs)} />
      {/* Temperature reads on its own range — anchored at zero the trace
          is a flat line pinned to the top of the panel. */}
      <YAxis domain={['auto', 'auto']} {...axis(pal)} width={Y_W} label={yLabel(pal, units.temp || '°F')} />
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...panelLegend(pal)} />
      <Line {...trace(pal)} dataKey="temp" name="Temperature" stroke={pal.series.temp} isAnimationActive={!width} />
    </LineChart>
  )
  const rh = (w, h) => (
    <LineChart data={data} {...size(w, h)} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis domain={[0, 100]} {...axis(pal)} width={Y_W} label={yLabel(pal, '%')} />
      {showRefs && (
        <ReferenceArea y1={STD.t.rh.min} y2={STD.t.rh.max} fill={pal.series.rh} fillOpacity={0.08} stroke="none"
          label={{ value: `${STD.t.rh.min}–${STD.t.rh.max}% · moisture-control range`, position: 'insideTopRight', fill: pal.axis, fontSize: 10, fontFamily: 'var(--font-sans)' }} />
      )}
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...panelLegend(pal)} />
      <Line {...trace(pal)} dataKey="rh" name="Relative Humidity" stroke={pal.series.rh} isAnimationActive={!width} />
    </LineChart>
  )
  return <Stacked width={width} height={height} panels={[temp, rh]} />
}

export function PMTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.pm25 || 'µg/m³')} />
      {showRefs && [
        refLine(pal, { key: 'pmepa', y: STD.c.pm25.epa, label: `EPA 24-h ${STD.c.pm25.epa} µg/m³` }),
        refLine(pal, { key: 'pmwho', y: STD.c.pm25.who, dash: '2 4', opacity: 0.55, label: `WHO ${STD.c.pm25.who} µg/m³` }),
      ]}
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...legendProps(pal)} />
      <Line {...trace(pal)} dataKey="pm25" name="PM2.5" stroke={pal.series.pm25} isAnimationActive={!width} />
      <Line {...trace(pal)} dataKey="pm10" name="PM10" stroke={pal.series.pm10} isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function COTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={52} label={yLabel(pal, units.co || 'ppm')} />
      {showRefs && [
        refLine(pal, { key: 'coosha', y: STD.c.co.osha, label: `OSHA PEL ${STD.c.co.osha} (8-h TWA)` }),
        refLine(pal, { key: 'coniosh', y: STD.c.co.niosh, dash: '2 4', opacity: 0.55, label: `NIOSH REL ${STD.c.co.niosh}` }),
      ]}
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line {...trace(pal)} dataKey="co" name="CO" stroke={pal.series.co} isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// The TVOC chart draws NO reference line, deliberately (2026-08).
//
// Two Mølhave tiers (500 and 3,000 µg/m³) rendered here, unit-gated to
// mass-based series because the figures are µg/m³ and loggers often report
// ppb. They were removed with every other TVOC threshold: a reference line is
// the most consequential mark on a chart — it is what a reader judges the
// trace against — and TVOC is a non-specific sum with no consensus
// health-based limit to draw.
//
// The `showRefs` prop is still accepted so the call site needs no change and
// every other chart keeps its lines; on this one it has nothing to turn on.
export function TVOCTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  void showRefs
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.tvoc || 'ppb')} />
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line {...trace(pal)} dataKey="tvoc" name="TVOC" stroke={pal.series.tvoc} isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}


// Multi-parameter comparison: each selected parameter scaled to 0–100% of
// its own range so trends of different magnitudes read together. The
// tooltip shows ACTUAL values + units (de-normalized), and the axis is
// clearly labelled "normalized" so magnitude is never implied.
function MultiTooltip({ active, payload, label, hasTs, units, pal }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div style={tipBox(pal)}>
      <div style={tipHead(pal)}>{hasTs ? dayjs(label).format('MMM D, YYYY HH:mm') : `Reading #${label}`}</div>
      {payload.map((p) => {
        const key = String(p.dataKey).replace(/^n_/, '')
        return <TipRow key={p.dataKey} color={p.stroke} name={p.name} value={row[key]} unit={units?.[key]} />
      })}
    </div>
  )
}

export function MultiParameterChart({ data, params = [], hasTs = true, units = {}, palette = DARK_PALETTE, width, height, occupancy = [] }) {
  const pal = palette
  const sel = (params || []).slice(0, 3)
  const { data: nd } = normalizeForCompare(data, sel)
  const inner = (w, h) => (
    <LineChart data={nd} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axis(pal)} width={52} label={yLabel(pal, '% of range')} />
      <Tooltip content={<MultiTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...legendProps(pal)} />
      {sel.map((k) => <Line key={k} {...trace(pal)} dataKey={`n_${k}`} name={paramLabel(k)} stroke={pal.series[k] || pal.axis} isAnimationActive={!width} />)}
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// Indoor vs outdoor CO₂: absolute traces on the left axis, the
// indoor−outdoor differential on the right axis. The advisory reference is
// the ASHRAE 62.1 differential (STD.v.co2.diff) and belongs to the Δ axis.
// `points` are pre-aligned rows { t, indoor, outdoor, diff } (alignDatasets).
export function Co2DifferentialChart({ points = [], hasTs = true, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const units = { indoor: 'ppm', outdoor: 'ppm', diff: 'ppm' }
  const size = (w, h) => (width ? { width: w, height: h } : {})
  // Absolute traces on top, the indoor−outdoor differential beneath on its
  // own scale (the ASHRAE differential advisory belongs to that panel).
  const abs = (w, h) => (
    <LineChart data={points} {...size(w, h)} margin={{ top: 4, right: 16, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...quietTimeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={Y_W} label={yLabel(pal, 'ppm')} />
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...panelLegend(pal)} />
      <Line {...trace(pal)} dataKey="indoor" name="Indoor CO₂" stroke={pal.series.co2} isAnimationActive={!width} />
      <Line {...trace(pal)} dataKey="outdoor" name="Outdoor CO₂" stroke={pal.series.temp} strokeDasharray="5 3" isAnimationActive={!width} />
    </LineChart>
  )
  const diff = (w, h) => (
    <LineChart data={points} {...size(w, h)} margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={Y_W} label={yLabel(pal, 'Δ ppm')} />
      {showRefs && refLine(pal, { key: 'co2diff', y: STD.v.co2.diff, label: `${STD.v.co2.diff} ppm above outdoor · ${STD.v.ref}` })}
      <Tooltip cursor={cursorLine(pal)} content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend {...panelLegend(pal)} />
      <Line {...trace(pal)} dataKey="diff" name="Δ (indoor−outdoor)" stroke={pal.series.rh} isAnimationActive={!width} />
    </LineChart>
  )
  return <Stacked width={width} height={height} panels={[abs, diff]} />
}

// Overlay one parameter (default CO₂) across several zone datasets on a
// shared time axis. `points` are pre-aligned rows keyed by dataset id;
// `zones` is [{ id, label }]. The CO₂ advisory line shows when enabled.
export function MultiZoneChart({ points = [], zones = [], param = 'co2', units = {}, hasTs = true, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const unit = units[param] || SENSOR_PARAMS.find((s) => s.key === param)?.unit || ''
  const tipUnits = Object.fromEntries(zones.map((z) => [z.id, unit]))
  const inner = (w, h) => (
    <LineChart data={points} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis {...timeAxis(pal, hasTs)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, unit || paramLabel(param))} />
      {showRefs && param === 'co2' && refLine(pal, { key: 'co2adv', y: STD.v.co2.con, color: pal.axis, opacity: 0.45, label: `${STD.v.co2.con} ppm · ${STD.v.ref} advisory` })}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={tipUnits} pal={pal} />} />
      <Legend {...legendProps(pal)} />
      {zones.map((z, i) => (
        <Line key={z.id} {...trace(pal)} dataKey={z.id} name={z.label} stroke={pal.zones[i % pal.zones.length]} isAnimationActive={!width} />
      ))}
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// Which chart applies given the detected params. `series` names drive the
// DOCX section text (the report image relies on axis labels + this list
// rather than the Recharts HTML legend).
export const GRAPH_DEFS = [
  { id: 'co2', title: 'CO₂ Over Time', needs: (p) => p.includes('co2'), series: ['CO₂'], refKey: 'co2', Chart: CO2TimelineChart },
  { id: 'tempRh', title: 'Temperature & Relative Humidity', needs: (p) => p.includes('temp') || p.includes('rh'), series: ['Temperature', 'Relative Humidity'], refKey: 'rh', Chart: TempHumidityChart },
  { id: 'pm', title: 'Particulate Matter (PM2.5 / PM10)', needs: (p) => p.includes('pm25') || p.includes('pm10'), series: ['PM2.5', 'PM10'], refKey: 'pm', Chart: PMTimelineChart },
  { id: 'co', title: 'Carbon Monoxide (CO)', needs: (p) => p.includes('co'), series: ['CO'], refKey: 'co', Chart: COTimelineChart },
  // No refKey — same as hcho below. The TVOC entry left REF_LINE_DEFS in
  // 2026-08, so a refKey here would name a catalogue entry that no longer
  // exists and offer the reader a toggle with nothing behind it.
  { id: 'tvoc', title: 'Total VOCs (TVOC)', needs: (p) => p.includes('tvoc'), series: ['TVOC'], Chart: TVOCTimelineChart },
  { id: 'hcho', title: 'Formaldehyde Over Time', needs: (p) => p.includes('hcho'), series: ['Formaldehyde'], Chart: HCHOTimelineChart },
]

// Reference-line catalogue for the toggle UI: which thresholds key applies
// to a parameter set, its label, and whether it applies given the units.
//
// TVOC has no entry, deliberately (2026-08). It offered `TVOC Mølhave`,
// unit-gated to mass-based series; it went with every other TVOC threshold.
// Absent rather than present-and-never-applicable so the toggle list does not
// advertise a reference the reader can never turn on.
export const REF_LINE_DEFS = [
  { key: 'co2', label: `CO₂ ${STD.v.co2.con} ppm`, std: STD.v.ref, applies: (params) => params.includes('co2') },
  { key: 'rh', label: `RH ${STD.t.rh.min}–${STD.t.rh.max}%`, std: STD.t.rh.ref, applies: (params) => params.includes('rh') },
  { key: 'pm', label: `PM2.5 EPA/WHO`, std: 'EPA NAAQS / WHO 2021', applies: (params) => params.includes('pm25') },
  { key: 'co', label: `CO OSHA/NIOSH`, std: 'OSHA PEL / NIOSH REL', applies: (params) => params.includes('co') },
]
