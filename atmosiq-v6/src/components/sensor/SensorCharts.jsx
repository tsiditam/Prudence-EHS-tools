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
 * only reference line is a labelled advisory, never a regulatory limit.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend,
} from 'recharts'
import dayjs from 'dayjs'
import { normalizeForCompare, SENSOR_PARAMS } from '../../utils/sensorParser'

// Resolved palettes (no CSS vars — see header). DARK mirrors the app's
// dark tokens; LIGHT is the white-document palette used for report images.
export const DARK_PALETTE = { axis: '#8B93A5', grid: '#2A2E38', text: '#ECEEF2', card: '#111318' }
export const LIGHT_PALETTE = { axis: '#475569', grid: '#CBD5E1', text: '#0F172A', card: '#FFFFFF' }

// Distinct, contrast-safe series colours so series read without relying
// on a single hue (works on both dark + white backgrounds).
const SERIES = { co2: '#0E9FB8', temp: '#EA7A2B', rh: '#2563EB', pm25: '#7C3AED', pm10: '#DB2777', tvoc: '#059669', co: '#CA8A04', hcho: '#DC2626' }

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

const axis = (pal) => ({ stroke: pal.axis, tick: { fill: pal.axis, fontSize: 11 }, tickLine: false, axisLine: { stroke: pal.grid } })

// Formaldehyde timeline. No fixed reference line — loggers report HCHO in
// ppb / µg/m³ / mg/m³ / ppm, so a hardcoded guideline line would be
// unit-ambiguous and misleading. The Y-axis label carries the detected unit.
export function HCHOTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={46} label={{ value: units.hcho ? `Formaldehyde (${units.hcho})` : 'Formaldehyde', angle: -90, position: 'insideLeft', fill: pal.axis, fontSize: 11 }} />
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="hcho" name="Formaldehyde" stroke={SERIES.hcho} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function CO2TimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={46} label={{ value: 'CO₂ (ppm)', angle: -90, position: 'insideLeft', fill: pal.axis, fontSize: 11 }} />
      <ReferenceLine y={1000} stroke={SERIES.co2} strokeDasharray="4 4" strokeOpacity={0.55} label={{ value: '1000 (advisory)', fill: pal.axis, fontSize: 10, position: 'right' }} />
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Line type="monotone" dataKey="co2" name="CO₂" stroke={SERIES.co2} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function TempHumidityChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis yAxisId="temp" {...axis(pal)} width={42} label={{ value: `Temp (${units.temp || '°F'})`, angle: -90, position: 'insideLeft', fill: pal.axis, fontSize: 11 }} />
      <YAxis yAxisId="rh" orientation="right" domain={[0, 100]} {...axis(pal)} width={38} label={{ value: 'RH (%)', angle: 90, position: 'insideRight', fill: pal.axis, fontSize: 11 }} />
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis }} />
      <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke={SERIES.temp} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
      <Line yAxisId="rh" type="monotone" dataKey="rh" name="Relative Humidity" stroke={SERIES.rh} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

export function PMTimelineChart({ data, hasTs = true, units = {}, palette = DARK_PALETTE, width, height }) {
  const pal = palette
  const inner = (w, h) => (
    <LineChart data={data} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis {...axis(pal)} width={46} label={{ value: `PM (${units.pm25 || 'µg/m³'})`, angle: -90, position: 'insideLeft', fill: pal.axis, fontSize: 11 }} />
      <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis }} />
      <Line type="monotone" dataKey="pm25" name="PM2.5" stroke={SERIES.pm25} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
      <Line type="monotone" dataKey="pm10" name="PM10" stroke={SERIES.pm10} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />
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

export function MultiParameterChart({ data, params = [], hasTs = true, units = {}, palette = DARK_PALETTE, width, height }) {
  const pal = palette
  const sel = (params || []).slice(0, 3)
  const { data: nd } = normalizeForCompare(data, sel)
  const inner = (w, h) => (
    <LineChart data={nd} {...(width ? { width: w, height: h } : {})} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
      <CartesianGrid stroke={pal.grid} strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axis(pal)} />
      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...axis(pal)} width={44} label={{ value: 'Normalized (% of range)', angle: -90, position: 'insideLeft', fill: pal.axis, fontSize: 11 }} />
      <Tooltip content={<MultiTooltip hasTs={hasTs} units={units} pal={pal} />} />
      <Legend wrapperStyle={{ fontSize: 11, color: pal.axis }} />
      {sel.map((k) => <Line key={k} type="monotone" dataKey={`n_${k}`} name={paramLabel(k)} stroke={SERIES[k] || pal.axis} strokeWidth={2} dot={false} connectNulls isAnimationActive={!width} />)}
    </LineChart>
  )
  return <Shell width={width} height={height}>{inner}</Shell>
}

// Which chart applies given the detected params. `series` names drive the
// DOCX section text (the report image relies on axis labels + this list
// rather than the Recharts HTML legend).
export const GRAPH_DEFS = [
  { id: 'co2', title: 'CO₂ Over Time', needs: (p) => p.includes('co2'), series: ['CO₂'], Chart: CO2TimelineChart },
  { id: 'tempRh', title: 'Temperature & Relative Humidity', needs: (p) => p.includes('temp') || p.includes('rh'), series: ['Temperature', 'Relative Humidity'], Chart: TempHumidityChart },
  { id: 'pm', title: 'Particulate Matter (PM2.5 / PM10)', needs: (p) => p.includes('pm25') || p.includes('pm10'), series: ['PM2.5', 'PM10'], Chart: PMTimelineChart },
  { id: 'hcho', title: 'Formaldehyde Over Time', needs: (p) => p.includes('hcho'), series: ['Formaldehyde'], Chart: HCHOTimelineChart },
]
