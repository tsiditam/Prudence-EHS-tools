/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * IncidentDetail — single-incident view + status editor.
 * Phase 1 affordances: edit status, delete. Phase 2 adds DOCX/PDF/share.
 * Phase 4 adds "Link to assessment."
 */

import { useState } from 'react'
import STO from '../utils/storage'
import { mix } from '../utils/theme'
import { generateIncidentDocx } from './IncidentDocxReport'
import { I } from './Icons'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const WARN = 'var(--warn)'
const DANGER = 'var(--danger)'
const SUCCESS = 'var(--success)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'

const STATUSES = [
  { id: 'open', label: 'Open', color: ACCENT },
  { id: 'in_progress', label: 'In progress', color: WARN },
  { id: 'resolved', label: 'Resolved', color: SUCCESS },
  { id: 'escalated', label: 'Escalated', color: DANGER },
]

import { SEVERITY_COLOR } from './incidentConstants'

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>{title}</div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, value, mono }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: TEXT, fontFamily: mono ? 'var(--font-mono)' : 'inherit', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}

export default function IncidentDetail({ incident, profile, onBack, onChange, onDeleted }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')

  if (!incident) return null

  const updateStatus = async (status) => {
    const updated = await STO.saveIncident({ ...incident, status })
    onChange?.(updated)
  }

  const handleDelete = async () => {
    await STO.deleteIncident(incident.id)
    onDeleted?.()
  }

  const handleExport = async () => {
    setExportError('')
    setExporting(true)
    try {
      await generateIncidentDocx(incident, profile)
    } catch (err) {
      console.error('Incident DOCX export failed', err)
      setExportError(err?.message || 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const sevColor = SEVERITY_COLOR[incident.severity] || DIM

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Incidents</button>
      </div>

      {/* Header */}
      <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>{incident.trigger_type}</h2>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: `${sevColor}18`, color: sevColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{incident.severity}</span>
      </div>
      <div style={{ fontSize: 12, color: SUB, fontFamily: 'var(--font-mono)' }}>{incident.location}{incident.building_name ? ` · ${incident.building_name}` : ''}</div>

      {/* Export — primary affordance, prominent under the title.
          Uses the Web Share API on iOS PWA so the user can save to
          Files, email, AirDrop, or send via Messages in one tap;
          falls back to download elsewhere. */}
      <div style={{ marginTop: 14 }}>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', background: 'var(--accent-fill)', border: 'none',
            borderRadius: 8, color: 'var(--on-accent-fill)', fontSize: 13,
            fontWeight: 700, cursor: exporting ? 'wait' : 'pointer',
            fontFamily: 'inherit', minHeight: 40, opacity: exporting ? 0.7 : 1,
          }}>
          <I n="download" s={14} c="var(--on-accent-fill)" w={2} />
          {exporting ? 'Preparing…' : 'Export Word report'}
        </button>
        {exportError && (
          <div style={{ marginTop: 8, fontSize: 11, color: DANGER }}>{exportError}</div>
        )}
      </div>

      {/* Status editor */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: SUB, marginBottom: 8 }}>Status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUSES.map(s => (
            <button key={s.id} onClick={() => updateStatus(s.id)} style={{
              padding: '7px 12px', borderRadius: 6,
              background: incident.status === s.id ? `${s.color}15` : 'transparent',
              border: `1px solid ${incident.status === s.id ? s.color : BORDER}`,
              color: incident.status === s.id ? s.color : SUB,
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32,
            }}>{s.label}</button>
          ))}
        </div>
      </div>

      <Section title="When & reporter">
        <Field label="Reported at" value={new Date(incident.reported_at).toLocaleString()} mono />
        <Field label="Reporter" value={[incident.reporter_name, incident.reporter_role].filter(Boolean).join(' · ')} />
        {incident.medical_attention && (
          <div style={{ fontSize: 12, color: DANGER, marginTop: 4, fontWeight: 600 }}>⚠ Medical attention sought</div>
        )}
      </Section>

      <Section title="Observations">
        <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{incident.observations}</div>
      </Section>

      {(incident.symptoms?.length || 0) > 0 && (
        <Section title="Symptoms reported">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {incident.symptoms.map(s => (
              <span key={s} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, background: `${mix('accent', 6)}`, color: ACCENT, border: `1px solid ${mix('accent', 15)}` }}>{s}</span>
            ))}
          </div>
        </Section>
      )}

      {((incident.actions_taken?.length || 0) > 0 || incident.actions_taken_other) && (
        <Section title="Actions taken">
          {(incident.actions_taken?.length || 0) > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: TEXT, lineHeight: 1.7 }}>
              {incident.actions_taken.map(a => <li key={a}>{a}</li>)}
            </ul>
          )}
          {incident.actions_taken_other && (
            <div style={{ marginTop: 10, fontSize: 13, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{incident.actions_taken_other}</div>
          )}
        </Section>
      )}

      {(incident.photo_ids?.length || 0) > 0 && (
        <Section title="Photos">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {incident.photo_ids.map((src, i) => (
              <img key={i} src={src} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: `1px solid ${BORDER}` }} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Record">
        <Field label="Incident ID" value={incident.id} mono />
        <Field label="Created" value={new Date(incident.created_at).toLocaleString()} mono />
        {incident.updated_at !== incident.created_at && (
          <Field label="Updated" value={new Date(incident.updated_at).toLocaleString()} mono />
        )}
      </Section>

      {/* Danger zone — delete */}
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${BORDER}` }}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{ padding: '10px 16px', background: 'transparent', border: `1px solid ${mix('danger', 25)}`, borderRadius: 8, color: DANGER, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Delete incident</button>
        ) : (
          <div style={{ padding: 14, background: `${mix('danger', 6)}`, border: `1px solid ${mix('danger', 25)}`, borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: TEXT, marginBottom: 10 }}>Delete this incident? This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleDelete} style={{ flex: 1, padding: '10px', background: DANGER, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
