/**
 * AtmosFlow Qualitative Observation Module — FM Mode v2.2
 * Structured observation categories for non-numeric assessments.
 * Observations feed escalation tree and documentation, NOT the scoring engine.
 */

import { useState } from 'react'
import { I } from './Icons'

const CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380'

const ODOR_OPTIONS = [
  'None', 'Chemical / solvent', 'Chemical / cleaner', 'Musty / earthy',
  'Sewer / sulfur', 'Combustion / smoky', 'Biological / rotting',
  'New material off-gassing', 'Fragrance / perfume', 'Other',
]

const OBS_QUESTIONS = [
  { id: 'airFeel', q: 'How does the air feel?', ic: '💨',
    opts: ['Not assessed', 'Fresh', 'Stale', 'Stuffy', 'Drafty'] },
  { id: 'odors', q: 'Any odors present?', ic: '👃', multi: true, opts: ODOR_OPTIONS },
  { id: 'visibleParticulate', q: 'Visible dust or particles?', ic: '🌫️',
    opts: ['Not assessed', 'None', 'Light haze', 'Moderate dust', 'Heavy dust or debris'] },
  { id: 'thermalComfort', q: 'Temperature comfort?', ic: '🌡️',
    opts: ['Not assessed', 'Comfortable', 'Too hot', 'Too cold', 'Inconsistent zones'] },
  { id: 'humidity', q: 'Humidity feel?', ic: '💧',
    opts: ['Not assessed', 'Comfortable', 'Too dry', 'Too humid', 'Visible condensation'] },
  { id: 'hvacVisible', q: 'HVAC system condition?', ic: '❄️',
    opts: ['Not assessed', 'Running normal', 'Not running', 'Unusual noise', 'Visible damage', 'Dirty vents or returns'] },
  { id: 'waterMoisture', q: 'Water or moisture signs?', ic: '🚿',
    opts: ['Not assessed', 'None', 'Old staining', 'Active leak', 'Recent event'] },
  { id: 'visibleMold', q: 'Visible mold or suspected growth?', ic: '🦠',
    opts: ['Not assessed', 'None', 'Suspected small (< 10 sq ft)', 'Suspected large (10-100 sq ft)', 'Suspected extensive (> 100 sq ft)'] },
]

export function getObservationSchema() {
  return OBS_QUESTIONS
}

export function normalizeObservations(raw) {
  const obs = {}
  OBS_QUESTIONS.forEach(q => {
    if (q.multi) {
      obs[q.id] = raw[q.id] || []
    } else {
      obs[q.id] = raw[q.id] || 'not_assessed'
    }
  })
  obs.notes = raw.obs_notes || ''
  return obs
}

export default function QualitativeObservation({ data, onChange, step, onNext, onBack, totalSteps }) {
  const q = OBS_QUESTIONS[step]
  if (!q) return null

  const current = q.multi ? (data[q.id] || []) : (data[q.id] || '')

  const select = (val) => {
    if (q.multi) {
      const arr = data[q.id] || []
      onChange(q.id, arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
    } else {
      onChange(q.id, val)
      setTimeout(onNext, 250)
    }
  }

  return (
    <div>
      <div style={{ fontSize: 10, color: DIM, marginBottom: 6, fontFamily: "var(--font-mono)" }}>
        {step + 1} of {totalSteps}
      </div>
      <div style={{ fontSize: 9, color: ACCENT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
        Observations
      </div>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 6 }}>{q.ic}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 20, lineHeight: 1.3 }}>{q.q}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {q.opts.map((o, i) => {
          const sel = q.multi ? (current || []).includes(o) : current === o
          return (
            <button key={o} onClick={() => select(o)} style={{
              padding: '14px 18px', textAlign: 'left',
              background: sel ? `${ACCENT}12` : CARD,
              border: `1.5px solid ${sel ? ACCENT : BORDER}`,
              borderRadius: 12, color: sel ? ACCENT : TEXT, fontSize: 15,
              fontFamily: 'inherit', fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12, minHeight: 48,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: q.multi ? 4 : '50%',
                border: `2px solid ${sel ? ACCENT : '#2A3040'}`,
                background: sel ? ACCENT : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {sel && <span style={{ color: '#07080C', fontSize: 11, fontWeight: 700 }}>✓</span>}
              </div>
              {o}
            </button>
          )
        })}
      </div>

      {/* Notes */}
      <textarea
        value={data.obs_notes || ''} onChange={e => onChange('obs_notes', e.target.value)}
        placeholder="Additional notes (optional)..."
        rows={2} style={{
          width: '100%', marginTop: 12, padding: '10px 14px',
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
          color: TEXT, fontSize: 13, fontFamily: 'inherit', outline: 'none',
          resize: 'vertical', boxSizing: 'border-box',
        }}
      />

      {/* Navigation */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {step > 0 && (
          <button onClick={onBack} style={{ flex: 0, padding: '12px 20px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: SUB, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
        )}
        {q.multi && (
          <button onClick={onNext} style={{ flex: 1, padding: '12px 20px', background: ACCENT, border: 'none', borderRadius: 8, color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {step === totalSteps - 1 ? 'Finish Observations' : 'Next'}
          </button>
        )}
      </div>
    </div>
  )
}
