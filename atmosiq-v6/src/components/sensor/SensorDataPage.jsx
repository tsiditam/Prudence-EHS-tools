/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SensorDataPage — "Logger Studio" (Environmental Evidence Graphs).
 * Upload a CSV logger export → detect/map columns → review data quality →
 * generate report-ready IAQ timelines → flag graphs for the report.
 *
 * Screening / documentation only. Graphs are provided for screening and
 * documentation purposes; interpretation should be reviewed by a
 * qualified IAQ professional.
 */

import { useRef, useState, useEffect, useMemo } from 'react'
import * as V3 from '../../styles/tokens'
import { I } from '../Icons'
import GlassCard from '../ui/GlassCard'
import TactileButton from '../ui/TactileButton'
import SegmentedControl from '../ui/SegmentedControl'
import Chip from '../ui/Chip'
import CollapsibleCard from '../ui/CollapsibleCard'
import GhostButton from '../ui/GhostButton'
import Select from '../ui/Select'
import RoleBadge from '../ui/RoleBadge'
import InlineError from '../ui/InlineError'
import { parseSensorRows, SENSOR_PARAMS, TVOC_REFERENCES, ppbToUgm3, ugm3ToPpb, HCHO_MW, normalizeSensorData, primaryDataset, alignDatasets, sensorAveragesToFields, detectDatasetRole, SENSOR_DATA_VERSION, withDisplayTempUnit } from '../../utils/sensorParser'
import SendToReportSheet from './SendToReportSheet'
import { splitCsvLine } from '../../utils/labResultsParser'
import { xlsxToRows } from '../../utils/sensorXlsx'
import { GRAPH_DEFS, REF_LINE_DEFS, MultiParameterChart, Co2DifferentialChart, MultiZoneChart, LIGHT_PALETTE, DARK_PALETTE, SERIES } from './SensorCharts'
import { paramReference, exceedance, categoryOf, CATEGORY } from '../../utils/sensorThresholds'
import { chartStats, chartPrimaryParam } from '../../utils/sensorAnalytics'
import Sparkline from '../ui/Sparkline'
import { emitEvent } from '../../../lib/events/emit'
import GaugeBar from '../ui/GaugeBar'
import { calcCfmPerPerson, VENTILATION_CITATION } from '../../utils/ventilation'
import dayjs from 'dayjs'

const csvToRows = (text) => text.split(/\r\n?|\n/).filter((l) => l.trim().length > 0).map(splitCsvLine)

// Charts pass resolved hex (Recharts emits SVG attributes where var()
// won't resolve), so pick the palette from the live theme.
const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_PALETTE : DARK_PALETTE)

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB
const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)', CARD = 'var(--card)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'

const QUALITY_TONE = { ok: V3.STATUS.ready, minor: '#FBBF24', uncertain: '#FBBF24', review: V3.DANGER }

// Short tab labels for the Analysis parameter strip (GRAPH_DEFS titles are
// long); falls back to the full title for anything unmapped.
const SHORT_LABEL = { co2: 'CO₂', tempRh: 'Temp / RH', pm: 'PM', co: 'CO', tvoc: 'TVOC', hcho: 'Formaldehyde' }

const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, HH:mm')} – ${dayjs(e).format('MMM D, HH:mm')}` : 'Row order (no timestamps)')
const fmtInterval = (sec) => (sec == null ? '—' : sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : sec >= 60 ? `${Math.round(sec / 60)} min` : `${Math.round(sec)} s`)
// Compact average. Adaptive precision so sub-unit magnitudes (HCHO in
// mg/m³, where indoor readings sit near 0.02) don't collapse to "0":
//   ≥ 100  → integer (CO₂ ppm)
//   ≥ 1    → 1 decimal (CO ppm, PM µg/m³, temp °C, RH %)
//   ≥ 0.1  → 2 decimals
//   > 0    → 3 decimals (HCHO mg/m³ ≈ 0.020)
// JS Number→String strips trailing zeros, so "0.3" stays "0.3" — no
// 0.30 noise.
const fmtAvg = (v) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a === 0)  return '0'
  if (a >= 100) return String(Math.round(v))
  if (a >= 1)   return String(Math.round(v * 10) / 10)
  if (a >= 0.1) return String(Math.round(v * 100) / 100)
  return String(Math.round(v * 1000) / 1000)
}
// TVOC cross-unit equivalent (isobutylene-equiv) so both mass- and
// volume-based readers see a familiar number. µg/m³ stays the canonical
// scored unit; this line is informational only.
const tvocEquivLabel = (mean, unit) => {
  const mw = TVOC_REFERENCES.isobutylene.mw
  const u = String(unit || '').toLowerCase()
  if (/µg|ug/.test(u)) { const ppb = ugm3ToPpb(mean, mw); return ppb == null ? null : `≈ ${Math.round(ppb)} ppb (isobutylene-equiv)` }
  if (u.includes('ppm')) { const ug = ppbToUgm3(mean * 1000, mw); return ug == null ? null : `≈ ${Math.round(ug)} µg/m³ (isobutylene-equiv)` }
  if (u.includes('ppb')) { const ug = ppbToUgm3(mean, mw); return ug == null ? null : `≈ ${Math.round(ug)} µg/m³ (isobutylene-equiv)` }
  return null
}
// Formaldehyde source-unit provenance. After the parser normalizes HCHO to
// ppb at parse time (see sensorParser.js `hchoSourceToPpb`), the card always
// shows ppb in the headline. When the source CSV reported a different unit
// (mg/m³, µg/m³, ppm) we surface the equivalent value in that source unit so
// the user can audit the conversion. Returns null when the data was already
// ppb (no provenance line needed) or the conversion can't run.
const hchoSourceLabel = (meanPpb, sourceUnit) => {
  if (!sourceUnit || meanPpb == null || !Number.isFinite(meanPpb)) return null
  const u = String(sourceUnit).toLowerCase()
  if (/µg|ug/.test(u)) { const ug = ppbToUgm3(meanPpb, HCHO_MW); return ug == null ? null : `Source: ${ug < 10 ? ug.toFixed(2) : Math.round(ug)} µg/m³` }
  if (/mg/.test(u))    { const ug = ppbToUgm3(meanPpb, HCHO_MW); return ug == null ? null : `Source: ${(ug / 1000).toFixed(3)} mg/m³` }
  if (u.includes('ppm')) return `Source: ${(meanPpb / 1000).toFixed(3)} ppm`
  return null
}

// Exceedance tones reuse the app's risk palette (danger red / caution
// amber) rather than the parameter hue, so a flag reads as a real cue.
const EXC_TONE = { danger: V3.DANGER, warn: '#FB923C' }

// One Overview parameter card: identity dot + sparkline, the mean in
// tabular numerals, a gauge against the screening reference, the observed
// range, the reference line(s), and a screening exceedance flag when the
// values sit above a reference. Screening only — never a determination.
function ParamCard({ param, stats, unit, points, ts, hchoSourceUnit }) {
  const spec = SENSOR_PARAMS.find((s) => s.key === param)
  const color = SERIES[param] || 'var(--accent)'
  const ref = paramReference(param, { unit, ts })
  const exc = exceedance(param, stats, ref)
  const equiv = param === 'tvoc' ? tvocEquivLabel(stats.mean, unit)
    : param === 'hcho' ? hchoSourceLabel(stats.mean, hchoSourceUnit) : null
  return (
    <GlassCard style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <span style={{ ...V3.T.micro, color: SUB }}>{spec?.label || param}</span>
        </div>
        <Sparkline values={points} color={color} />
      </div>
      <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, color: TEXT, fontFamily: 'var(--font-mono)', letterSpacing: '-0.3px' }}>
        {fmtAvg(stats.mean)} <span style={{ fontSize: 11, fontWeight: 600, color: DIM }}>{unit}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <GaugeBar min={stats.min} max={stats.max} value={stats.mean} limit={ref.limit} band={ref.band} color={color} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 11, color: DIM, fontFamily: 'var(--font-mono)' }}>
        <span>{fmtAvg(stats.min)}–{fmtAvg(stats.max)} {unit} · n={stats.n}</span>
        {ref.limit != null && <span>limit {fmtAvg(ref.limit)}</span>}
      </div>
      {ref.refs.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 11, color: DIM, lineHeight: 1.5 }}>{ref.refs.join(' · ')}</div>
          {exc.level && (
            <div style={{ fontSize: 12, fontWeight: 600, color: EXC_TONE[exc.level], marginTop: 5, lineHeight: 1.45 }}>
              {exc.message}{equiv ? ` · ${equiv}` : ''}
            </div>
          )}
          {ref.note && (
            <div style={{ fontSize: 10, color: DIM, marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' }}>{ref.note}</div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// Top-of-Overview banner summarizing how many parameters sit above a
// screening reference (mirrors the per-card flags).
function ThresholdBanner({ items }) {
  if (!items.length) return null
  return (
    <GlassCard style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: V3.DANGER, fontFamily: 'var(--font-mono)' }}>{items.length}</span>
        <span style={{ ...V3.T.bodyStrong }}>parameter{items.length === 1 ? '' : 's'} above a screening reference</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
        {items.map((it) => (
          <span key={it.param} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: SUB }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: SERIES[it.param] || 'var(--accent)' }} />
            {it.label}
          </span>
        ))}
      </div>
    </GlassCard>
  )
}

// Factual stat row under an Analysis chart: mean, peak (flagged occupied
// when occupancy windows exist), % of readings over the screening
// reference, and the occupied−unoccupied delta. Cells with no input
// (no reference / no occupancy) are omitted. Numbers only — no judgment.
function ChartStatRow({ stats, unit, reference }) {
  if (!stats) return null
  const cells = [
    { label: 'Mean', value: fmtAvg(stats.mean), sub: unit },
    { label: 'Peak', value: fmtAvg(stats.peak), sub: stats.peakOccupied === true ? 'occupied hr' : stats.peakOccupied === false ? 'unoccupied' : unit },
  ]
  if (stats.pctOver != null) {
    cells.push({ label: `% > ${reference?.limitLabel || 'ref'}`, value: `${Math.round(stats.pctOver)}%`, sub: `of n=${stats.n}`, tone: stats.pctOver > 0 ? '#FB923C' : null })
  }
  if (stats.deltaOccNoc != null) {
    cells.push({ label: 'Δ occ−noc', value: `${stats.deltaOccNoc >= 0 ? '+' : ''}${fmtAvg(stats.deltaOccNoc)}`, sub: unit })
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 20px', padding: '0 18px 12px' }}>
      {cells.map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', color: SUB }}>{c.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: c.tone || TEXT, fontFamily: 'var(--font-mono)' }}>{c.value}</span>
          {c.sub && <span style={{ fontSize: 10, color: DIM }}>{c.sub}</span>}
        </div>
      ))}
    </div>
  )
}

// "Analyzing" reveal — after a successful upload we hold the parsed
// results behind a short processing animation so the transition reads as
// the app working through the data rather than snapping in. ~5s across
// three status lines. Honors prefers-reduced-motion (skipped → instant).
const ANALYZE_MS = 5000
const ANALYZE_STATUS = ['Parsing readings…', 'Computing averages…', 'Preparing visuals…']

function AnalyzingCard({ fileName, phase }) {
  return (
    <GlassCard style={{ marginTop: 16, padding: '40px 24px', textAlign: 'center', animation: 'fadeUp .3s ease' }}>
      <style>{`
        @keyframes sdPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.09);opacity:.82} }
        @keyframes sdScan { 0%{transform:translateX(-110%)} 100%{transform:translateX(320%)} }
      `}</style>
      <div style={{ width: 60, height: 60, borderRadius: 16, margin: '0 auto 18px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sdPulse 1.4s ease-in-out infinite' }}>
        <I n="chart" s={26} c={ACCENT} w={1.8} />
      </div>
      <div style={{ ...V3.T.h3, marginBottom: 6 }}>Analyzing logger data</div>
      <div style={{ ...V3.T.bodyDim, maxWidth: 360, margin: '0 auto 20px', minHeight: 20 }}>
        {ANALYZE_STATUS[Math.min(phase, ANALYZE_STATUS.length - 1)]}
      </div>
      <div style={{ position: 'relative', height: 4, maxWidth: 280, margin: '0 auto', borderRadius: 2, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '35%', borderRadius: 2, background: ACCENT, animation: 'sdScan 1.2s ease-in-out infinite' }} />
      </div>
      {fileName && <div style={{ ...V3.T.captionDim, marginTop: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</div>}
    </GlassCard>
  )
}

export default function SensorDataPage({ value, onChange, onBack, reports = [], currentReportId = null, currentZones = [], onApplyAverages }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [error, setError] = useState(null)
  const [sourceRows, setSourceRows] = useState(null) // kept for re-mapping this session
  const [mapOpen, setMapOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [phase, setPhase] = useState(0)
  // Active view (Overview / Analysis / Report) and, within Analysis, the
  // selected chart in the parameter tab strip.
  const [mode, setMode] = useState('overview')
  const [activeChartKey, setActiveChartKey] = useState(null)
  // Where the next picked file lands: the primary indoor dataset, an outdoor
  // baseline, or a named zone. Set just before opening the file picker.
  const [pendingTarget, setPendingTarget] = useState({ role: 'indoor', label: 'Indoor' })
  const analyzeTimer = useRef(null)
  const phaseTimer = useRef(null)
  const env = useMemo(() => normalizeSensorData(value), [value])
  const primary = env ? primaryDataset(env) : null
  const datasets = env ? env.datasets : []
  // Temperature display unit. Defaults to the native detected unit; the user
  // can flip the Overview + charts to the other scale via the toggle. Stored
  // on the envelope so the choice persists. `data` is a render-time view of
  // the primary dataset with temperature projected to the chosen unit — the
  // stored series stays native.
  const tempNative = (primary && primary.units && primary.units.temp) || null
  const hasTemp = !!(primary && (primary.params || []).includes('temp'))
  const tempDisplay = (env && env.tempDisplay) || tempNative || '°F'
  const data = useMemo(() => withDisplayTempUnit(primary, tempDisplay), [primary, tempDisplay])
  const graphsState = (env && env.graphs) || {}
  // Whether the loaded log yields any zone-fillable averages (gates the
  // "Send averages to a report" action below the Overview averages grid).
  const canSendAverages = useMemo(
    () => !!onApplyAverages && sensorAveragesToFields(value, { stat: 'mean', tvocRef: 'isobutylene' }).details.length > 0,
    [value, onApplyAverages]
  )

  const pickFor = (target) => { setPendingTarget(target); setError(null); fileRef.current?.click() }

  const stopAnalyzing = () => {
    if (analyzeTimer.current) { clearTimeout(analyzeTimer.current); analyzeTimer.current = null }
    if (phaseTimer.current) { clearInterval(phaseTimer.current); phaseTimer.current = null }
  }

  // Hold the parsed results behind a brief processing animation. Skipped
  // (instant reveal) under prefers-reduced-motion — the delay is an
  // animation, so motion-averse users get the fast path.
  const startAnalyzing = () => {
    stopAnalyzing()
    let reduce = false
    try { reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { reduce = false }
    if (reduce) { setAnalyzing(false); return }
    setPhase(0)
    setAnalyzing(true)
    phaseTimer.current = setInterval(() => setPhase((p) => Math.min(p + 1, ANALYZE_STATUS.length - 1)), Math.round(ANALYZE_MS / ANALYZE_STATUS.length))
    analyzeTimer.current = setTimeout(() => { setAnalyzing(false); stopAnalyzing() }, ANALYZE_MS)
  }

  // Cancel any pending reveal timers on unmount.
  useEffect(() => () => stopAnalyzing(), [])

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setError(null)
    const isCsv = /\.csv$/i.test(file.name)
    const isXlsx = /\.xlsx$/i.test(file.name)
    if (!isCsv && !isXlsx) { setError('Please upload a .csv or .xlsx logger export.'); return }
    if (file.size > MAX_FILE_BYTES) { setError('File is larger than 8 MB. Trim the export or split it.'); return }
    setBusy(true)
    try {
      const rows = isXlsx ? await xlsxToRows(file) : csvToRows(await file.text())
      const parsed = parseSensorRows(rows, { fileName: file.name })
      if (!parsed) { setError('Could not find a timestamp + parameter columns in that file. Check the export or adjust the mapping.'); setBusy(false); return }
      const target = pendingTarget || { role: 'indoor', label: 'Indoor' }
      // The generic uploader lands in the indoor primary slot by default;
      // honor a clear outdoor/indoor signal from the filename or column
      // headers instead of silently labeling the data indoor. Explicit
      // "add outdoor baseline / zone" picks keep the user's chosen role.
      const detectedRole = detectDatasetRole(parsed.fileName, (parsed.columns || []).map((c) => c.raw))
      const role = target.role === 'indoor' && detectedRole ? detectedRole : target.role
      const label = role === 'outdoor' ? 'Outdoor' : role === 'indoor' ? 'Indoor' : ((target.label || '').trim() || 'Zone')
      emitEvent('logger_imported', {
        target_id: currentReportId || null,
        target_type: 'assessment',
        details: {
          file_name: parsed.fileName || file.name,
          role,
          parameters: Array.isArray(parsed.params) ? parsed.params : [],
          rows: Array.isArray(rows) ? rows.length : 0,
        },
      })
      if (!env) {
        // First upload — establish the envelope. This dataset takes the
        // 'primary' slot (it's the only data) with its detected role + label.
        const ds = { id: 'primary', role, label, ...parsed }
        setSourceRows(rows)
        onChange(normalizeSensorData({ version: SENSOR_DATA_VERSION, datasets: [ds], graphs: {} }))
        startAnalyzing()
      } else if (role === 'indoor') {
        // Replacing / setting the primary indoor dataset. The reveal
        // animation + re-mapping source rows apply to the primary only.
        const ds = { id: primary?.id || 'primary', role: 'indoor', label: 'Indoor', ...parsed }
        const nextDatasets = env.datasets.length ? env.datasets.map((d) => (d.id === ds.id ? ds : d)) : [ds]
        setSourceRows(rows)
        onChange({ ...env, datasets: nextDatasets })
        startAnalyzing()
      } else {
        // Additional dataset (outdoor baseline / named zone), including a
        // detected-outdoor file dropped on the generic uploader.
        const ds = { id: `ds-${Date.now()}`, role, label, ...parsed }
        onChange({ ...env, datasets: [...env.datasets, ds] })
      }
    } catch (err) {
      setError((err && err.message) || 'Could not read that file.')
    }
    setBusy(false)
  }

  const reparse = (mapping) => {
    if (!sourceRows || !env) return
    const parsed = parseSensorRows(sourceRows, { fileName: primary?.fileName, mapping })
    if (!parsed) return
    const ds = { id: primary?.id || 'primary', role: primary?.role || 'indoor', label: primary?.label || 'Indoor', ...parsed, mapping }
    onChange({ ...env, datasets: env.datasets.map((d) => (d.id === ds.id ? ds : d)) })
  }

  const setGraph = (id, patch) => {
    onChange({ ...env, graphs: { ...graphsState, [id]: { ...(graphsState[id] || {}), ...patch } } })
  }

  const removeDataset = (id) => {
    if (!env) return
    const remaining = env.datasets.filter((d) => d.id !== id)
    if (!remaining.length) { clear(); return }
    onChange({ ...env, datasets: remaining })
  }

  const clear = () => { stopAnalyzing(); setAnalyzing(false); setSourceRows(null); setError(null); onChange(null) }

  const graphs = data ? GRAPH_DEFS.filter((g) => g.needs(data.params)) : []
  // Reference-line visibility. Default { co2: true } preserves the legacy
  // always-on CO₂ advisory line; once the user toggles, the explicit map wins.
  const refs = (env && env.thresholds) || { co2: true }
  const availableRefs = data ? REF_LINE_DEFS.filter((d) => d.applies(data.params, data.units)) : []
  const toggleRef = (key) => onChange({ ...env, thresholds: { ...refs, [key]: !refs[key] } })

  // Indoor vs outdoor CO₂ differential — both must be timestamped CO₂ series.
  const outdoorDs = datasets.find((d) => d.role === 'outdoor' && d.params?.includes('co2') && d.hasTimestamps)
  const diff = useMemo(() => {
    if (!primary || !primary.params?.includes('co2') || !primary.hasTimestamps || !outdoorDs) return null
    const { points } = alignDatasets([{ ...primary, id: 'indoor' }, { ...outdoorDs, id: 'outdoor' }], 'co2')
    const rows = points.map((p) => ({ t: p.t, indoor: p.indoor, outdoor: p.outdoor, diff: p.indoor != null && p.outdoor != null ? Math.round(p.indoor - p.outdoor) : null }))
    const paired = rows.filter((r) => r.diff != null)
    if (!paired.length) return null
    const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
    const meanIndoor = mean(paired.map((r) => r.indoor))
    const meanOutdoor = mean(paired.map((r) => r.outdoor))
    return { rows, meanDiff: Math.round(meanIndoor - meanOutdoor), vo: calcCfmPerPerson(meanIndoor, meanOutdoor) }
  }, [primary, outdoorDs])

  // Multi-zone overlay — params shared by ≥2 timestamped datasets.
  const tsDatasets = datasets.filter((d) => d.hasTimestamps && Array.isArray(d.params))
  const sharedParams = SENSOR_PARAMS.map((s) => s.key).filter((k) => tsDatasets.filter((d) => d.params.includes(k)).length >= 2)
  const [zoneParam, setZoneParam] = useState(null)
  const activeZoneParam = (zoneParam && sharedParams.includes(zoneParam)) ? zoneParam : (sharedParams.includes('co2') ? 'co2' : sharedParams[0])
  const zoneOverlay = useMemo(() => {
    if (!activeZoneParam) return null
    const dsForParam = tsDatasets.filter((d) => d.params.includes(activeZoneParam))
    if (dsForParam.length < 2) return null
    const { points } = alignDatasets(dsForParam, activeZoneParam)
    if (!points.length) return null
    return { points, zones: dsForParam.map((d) => ({ id: d.id, label: d.label })), units: dsForParam[0].units || {} }
  }, [datasets, activeZoneParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // Occupancy windows tag occupied / unoccupied periods on the shared time
  // axis; they shade every timeline chart (and the captured report image).
  const occWindows = (env && env.occupancyWindows) || []
  const setOccupancy = (next) => onChange({ ...env, occupancyWindows: next })
  const occRange = (primary && primary.hasTimestamps && primary.summary?.start && primary.summary?.end)
    ? { start: primary.summary.start, end: primary.summary.end }
    : null

  // Chart "views" available for the Analysis tab strip and the Report list:
  // each detected parameter graph, plus the multi-parameter, indoor/outdoor
  // differential, and zone-comparison overlays when they apply.
  const chartTabs = []
  graphs.forEach((g) => chartTabs.push({ key: g.id, kind: 'graph', def: g, label: SHORT_LABEL[g.id] || g.title }))
  if (data && data.params.length >= 2) chartTabs.push({ key: 'multi', kind: 'multi', label: 'Multi-Parameter' })
  if (diff) chartTabs.push({ key: 'co2-diff', kind: 'diff', label: 'Indoor vs Outdoor' })
  if (zoneOverlay) chartTabs.push({ key: 'zones', kind: 'zone', label: 'Zone Comparison' })
  const activeChart = chartTabs.find((t) => t.key === activeChartKey) || chartTabs[0] || null
  // Count every graph flagged for the report (standard + overlays).
  const includedReportCount = Object.values(graphsState).filter((s) => s && s.include).length

  // One chart block, shared by Analysis (single, controls hidden) and Report
  // (listed, with caption + export). blockMode is forwarded to GraphCard.
  const renderChartBlock = (tab, blockMode) => {
    if (!tab) return null
    if (tab.kind === 'graph') {
      return <GraphCard def={tab.def} data={data} state={graphsState[tab.def.id] || {}} onState={(patch) => setGraph(tab.def.id, patch)} chartProps={{ showRefs: !!refs[tab.def.refKey], occupancy: occWindows }} mode={blockMode} />
    }
    if (tab.kind === 'multi') {
      return <MultiParamSection data={data} state={graphsState.multi || {}} onState={(patch) => setGraph('multi', patch)} occupancy={occWindows} mode={blockMode} />
    }
    if (tab.kind === 'diff' && diff) {
      return (
        <div>
          <div style={{ ...V3.T.micro, margin: '0 2px 8px' }}>Indoor vs Outdoor CO₂ · ventilation differential</div>
          <GraphCard
            def={{ id: 'co2-diff', title: 'Indoor vs Outdoor CO₂', series: ['Indoor CO₂', 'Outdoor CO₂', 'Δ (indoor−outdoor)'], refKey: 'co2', Chart: Co2DifferentialChart }}
            data={data}
            state={graphsState['co2-diff'] || {}}
            onState={(patch) => setGraph('co2-diff', patch)}
            chartProps={{ points: diff.rows, hasTs: true, showRefs: !!refs.co2, occupancy: occWindows }}
            mode={blockMode}
          />
          <GlassCard style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={V3.T.micro}>Mean differential</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: 'var(--font-mono)' }}>{diff.meanDiff} <span style={{ fontSize: 11, color: DIM }}>ppm</span></div>
              </div>
              <div>
                <div style={V3.T.micro}>Est. outdoor air</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: diff.vo?.cfmPerPerson != null ? ACCENT : DIM, fontFamily: 'var(--font-mono)' }}>
                  {diff.vo?.cfmPerPerson != null ? <>{diff.vo.cfmPerPerson} <span style={{ fontSize: 11, color: DIM }}>cfm/person</span></> : '—'}
                </div>
              </div>
            </div>
            {diff.vo?.error && <div style={{ ...V3.T.captionDim, marginTop: 8, color: '#FCA85F' }}>{diff.vo.error}</div>}
            <div style={{ ...V3.T.captionDim, marginTop: 10, lineHeight: 1.5 }}>{VENTILATION_CITATION}</div>
          </GlassCard>
        </div>
      )
    }
    if (tab.kind === 'zone' && zoneOverlay) {
      return (
        <div>
          <div style={{ ...V3.T.micro, margin: '0 2px 8px' }}>Zone comparison{sharedParams.length > 1 ? ' · pick a parameter' : ''}</div>
          {sharedParams.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {sharedParams.map((k) => (
                <Chip key={k} selected={k === activeZoneParam} onClick={() => setZoneParam(k)} checkmark>
                  {SENSOR_PARAMS.find((s) => s.key === k)?.label || k}
                </Chip>
              ))}
            </div>
          )}
          <GraphCard
            def={{ id: `zones-${activeZoneParam}`, title: `Zone Comparison — ${SENSOR_PARAMS.find((s) => s.key === activeZoneParam)?.label || activeZoneParam}`, series: zoneOverlay.zones.map((z) => z.label), refKey: activeZoneParam, Chart: MultiZoneChart }}
            data={data}
            state={graphsState[`zones-${activeZoneParam}`] || {}}
            onState={(patch) => setGraph(`zones-${activeZoneParam}`, patch)}
            chartProps={{ points: zoneOverlay.points, zones: zoneOverlay.zones, param: activeZoneParam, units: zoneOverlay.units, hasTs: true, showRefs: !!refs[activeZoneParam], occupancy: occWindows }}
            mode={blockMode}
          />
        </div>
      )
    }
    return null
  }

  const emptyCharts = (
    <GlassCard style={{ textAlign: 'center', padding: '28px 20px', marginTop: 14 }}>
      <div style={V3.T.bodyDim}>No chartable IAQ parameters detected. Use “Adjust column mapping” in Overview to map your columns.</div>
    </GlassCard>
  )

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 820, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 10, background: CARD, border: `1px solid ${BORDER}`, color: SUB, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <I n="home" s={17} c={SUB} w={1.8} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...V3.T.h1, marginBottom: 2 }}>Logger Studio</div>
          <div style={V3.T.bodyDim}>Upload logger data for report-ready IAQ visuals.</div>
        </div>
      </div>

      {/* Single hidden file input; pendingTarget decides where the file lands. */}
      <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onPick} style={{ display: 'none' }} aria-hidden="true" />

      {!data && (
        <GlassCard style={{ marginTop: 16, padding: '28px 24px', textAlign: 'center', animation: 'fadeUp .3s ease' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: `color-mix(in srgb, var(--accent) 10%, transparent)`, border: `1px solid color-mix(in srgb, var(--accent) 22%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I n="upload" s={22} c={ACCENT} w={1.8} />
          </div>
          <div style={{ ...V3.T.h3, marginBottom: 6 }}>Upload Logger Data</div>
          <div style={{ ...V3.T.bodyDim, maxWidth: 460, margin: '0 auto 18px' }}>
            CSV or XLSX exports from TSI Q-Trak, HOBO, Aeroqual, GrayWolf, Airthings, and most loggers. AtmosFlow detects timestamp, CO₂, temperature, RH, PM, TVOC and CO columns automatically.
          </div>
          {error && <InlineError style={{ marginBottom: 14 }}>{error}</InlineError>}
          {/* ~30%-smaller red upload CTA (per product direction). Sizes
              are 0.7× the `lg` variant (pad 16/22→11/15, font 15→11,
              minH 52→36, icon 15→11); background uses the theme-aware
              --danger with white text + a soft red glow, overriding the
              primary variant's cyan accent-fill + glow. */}
          <TactileButton variant="primary" size="lg" pill disabled={busy} onClick={() => pickFor({ role: 'indoor', label: 'Indoor' })} icon={<I n="upload" s={11} c="#FFFFFF" w={2} />} style={{
            padding: '11px 15px',
            fontSize: 11,
            minHeight: 36,
            background: 'var(--danger)',
            color: '#FFFFFF',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.20), 0 8px 18px color-mix(in srgb, var(--danger) 30%, transparent)',
          }}>
            {busy ? 'Reading…' : 'Upload Data'}
          </TactileButton>
        </GlassCard>
      )}

      {data && analyzing && <AnalyzingCard fileName={data.fileName} phase={phase} />}

      {data && !analyzing && (
        <>
          {error && <InlineError style={{ marginTop: 14 }}>{error}</InlineError>}

          <SegmentedControl ariaLabel="Logger Studio view" value={mode} onChange={setMode} style={{ marginTop: 14 }}
            options={[{ value: 'overview', label: 'Overview' }, { value: 'analysis', label: 'Analysis' }, { value: 'report', label: 'Report', badge: includedReportCount || undefined }]} />

          {mode === 'overview' && (
            <>
          {/* Session header — eyebrow + title + quiet metadata. Identity
              (role / file / range) sits as a subdued line so it reads as
              context, not the headline. */}
          <GlassCard style={{ marginTop: 14, animation: 'fadeUp .3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={V3.T.micro}>Logger Studio · Averages</div>
              {hasTemp && tempNative && (
                <SegmentedControl
                  ariaLabel="Temperature display unit"
                  style={{ padding: 3, gap: 2, width: 104, flex: '0 0 auto' }}
                  value={tempDisplay}
                  onChange={(u) => onChange({ ...env, tempDisplay: u })}
                  options={[{ value: '°C', label: '°C' }, { value: '°F', label: '°F' }]}
                />
              )}
            </div>
            <div style={{ ...V3.T.h1, marginTop: 8 }}>Session Averages</div>
            <div style={{ ...V3.T.captionDim, marginTop: 4 }}>
              {data.summary.count.toLocaleString()} readings · {fmtInterval(data.summary.intervalSec)} interval · {data.params.length} parameters{data.summary.emptyRows ? ` · ${data.summary.emptyRows} empty` : ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <RoleBadge role={data.role || 'indoor'}>{data.label || 'Indoor'}</RoleBadge>
                <div style={{ ...V3.T.captionDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.fileName || 'Logger data'} · {fmtRange(data.summary.start, data.summary.end)}</div>
              </div>
              <GhostButton onClick={() => pickFor({ role: 'indoor', label: 'Indoor' })}>Replace</GhostButton>
            </div>
            <GhostButton onClick={() => setMapOpen((v) => !v)} style={{ marginTop: 14, width: '100%', justifyContent: 'center' }}>
              {mapOpen ? 'Hide column mapping' : 'Adjust column mapping'}
            </GhostButton>
            {mapOpen && sourceRows && <MappingPanel columns={data.columns} onApply={(m) => { reparse(m); setMapOpen(false) }} />}
          </GlassCard>

          {/* Session averages — grouped by category, each card gauged
              against its screening reference. */}
          {data.summary.stats && data.params.some((p) => data.summary.stats[p]) && (() => {
            const flagged = []
            data.params.forEach((p) => {
              const s = data.summary.stats[p]
              if (!s) return
              const exc = exceedance(p, s, paramReference(p, { unit: data.units[p] || '', ts: data.summary.start }))
              if (exc.level) flagged.push({ param: p, label: SENSOR_PARAMS.find((x) => x.key === p)?.label || p })
            })
            return (
              <>
                <ThresholdBanner items={flagged} />
                {CATEGORY.map((cat) => {
                  const ps = data.params.filter((p) => data.summary.stats[p] && categoryOf(p) === cat.id)
                  if (!ps.length) return null
                  return (
                    <div key={cat.id} style={{ marginTop: 16 }}>
                      <div style={{ ...V3.T.micro, color: SUB, marginBottom: 2 }}>{cat.label}</div>
                      {ps.map((p) => (
                        <ParamCard key={p} param={p} stats={data.summary.stats[p]} unit={data.units[p] || ''} points={data.points.map((pt) => pt[p])} ts={data.summary.start} hchoSourceUnit={data.units.hchoSource} />
                      ))}
                    </div>
                  )
                })}
                {canSendAverages && (
                  <TactileButton variant="secondary" fullWidth size="md" onClick={() => setSendOpen(true)}
                    icon={<I n="report" s={16} c={ACCENT} />} style={{ marginTop: 16 }}>
                    Send averages to a report
                  </TactileButton>
                )}
              </>
            )
          })()}

          {/* Data quality */}
          <GlassCard style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <I n={data.quality.level === 'ok' ? 'check' : 'alert'} s={16} c={QUALITY_TONE[data.quality.level]} w={2} />
              <div style={{ ...V3.T.bodyStrong, color: QUALITY_TONE[data.quality.level] }}>{data.quality.status}</div>
            </div>
            {data.quality.flags.length > 0 && (
              <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                {data.quality.flags.map((f, i) => (
                  <li key={i} style={{ fontSize: 12, color: SUB, lineHeight: 1.7 }}>{f.msg}</li>
                ))}
              </ul>
            )}
            <div style={{ ...V3.T.captionDim, marginTop: 12, lineHeight: 1.5 }}>
              Graphs are provided for screening and documentation purposes. Interpretation should be reviewed by a qualified IAQ professional. AtmosFlow does not make compliance determinations.
            </div>
          </GlassCard>

              <GhostButton onClick={clear} style={{ marginTop: 18, color: V3.DANGER, borderColor: 'color-mix(in srgb, var(--danger) 30%, transparent)' }}>Remove logger data</GhostButton>
            </>
          )}

          {mode === 'analysis' && (
            <>
              {availableRefs.length > 0 && (
                <CollapsibleCard title="Reference lines" summary={`${availableRefs.filter((d) => refs[d.key]).length} of ${availableRefs.length} on`} defaultOpen={false}>
                  <div style={{ ...V3.T.captionDim, marginBottom: 10 }}>Labelled advisory / context values, not compliance limits.</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {availableRefs.map((d) => (
                      <Chip key={d.key} selected={!!refs[d.key]} onClick={() => toggleRef(d.key)} title={d.std} checkmark>
                        {d.label}
                      </Chip>
                    ))}
                  </div>
                </CollapsibleCard>
              )}

              {/* Compare datasets — add an outdoor baseline or named zones. */}
              <DatasetManager datasets={datasets} onPickFor={pickFor} onRemove={removeDataset} busy={busy} />

              {/* Occupancy — tag occupied / unoccupied periods that shade every chart. */}
              {occRange && <OccupancyEditor windows={occWindows} range={occRange} onChange={setOccupancy} />}
              {chartTabs.length === 0 ? emptyCharts : (
                <>
                  <div style={{ ...V3.T.micro, margin: '20px 2px 8px' }}>Charts</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                    {chartTabs.map((t) => (
                      <Chip key={t.key} selected={t.key === activeChart?.key} onClick={() => setActiveChartKey(t.key)}>
                        {t.label}
                      </Chip>
                    ))}
                  </div>
                  {renderChartBlock(activeChart, 'analysis')}
                </>
              )}
            </>
          )}

          {mode === 'report' && (
            <>
              {chartTabs.length === 0 ? emptyCharts : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 14 }}>
                  {chartTabs.map((t) => <div key={t.key}>{renderChartBlock(t, 'report')}</div>)}
                </div>
              )}
            </>
          )}
        </>
      )}

      {sendOpen && (
        <SendToReportSheet
          sensorData={value}
          reports={reports}
          currentReportId={currentReportId}
          currentZones={currentZones}
          onApply={onApplyAverages}
          onClose={() => setSendOpen(false)}
        />
      )}
    </div>
  )
}

const CAP_W = 680, CAP_H = 300

// Compare up to 3 detected parameters on one normalized timeline. Changing
// the selection invalidates any captured image (so the report figure always
// matches the shown selection).
function MultiParamSection({ data, state, onState, occupancy = [], mode = 'report' }) {
  const selected = (state.params && state.params.length) ? state.params : data.params.slice(0, Math.min(3, data.params.length))
  const labelOf = (k) => SENSOR_PARAMS.find((s) => s.key === k)?.label || k
  const toggleParam = (k) => {
    const has = selected.includes(k)
    if (!has && selected.length >= 3) return
    const next = has ? selected.filter((x) => x !== k) : [...selected, k]
    if (!next.length) return
    onState({ params: next, include: false, imageDataUrl: null })
  }
  const def = { id: 'multi', title: 'Multi-Parameter Comparison', series: selected.map(labelOf), Chart: MultiParameterChart }
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ ...V3.T.micro, margin: '0 2px 8px' }}>Compare parameters · pick up to 3</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {data.params.map((k) => (
          <Chip key={k} selected={selected.includes(k)} onClick={() => toggleParam(k)} checkmark>
            {labelOf(k)}
          </Chip>
        ))}
      </div>
      <GraphCard def={def} data={data} state={state} onState={onState} chartProps={{ params: selected, occupancy }} mode={mode} />
    </div>
  )
}

function GraphCard({ def, data, state, onState, chartProps = {}, mode = 'report' }) {
  const hiddenRef = useRef(null)
  const [capture, setCapture] = useState(null) // null | 'include' | 'export' | 'export-svg'
  const [busy, setBusy] = useState(false)
  const { Chart } = def
  const pal = currentPalette()

  // Factual stat row for single-parameter timeline charts. Reuses the
  // Phase-1 screening reference (for % over) and the occupancy windows.
  const statParam = chartPrimaryParam(def.id)
  const statRef = statParam ? paramReference(statParam, { unit: data.units[statParam] || '', ts: data.summary.start }) : null
  const stats = statParam
    ? chartStats(
        data.points.map((p) => p[statParam]),
        data.points.map((p) => p.t),
        { occupancyWindows: chartProps.occupancy, limit: statRef ? statRef.limit : null },
      )
    : null

  // Render the included/exported image from a hidden, fixed-size,
  // LIGHT-palette copy of the chart (so the report image is white-paper
  // ready regardless of the app theme). html2canvas reads computed styles;
  // the resolved-hex palette captures cleanly, legend included.
  useEffect(() => {
    if (!capture) return undefined
    let cancelled = false
    const baseName = `${(data.fileName || 'sensor').replace(/\.(csv|xlsx)$/i, '')}-${def.id}`
    const id = requestAnimationFrame(() => requestAnimationFrame(async () => {
      try {
        if (capture === 'export-svg') {
          const svg = hiddenRef.current?.querySelector('svg')
          if (svg) {
            const clone = svg.cloneNode(true)
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
            const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a'); a.href = url; a.download = `${baseName}.svg`; a.click()
            setTimeout(() => URL.revokeObjectURL(url), 2000)
          }
        } else {
          const html2canvas = (await import('html2canvas')).default
          const canvas = await html2canvas(hiddenRef.current, { backgroundColor: '#FFFFFF', scale: 2, logging: false })
          const png = canvas.toDataURL('image/png')
          if (cancelled) return
          if (capture === 'include') onState({ include: true, imageDataUrl: png, title: def.title, series: def.series })
          else if (capture === 'export') {
            const a = document.createElement('a'); a.href = png; a.download = `${baseName}.png`; a.click()
          }
        }
      } catch { /* best-effort */ }
      if (!cancelled) { setBusy(false); setCapture(null) }
    }))
    return () => { cancelled = true; cancelAnimationFrame(id) }
  }, [capture]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleInclude = () => {
    if (state.include) { onState({ include: false, imageDataUrl: null }); setCapture(null); setBusy(false); return }
    // Commit inclusion immediately. The on-screen Logger result tab re-renders
    // this graph live from the dataset, so inclusion must not wait on the PNG
    // capture below — that pass only enriches the DOCX figure (best-effort).
    // Gating inclusion on html2canvas left the flag silently un-committed when
    // capture failed (e.g. iOS Safari), so no graph reached the Logger tab.
    onState({ include: true, title: def.title, series: def.series })
    setBusy(true); setCapture('include')
  }
  const exportPng = () => { setBusy(true); setCapture('export') }
  const exportSvg = () => { setBusy(true); setCapture('export-svg') }

  return (
    <GlassCard style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px 8px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={V3.T.bodyStrong}>{def.title}</div>
          <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{fmtRange(data.summary.start, data.summary.end)}{def.series.length > 1 ? ` · ${def.series.join(' / ')}` : ''}</div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
          <span style={{ ...V3.T.caption, color: state.include ? ACCENT : SUB }}>{busy && capture === 'include' ? 'Preparing…' : 'Include in report'}</span>
          <span onClick={toggleInclude} role="switch" aria-checked={!!state.include} aria-label="Include graph in report" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleInclude() } }}
            style={{ width: 40, height: 24, borderRadius: 12, background: state.include ? ACCENT : 'var(--surface)', border: `1px solid ${state.include ? ACCENT : BORDER}`, position: 'relative', transition: 'background .2s, border-color .2s', flexShrink: 0 }}>
            <span style={{ position: 'absolute', top: 2, left: state.include ? 18 : 2, width: 18, height: 18, borderRadius: '50%', background: state.include ? 'var(--on-accent-fill)' : SUB, transition: 'left .2s' }} />
          </span>
        </label>
      </div>
      <div style={{ padding: '4px 8px 12px', background: CARD }}>
        <Chart data={data.points} hasTs={data.hasTimestamps} units={data.units} palette={pal} {...chartProps} />
      </div>
      {stats && <ChartStatRow stats={stats} unit={data.units[statParam] || ''} reference={statRef} />}
      {mode !== 'analysis' && (
        <div style={{ padding: '0 18px 16px' }}>
          <textarea value={state.caption || ''} onChange={(e) => onState({ caption: e.target.value })} placeholder="Add a caption (optional)"
            rows={2} style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <GhostButton onClick={exportPng} disabled={busy}>
              <I n="download" s={14} c={SUB} w={1.8} /> {busy && capture === 'export' ? 'Exporting…' : 'Export PNG'}
            </GhostButton>
            <GhostButton onClick={exportSvg} disabled={busy}>
              <I n="download" s={14} c={SUB} w={1.8} /> {busy && capture === 'export-svg' ? 'Exporting…' : 'Export SVG'}
            </GhostButton>
          </div>
        </div>
      )}
      {capture && (
        <div aria-hidden="true" ref={hiddenRef} style={{ position: 'fixed', left: -10000, top: 0, width: CAP_W, height: CAP_H, background: '#FFFFFF', padding: 8, boxSizing: 'border-box', pointerEvents: 'none' }}>
          <Chart data={data.points} hasTs={data.hasTimestamps} units={data.units} palette={LIGHT_PALETTE} width={CAP_W - 16} height={CAP_H - 16} {...chartProps} />
        </div>
      )}
    </GlassCard>
  )
}

function MappingPanel({ columns, onApply }) {
  const [map, setMap] = useState(() => columns.map((c) => ({ role: c.role, param: c.param || '', unit: c.unit || '' })))
  const roles = ['unknown', 'timestamp', 'param', 'zone']
  return (
    <div style={{ marginTop: 12, borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={V3.T.captionDim}>Map each column, then apply to re-read the file.</div>
      {columns.map((c, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
          <span style={{ ...V3.T.caption, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.raw || `Column ${i + 1}`}</span>
          <Select value={map[i].role} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
          {map[i].role === 'param' ? (
            <Select value={map[i].param} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? { ...x, param: e.target.value } : x)))}>
              <option value="">param…</option>
              {SENSOR_PARAMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </Select>
          ) : <span />}
        </div>
      ))}
      <TactileButton variant="secondary" size="sm" onClick={() => {
        const mapping = {}
        map.forEach((m, i) => { mapping[i] = m.role === 'param' ? { role: 'param', param: m.param, unit: m.unit || (SENSOR_PARAMS.find((p) => p.key === m.param)?.unit) } : { role: m.role } })
        onApply(mapping)
      }}>Apply mapping</TactileButton>
    </div>
  )
}

const OCC_TONE = { occupied: '#10B981', unoccupied: '#94A3B8' }

// Tag occupied / unoccupied periods on the shared time axis. Time inputs +
// presets (mobile-friendly); windows are clamped to the data range and shade
// every timeline chart. Pure presentation — state lives in the envelope.
function OccupancyEditor({ windows, range, onChange }) {
  const fmtLocal = (ms) => dayjs(ms).format('YYYY-MM-DDTHH:mm')
  const [kind, setKind] = useState('occupied')
  const [startLocal, setStartLocal] = useState(fmtLocal(range.start))
  const [endLocal, setEndLocal] = useState(fmtLocal(range.end))
  const [label, setLabel] = useState('')
  const list = Array.isArray(windows) ? windows : []

  const add = (win) => onChange([...list, { id: `occ-${Date.now()}-${Math.round(Math.random() * 1e4)}`, ...win }])
  const addManual = () => {
    const s = dayjs(startLocal).valueOf()
    const e = dayjs(endLocal).valueOf()
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return
    const cs = Math.max(s, range.start)
    const ce = Math.min(e, range.end)
    if (ce <= cs) return
    add({ start: cs, end: ce, kind, label: label.trim() || (kind === 'occupied' ? 'Occupied' : 'Unoccupied') })
    setLabel('')
  }
  const addWhole = (k) => add({ start: range.start, end: range.end, kind: k, label: k === 'occupied' ? 'Occupied' : 'Unoccupied' })
  const addBusinessHours = () => {
    const next = []
    let day = dayjs(range.start).startOf('day')
    const last = dayjs(range.end)
    while (day.isBefore(last)) {
      const s = Math.max(day.hour(8).valueOf(), range.start)
      const e = Math.min(day.hour(18).valueOf(), range.end)
      if (e > s) next.push({ id: `occ-${day.valueOf()}`, start: s, end: e, kind: 'occupied', label: 'Business hours' })
      day = day.add(1, 'day')
    }
    if (next.length) onChange([...list, ...next])
  }
  const remove = (id) => onChange(list.filter((w) => w.id !== id))

  const inStyle = { padding: '8px 10px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }
  const summary = list.length ? `${list.length} period${list.length > 1 ? 's' : ''}` : 'None yet — mark occupied / unoccupied windows'
  return (
    <CollapsibleCard title="Occupancy periods" summary={summary} defaultOpen={list.length > 0}>
      {list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {list.map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: OCC_TONE[w.kind] || OCC_TONE.occupied, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...V3.T.caption, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.label}</div>
                <div style={V3.T.captionDim}>{fmtRange(w.start, w.end)}</div>
              </div>
              <GhostButton onClick={() => remove(w.id)} aria-label={`Remove ${w.label}`} style={{ padding: '4px 10px', minHeight: 30 }}>Remove</GhostButton>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <Chip onClick={addBusinessHours}>+ Business hours (8–18)</Chip>
        <Chip onClick={() => addWhole('occupied')}>+ Occupied (all)</Chip>
        <Chip onClick={() => addWhole('unoccupied')}>+ Unoccupied (all)</Chip>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Occupancy kind">
          <option value="occupied">Occupied</option>
          <option value="unoccupied">Unoccupied</option>
        </Select>
        <input type="datetime-local" value={startLocal} min={fmtLocal(range.start)} max={fmtLocal(range.end)} onChange={(e) => setStartLocal(e.target.value)} aria-label="Start" style={inStyle} />
        <input type="datetime-local" value={endLocal} min={fmtLocal(range.start)} max={fmtLocal(range.end)} onChange={(e) => setEndLocal(e.target.value)} aria-label="End" style={inStyle} />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" style={{ ...inStyle, flex: '1 1 140px', minWidth: 0 }} />
        <TactileButton variant="secondary" size="sm" onClick={addManual}>Add period</TactileButton>
      </div>
      <div style={{ ...V3.T.captionDim, marginTop: 8, lineHeight: 1.5 }}>
        Shading marks occupied (green) vs unoccupied (grey) periods on every timeline and the report image — context for interpretation, not a measurement.
      </div>
    </CollapsibleCard>
  )
}

// Manage the additional datasets (outdoor baseline + named zones) compared
// against the primary indoor logger. The primary itself is shown above in
// the file-summary card; this lists only the extras + the add control.
function DatasetManager({ datasets, onPickFor, onRemove, busy }) {
  const extras = datasets.filter((d) => d.role !== 'indoor')
  const hasOutdoor = datasets.some((d) => d.role === 'outdoor')
  const [role, setRole] = useState('zone')
  const [label, setLabel] = useState('')
  const add = () => {
    const l = role === 'outdoor' ? 'Outdoor' : (label.trim() || 'Zone')
    onPickFor({ role, label: l })
    setLabel('')
  }
  const summary = extras.length ? `${extras.length} added · ${extras.map((d) => d.label).join(', ')}` : 'Indoor only — add outdoor baseline or zones'
  return (
    <CollapsibleCard title="Compare datasets" summary={summary} defaultOpen={extras.length > 0}>
      {extras.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {extras.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
              <RoleBadge role={d.role}>{d.role === 'outdoor' ? 'Outdoor' : 'Zone'}</RoleBadge>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...V3.T.caption, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}{d.fileName && d.fileName !== d.label ? ` · ${d.fileName}` : ''}</div>
                <div style={V3.T.captionDim}>{(d.summary?.count ?? 0).toLocaleString()} readings · {(d.params || []).map((p) => SENSOR_PARAMS.find((s) => s.key === p)?.label || p).join(', ')}</div>
              </div>
              <GhostButton onClick={() => onRemove(d.id)} aria-label={`Remove ${d.label}`} style={{ padding: '6px 10px', minHeight: 32 }}>Remove</GhostButton>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Dataset role">
          <option value="outdoor" disabled={hasOutdoor}>Outdoor baseline{hasOutdoor ? ' (added)' : ''}</option>
          <option value="zone">Zone</option>
        </Select>
        {role === 'zone' && (
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Zone label (e.g. Conference Room A)"
            style={{ flex: '1 1 200px', minWidth: 0, padding: '8px 10px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        )}
        <TactileButton variant="secondary" size="sm" disabled={busy} onClick={add} icon={<I n="upload" s={13} c={ACCENT} w={2} />}>
          {busy ? 'Reading…' : 'Add file'}
        </TactileButton>
      </div>
      <div style={{ ...V3.T.captionDim, marginTop: 8, lineHeight: 1.5 }}>
        Add an outdoor CO₂ baseline to estimate ventilation, or upload zone files to compare the same parameter across locations.
      </div>
    </CollapsibleCard>
  )
}
