/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SensorDataPage — "Sensor Data / Environmental Evidence Graphs".
 * Upload a CSV logger export → detect/map columns → review data quality →
 * generate report-ready IAQ timelines → flag graphs for the report.
 *
 * Screening / documentation only. Graphs are provided for screening and
 * documentation purposes; interpretation should be reviewed by a
 * qualified IAQ professional.
 */

import { useRef, useState, useEffect } from 'react'
import * as V3 from '../../styles/tokens'
import { I } from '../Icons'
import GlassCard from '../ui/GlassCard'
import TactileButton from '../ui/TactileButton'
import { parseSensorRows, SENSOR_PARAMS } from '../../utils/sensorParser'
import { splitCsvLine } from '../../utils/labResultsParser'
import { xlsxToRows } from '../../utils/sensorXlsx'
import { GRAPH_DEFS, MultiParameterChart, LIGHT_PALETTE, DARK_PALETTE } from './SensorCharts'
import dayjs from 'dayjs'

const csvToRows = (text) => text.split(/\r\n?|\n/).filter((l) => l.trim().length > 0).map(splitCsvLine)

// Charts pass resolved hex (Recharts emits SVG attributes where var()
// won't resolve), so pick the palette from the live theme.
const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_PALETTE : DARK_PALETTE)

const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB
const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)', CARD = 'var(--card)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'

const QUALITY_TONE = { ok: V3.STATUS.ready, minor: '#FBBF24', uncertain: '#FBBF24', review: V3.DANGER }

const fmtRange = (s, e) => (s && e ? `${dayjs(s).format('MMM D, HH:mm')} – ${dayjs(e).format('MMM D, HH:mm')}` : 'Row order (no timestamps)')
const fmtInterval = (sec) => (sec == null ? '—' : sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : sec >= 60 ? `${Math.round(sec / 60)} min` : `${Math.round(sec)} s`)
// Compact average: integers above 100 (e.g. CO₂ ppm), one decimal below.
const fmtAvg = (v) => (v == null || !Number.isFinite(v) ? '—' : Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10))

export default function SensorDataPage({ value, onChange, onBack }) {
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [sourceRows, setSourceRows] = useState(null) // kept for re-mapping this session
  const [mapOpen, setMapOpen] = useState(false)
  const data = value || null

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
      setSourceRows(rows)
      onChange({ ...parsed, graphs: {} })
    } catch (err) {
      setError((err && err.message) || 'Could not read that file.')
    }
    setBusy(false)
  }

  const reparse = (mapping) => {
    if (!sourceRows) return
    const parsed = parseSensorRows(sourceRows, { fileName: data?.fileName, mapping })
    if (parsed) onChange({ ...parsed, mapping, graphs: data?.graphs || {} })
  }

  const setGraph = (id, patch) => {
    onChange({ ...data, graphs: { ...(data.graphs || {}), [id]: { ...(data.graphs?.[id] || {}), ...patch } } })
  }

  const clear = () => { setSourceRows(null); setError(null); onChange(null) }

  const graphs = data ? GRAPH_DEFS.filter((g) => g.needs(data.params)) : []
  const includedCount = data ? graphs.filter((g) => data.graphs?.[g.id]?.include).length : 0

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
          <div style={{ ...V3.T.h1, marginBottom: 2 }}>Sensor Data</div>
          <div style={V3.T.bodyDim}>Upload logger data and generate report-ready IAQ visuals.</div>
        </div>
      </div>

      {!data && (
        <GlassCard style={{ marginTop: 16, padding: '28px 24px', textAlign: 'center', animation: 'fadeUp .3s ease' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', background: `color-mix(in srgb, var(--accent) 10%, transparent)`, border: `1px solid color-mix(in srgb, var(--accent) 22%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <I n="upload" s={22} c={ACCENT} w={1.8} />
          </div>
          <div style={{ ...V3.T.h3, marginBottom: 6 }}>Upload Logger Data</div>
          <div style={{ ...V3.T.bodyDim, maxWidth: 460, margin: '0 auto 18px' }}>
            CSV or XLSX exports from TSI Q-Trak, HOBO, Aeroqual, GrayWolf, Airthings, and most loggers. AtmosFlow detects timestamp, CO₂, temperature, RH, PM, TVOC and CO columns automatically.
          </div>
          {error && <div style={{ ...errBox, marginBottom: 14 }}>{error}</div>}
          <TactileButton variant="primary" size="lg" pill disabled={busy} onClick={() => fileRef.current?.click()} icon={<I n="upload" s={15} c="var(--on-accent-fill)" w={2} />}>
            {busy ? 'Reading…' : 'Upload Logger Data'}
          </TactileButton>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onPick} style={{ display: 'none' }} aria-hidden="true" />
        </GlassCard>
      )}

      {data && (
        <>
          {error && <div style={{ ...errBox, marginTop: 14 }}>{error}</div>}
          {/* File summary */}
          <GlassCard style={{ marginTop: 16, animation: 'fadeUp .3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...V3.T.bodyStrong, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{data.fileName || 'Logger data'}</div>
                <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{fmtRange(data.summary.start, data.summary.end)}</div>
              </div>
              <button onClick={() => fileRef.current?.click()} style={ghostBtn}>Replace</button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onPick} style={{ display: 'none' }} aria-hidden="true" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginTop: 14 }}>
              <Stat label="Readings" value={data.summary.count.toLocaleString()} />
              <Stat label="Interval" value={fmtInterval(data.summary.intervalSec)} />
              <Stat label="Parameters" value={data.params.length} />
              <Stat label="Empty rows" value={data.summary.emptyRows} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
              {data.params.map((p) => {
                const spec = SENSOR_PARAMS.find((s) => s.key === p)
                return <span key={p} style={chip}>{spec?.label || p}{data.units[p] ? ` · ${data.units[p]}` : ''}</span>
              })}
            </div>
            {data.summary.stats && data.params.some((p) => data.summary.stats[p]) && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                <div style={{ ...V3.T.micro, marginBottom: 8 }}>Averages</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                  {data.params.map((p) => {
                    const s = data.summary.stats[p]
                    if (!s) return null
                    const spec = SENSOR_PARAMS.find((x) => x.key === p)
                    const u = data.units[p] || spec?.unit || ''
                    return (
                      <div key={p} style={{ padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, fontFamily: 'var(--font-mono)', letterSpacing: '-0.3px' }}>
                          {fmtAvg(s.mean)} <span style={{ fontSize: 11, fontWeight: 600, color: DIM }}>{u}</span>
                        </div>
                        <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{spec?.label || p} · mean</div>
                        <div style={{ fontSize: 11, color: DIM, marginTop: 2, fontFamily: 'var(--font-mono)' }}>{fmtAvg(s.min)}–{fmtAvg(s.max)} · n={s.n}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <button onClick={() => setMapOpen((v) => !v)} style={{ ...ghostBtn, marginTop: 14, width: '100%', justifyContent: 'center' }}>
              {mapOpen ? 'Hide column mapping' : 'Adjust column mapping'}
            </button>
            {mapOpen && sourceRows && <MappingPanel columns={data.columns} onApply={(m) => { reparse(m); setMapOpen(false) }} />}
          </GlassCard>

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

          {/* Graph gallery */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '20px 2px 10px' }}>
            <div style={V3.T.micro}>Graphs{graphs.length ? ` · ${graphs.length}` : ''}</div>
            <div style={V3.T.captionDim}>{includedCount} in report</div>
          </div>
          {graphs.length === 0 ? (
            <GlassCard style={{ textAlign: 'center', padding: '28px 20px' }}>
              <div style={V3.T.bodyDim}>No chartable IAQ parameters detected. Use “Adjust column mapping” to map your columns.</div>
            </GlassCard>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {graphs.map((g) => (
                <GraphCard key={g.id} def={g} data={data} state={data.graphs?.[g.id] || {}} onState={(patch) => setGraph(g.id, patch)} />
              ))}
            </div>
          )}
          {data.params.length >= 2 && <MultiParamSection data={data} state={data.graphs?.multi || {}} onState={(patch) => setGraph('multi', patch)} />}
          <button onClick={clear} style={{ ...ghostBtn, marginTop: 18, color: V3.DANGER, borderColor: `color-mix(in srgb, var(--danger) 30%, transparent)` }}>Remove sensor data</button>
        </>
      )}
    </div>
  )
}

const CAP_W = 680, CAP_H = 300

// Compare up to 3 detected parameters on one normalized timeline. Changing
// the selection invalidates any captured image (so the report figure always
// matches the shown selection).
function MultiParamSection({ data, state, onState }) {
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
        {data.params.map((k) => {
          const on = selected.includes(k)
          return (
            <button key={k} onClick={() => toggleParam(k)} aria-pressed={on}
              style={{ ...chip, cursor: 'pointer', color: on ? ACCENT : SUB, borderColor: on ? ACCENT : BORDER, background: on ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)' }}>
              {on ? '✓ ' : ''}{labelOf(k)}
            </button>
          )
        })}
      </div>
      <GraphCard def={def} data={data} state={state} onState={onState} chartProps={{ params: selected }} />
    </div>
  )
}

function GraphCard({ def, data, state, onState, chartProps = {} }) {
  const hiddenRef = useRef(null)
  const [capture, setCapture] = useState(null) // null | 'include' | 'export' | 'export-svg'
  const [busy, setBusy] = useState(false)
  const { Chart } = def
  const pal = currentPalette()

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
    if (state.include) { onState({ include: false, imageDataUrl: null }); return }
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
      <div style={{ padding: '0 18px 16px' }}>
        <textarea value={state.caption || ''} onChange={(e) => onState({ caption: e.target.value })} placeholder="Caption (e.g. CO₂ rose during occupied periods and declined after apparent occupancy reduction — interpret with site observations)."
          rows={2} style={{ width: '100%', padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button onClick={exportPng} disabled={busy} style={ghostBtn}>
            <I n="download" s={14} c={SUB} w={1.8} /> {busy && capture === 'export' ? 'Exporting…' : 'Export PNG'}
          </button>
          <button onClick={exportSvg} disabled={busy} style={ghostBtn}>
            <I n="download" s={14} c={SUB} w={1.8} /> {busy && capture === 'export-svg' ? 'Exporting…' : 'Export SVG'}
          </button>
        </div>
      </div>
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
          <select value={map[i].role} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} style={sel}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {map[i].role === 'param' ? (
            <select value={map[i].param} onChange={(e) => setMap((m) => m.map((x, j) => (j === i ? { ...x, param: e.target.value } : x)))} style={sel}>
              <option value="">param…</option>
              {SENSOR_PARAMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
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

function Stat({ label, value }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: TEXT, fontFamily: 'var(--font-mono)', letterSpacing: '-0.3px' }}>{value}</div>
      <div style={{ ...V3.T.captionDim, marginTop: 2 }}>{label}</div>
    </div>
  )
}

const errBox = { padding: '10px 12px', background: `color-mix(in srgb, var(--danger) 10%, transparent)`, border: `1px solid color-mix(in srgb, var(--danger) 28%, transparent)`, borderRadius: 10, color: 'var(--danger)', fontSize: 12, lineHeight: 1.5 }
const ghostBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 10, color: SUB, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 38, WebkitTapHighlightColor: 'transparent' }
const chip = { fontSize: 11, fontWeight: 600, color: SUB, padding: '4px 10px', borderRadius: 999, background: 'var(--surface)', border: `1px solid ${BORDER}` }
const sel = { padding: '6px 8px', background: 'var(--surface)', border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 12, fontFamily: 'inherit', appearance: 'auto' }
