/**
 * InstrumentLogImport — Play 4a UI surface.
 *
 * Self-contained import flow that sits next to the SensorScreen.
 * Assessor uploads a CSV exported from their connected instrument
 * (TSI Q-Trak, Aeroqual, Graywolf, etc.); the parser aggregates
 * the time-series; the assessor reviews the mean / median / p95 /
 * max preview; tap "Apply mean values" merges the values into the
 * current zone's sensor fields via the onApply(recommendedReadings)
 * callback.
 *
 * The full series (every reading) is NOT persisted — only the
 * aggregates flow into the assessment. That keeps the storage
 * shape compatible with the existing spot-reading data model and
 * avoids inflating the assessment JSON. The instrument log itself
 * can be retained in the project record outside AtmosFlow if the
 * IH wants the raw series.
 *
 * Defensibility framing: every applied value carries a one-line
 * audit attribution (instrument detected, sample count, source
 * filename) the IH can reference when reviewing the report.
 */

import { useRef, useState } from 'react'
import {
  parseSensorCsv,
  parseSensorRows,
  sensorAveragesToFields,
  normalizeSensorData,
  SENSOR_DATA_VERSION,
} from '../utils/sensorParser'
import { xlsxToRows } from '../utils/sensorXlsx'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SURFACE = 'var(--surface)'
const SUCCESS = 'var(--success)'
const DANGER = 'var(--danger)'

const PARAM_LABEL = {
  co2: 'CO₂',
  co: 'CO',
  tf: 'Temp',
  rh: 'RH',
  pm: 'PM2.5',
  tv: 'TVOC',
  hc: 'HCHO',
}
const PARAM_UNIT = {
  co2: 'ppm',
  co: 'ppm',
  tf: '°F',
  rh: '%',
  pm: 'µg/m³',
  tv: 'µg/m³',
  hc: 'ppm',
}

// Per-parameter mean/median/p95/max from the dataset's points array. The
// sensorParser populates summary.stats with mean/median/min/max but not
// p95, and the preview table needs p95 so the assessor can spot a mean
// masked by a spike — compute all four here so the table column set
// stays consistent across CSV and XLSX inputs.
function quantile(sorted, q) {
  if (!sorted.length) return null
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}
function aggregate(values) {
  const finite = (values || []).filter((v) => Number.isFinite(v))
  if (!finite.length) return null
  const sorted = [...finite].sort((a, b) => a - b)
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length
  return { mean, median: quantile(sorted, 0.5), p95: quantile(sorted, 0.95), max: sorted[sorted.length - 1] }
}

function fmt(value, paramId) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  if (paramId === 'hc') return value.toFixed(3)
  if (paramId === 'tf' || paramId === 'rh') return value.toFixed(1)
  return Math.round(value).toString()
}

export default function InstrumentLogImport({ onApply, isCompact }) {
  const fileRef = useRef(null)
  const [filename, setFilename] = useState('')
  const [parsed, setParsed] = useState(null)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleFile = async (e) => {
    setError('')
    setParsed(null)
    setApplied(false)
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const isXlsx = /\.xlsx$/i.test(file.name)
    try {
      // Use the same parser as Logger Studio for both CSV and XLSX so this
      // inline import surfaces the same files in the OS picker and accepts
      // the same shapes. xlsxToRows is no-extra-deps (jszip + DOMParser);
      // parseSensorRows / parseSensorCsv produce identical dataset shapes.
      const parsedDataset = isXlsx
        ? parseSensorRows(await xlsxToRows(file), { fileName: file.name })
        : parseSensorCsv(await file.text(), { fileName: file.name })
      if (!parsedDataset) {
        setError('Could not parse the file. It needs at least a timestamp/row column + one recognised parameter column.')
        return
      }
      // Wrap as a single-dataset envelope so sensorAveragesToFields can
      // produce the field-keyed mean values that map straight into the
      // zone's sensor inputs — same flow as Logger Studio's Send-to-Report.
      const envelope = normalizeSensorData({
        version: SENSOR_DATA_VERSION,
        datasets: [{ id: 'primary', role: 'indoor', label: 'Indoor', ...parsedDataset }],
        graphs: {},
      })
      const { fields: rawFields, details } = sensorAveragesToFields(envelope, { stat: 'mean', tvocRef: 'isobutylene' })
      // sensorAveragesToFields hands back display-rounded strings (its
      // primary caller fills text inputs). MobileApp.onApply filters by
      // Number.isFinite before writing into the zone, so coerce to numbers.
      const fields = {}
      for (const [k, v] of Object.entries(rawFields || {})) {
        const n = Number(v)
        if (Number.isFinite(n)) fields[k] = n
      }
      // Build per-field aggregates for the preview table by sampling each
      // active parameter's values out of the dataset's points. details
      // tells us which sensorParser param maps to which sensor field.
      const points = parsedDataset.points || []
      const parameters = {}
      for (const d of details || []) {
        const agg = aggregate(points.map((p) => p[d.param]))
        if (agg) parameters[d.field] = agg
      }
      const result = {
        sampleCount: parsedDataset.rawCount || (parsedDataset.points || []).length,
        instrument: null,
        parameters,
        recommendedReadings: fields,
        warnings: [],
        unmappedColumns: (parsedDataset.columns || []).filter((c) => c.role === 'unknown').map((c) => c.raw),
      }
      setParsed(result)
      if (Object.keys(parameters).length === 0) {
        setError('No recognised IAQ parameter columns were found (CO₂ / Temp / RH / PM2.5 / TVOC / CO / HCHO).')
      } else if (result.sampleCount === 0) {
        setError('No sample rows were parsed from the file.')
      }
    } catch (err) {
      console.error('[instrument-log] parse failed', err)
      setError(err?.message || (isXlsx
        ? 'Could not read the XLSX. Try exporting as CSV from your meter.'
        : 'Could not read the CSV. Confirm the file is valid UTF-8 text.'))
    } finally {
      if (e.target) e.target.value = ''
    }
  }

  const handleApply = () => {
    if (!parsed || !onApply) return
    const payload = {
      readings: parsed.recommendedReadings,
      meta: {
        source: 'instrument_log',
        filename: filename || null,
        instrument: parsed.instrument,
        sampleCount: parsed.sampleCount,
        importedAt: new Date().toISOString(),
      },
    }
    onApply(payload)
    setApplied(true)
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          marginTop: 8,
          padding: '8px 12px',
          background: 'transparent',
          border: `1px dashed ${BORDER}`,
          borderRadius: 8,
          color: ACCENT,
          fontSize: 11,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          width: isCompact ? 'auto' : '100%',
        }}
      >
        + Import instrument log (Q-Trak / Aeroqual / Graywolf · CSV or XLSX)
      </button>
    )
  }

  return (
    <div
      data-testid="instrument-log-import"
      style={{
        marginTop: 8,
        padding: 14,
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Import instrument log</div>
        <button
          onClick={() => { setExpanded(false); setParsed(null); setError(''); setApplied(false); setFilename('') }}
          style={{ background: 'transparent', border: 'none', color: DIM, fontSize: 16, cursor: 'pointer', padding: 0 }}
          aria-label="Close importer"
        >
          ×
        </button>
      </div>
      <div style={{ fontSize: 11, color: SUB, lineHeight: 1.5, marginBottom: 10 }}>
        Upload a CSV or XLSX from a connected IAQ meter (TSI Q-Trak / IAQ-Calc, Aeroqual S500, Graywolf, Testo, etc.).
        The parser aggregates the time-series and pre-fills the spot readings below. Raw series is
        not stored — only the aggregates.
      </div>

      <input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            padding: '8px 14px',
            background: 'var(--accent-fill)',
            border: 'none',
            borderRadius: 8,
            color: 'var(--on-accent-fill)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {filename ? 'Choose different file…' : 'Choose CSV or XLSX…'}
        </button>
        {filename && <span style={{ alignSelf: 'center', fontSize: 11, color: SUB }}>{filename}</span>}
      </div>

      {error && (
        <div style={{
          padding: '8px 10px',
          marginBottom: 10,
          background: `${DANGER}12`,
          border: `1px solid ${DANGER}30`,
          borderRadius: 6,
          color: DANGER,
          fontSize: 11,
        }}>{error}</div>
      )}

      {applied && (
        <div style={{
          padding: '8px 10px',
          marginBottom: 10,
          background: `${SUCCESS}12`,
          border: `1px solid ${SUCCESS}30`,
          borderRadius: 6,
          color: SUCCESS,
          fontSize: 11,
        }}>
          Applied {Object.keys(parsed?.recommendedReadings || {}).length} aggregated values to the sensor fields.
          Spot inputs above are now populated.
        </div>
      )}

      {parsed && parsed.sampleCount > 0 && (
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: SUB, marginBottom: 6 }}>
            {parsed.instrument ? <><strong style={{ color: TEXT }}>{parsed.instrument}</strong> · </> : null}
            {parsed.sampleCount} sample row{parsed.sampleCount === 1 ? '' : 's'} parsed
            {parsed.unmappedColumns.length > 0 ? ` · ${parsed.unmappedColumns.length} unmapped column${parsed.unmappedColumns.length === 1 ? '' : 's'}` : ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ color: DIM }}>
                <th style={{ textAlign: 'left', padding: '4px 6px' }}>Parameter</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Mean</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Median</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>p95</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Max</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(parsed.parameters).map(([paramId, agg]) => (
                <tr key={paramId} style={{ borderTop: `1px solid ${BORDER}` }}>
                  <td style={{ padding: '4px 6px', color: TEXT, fontWeight: 600 }}>
                    {PARAM_LABEL[paramId]} <span style={{ fontSize: 9, color: DIM }}>{PARAM_UNIT[paramId]}</span>
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: TEXT, fontFamily: 'var(--font-mono)' }}>{fmt(agg.mean, paramId)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: SUB, fontFamily: 'var(--font-mono)' }}>{fmt(agg.median, paramId)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: SUB, fontFamily: 'var(--font-mono)' }}>{fmt(agg.p95, paramId)}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', color: SUB, fontFamily: 'var(--font-mono)' }}>{fmt(agg.max, paramId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: DIM, marginTop: 8, lineHeight: 1.5 }}>
            Mean is applied to the sensor fields. Median, p95, and max are shown so you can see
            whether the mean is masking a spike. If p95 ≫ mean, prefer recording the p95 with
            a note about the spike pattern.
          </div>
        </div>
      )}

      {parsed && parsed.sampleCount > 0 && !applied && (
        <button
          onClick={handleApply}
          style={{
            padding: '10px 16px',
            background: 'var(--accent-fill)',
            border: 'none',
            borderRadius: 8,
            color: 'var(--on-accent-fill)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
            width: '100%',
          }}
        >
          Apply mean values to sensor fields
        </button>
      )}
    </div>
  )
}
