/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Presentational helpers shared by the Project / Site Folder screens —
 * status tone mapping, file-type glyphs, and compact formatters. Kept
 * separate from projectStore.js so the data layer stays UI-agnostic.
 */

import * as V3 from '../../styles/tokens'

export const STATUS_TONE = {
  draft: V3.STATUS.draft,
  // Active = brand cyan. ANSI Z535 discipline: green is reserved for the
  // safe / severity scale, so an active project no longer reads green (which
  // signals "safe / pass"). Hardcoded to the --accent hex (#2EA7BF, the same
  // value in dark and light) rather than var(--accent) because the status
  // pills compose `${tone}NN` alpha suffixes, which require a hex literal,
  // not a CSS variable.
  active: '#2EA7BF',
  'follow-up': V3.SEVERITY.medium,
  closed: V3.STATUS.archived,
}

export const STATUS_LABEL = {
  draft: 'Draft',
  active: 'Active',
  'follow-up': 'Follow-up',
  closed: 'Closed',
}

// Shared spreadsheet detection — matches CSV / XLS / XLSX by MIME or filename.
// Single source of truth so the file glyph and the Logger "load from project"
// filter never drift.
export const SPREADSHEET_RE = /sheet|csv|xlsx?|excel|spreadsheet/i

export function isSpreadsheetDoc(doc = {}) {
  return SPREADSHEET_RE.test(`${doc.type || ''} ${doc.name || ''}`)
}

// Map a MIME type / filename to one of the available <I> glyph names.
export function fileIcon(type = '', name = '') {
  const t = `${type} ${name}`.toLowerCase()
  if (/image|\.png|\.jpe?g|\.gif|\.webp|\.heic/.test(t)) return 'image'
  if (/pdf/.test(t)) return 'report'
  if (/word|docx?|\.doc/.test(t)) return 'notes'
  if (SPREADSHEET_RE.test(t)) return 'flask'
  return 'paperclip'
}

export function fmtBytes(bytes) {
  if (!bytes || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Read a File into a data URL for inline (offline-first) storage.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error || new Error('Could not read file'))
    r.readAsDataURL(file)
  })
}

// Trigger a browser download (or open) for a stored data-URL document.
export function downloadDataUrl(dataUrl, filename) {
  try {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = filename || 'document'
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch { /* no-op — surfaced by caller if needed */ }
}
