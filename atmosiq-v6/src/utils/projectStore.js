/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Project / Site Folder store.
 *
 * A Project (a.k.a. Site Folder) is the engagement-level workspace that
 * groups everything tied to one building / property / client site:
 * metadata, uploaded documents, evidence photos, notes, linked in-app
 * assessments, and an auto-maintained activity log.
 *
 * Persistence mirrors the incidents store in utils/storage.js — a single
 * global array under one localStorage key via the STO wrapper. This keeps
 * the feature offline-first like the rest of the app. Document/evidence
 * binaries are stored as data URLs with a conservative per-file size cap;
 * production-grade large-binary storage (Supabase Storage) is the intended
 * next step and the model is shaped so a cloud adapter can be slotted in
 * without changing call sites.
 */

import STO from './storage'

const KEY = 'atmosflow:projects'

// Per-file cap for inline (data-URL) storage. localStorage quota is ~5 MB
// per origin and base64 inflates payloads ~33%, so we keep individual
// documents/photos small and defer larger binaries to cloud storage.
export const MAX_INLINE_FILE_BYTES = 1.5 * 1024 * 1024

export const PROJECT_STATUSES = ['draft', 'active', 'follow-up', 'closed']

export const SITE_TYPES = [
  'Office', 'School', 'Warehouse', 'Healthcare', 'Laboratory',
  'Data Center', 'Residential', 'Industrial', 'Retail', 'Other',
]

// Document categories surfaced as optional tags in the Documents section.
export const DOCUMENT_CATEGORIES = [
  'Sampling report', 'Lab results', 'HVAC document', 'Building plan',
  'Complaint log', 'Prior IAQ report', 'Correspondence', 'Other',
]

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function nowIso() { return new Date().toISOString() }

async function readAll() {
  return (await STO.get(KEY)) || []
}

async function writeAll(projects) {
  return STO.set(KEY, projects)
}

// Append an activity entry (newest first) without an extra round-trip.
function pushActivity(project, text) {
  const entry = { id: genId('act'), ts: nowIso(), text }
  project.activity = [entry, ...(project.activity || [])]
  return project
}

/** All projects, newest-updated first. */
export async function getProjects() {
  const all = await readAll()
  return [...all].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

export async function getProject(id) {
  const all = await readAll()
  return all.find(p => p.id === id) || null
}

/**
 * Create a new project/site folder.
 * @returns {object} the created project
 */
export async function createProject(fields = {}) {
  const all = await readAll()
  const ts = nowIso()
  const project = {
    id: genId('proj'),
    name: (fields.name || '').trim() || 'Untitled site',
    client: (fields.client || '').trim(),
    address: (fields.address || '').trim(),
    siteType: fields.siteType || '',
    status: PROJECT_STATUSES.includes(fields.status) ? fields.status : 'draft',
    description: (fields.description || '').trim(),
    assessors: Array.isArray(fields.assessors) ? fields.assessors.filter(Boolean) : [],
    documents: [],
    evidence: [],
    notes: [],
    linkedReportIds: [],
    activity: [],
    createdAt: ts,
    updatedAt: ts,
  }
  pushActivity(project, 'Project created')
  await writeAll([project, ...all])
  return project
}

/** Shallow-merge metadata fields onto a project; bumps updatedAt. */
export async function updateProject(id, patch = {}) {
  const all = await readAll()
  const i = all.findIndex(p => p.id === id)
  if (i < 0) return null
  const prev = all[i]
  const next = { ...prev }
  const META = ['name', 'client', 'address', 'siteType', 'status', 'description', 'assessors']
  for (const k of META) {
    if (k in patch) next[k] = patch[k]
  }
  if ('status' in patch && patch.status !== prev.status) {
    pushActivity(next, `Status changed to "${patch.status}"`)
  }
  next.updatedAt = nowIso()
  all[i] = next
  await writeAll(all)
  return next
}

export async function deleteProject(id) {
  const all = await readAll()
  await writeAll(all.filter(p => p.id !== id))
}

// Internal: mutate one project, persist, return it (or null if missing).
async function mutate(id, fn) {
  const all = await readAll()
  const i = all.findIndex(p => p.id === id)
  if (i < 0) return null
  const project = { ...all[i] }
  fn(project)
  project.updatedAt = nowIso()
  all[i] = project
  const ok = await writeAll(all)
  return ok ? project : null
}

/**
 * Add an uploaded document. `file` is { name, type, size, dataUrl,
 * category, uploadedBy }. Returns { project } on success or
 * { error } when the payload exceeds the inline size cap or storage
 * write fails (e.g. quota exceeded) — the caller surfaces the message.
 */
export async function addDocument(id, file = {}) {
  if (typeof file.size === 'number' && file.size > MAX_INLINE_FILE_BYTES) {
    return { error: `File is too large to store on-device (limit ${(MAX_INLINE_FILE_BYTES / 1024 / 1024).toFixed(1)} MB). Cloud document storage is coming soon.` }
  }
  const doc = {
    id: genId('doc'),
    name: file.name || 'Untitled',
    type: file.type || '',
    size: file.size || 0,
    dataUrl: file.dataUrl || '',
    category: file.category || '',
    uploadedBy: file.uploadedBy || '',
    uploadedAt: nowIso(),
  }
  const project = await mutate(id, p => {
    p.documents = [doc, ...(p.documents || [])]
    pushActivity(p, `Document added: ${doc.name}`)
  })
  if (!project) return { error: 'Could not save the document — on-device storage may be full.' }
  return { project, doc }
}

export async function removeDocument(id, docId) {
  return mutate(id, p => {
    const doc = (p.documents || []).find(d => d.id === docId)
    p.documents = (p.documents || []).filter(d => d.id !== docId)
    if (doc) pushActivity(p, `Document removed: ${doc.name}`)
  })
}

export async function addEvidence(id, file = {}) {
  if (typeof file.size === 'number' && file.size > MAX_INLINE_FILE_BYTES) {
    return { error: `Image is too large to store on-device (limit ${(MAX_INLINE_FILE_BYTES / 1024 / 1024).toFixed(1)} MB).` }
  }
  const item = {
    id: genId('ev'),
    name: file.name || 'Photo',
    type: file.type || 'image',
    dataUrl: file.dataUrl || '',
    caption: file.caption || '',
    uploadedBy: file.uploadedBy || '',
    uploadedAt: nowIso(),
  }
  const project = await mutate(id, p => {
    p.evidence = [item, ...(p.evidence || [])]
    pushActivity(p, 'Evidence photo added')
  })
  if (!project) return { error: 'Could not save the photo — on-device storage may be full.' }
  return { project, item }
}

export async function removeEvidence(id, evId) {
  return mutate(id, p => {
    p.evidence = (p.evidence || []).filter(e => e.id !== evId)
    pushActivity(p, 'Evidence photo removed')
  })
}

export async function addNote(id, { text, author } = {}) {
  const body = (text || '').trim()
  if (!body) return null
  const note = { id: genId('note'), text: body, author: author || '', createdAt: nowIso() }
  return mutate(id, p => {
    p.notes = [note, ...(p.notes || [])]
    pushActivity(p, 'Note added')
  })
}

export async function removeNote(id, noteId) {
  return mutate(id, p => {
    p.notes = (p.notes || []).filter(n => n.id !== noteId)
  })
}

/** Link an in-app assessment (report-index id) to the project. Idempotent. */
export async function linkReport(id, reportId, label) {
  return mutate(id, p => {
    if (!(p.linkedReportIds || []).includes(reportId)) {
      p.linkedReportIds = [reportId, ...(p.linkedReportIds || [])]
      pushActivity(p, `Assessment linked${label ? `: ${label}` : ''}`)
    }
  })
}

export async function unlinkReport(id, reportId) {
  return mutate(id, p => {
    p.linkedReportIds = (p.linkedReportIds || []).filter(r => r !== reportId)
    pushActivity(p, 'Assessment unlinked')
  })
}

export default {
  PROJECT_STATUSES, SITE_TYPES, DOCUMENT_CATEGORIES, MAX_INLINE_FILE_BYTES,
  getProjects, getProject, createProject, updateProject, deleteProject,
  addDocument, removeDocument, addEvidence, removeEvidence,
  addNote, removeNote, linkReport, unlinkReport,
}
