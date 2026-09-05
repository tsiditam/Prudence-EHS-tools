/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ProjectForm — create / edit metadata fields for a Project / Site
 * Folder. Rendered inside a BottomSheet by both the list (create) and
 * detail (edit) screens, so the field set stays in one place.
 */

import { useState } from 'react'
import * as V3 from '../../styles/tokens'
import TactileButton from '../ui/TactileButton'
import { PROJECT_STATUSES, SITE_TYPES } from '../../utils/projectStore'
import { STATUS_LABEL } from './projectsTheme'

// 16px is a functional floor, not a type choice: iOS Safari zooms the
// viewport when a focused control is under 16px, and the app's viewport is
// locked, so the zoom leaves the form half off-screen with no way back.
// index.html sets `input,select,textarea{font-size:16px}` for exactly this,
// but an inline style outranks a stylesheet rule — so the 14px that used to
// be here silently defeated the guard on every field of this sheet.
const inputStyle = {
  width: '100%', boxSizing: 'border-box', padding: '11px 12px',
  background: 'var(--surface)', border: `1px solid ${V3.BORDER_DEFAULT}`,
  borderRadius: V3.R.md, color: V3.TEXT_PRIMARY, fontSize: 16,
  fontFamily: 'inherit',
}

// A native <select> renders the platform's own chevron, height and corner
// radius, so beside these inputs it read as an unstyled control dropped into
// a designed sheet. Same box as inputStyle, with the caret drawn as an
// inline SVG in the theme's muted foreground.
const CARET = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1.5 6 6.5l5-5' fill='none' stroke='%23A1A1AA' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>"
const selectStyle = {
  ...inputStyle,
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  paddingRight: 34,
  backgroundImage: `url("${CARET}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
}

function Label({ children }) {
  return <div style={{ ...V3.T.micro, marginBottom: 6 }}>{children}</div>
}

export default function ProjectForm({ initial = {}, submitLabel = 'Create project', onSubmit, onCancel }) {
  const [name, setName] = useState(initial.name || '')
  const [client, setClient] = useState(initial.client || '')
  const [address, setAddress] = useState(initial.address || '')
  const [siteType, setSiteType] = useState(initial.siteType || '')
  const [status, setStatus] = useState(initial.status || 'draft')
  const [assessors, setAssessors] = useState((initial.assessors || []).join(', '))
  const [description, setDescription] = useState(initial.description || '')

  const canSubmit = name.trim().length > 0

  const submit = () => {
    if (!canSubmit) return
    onSubmit?.({
      name: name.trim(),
      client: client.trim(),
      address: address.trim(),
      siteType,
      status,
      assessors: assessors.split(',').map(s => s.trim()).filter(Boolean),
      description: description.trim(),
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Label>Project / site name *</Label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Meridian Commerce Tower" />
      </div>
      <div>
        <Label>Client / organization</Label>
        <input style={inputStyle} value={client} onChange={e => setClient(e.target.value)} placeholder="e.g. Demo Holdings LLC" />
      </div>
      <div>
        <Label>Address / location</Label>
        <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, city, state" />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>Site type</Label>
          <select style={selectStyle} value={siteType} onChange={e => setSiteType(e.target.value)}>
            <option value="">Select…</option>
            {SITE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>Status</Label>
          <select style={selectStyle} value={status} onChange={e => setStatus(e.target.value)}>
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label>Assigned assessor(s)</Label>
        <input style={inputStyle} value={assessors} onChange={e => setAssessors(e.target.value)} placeholder="Comma-separated, e.g. J. Smith, CIH" />
      </div>
      <div>
        <Label>Description / notes (optional)</Label>
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'none' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Scope, reason for engagement, context…" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <TactileButton
          variant="primary"
          size="lg"
          pill
          fullWidth
          disabled={!canSubmit}
          onClick={submit}
          haptic="success"
          // Standard cyan primary (variant accent-fill), matching the
          // "New project" CTA on the Projects screen. Green is reserved for
          // the safe / severity scale, not chrome (ANSI Z535 discipline).
        >{submitLabel}</TactileButton>
        {onCancel && <TactileButton variant="ghost" size="lg" onClick={onCancel}>Cancel</TactileButton>}
      </div>
    </div>
  )
}
