/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * IncidentLog — list view of saved incidents grouped by status.
 * Replaces the FM-mode ComplaintLog. Migrates legacy complaint
 * records on first mount (via STO.getIncidents → STO._migrateComplaints).
 *
 * Restraint pass (2026-09): the caveat subtitle, the five bordered count
 * chips, the empty state in a card with an icon tile, and the card per
 * incident are gone. The status filter is the app's text-tab row with
 * counts beside the labels; an incident is a row that parts from the
 * next with a hairline, its severity and status as words in their
 * colours. The one accent on the screen is "Report".
 */

import { useEffect, useState } from 'react'
import { clickable } from './ui/a11y'
import { formatShortDateTime } from '../utils/formatDate'
import STO from '../utils/storage'
import { generateIncidentDocx } from './IncidentDocxReport'
import { I } from './Icons'
import * as V3 from '../styles/tokens'
import TactileButton from './ui/TactileButton'
import AssessmentSegmentedPillNav from './ui/AssessmentSegmentedPillNav'
import { SEVERITY_COLOR } from './incidentConstants'

const HAIRLINE = `1px solid ${V3.BORDER_SUBTLE}`
const DANGER = 'var(--danger)'
const SUCCESS = 'var(--success)'

const STATUS_FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'all', label: 'All' },
]

const STATUS_LABEL = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  escalated: 'Escalated',
}

// Status as a word in its colour: only resolved and escalated carry one.
const STATUS_TONE = { resolved: SUCCESS, escalated: DANGER }

// src/utils/formatDate.js is the single definition; this row format drops
// the year (the list is recent-first) and uses the device locale.
const fmtDate = (iso) => formatShortDateTime(iso, { fallback: iso || '' })

// `onBack` is still passed by the shell; the header back control handles
// it, so the view renders none of its own.
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <h2 style={{ ...V3.T.h1, margin: 0 }}>Incidents</h2>
        <TactileButton variant="primary" size="sm" pill onClick={onNewIncident} style={{ flexShrink: 0 }}>
          Report
        </TactileButton>
      </div>

      <AssessmentSegmentedPillNav
        tabs={STATUS_FILTERS.map(s => ({ id: s.id, label: s.label, badge: counts[s.id] || undefined }))}
        active={filter}
        onChange={setFilter}
        ariaLabel="Incident status"
        style={{ margin: '0 0 4px' }}
      />

      {filtered.length === 0 && (
        <div style={{ ...V3.T.bodyDim, padding: '12px 0' }}>
          {incidents.length === 0
            ? 'None recorded. Document an indoor air event and it is listed here, with a Word export for the record.'
            : `No ${STATUS_LABEL[filter]?.toLowerCase() || ''} incidents.`}
        </div>
      )}
      {filtered.map((inc, i) => (
        <div key={inc.id} {...clickable(() => onView?.(inc), { label: `Open incident ${inc.location || '(no location)'}` })} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
          borderTop: i === 0 ? 'none' : HAIRLINE, cursor: 'pointer', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ ...V3.T.bodyStrong, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.location || '(no location)'}</div>
              <span style={{ ...V3.T.caption, color: SEVERITY_COLOR[inc.severity] || V3.TEXT_TERTIARY, fontWeight: 600, whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{inc.severity}</span>
            </div>
            <div style={{ ...V3.T.caption, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.trigger_type}{inc.building_name ? ` · ${inc.building_name}` : ''}</div>
            <div style={{ ...V3.T.captionDim, marginTop: 2 }}>
              {inc.reporter_name} · {fmtDate(inc.reported_at)} · <span style={{ color: STATUS_TONE[inc.status] || undefined }}>{STATUS_LABEL[inc.status] || inc.status}</span>
              {inc.medical_attention && <span style={{ color: DANGER }}> · Medical attention sought</span>}
            </div>
          </div>
          <button
            onClick={(e) => handleExport(e, inc)}
            disabled={exportingId === inc.id}
            aria-label="Export Word report"
            style={{ background: 'none', border: 'none', padding: 6, cursor: exportingId === inc.id ? 'wait' : 'pointer', display: 'inline-flex', opacity: exportingId === inc.id ? 0.5 : 1, WebkitTapHighlightColor: 'transparent' }}>
            <I n="download" s={16} c={V3.TEXT_SECONDARY} w={1.8} />
          </button>
        </div>
      ))}
      {filtered.length > 0 && <div style={{ borderTop: HAIRLINE }} />}

      <div style={{ ...V3.T.captionDim, marginTop: 16, lineHeight: 1.6 }}>
        Documented for the record. In an emergency, call emergency services.
      </div>
    </div>
  )
}
