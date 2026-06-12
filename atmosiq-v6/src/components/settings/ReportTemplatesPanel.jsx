/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Report Templates panel — Settings affordance for uploading, listing,
 * and removing user .docx report templates that Jasper renders via
 * the generate_report tool.
 *
 * Surfaces:
 *   • Upload affordance (.docx, ≤ 5 MB) — drag-drop or file picker.
 *   • List of saved templates with name, upload date, and a Delete row.
 *   • Per-template "Inspect" expander showing tokens_found / unknown +
 *     a copyable "Available tokens" reference list pulled from the
 *     canonical registry.
 *
 * No prose generation surface. Per the screening-only positioning,
 * templates fill literal data only; this panel does NOT expose any
 * AI-prose toggle.
 */

import { useEffect, useRef, useState } from 'react'
import * as V3 from '../../styles/tokens'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'
const WARN = 'var(--warn)'
const SUCCESS = 'var(--success)'
const DANGER = 'var(--danger)'
const ACCENT = 'var(--accent)'

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

import { getAuthHeader, fmtDate } from './settingsHelpers'

function fmtSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}


async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      // Strip the data:...;base64, prefix — the API handler tolerates
      // it either way but the wire is smaller without.
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}

export default function ReportTemplatesPanel() {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const inputRef = useRef(null)

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const auth = await getAuthHeader()
      if (!auth) {
        setError('Sign in to manage report templates.')
        setTemplates([])
        return
      }
      const resp = await fetch('/api/report-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'list' }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json?.error || `Failed to load templates (${resp.status}).`)
        return
      }
      setTemplates(Array.isArray(json?.templates) ? json.templates : [])
    } catch (err) {
      setError(err?.message || 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const handleUpload = async (file) => {
    if (!file) return
    setError('')
    if (!/\.docx$/i.test(file.name)) {
      setError('Only .docx templates are supported.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('File exceeds the 5 MB limit.')
      return
    }
    setBusy(true)
    try {
      const auth = await getAuthHeader()
      if (!auth) { setError('Sign in to upload a template.'); return }
      const base64 = await fileToBase64(file)
      const name = file.name.replace(/\.docx$/i, '').slice(0, 120)
      const resp = await fetch('/api/report-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'upload', name, base64 }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json?.error || `Upload failed (${resp.status}).`)
        return
      }
      await refresh()
    } catch (err) {
      setError(err?.message || 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (id) => {
    if (!id) return
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    setBusy(true)
    setError('')
    try {
      const auth = await getAuthHeader()
      if (!auth) { setError('Sign in to delete templates.'); return }
      const resp = await fetch('/api/report-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ action: 'delete', id }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json?.error || `Delete failed (${resp.status}).`)
        return
      }
      await refresh()
    } catch (err) {
      setError(err?.message || 'Delete failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {/* Upload affordance */}
      <div
        style={{
          padding: '14px 16px',
          background: 'transparent',
          display: 'flex', alignItems: 'center', gap: 12,
          minHeight: 52,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
            Upload a template
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
            .docx with {'{{tokens}}'}. Jasper fills literal data only, never invents.
          </div>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            padding: '8px 14px',
            background: busy ? 'transparent' : ACCENT,
            color: busy ? SUB : 'var(--on-accent)',
            border: `1px solid ${busy ? BORDER : ACCENT}`,
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          {busy ? 'Working…' : 'Upload .docx'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleUpload(f)
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: '8px 16px 12px',
            color: DANGER,
            fontSize: 12,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          {error}
        </div>
      )}

      {/* Saved templates list */}
      {loading && templates.length === 0 && (
        <div style={{ padding: '14px 16px', color: SUB, fontSize: 12, borderTop: `1px solid ${BORDER}` }}>
          Loading…
        </div>
      )}

      {!loading && templates.length === 0 && (
        <div
          style={{
            padding: '14px 16px',
            color: SUB,
            fontSize: 12,
            borderTop: `1px solid ${BORDER}`,
          }}
        >
          No templates saved yet.
        </div>
      )}

      {templates.map((t, i) => {
        const expanded = expandedId === t.id
        return (
          <div key={t.id} style={{ borderTop: `1px solid ${BORDER}` }}>
            <div
              style={{
                padding: '14px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 52,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>
                  {fmtDate(t.created_at)} · {fmtSize(t.size_bytes)} · {(t.tokens_found || []).length} tokens
                  {(t.tokens_missing || []).length > 0 && (
                    <>
                      {' '}·{' '}
                      <span style={{ color: WARN }}>
                        {(t.tokens_missing || []).length} unknown
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                onClick={() => setExpandedId(expanded ? null : t.id)}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: SUB,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                {expanded ? 'Hide' : 'Inspect'}
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={busy}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: DANGER,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
              >
                Delete
              </button>
            </div>
            {expanded && (
              <div style={{ padding: '4px 16px 14px', fontSize: 11, color: SUB }}>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600, marginBottom: 4 }}>
                      Tokens found ({(t.tokens_found || []).length})
                    </div>
                    {(t.tokens_found || []).length === 0 ? (
                      <div style={{ color: DIM }}>None</div>
                    ) : (
                      (t.tokens_found || []).map((tok) => (
                        <div key={tok} style={{ fontFamily: 'monospace', color: SUCCESS, fontSize: 11 }}>
                          {`{{${tok}}}`}
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600, marginBottom: 4 }}>
                      Unknown tokens ({(t.tokens_missing || []).length})
                    </div>
                    {(t.tokens_missing || []).length === 0 ? (
                      <div style={{ color: DIM }}>None</div>
                    ) : (
                      <>
                        <div style={{ color: WARN, marginBottom: 4 }}>
                          These will render empty.
                        </div>
                        {(t.tokens_missing || []).map((tok) => (
                          <div key={tok} style={{ fontFamily: 'monospace', color: WARN, fontSize: 11 }}>
                            {`{{${tok}}}`}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
