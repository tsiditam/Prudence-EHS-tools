/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Site Library panel — Settings affordance for listing the user's
 * saved sites, editing the name/address, pausing or resuming
 * re-assessment reminders, and deleting a site outright.
 *
 * Mounted in the Settings "Sites" group. Reads / writes /api/sites and
 * refreshes the StorageContext.sites cache after every write, so the
 * dashboard and SaveSitePrompt read fresh state without a second fetch.
 *
 * This is the ONLY surface where a user can act on a site. Sites are
 * created for them — SaveSitePrompt writes one at finalize — and the
 * re-assessment cron emails against `next_due_at`. While this panel sat
 * unmounted, that loop ran with no way to rename, pause or delete
 * anything in it. Do not unmount it without also disabling the writer
 * and the reminder.
 *
 * Not exposed here: the per-site reassessment cadence. The column exists
 * (migration 017, `reassessment_interval_months`, default 12) and the API
 * clamps and honours it, so a picker is additive when the need appears —
 * every site currently runs on the 12-month default.
 */

import { useEffect, useState } from 'react'
import * as V3 from '../../styles/tokens'
import { useStorage } from '../../contexts/StorageContext'

// The panel mounts INSIDE a Settings <Group>, whose container is already
// painted --card. Per-site cards use --surface so they read as rows nested
// in that group rather than as a second card of the same colour.
const CARD = 'var(--surface)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const ACCENT = 'var(--accent)'
const DANGER = 'var(--danger)'

import { getAuthHeader, fmtDate } from './settingsHelpers'
import { useConfirm } from '../ui/ConfirmDialog'

function nextDueLabel(site) {
  if (site.disabled_at) return 'Reminders paused'
  if (!site.next_due_at) return 'No reminder scheduled'
  const due = new Date(site.next_due_at)
  if (Number.isNaN(due.getTime())) return ''
  const now = new Date()
  const days = Math.round((due.getTime() - now.getTime()) / 86400000)
  if (days <= 0) return `Reassessment due now (${fmtDate(site.next_due_at)})`
  if (days < 60) return `Due in ${days} days (${fmtDate(site.next_due_at)})`
  return `Due ${fmtDate(site.next_due_at)}`
}

export default function SiteLibraryPanel() {
  const [confirmDelete, confirmDialog] = useConfirm()
  const { sites: cachedSites, refreshSites } = useStorage()
  const [sites, setSites] = useState(cachedSites || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const auth = await getAuthHeader()
      if (!auth) {
        setError('Sign in to manage your sites.')
        setSites([])
        return
      }
      const resp = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'list' }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json.error || 'Could not load sites.')
        return
      }
      const list = Array.isArray(json.sites) ? json.sites : []
      setSites(list)
      await refreshSites(list)
    } catch (e) {
      setError((e && e.message) || 'Network error.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (s) => {
    setEditingId(s.id)
    setEditName(s.name || '')
    setEditAddress(s.address || '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditAddress('')
  }

  const save = async (site, patch) => {
    setBusy(true)
    setError('')
    try {
      const auth = await getAuthHeader()
      if (!auth) { setError('Sign in to save changes.'); return }
      const resp = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'save', site: { id: site.id, name: patch.name ?? site.name, address: 'address' in patch ? patch.address : site.address, disabled: 'disabled' in patch ? patch.disabled : !!site.disabled_at } }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) { setError(json.error || 'Save failed.'); return }
      await refresh()
      cancelEdit()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (site) => {
    if (!(await confirmDelete({ title: `Delete "${site.name}" from your sites?`, message: 'Reminders for this site will be canceled. Past assessments are unaffected.', confirmLabel: 'Delete', destructive: true }))) return
    setBusy(true)
    setError('')
    try {
      const auth = await getAuthHeader()
      if (!auth) { setError('Sign in to delete.'); return }
      const resp = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'delete', id: site.id }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) { setError(json.error || 'Delete failed.'); return }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{maxWidth: 620, margin: '0 auto'}}>
      {confirmDialog}
      {/* No "Sites" heading here — the Settings Group wrapper already
          renders the section's "SITES" label, so an in-panel <h2>Sites</h2>
          duplicated it. */}
      <div style={{...V3.T.bodyDim, marginBottom: 16}}>
        Saved sites. AtmosFlow reminds you when each is due for
        re-assessment (annually by default) and pre-fills the building
        profile on a follow-up visit to the same location.
      </div>

      {error && (
        <div style={{padding: 12, marginBottom: 12, borderRadius: 10, border: `1px solid ${BORDER}`, background: CARD, color: '#F59E0B', ...V3.T.captionDim}}>
          {error}
        </div>
      )}

      {loading && sites.length === 0 && (
        <div style={{...V3.T.bodyDim, padding: 20, textAlign: 'center'}}>Loading sites…</div>
      )}

      {!loading && sites.length === 0 && (
        <div style={{padding: 18, borderRadius: 12, border: `1px dashed ${BORDER}`, background: CARD, textAlign: 'center'}}>
          <div style={{...V3.T.bodyStrong, marginBottom: 6}}>No sites saved yet</div>
          <div style={{...V3.T.captionDim}}>Finalize an assessment to add the building as a site.</div>
        </div>
      )}

      {sites.map(s => (
        <div key={s.id} style={{
          padding: 14, marginBottom: 10,
          borderRadius: 12, border: `1px solid ${BORDER}`, background: CARD,
          opacity: s.disabled_at ? 0.65 : 1,
        }}>
          {editingId === s.id ? (
            <div>
              <input
                type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                placeholder="Site name"
                style={{width:'100%', padding:'10px 12px', marginBottom: 8, borderRadius:8, border:`1.5px solid ${BORDER}`, background: 'var(--bg)', color: TEXT, fontSize: 14, fontFamily: 'inherit'}}
              />
              <input
                type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)}
                placeholder="Address (optional)"
                style={{width:'100%', padding:'10px 12px', marginBottom: 10, borderRadius:8, border:`1.5px solid ${BORDER}`, background: 'var(--bg)', color: TEXT, fontSize: 14, fontFamily: 'inherit'}}
              />
              <div style={{display:'flex', gap: 8}}>
                <button disabled={busy} onClick={() => save(s, { name: editName, address: editAddress })} style={btnPrimary}>
                  Save
                </button>
                <button disabled={busy} onClick={cancelEdit} style={btnGhost}>Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:'flex', alignItems:'baseline', justifyContent:'space-between', gap: 10}}>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{...V3.T.bodyStrong, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {s.name}
                  </div>
                  {s.address && (
                    <div style={{...V3.T.captionDim, marginTop: 2}}>{s.address}</div>
                  )}
                </div>
                <div style={{...V3.T.captionDim, color: s.disabled_at ? DIM : SUB, whiteSpace: 'nowrap'}}>
                  {nextDueLabel(s)}
                </div>
              </div>
              <div style={{display:'flex', gap: 8, marginTop: 10, flexWrap: 'wrap'}}>
                <button disabled={busy} onClick={() => startEdit(s)} style={btnGhost}>Edit</button>
                <button disabled={busy} onClick={() => save(s, { disabled: !s.disabled_at })} style={btnGhost}>
                  {s.disabled_at ? 'Resume reminders' : 'Pause reminders'}
                </button>
                <button disabled={busy} onClick={() => remove(s)} style={{...btnGhost, color: DANGER}}>Delete</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const btnPrimary = {
  padding: '8px 14px', borderRadius: 8,
  background: ACCENT, color: 'var(--primary-cta-icon, #0B1014)',
  border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  fontFamily: 'inherit',
}
const btnGhost = {
  padding: '8px 12px', borderRadius: 8,
  background: 'transparent', color: TEXT, border: `1px solid ${BORDER}`,
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
  fontFamily: 'inherit',
}
