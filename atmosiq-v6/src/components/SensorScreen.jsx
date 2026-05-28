/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { useState } from 'react'
import { SENSOR_FIELDS } from '../constants/questions'
import { SENSOR_PARAMS, TVOC_REFERENCES, ppbToUgm3, ugm3ToPpb, sensorAveragesToFields } from '../utils/sensorParser'
import { mix } from '../utils/theme'

const paramLabel = (key) => SENSOR_PARAMS.find((p) => p.key === key)?.label || key
const fieldUnit = (id) => SENSOR_FIELDS.find((f) => f.id === id)?.u || ''

const miniSelect = { padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', appearance: 'auto', minHeight: 38 }
const miniInput = { width: 84, padding: '8px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', minHeight: 38 }

export default function SensorScreen({ data, onChange, sensorData, isDesktop, showOutdoor = true }) {
  // TVOC reference compound for ppb/ppm → µg/m³ (shared by the logger
  // auto-fill and the manual converter below the TVOC field).
  const [tvocRef, setTvocRef] = useState('isobutylene')
  const [tvocIn, setTvocIn] = useState({ val: '', unit: 'ppb' })

  // Logger averages → reading fields. Empty when no usable log is loaded.
  const { fields: avgFields, details, skipped } = sensorAveragesToFields(sensorData, { stat: 'mean', tvocRef })
  const hasAverages = details.length > 0

  const applyAverages = () => {
    const ids = Object.keys(avgFields)
    const occupied = ids.filter((id) => String(data[id] ?? '').trim() !== '')
    let overwrite = true
    if (occupied.length) {
      overwrite = window.confirm(
        `${occupied.length} field${occupied.length > 1 ? 's' : ''} already ${occupied.length > 1 ? 'have' : 'has'} a value. ` +
        'Click OK to overwrite with the sensor-log averages, or Cancel to keep your entries and fill only the blanks.'
      )
    }
    ids.forEach((id) => {
      const isEmpty = String(data[id] ?? '').trim() === ''
      if (isEmpty || overwrite) onChange(id, avgFields[id])
    })
  }

  // Live result of the manual TVOC converter (µg/m³), or null when invalid.
  const tvocConverted = (() => {
    const v = Number(tvocIn.val)
    if (tvocIn.val === '' || !Number.isFinite(v)) return null
    const ug = ppbToUgm3(tvocIn.unit === 'ppm' ? v * 1000 : v, TVOC_REFERENCES[tvocRef].mw)
    return ug == null ? null : Math.round(ug)
  })()

  // ppb-equivalent of the µg/m³ value currently entered in the TVOC field, so
  // ppb-native instrument users see a familiar number. µg/m³ stays canonical.
  const tvocPpbEquiv = (() => {
    const v = Number(data.tv)
    if (String(data.tv ?? '').trim() === '' || !Number.isFinite(v)) return null
    const ppb = ugm3ToPpb(v, TVOC_REFERENCES[tvocRef].mw)
    return ppb == null ? null : Math.round(ppb)
  })()

  return (
    <div style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? '1fr 1fr' : undefined, flexDirection: isDesktop ? undefined : 'column', gap: isDesktop ? 16 : 12 }}>
      <div style={{ padding: '12px 16px', background: mix('accent', 3), border: `1px solid ${mix('accent', 13)}`, borderRadius: 10, fontSize: 14, color: 'var(--accent)', gridColumn: isDesktop ? '1 / -1' : undefined }}>
        📏 Enter all available readings. Leave blank if not measured.
      </div>

      {hasAverages && (
        <div style={{ padding: '14px 16px', background: mix('accent', 5), border: `1px solid ${mix('accent', 19)}`, borderRadius: 10, gridColumn: isDesktop ? '1 / -1' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>📊 Auto-fill from sensor log</div>
            <button type="button" onClick={applyAverages}
              style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#04141a', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', minHeight: 36 }}>
              Fill fields with averages
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {details.map((d) => (
              <span key={d.field} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '4px 10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
                {paramLabel(d.param)} <strong>{d.value}</strong> {fieldUnit(d.field)}{d.note ? ` ·${d.note}` : ''}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>
            Mean of logged readings. Existing entries are preserved unless you confirm overwrite.
            {skipped.length > 0 && ` ${skipped.map((s) => `${paramLabel(s.param)} not auto-filled (${s.reason})`).join('; ')}.`}
          </div>
        </div>
      )}

      {!showOutdoor && (
        <div style={{ padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--dim)', gridColumn: isDesktop ? '1 / -1' : undefined }}>
          🌍 Outdoor baseline (CO₂ · temp · RH · PM2.5 · TVOC) is captured once on the first zone and applies to every zone — enter indoor readings only here.
        </div>
      )}

      {SENSOR_FIELDS.filter(sf => showOutdoor || !sf.outdoor).map(sf => (
        <div key={sf.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{sf.label}</div>
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>{sf.ref}</div>
            </div>
            <div style={{ position: 'relative', width: 140 }}>
              <input type="number" value={data[sf.id] || ''} onChange={e => onChange(sf.id, e.target.value)}
                style={{ width: '100%', padding: '12px 14px', paddingRight: 44, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 16, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.2s ease' }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 20px rgba(34,211,238,0.15)' }}
                onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none' }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>{sf.u}</span>
            </div>
          </div>

          {sf.id === 'tv' && tvocPpbEquiv != null && (
            <div style={{ fontSize: 12, color: 'var(--dim)', fontFamily: 'var(--font-mono)', textAlign: 'right', marginTop: -4 }}>
              ≈ {tvocPpbEquiv} ppb ({TVOC_REFERENCES[tvocRef].label.toLowerCase()}-equiv)
            </div>
          )}

          {sf.id === 'tv' && (
            <div style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--sub)', letterSpacing: '0.3px', textTransform: 'uppercase', marginBottom: 8 }}>TVOC unit converter</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <input type="number" inputMode="decimal" value={tvocIn.val} placeholder="value"
                  onChange={e => setTvocIn(s => ({ ...s, val: e.target.value }))} style={miniInput} />
                <select value={tvocIn.unit} onChange={e => setTvocIn(s => ({ ...s, unit: e.target.value }))} style={miniSelect} aria-label="Input unit">
                  <option value="ppb">ppb</option>
                  <option value="ppm">ppm</option>
                </select>
                <select value={tvocRef} onChange={e => setTvocRef(e.target.value)} style={miniSelect} aria-label="Reference compound">
                  {Object.entries(TVOC_REFERENCES).map(([key, r]) => (
                    <option key={key} value={key}>{r.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: 14, color: 'var(--dim)' }}>=</span>
                <strong style={{ fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-mono)', minWidth: 64 }}>
                  {tvocConverted == null ? '—' : tvocConverted} <span style={{ fontSize: 11, color: 'var(--dim)', fontWeight: 400 }}>µg/m³</span>
                </strong>
                <button type="button" disabled={tvocConverted == null} onClick={() => onChange('tv', String(tvocConverted))}
                  style={{ padding: '8px 14px', background: tvocConverted == null ? 'var(--card)' : 'var(--accent)', border: tvocConverted == null ? '1px solid var(--border)' : 'none', borderRadius: 8, color: tvocConverted == null ? 'var(--dim)' : '#04141a', fontSize: 13, fontWeight: 700, cursor: tvocConverted == null ? 'default' : 'pointer', fontFamily: 'inherit', minHeight: 38 }}>
                  Use
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8, lineHeight: 1.5 }}>
                Converts to µg/m³ as {TVOC_REFERENCES[tvocRef].label.toLowerCase()}-equivalent (MW {TVOC_REFERENCES[tvocRef].mw}), at 25 °C / 1 atm. PIDs typically calibrate to isobutylene.
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
