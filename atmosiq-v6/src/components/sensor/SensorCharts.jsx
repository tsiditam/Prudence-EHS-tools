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

// Resolved palettes (no CSS vars — see header). DARK mirrors the app's
// dark tokens; LIGHT is the white-document palette used for report images.
export const DARK_PALETTE = { axis: '#8B93A5', grid: '#2A2E38', text: '#ECEEF2', card: '#111318' }
export const LIGHT_PALETTE = { axis: '#475569', grid: '#CBD5E1', text: '#0F172A', card: '#FFFFFF' }

// Distinct, contrast-safe series colours so series read without relying
// on a single hue (works on both dark + white backgrounds).
export const SERIES = { co2: '#0E9FB8', temp: '#EA7A2B', rh: '#2563EB', pm25: '#7C3AED', pm10: '#DB2777', tvoc: '#059669', co: '#CA8A04', hcho: '#DC2626' }

const fmtTime = (hasTs) => (v) => (hasTs ? dayjs(v).format('MMM D HH:mm') : `#${v}`)

function ChartTooltip({ active, payload, label, hasTs, units, pal }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: pal.card, border: `1px solid ${pal.grid}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: pal.text, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
      <div style={{ color: pal.axis, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{hasTs ? dayjs(label).format('MMM D, YYYY HH:mm') : `Reading #${label}`}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.stroke, display: 'inline-block' }} />
          <span style={{ fontWeight: 600 }}>{p.name}:</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{p.value == null ? '—' : p.value}{units?.[p.dataKey] ? ` ${units[p.dataKey]}` : ''}</span>
        </div>
      ))}
    </div>
  )
}

// Render either responsive (on-screen) or fixed-size (capture).
function Shell({ width, height = 240, children }) {
  if (width) return <div style={{ width, height }}>{children(width, height)}</div>
  return <div role="img" style={{ width: '100%', height, minWidth: 0 }}><ResponsiveContainer width="100%" height="100%">{children('100%', height)}</ResponsiveContainer></div>
}

const axis = (pal) => ({ stroke: pal.axis, tick: { fill: pal.axis, fontSize: 11, fontFamily: 'var(--font-sans)' }, tickLine: false, axisLine: { stroke: pal.grid } })

// Y-axis title — unit only (the chart card already names the parameter), set
// in the app font so chart type matches the rest of the UI. `right` flips it
// for the secondary axis on dual-axis charts. Generous default `width` so the
// rotated title and the tick numbers don't collide.
const yLabel = (pal, value, opts = {}) => ({ value, angle: opts.right ? 90 : -90, position: opts.right ? 'insideRight' : 'insideLeft', fill: pal.axis, fontSize: 11, fontFamily: 'var(--font-sans)' })

// A labelled, dashed advisory/context reference line. Values come from STD
// (standards.js) — never hardcoded — and the label always names its source
// standard so the line never reads as an automated compliance verdict.
const refLine = (pal, { key, y, color, label, dash = '4 4', opacity = 0.5, yAxisId }) => (
  <ReferenceLine
    key={key}
    {...(yAxisId ? { yAxisId } : {})}
    y={y}
    stroke={color}
    strokeDasharray={dash}
    strokeOpacity={opacity}
    label={{ value: label, fill: pal.axis, fontSize: 9, position: 'right', fontFamily: 'var(--font-sans)' }}
  />
)

// Occupancy shading: a vertical band per tagged window on the time axis.
// Occupied vs unoccupied read by fill colour; the editor list carries the
// labels. `ifOverflow="hidden"` clips bands to each chart's own domain so a
// window clamped to the indoor range still renders on overlay charts.
const OCC_TONE = { occupied: '#10B981', unoccupied: '#94A3B8' }
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
      fillOpacity={0.13}
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
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.hcho || 'ppb')} />
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="hcho" name="Formaldehyde" stroke={SERIES.hcho} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function CO2TimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={52} label={yLabel(pal, 'ppm')} />
      {showRefs && refLine(pal, { key: 'co2adv', y: STD.v.co2.con, color: SERIES.co2, opacity: 0.55, label: `${STD.v.co2.con} ppm · ${STD.v.ref} advisory` })}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="co2" name="CO₂" stroke={SERIES.co2} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function TempHumidityChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy, 'temp')}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis yAxisId="temp" {...axis(pal)} width={48} label={yLabel(pal, units.temp || '°F')} />
      <YAxis yAxisId="rh" orientation="right" domain={[0, 100]} {...axis(pal)} width={44} label={yLabel(pal, '%', { right: true })} />
      {showRefs && (
        <ReferenceArea yAxisId="rh" y1={STD.t.rh.min} y2={STD.t.rh.max} fill={SERIES.rh} fillOpacity={0.07} stroke="none"
          label={{ value: `${STD.t.rh.min}–${STD.t.rh.max}% · ${STD.t.ref} comfort`, position: 'insideTopRight', fill: pal.axis, fontSize: 9, fontFamily: 'var(--font-sans)' }} />
      )}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)' }} />
      <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke={SERIES.temp} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
      <Line yAxisId="rh" type="monotone" dataKey="rh" name="Relative Humidity" stroke={SERIES.rh} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function PMTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.pm25 || 'µg/m³')} />
      {showRefs && [
        refLine(pal, { key: 'pmepa', y: STD.c.pm25.epa, color: SERIES.pm25, opacity: 0.5, label: `EPA 24-h ${STD.c.pm25.epa} µg/m³` }),
        refLine(pal, { key: 'pmwho', y: STD.c.pm25.who, color: SERIES.pm25, dash: '2 4', opacity: 0.4, label: `WHO ${STD.c.pm25.who} µg/m³` }),
      ]}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)' }} />
      <Line type="monotone" dataKey="pm25" name="PM2.5" stroke={SERIES.pm25} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
      <Line type="monotone" dataKey="pm10" name="PM10" stroke={SERIES.pm10} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function COTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={52} label={yLabel(pal, units.co || 'ppm')} />
      {showRefs && [
        refLine(pal, { key: 'coosha', y: STD.c.co.osha, color: SERIES.co, opacity: 0.55, label: `OSHA PEL ${STD.c.co.osha} (8-h TWA)` }),
        refLine(pal, { key: 'coniosh', y: STD.c.co.niosh, color: SERIES.co, dash: '2 4', opacity: 0.45, label: `NIOSH REL ${STD.c.co.niosh}` }),
      ]}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="co" name="CO" stroke={SERIES.co} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// TVOC tiers in STD.c.tvoc are µg/m³ (Mølhave 1991). Loggers often report
// ppb/ppm, where those values do not apply — so the advisory lines render
// ONLY when the series unit is mass-based (µg/m³). The timeline still draws
// for any unit; only the reference lines are unit-gated.
const tvocIsMass = (units) => /µg|ug/.test(String(units?.tvoc || '').toLowerCase())

export function TVOCTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const showTiers = showRefs && tvocIsMass(units)
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, units.tvoc || 'ppb')} />
      {showTiers && [
        refLine(pal, { key: 'tvoccon', y: STD.c.tvoc.con, color: SERIES.tvoc, opacity: 0.5, label: `Mølhave ${STD.c.tvoc.con} µg/m³ (advisory)` }),
        refLine(pal, { key: 'tvocact', y: STD.c.tvoc.act, color: SERIES.tvoc, dash: '2 4', opacity: 0.45, label: `Mølhave ${STD.c.tvoc.act} µg/m³ (advisory)` }),
      ]}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="tvoc" name="TVOC" stroke={SERIES.tvoc} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

const paramLabel = (k) => SENSOR_PARAMS.find((p) => p.key === k)?.label || k

// Multi-parameter comparison: each selected parameter scaled to 0–100% of
// its own range so trends of different magnitudes read together. The
// tooltip shows ACTUAL values + units (de-normalized), and the axis is
// clearly labelled "normalized" so magnitude is never implied.
function MultiTooltip({ active, payload, label, hasTs, units, pal }) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div style={{ background: pal.card, border: `1px solid ${pal.grid}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: pal.text, boxShadow: '0 4px 16px rgba(0,0,0,0.25)' }}>
      <div style={{ color: pal.axis, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{hasTs ? dayjs(label).format('MMM D, YYYY HH:mm') : `Reading #${label}`}</div>
      {payload.map((p) => {
        const key = String(p.dataKey).replace(/^n_/, '')
        const actual = row[key]
        return (
          <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.stroke, display: 'inline-block' }} />
            <span style={{ fontWeight: 600 }}>{p.name}:</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{actual == null ? '—' : actual}{units?.[key] ? ` ${units[key]}` : ''}</span>
          </div>
        )
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
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axis(pal)} width={52} label={yLabel(pal, '% of range')} />
      <Tooltip content={<MultiTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)' }} />
      {sel.map((k) => <Line key={k} type="monotone" dataKey={`n_${k}`} name={paramLabel(k)} stroke={SERIES[k] || pal.axis} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />)}
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
  const inner = (w, h) => (
    <LineChart data={points} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy, 'abs')}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis yAxisId="abs" {...axis(pal)} width={54} label={yLabel(pal, 'ppm')} />
      <YAxis yAxisId="diff" orientation="right" {...axis(pal)} width={54} label={yLabel(pal, 'Δ ppm', { right: true })} />
      {showRefs && refLine(pal, { key: 'co2diff', y: STD.v.co2.diff, color: SERIES.rh, opacity: 0.6, yAxisId: 'diff', label: `${STD.v.co2.diff} ppm above outdoor · ${STD.v.ref}` })}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)' }} />
      <Line yAxisId="abs" type="monotone" dataKey="indoor" name="Indoor CO₂" stroke={SERIES.co2} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
      <Line yAxisId="abs" type="monotone" dataKey="outdoor" name="Outdoor CO₂" stroke={SERIES.temp} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={!width} />
      <Line yAxisId="diff" type="monotone" dataKey="diff" name="Δ (indoor−outdoor)" stroke={SERIES.rh} strokeWidth={1.5} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// Distinct per-zone line colours for the multi-zone overlay.
const ZONE_COLORS = ['#0E9FB8', '#EA7A2B', '#2563EB', '#7C3AED', '#059669', '#CA8A04']

// Overlay one parameter (default CO₂) across several zone datasets on a
// shared time axis. `points` are pre-aligned rows keyed by dataset id;
// `zones` is [{ id, label }]. The CO₂ advisory line shows when enabled.
export function MultiZoneChart({ points = [], zones = [], param = 'co2', units = {}, hasTs = true, palette = DARK_PALETTE, width, height, showRefs = false, occupancy = [] }) {
  const pal = palette
  const unit = units[param] || SENSOR_PARAMS.find((s) => s.key === param)?.unit || ''
  const tipUnits = Object.fromEntries(zones.map((z) => [z.id, unit]))
  const inner = (w, h) => (
    <LineChart data={points} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      {occupancyAreas(occupancy)}
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={54} label={yLabel(pal, unit || paramLabel(param))} />
      {showRefs && param === 'co2' && refLine(pal, { key: 'co2adv', y: STD.v.co2.con, color: pal.axis, opacity: 0.45, label: `${STD.v.co2.con} ppm · ${STD.v.ref} advisory` })}
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={tipUnits} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis, fontFamily: 'var(--font-sans)' }} />
      {zones.map((z, i) => (
        <Line key={z.id} type="monotone" dataKey={z.id} name={z.label} stroke={ZONE_COLORS[i % ZONE_COLORS.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
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
  { id: 'tvoc', title: 'Total VOCs (TVOC)', needs: (p) => p.includes('tvoc'), series: ['TVOC'], refKey: 'tvoc', Chart: TVOCTimelineChart },
  { id: 'hcho', title: 'Formaldehyde Over Time', needs: (p) => p.includes('hcho'), series: ['Formaldehyde'], Chart: HCHOTimelineChart },
]

// Reference-line catalogue for the toggle UI: which thresholds key applies
// to a parameter set, its label, and whether it applies given the units.
// `tvoc` lines only apply to mass-based (µg/m³) series — see TVOCTimelineChart.
export const REF_LINE_DEFS = [
  { key: 'co2', label: `CO₂ ${STD.v.co2.con} ppm`, std: STD.v.ref, applies: (params) => params.includes('co2') },
  { key: 'rh', label: `RH ${STD.t.rh.min}–${STD.t.rh.max}%`, std: STD.t.ref, applies: (params) => params.includes('rh') },
  { key: 'pm', label: `PM2.5 EPA/WHO`, std: 'EPA NAAQS / WHO 2021', applies: (params) => params.includes('pm25') },
  { key: 'co', label: `CO OSHA/NIOSH`, std: 'OSHA PEL / NIOSH REL', applies: (params) => params.includes('co') },
  { key: 'tvoc', label: `TVOC Mølhave`, std: 'Mølhave 1991', applies: (params, units) => params.includes('tvoc') && tvocIsMass(units) },
]
