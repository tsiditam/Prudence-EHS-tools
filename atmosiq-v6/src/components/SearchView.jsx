/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * SearchView — global search across all of AtmosFlow's user content
 * (reports, drafts, incidents) and static content (FAQ, settings /
 * navigation targets). Results are grouped by type and case-
 * insensitive substring matched against the corpus.
 */

import { useEffect, useMemo, useState } from 'react'
import STO from '../utils/storage'
import { FAQ_SECTIONS } from '../constants/faq'
import { I } from './Icons'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const ACCENT = 'var(--accent)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const SURFACE = 'var(--surface)'

const MAX_PER_GROUP = 8

const NAV_TARGETS = [
  { label: 'Home',                      view: 'dash',     keywords: 'home dashboard' },
  { label: 'Reports',                   view: 'history',  keywords: 'drafts finalized assessments' },
  { label: 'Trash',                     view: 'trash',    keywords: 'deleted recycle' },
  { label: 'Settings',                  view: 'settings', keywords: 'preferences account' },
  { label: 'Calibration / Instruments', view: 'settings', keywords: 'instruments meters iaq pid calibration' },
  { label: 'Subscription / Billing',    view: 'settings', keywords: 'plan pricing credits stripe billing subscription' },
  { label: 'Theme (light / dark)',      view: 'settings', keywords: 'appearance dark light mode theme' },
  { label: 'Change password',           view: 'settings', keywords: 'security password' },
  { label: 'Backup & restore',          view: 'settings', keywords: 'export import data backup restore' },
  { label: 'Help & FAQ',                view: 'help',     keywords: 'support questions help faq' },
  { label: 'Terms of Service',          view: 'tos',      keywords: 'legal terms tos' },
  { label: 'Privacy Policy',            view: 'privacy',  keywords: 'legal privacy data' },
]

function GroupHeader({ icon, label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 8 }}>
      <I n={icon} s={14} c={DIM} w={1.8} />
      <div style={{ fontSize: 11, fontWeight: 700, color: DIM, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
      {count > 0 && <div style={{ fontSize: 11, color: DIM }}>· {count}</div>}
    </div>
  )
}

function ResultRow({ icon, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, marginBottom: 6, cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', minHeight: 56,
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = SURFACE }}
      onMouseLeave={e => { e.currentTarget.style.background = CARD }}>
      <I n={icon} s={18} c={SUB} w={1.8} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11, color: DIM, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
      </div>
    </button>
  )
}

export default function SearchView({ index, onOpenReport, onResumeDraft, onOpenIncident, onNavigate }) {
  const [q, setQ] = useState('')
  const [incidents, setIncidents] = useState([])

  useEffect(() => {
    let cancelled = false
    STO.getIncidents().then(list => { if (!cancelled) setIncidents(list || []) })
    return () => { cancelled = true }
  }, [])

  const reportItems = useMemo(() => {
    const drafts = (index?.drafts || []).map(d => ({
      kind: 'draft', id: d.id, title: d.facility || 'Untitled draft',
      subtitle: 'Draft · in progress',
      haystack: `${d.facility || ''} ${d.building?.fn || ''} draft`.toLowerCase(),
      raw: d,
    }))
    const finalized = (index?.reports || []).map(r => ({
      kind: 'report', id: r.id, title: r.facility || 'Untitled report',
      subtitle: `Finalized · score ${r.score ?? '—'}`,
      haystack: `${r.facility || ''} ${r.building?.fn || ''} report finalized`.toLowerCase(),
      raw: r,
    }))
    return [...drafts, ...finalized]
  }, [index])

  const incidentItems = useMemo(() => (incidents || []).map(inc => ({
    kind: 'incident', id: inc.id,
    title: inc.trigger_type || 'Incident',
    subtitle: [inc.severity, inc.location, inc.building_name].filter(Boolean).join(' · '),
    haystack: `${inc.trigger_type || ''} ${inc.location || ''} ${inc.building_name || ''} ${inc.observations || ''} ${inc.reporter_name || ''} ${inc.severity || ''}`.toLowerCase(),
    raw: inc,
  })), [incidents])

  const faqItems = useMemo(() => {
    const out = []
    for (const sec of FAQ_SECTIONS) {
      for (const item of sec.items) {
        out.push({
          kind: 'faq',
          title: item.q,
          subtitle: sec.title,
          haystack: `${item.q} ${item.a} ${sec.title}`.toLowerCase(),
        })
      }
    }
    return out
  }, [])

  const navItems = useMemo(() => NAV_TARGETS.map(n => ({
    kind: 'nav', view: n.view, title: n.label,
    subtitle: 'Go to ' + n.label.toLowerCase(),
    haystack: `${n.label} ${n.keywords}`.toLowerCase(),
  })), [])

  const query = q.trim().toLowerCase()
  // Empty query → empty page. Results only appear as the user types.
  const match = (item) => query.length > 0 && item.haystack.includes(query)
  const reports = reportItems.filter(match)
  const incs = incidentItems.filter(match)
  const faqs = faqItems.filter(match)
  const navs = navItems.filter(match)

  const hasQuery = query.length > 0
  const totalResults = reports.length + incs.length + faqs.length + navs.length

  return (
    <div style={{ paddingTop: 16, paddingBottom: 120, maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0, letterSpacing: '-0.3px' }}>Search</h2>
      <div style={{ fontSize: 12, color: SUB, marginTop: 4, marginBottom: 14 }}>Reports, incidents, settings, help</div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <I n="search" s={16} c={DIM} w={1.8} />
        </div>
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
          placeholder="Search reports, incidents, settings, help…"
          style={{
            width: '100%', padding: '13px 16px 13px 40px', background: CARD,
            border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 15,
            fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', minHeight: 46,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = ACCENT }}
          onBlur={e => { e.currentTarget.style.borderColor = BORDER }}
        />
      </div>

      {hasQuery && totalResults === 0 && (
        <div style={{ padding: '48px 24px', marginTop: 24, textAlign: 'center', background: CARD, borderRadius: 10, border: `1px solid ${BORDER}` }}>
          <I n="search" s={28} c={DIM} w={1.4} />
          <div style={{ fontSize: 15, fontWeight: 600, color: SUB, marginTop: 16 }}>No results</div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 6 }}>Try a different keyword.</div>
        </div>
      )}

      {reports.length > 0 && (
        <>
          <GroupHeader icon="report" label="Reports & Drafts" count={reports.length} />
          {reports.slice(0, MAX_PER_GROUP).map(item => (
            <ResultRow
              key={`${item.kind}-${item.id}`}
              icon={item.kind === 'draft' ? 'draft' : 'report'}
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => item.kind === 'draft' ? onResumeDraft?.(item.id) : onOpenReport?.(item.raw)}
            />
          ))}
          {reports.length > MAX_PER_GROUP && (
            <div style={{ fontSize: 11, color: DIM, margin: '4px 0 8px 4px' }}>+ {reports.length - MAX_PER_GROUP} more</div>
          )}
        </>
      )}

      {incs.length > 0 && (
        <>
          <GroupHeader icon="alert" label="Incidents" count={incs.length} />
          {incs.slice(0, MAX_PER_GROUP).map(item => (
            <ResultRow
              key={`incident-${item.id}`}
              icon="alert"
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onOpenIncident?.(item.raw)}
            />
          ))}
          {incs.length > MAX_PER_GROUP && (
            <div style={{ fontSize: 11, color: DIM, margin: '4px 0 8px 4px' }}>+ {incs.length - MAX_PER_GROUP} more</div>
          )}
        </>
      )}

      {faqs.length > 0 && (
        <>
          <GroupHeader icon="help" label="Help & FAQ" count={faqs.length} />
          {faqs.slice(0, MAX_PER_GROUP).map((item, i) => (
            <ResultRow
              key={`faq-${i}`}
              icon="help"
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onNavigate?.('help')}
            />
          ))}
          {faqs.length > MAX_PER_GROUP && (
            <div style={{ fontSize: 11, color: DIM, margin: '4px 0 8px 4px' }}>+ {faqs.length - MAX_PER_GROUP} more</div>
          )}
        </>
      )}

      {navs.length > 0 && (
        <>
          <GroupHeader icon="layers" label="Navigate to" count={navs.length} />
          {navs.slice(0, MAX_PER_GROUP).map((item, i) => (
            <ResultRow
              key={`nav-${i}`}
              icon="layers"
              title={item.title}
              subtitle={item.subtitle}
              onClick={() => onNavigate?.(item.view)}
            />
          ))}
        </>
      )}
    </div>
  )
}
