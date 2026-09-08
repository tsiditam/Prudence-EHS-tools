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
import { clickable } from './ui/a11y'
import { formatShortDateTime } from '../utils/formatDate'
import STO from '../utils/storage'
import { generateIncidentDocx } from './IncidentDocxReport'
import { I } from './Icons'
import * as V3 from '../styles/tokens'
import TactileButton from './ui/TactileButton'
import Chip from './ui/Chip'
import StatusPill from './ui/StatusPill'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
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

// src/utils/formatDate.js is the single definition; this row format drops
// the year (the list is recent-first) and uses the device locale.
const fmtDate = (iso) => formatShortDateTime(iso, { fallback: iso || '' })

// `onBack` is still passed by the shell; the header back pill handles it
// now, so the view no longer renders its own.
export default function IncidentLog({ profile, onNewIncident, onView }) {
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
      {/* The shell header's back pill is the single back affordance; the
          in-body "← Home" link duplicated it. Title + subtitle use the same
          scale as Projects / Reports / Settings. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ ...V3.T.h1, margin: 0 }}>Incidents</h2>
          <div style={{ ...V3.T.h1Sub, marginTop: 4 }}>Indoor air events documented for the record. Not a substitute for emergency services.</div>
        </div>
        {/* Accent primary, like every other create action. This was a
            --warn (amber) fill — the only amber button in the app, and it
            read as a caution badge rather than the way to add a record. */}
        <TactileButton variant="primary" size="sm" pill bubble onClick={onNewIncident} icon={<I n="plus" s={14} c="var(--on-accent-fill)" w={2.2} />} style={{ flexShrink: 0 }}>
          Report
        </TactileButton>
      </div>

      {/* Status filter chips — the shared pill Chip, matching the Projects
          filter strip, instead of a local 6px-radius rectangle. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {STATUS_FILTERS.map(s => {
          const on = filter === s.id
          return (
            <Chip key={s.id} selected={on} onClick={() => setFilter(s.id)} style={{ padding: '7px 13px', minHeight: 32, fontSize: 12 }}>
              {s.label} <span style={{ color: on ? ACCENT : DIM, fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{counts[s.id] || 0}</span>
            </Chip>
          )
        })}
      </div>

      {/* List */}
      {filtered.length === 0 && (
        <div style={{ ...V3.panel(), textAlign: 'center', padding: '36px 24px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)' }}>
            <I n="alert" s={24} c={ACCENT} w={1.8} />
          </div>
          <div style={{ ...V3.T.h3, marginBottom: 6 }}>
            {incidents.length === 0 ? 'No incidents recorded' : `No ${STATUS_LABEL[filter]?.toLowerCase() || ''} incidents`}
          </div>
          <div style={{ ...V3.T.bodyDim, maxWidth: 360, margin: '0 auto' }}>
            {incidents.length === 0
              ? 'Document an indoor air event and it will be listed here, with a Word export for the record.'
              : 'Try a different status filter.'}
          </div>
        </div>
      )}
      {filtered.map(inc => (
        <div key={inc.id} {...clickable(() => onView?.(inc), { label: `Open incident ${inc.location || '(no location)'}` })} style={{
          width: '100%', textAlign: 'left', padding: '14px 16px',
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
          marginBottom: 8, cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{inc.location || '(no location)'}</div>
            <StatusPill tone={SEVERITY_COLOR[inc.severity] || DIM} style={{ flexShrink: 0 }}>{inc.severity}</StatusPill>
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
