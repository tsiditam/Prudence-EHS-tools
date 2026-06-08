/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * IncidentLog — list view of saved incidents grouped by status.
 * Replaces the FM-mode ComplaintLog. Migrates legacy complaint
 * records on first mount (via STO.getIncidents → STO._migrateComplaints).
 */

import { useEffect, useState } from 'react'
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

const STATUS_FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'all', label: 'All' },
]

import { SEVERITY_COLOR } from './incidentConstants'

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
}

function fmtDate(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

export default function IncidentLog({ profile, onBack, onNewIncident, onView }) {
  const [incidents, setIncidents] = useState([])
  const [filter, setFilter] = useState('open')
  const [exportingId, setExportingId] = useState(null)

  useEffect(() => {
    STO.getIncidents().then(setIncidents)
  }, [])

  const handleExport = async (e, inc) => {
    e.stopPropagation()
    setExportingId(inc.id)
    try {
      await generateIncidentDocx(inc, profile)
    } catch (err) {
      console.error('Incident DOCX export failed', err)
    } finally {
      setExportingId(null)
    }
  }

  const filtered = filter === 'all' ? incidents : incidents.filter(i => i.status === filter)
  const counts = STATUS_FILTERS.reduce((acc, f) => {
    acc[f.id] = f.id === 'all' ? incidents.length : incidents.filter(i => i.status === f.id).length
    return acc
  }, {})

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 8 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Home</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>Incidents</h2>
          <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>Indoor air events documented for the record. Not a substitute for emergency services.</div>
        </div>
        <button onClick={onNewIncident} style={{ padding: '10px 14px', background: WARN, border: 'none', borderRadius: 8, color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', minHeight: 40 }}>+ Report</button>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {STATUS_FILTERS.map(s => (
          <button key={s.id} onClick={() => setFilter(s.id)} style={{
            padding: '7px 12px', borderRadius: 6,
            background: filter === s.id ? `${mix('accent', 7)}` : 'transparent',
            border: `1px solid ${filter === s.id ? `${mix('accent', 25)}` : BORDER}`,
            color: filter === s.id ? ACCENT : SUB,
            fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 32,
          }}>
            {s.label} <span style={{ color: filter === s.id ? ACCENT : DIM, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{counts[s.id] || 0}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: DIM, fontSize: 13 }}>
          {incidents.length === 0
            ? 'No incidents reported yet. Tap "+ Report" to document one.'
            : `No ${STATUS_LABEL[filter]?.toLowerCase() || ''} incidents.`}
        </div>
      )}
      {filtered.map(inc => (
        <div key={inc.id} onClick={() => onView?.(inc)} role="button" tabIndex={0} style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{inc.location || '(no location)'}</div>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: `${SEVERITY_COLOR[inc.severity] || DIM}18`, color: SEVERITY_COLOR[inc.severity] || DIM, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>{inc.severity}</span>
            <button
              onClick={(e) => handleExport(e, inc)}
              disabled={exportingId === inc.id}
              aria-label="Export Word report"
              style={{
                flexShrink: 0, width: 32, height: 32, padding: 0,
                background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 6, cursor: exportingId === inc.id ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: exportingId === inc.id ? 0.5 : 1,
              }}>
              <I n="download" s={14} c={SUB} w={1.8} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: SUB, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.trigger_type}{inc.building_name ? ` · ${inc.building_name}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: DIM, fontFamily: 'var(--font-mono)' }}>
            <span>{inc.reporter_name} · {fmtDate(inc.reported_at)}</span>
            <span style={{ color: inc.status === 'resolved' ? SUCCESS : inc.status === 'escalated' ? DANGER : ACCENT }}>{STATUS_LABEL[inc.status] || inc.status}</span>
          </div>
          {inc.medical_attention && (
            <div style={{ fontSize: 10, color: DANGER, marginTop: 2 }}>⚠ Medical attention sought</div>
          )}
        </div>
      ))}
    </div>
  )
}
