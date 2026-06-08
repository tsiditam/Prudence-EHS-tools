/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * IncidentForm — fast capture for an indoor air event/emergency.
 * Single-page scrollable layout (target <3 min completion) with five
 * logical sections. No scoring, no calibration gate, no engine path —
 * pure observational documentation per the screening-only positioning.
 */

import { useState } from 'react'
import STO from '../utils/storage'
import { COMPLAINT_SYMPTOMS } from '../constants/terminology'
import { mix } from '../utils/theme'
import VoiceInputButton, { appendWithSpace } from './VoiceInputButton'

const BG = 'var(--bg)'
const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'

// Trigger types — subset of Q_PRESURVEY.ps_reason (incident-only)
// plus emergency-specific entries. Order: emergency-first so users
// see the urgent categories at the top.
export const INCIDENT_TRIGGERS = [
  'CO alarm / detector',
  'Suspected gas leak',
  'Chemical release / spill',
  'Smoke / fire aftermath',
  'Sewer gas event',
  'Water intrusion event',
  'HVAC failure',
  'Odor event',
  'Occupant complaint(s)',
  'Post-renovation / construction',
  'Other',
]

const EMERGENCY_TRIGGERS = new Set([
  'CO alarm / detector',
  'Suspected gas leak',
  'Chemical release / spill',
  'Smoke / fire aftermath',
  'Sewer gas event',
])

export const INCIDENT_SEVERITIES = [
  { value: 'minor', label: 'Minor', sub: 'Comfort concern only' },
  { value: 'moderate', label: 'Moderate', sub: 'Symptoms reported' },
  { value: 'significant', label: 'Significant', sub: 'Multiple occupants affected' },
  { value: 'severe', label: 'Severe', sub: 'Medical attention sought' },
  { value: 'critical', label: 'Critical', sub: 'Evacuation or work stoppage' },
]

const ACTIONS = [
  'Evacuated affected area',
  'Ventilated / opened windows',
  'Isolated / sealed off area',
  'Contacted facility maintenance',
  'Contacted 911 / emergency services',
  'Notified building occupants',
  'Shut down HVAC system',
  'No action yet',
]

const inp = {
  width: '100%', padding: '12px 14px', background: BG,
  border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT,
  fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}
const labelStyle = { fontSize: 11, fontWeight: 600, color: SUB, marginBottom: 6, display: 'block', letterSpacing: '0.2px' }
const sectionHeader = {
  fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase',
  letterSpacing: '0.8px', marginTop: 28, marginBottom: 12,
  paddingBottom: 8, borderBottom: `1px solid ${BORDER}`,
}

function Chip({ selected, label, onClick, danger }) {
  const c = danger ? DANGER : ACCENT
  return (
    <button onClick={onClick} style={{
      padding: '8px 14px', borderRadius: 8,
      background: selected ? `${c}15` : 'transparent',
      border: `1px solid ${selected ? c : BORDER}`,
      color: selected ? c : SUB,
      fontSize: 12, fontWeight: selected ? 600 : 500, cursor: 'pointer',
      fontFamily: 'inherit', minHeight: 36, transition: 'all 0.15s',
    }}>
      {selected && <span style={{ marginRight: 4 }}>✓</span>}{label}
    </button>
  )
}

export default function IncidentForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({
    trigger_type: '',
    reported_at: new Date().toISOString().slice(0, 16), // local datetime-local format
    building_name: '',
    location: '',
    observations: '',
    symptoms: [],
    severity: '',
    reporter_name: '',
    reporter_role: '',
    medical_attention: false,
    actions_taken: [],
    actions_taken_other: '',
    photo_ids: [],
  })
  const [saving, setSaving] = useState(false)

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const toggle = (k, v) => setForm(prev => {
    const cur = prev[k] || []
    return { ...prev, [k]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v] }
  })

  const onFile = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 4 - (form.photo_ids?.length || 0))
    if (files.length === 0) return
    const datas = await Promise.all(files.map(file => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })))
    f('photo_ids', [...(form.photo_ids || []), ...datas])
    e.target.value = ''
  }

  const canSave = form.trigger_type && form.location && form.observations && form.severity && form.reporter_name

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    const now = new Date().toISOString()
    const incident = {
      id: 'inc-' + Date.now().toString(36),
      building_id: form.building_name || '',
      building_name: form.building_name || '',
      reported_at: form.reported_at ? new Date(form.reported_at).toISOString() : now,
      reporter_name: form.reporter_name.trim(),
      reporter_role: form.reporter_role.trim(),
      trigger_type: form.trigger_type,
      severity: form.severity,
      location: form.location.trim(),
      observations: form.observations.trim(),
      symptoms: form.symptoms,
      medical_attention: !!form.medical_attention,
      actions_taken: form.actions_taken,
      actions_taken_other: form.actions_taken_other.trim(),
      photo_ids: form.photo_ids,
      status: 'open',
      linked_assessment_ids: [],
      created_at: now,
      updated_at: now,
    }
    const saved = await STO.saveIncident(incident)
    setSaving(false)
    onSaved?.(saved || incident)
  }

  const isEmergency = EMERGENCY_TRIGGERS.has(form.trigger_type)

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Cancel</button>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 4, letterSpacing: '-0.3px' }}>Incident Response</h2>
      <div style={{ fontSize: 12, color: SUB, marginBottom: 4 }}>
        Fast capture of an indoor air event. Documentation only, not a substitute for emergency services or a full IAQ assessment.
      </div>

      {/* Section: Trigger */}
      <div style={sectionHeader}>What happened</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {INCIDENT_TRIGGERS.map(t => (
          <Chip key={t} label={t} selected={form.trigger_type === t} onClick={() => f('trigger_type', t)} danger={EMERGENCY_TRIGGERS.has(t)} />
        ))}
      </div>
      {isEmergency && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: `${mix('danger', 6)}`, border: `1px solid ${mix('danger', 25)}`, borderRadius: 8, fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
          <strong style={{ color: DANGER }}>⚠ Emergency type selected.</strong> If there is imminent danger to occupants, contact 911 or your building emergency services <strong>before</strong> continuing to document. AtmosFlow does not provide emergency response.
        </div>
      )}

      {/* Section: Time & place */}
      <div style={sectionHeader}>When & where</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Date & time</label>
          <input type="datetime-local" value={form.reported_at} onChange={e => f('reported_at', e.target.value)} style={inp} />
        </div>
        <div>
          <label style={labelStyle}>Building (optional)</label>
          <input value={form.building_name} onChange={e => f('building_name', e.target.value)} placeholder="e.g. Meridian Commerce Tower" style={inp} />
        </div>
        <div>
          <label style={labelStyle}>Location within building <span style={{ color: DANGER }}>*</span></label>
          <input value={form.location} onChange={e => f('location', e.target.value)} placeholder="e.g. 3rd floor mechanical room" style={inp} />
        </div>
      </div>

      {/* Section: Description */}
      <div style={sectionHeader}>What you observed</div>
      <label style={labelStyle}>Observations <span style={{ color: DANGER }}>*</span></label>
      {/* Description with inline dictation. The mic button anchors
          in the bottom-right of the textarea; right-side padding
          on the textarea keeps typed content out from under it.
          Both inp's existing padding and the override here ship
          via the spread; the wrapper handles the layout. */}
      <div style={{ position: 'relative' }}>
        <textarea
          value={form.observations}
          onChange={e => f('observations', e.target.value)}
          placeholder="Describe what you saw, smelled, or measured. Include any device readings if available."
          rows={4}
          style={{ ...inp, paddingRight: 52, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ position: 'absolute', right: 8, bottom: 8 }}>
          <VoiceInputButton
            ariaLabel="Dictate observations"
            size={36}
            onTranscript={(text) => f('observations', appendWithSpace(form.observations || '', text))}
          />
        </div>
      </div>
      <div style={{ ...labelStyle, marginTop: 12 }}>Symptoms reported by occupants</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {COMPLAINT_SYMPTOMS.map(s => (
          <Chip key={s} label={s} selected={form.symptoms.includes(s)} onClick={() => toggle('symptoms', s)} />
        ))}
      </div>

      {/* Section: Severity & reporter */}
      <div style={sectionHeader}>Severity & reporter</div>
      <label style={labelStyle}>Severity <span style={{ color: DANGER }}>*</span></label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {INCIDENT_SEVERITIES.map(s => (
          <button key={s.value} onClick={() => f('severity', s.value)} style={{
            padding: '10px 14px', textAlign: 'left',
            background: form.severity === s.value ? `${mix('accent', 6)}` : 'transparent',
            border: `1px solid ${form.severity === s.value ? ACCENT : BORDER}`,
            borderRadius: 8, color: form.severity === s.value ? TEXT : SUB,
            fontSize: 13, fontWeight: form.severity === s.value ? 600 : 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{s.sub}</div>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
        <div>
          <label style={labelStyle}>Reporter name <span style={{ color: DANGER }}>*</span></label>
          <input value={form.reporter_name} onChange={e => f('reporter_name', e.target.value)} placeholder="Your name" style={inp} />
        </div>
        <div>
          <label style={labelStyle}>Role (optional)</label>
          <input value={form.reporter_role} onChange={e => f('reporter_role', e.target.value)} placeholder="e.g. CIH, Facility manager" style={inp} />
        </div>
      </div>
      <label style={{ fontSize: 12, color: SUB, display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={form.medical_attention} onChange={e => f('medical_attention', e.target.checked)} style={{ cursor: 'pointer' }} />
        Medical attention sought
      </label>

      {/* Section: Actions taken */}
      <div style={sectionHeader}>Actions already taken</div>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 8 }}>Descriptive: what's been done on-site. AtmosFlow does not prescribe emergency actions.</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {ACTIONS.map(a => (
          <Chip key={a} label={a} selected={form.actions_taken.includes(a)} onClick={() => toggle('actions_taken', a)} />
        ))}
      </div>
      <label style={{ ...labelStyle, marginTop: 12 }}>Other actions (optional)</label>
      <textarea value={form.actions_taken_other} onChange={e => f('actions_taken_other', e.target.value)} placeholder="Anything not in the list above..." rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />

      <div style={{ ...labelStyle, marginTop: 12 }}>Photos (up to 4)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {(form.photo_ids || []).map((src, i) => (
          <div key={i} style={{ position: 'relative', width: 72, height: 72 }}>
            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
            <button onClick={() => f('photo_ids', form.photo_ids.filter((_, j) => j !== i))} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, background: DANGER, border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1 }}>×</button>
          </div>
        ))}
        {(form.photo_ids?.length || 0) < 4 && (
          <label style={{ width: 72, height: 72, borderRadius: 8, border: `1px dashed ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: DIM, fontSize: 24, fontFamily: 'inherit' }}>
            <input type="file" accept="image/*" multiple onChange={onFile} style={{ display: 'none' }} />
            +
          </label>
        )}
      </div>

      {/* Footer actions */}
      <div style={{ position: 'sticky', bottom: 0, marginTop: 32, padding: '16px 0', background: BG, borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, color: SUB, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 48 }}>Cancel</button>
        <button onClick={handleSave} disabled={!canSave || saving} style={{ flex: 2, padding: '14px', background: canSave ? WARN : `${mix('warn', 19)}`, border: 'none', borderRadius: 10, color: canSave ? '#000' : SUB, fontSize: 14, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: 48, transition: 'opacity 0.15s' }}>
          {saving ? 'Saving…' : 'Save incident'}
        </button>
      </div>
    </div>
  )
}
