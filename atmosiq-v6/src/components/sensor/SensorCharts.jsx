/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SensorCharts — report-ready IAQ timelines (Recharts, themed to the app
 * tokens so they read cleanly in both dark and light mode). Screening /
 * documentation only — no compliance lines, only labelled advisory
 * references.
 */

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend,
} from 'recharts'
import dayjs from 'dayjs'

// Theme pulled from CSS vars so charts flip with the app's light/dark.
const AXIS = 'var(--sub)'
const GRID = 'var(--border)'
const TEXT = 'var(--text)'
const CARD = 'var(--card)'
// Distinct, contrast-safe series colours (not accent-only) so series are
// distinguishable without relying on a single hue.
const SERIES = { co2: '#22D3EE', temp: '#FB923C', rh: '#38BDF8', pm25: '#A78BFA', pm10: '#F472B6', tvoc: '#34D399', co: '#FBBF24', press: '#94A3B8' }

const fmtTime = (hasTs) => (v) => (hasTs ? dayjs(v).format('MMM D HH:mm') : `#${v}`)

function ChartTooltip({ active, payload, label, hasTs, units }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{ background: CARD, border: `1px solid ${GRID}`, borderRadius: 8, padding: '8px 10px', fontSize: 12, color: TEXT, boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
      <div style={{ color: AXIS, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>{hasTs ? dayjs(label).format('MMM D, YYYY HH:mm') : `Reading #${label}`}</div>
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

function ChartShell({ children, height = 240 }) {
  return (
    <div role="img" style={{ width: '100%', height, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  )
}

const axisProps = { stroke: AXIS, tick: { fill: AXIS, fontSize: 11 }, tickLine: false, axisLine: { stroke: GRID } }

export function CO2TimelineChart({ data, hasTs = true, units = {} }) {
  return (
    <ChartShell>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axisProps} />
        <YAxis {...axisProps} width={44} label={{ value: 'CO₂ (ppm)', angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11 }} />
        {/* Advisory references (not regulatory limits). */}
        <ReferenceLine y={1000} stroke={SERIES.co2} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: '1000 (advisory)', fill: AXIS, fontSize: 10, position: 'right' }} />
        <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} />} />
        <Line type="monotone" dataKey="co2" name="CO₂" stroke={SERIES.co2} strokeWidth={2} dot={false} connectNulls isAnimationActive />
      </LineChart>
    </ChartShell>
  )
}

export function TempHumidityChart({ data, hasTs = true, units = {} }) {
  return (
    <ChartShell>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axisProps} />
        <YAxis yAxisId="temp" {...axisProps} width={40} label={{ value: `Temp (${units.temp || '°F'})`, angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11 }} />
        <YAxis yAxisId="rh" orientation="right" domain={[0, 100]} {...axisProps} width={36} label={{ value: 'RH (%)', angle: 90, position: 'insideRight', fill: AXIS, fontSize: 11 }} />
        <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
        <Line yAxisId="temp" type="monotone" dataKey="temp" name="Temperature" stroke={SERIES.temp} strokeWidth={2} dot={false} connectNulls />
        <Line yAxisId="rh" type="monotone" dataKey="rh" name="Relative Humidity" stroke={SERIES.rh} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ChartShell>
  )
}

export function PMTimelineChart({ data, hasTs = true, units = {} }) {
  return (
    <ChartShell>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTime(hasTs)} {...axisProps} />
        <YAxis {...axisProps} width={44} label={{ value: `PM (${units.pm25 || 'µg/m³'})`, angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11 }} />
        <Tooltip content={<ChartTooltip hasTs={hasTs} units={units} />} />
        <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
        <Line type="monotone" dataKey="pm25" name="PM2.5" stroke={SERIES.pm25} strokeWidth={2} dot={false} connectNulls />
        <Line type="monotone" dataKey="pm10" name="PM10" stroke={SERIES.pm10} strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ChartShell>
  )
}

// Which chart applies given the detected params.
export const GRAPH_DEFS = [
  { id: 'co2', title: 'CO₂ Over Time', params: ['co2'], needs: (p) => p.includes('co2'), Chart: CO2TimelineChart },
  { id: 'tempRh', title: 'Temperature & Relative Humidity', params: ['temp', 'rh'], needs: (p) => p.includes('temp') || p.includes('rh'), Chart: TempHumidityChart },
  { id: 'pm', title: 'Particulate Matter (PM2.5 / PM10)', params: ['pm25', 'pm10'], needs: (p) => p.includes('pm25') || p.includes('pm10'), Chart: PMTimelineChart },
]
