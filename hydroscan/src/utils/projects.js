/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Projects model — the project-centered workspace layer that sits on top of the
 * existing assessment / lab / report flows (it frames them; it does not replace
 * the engine). Persisted to localStorage. A project owns the lifecycle metadata
 * (site, location, workflow stage, sample count, lab/report status) and links
 * out to the existing flows via WORKFLOW_STEPS.
 */

const KEY = 'hydroscan:projects'

// Workflow lifecycle, in order. Each step launches an existing app flow.
export const WORKFLOW_STEPS = [
  { key: 'walkthrough', label: 'Field Walkthrough', icon: 'search' },
  { key: 'sampling', label: 'Sampling Plan', icon: 'drop' },
  { key: 'coc', label: 'Chain of Custody', icon: 'clip' },
  { key: 'lab', label: 'Lab Results', icon: 'flask' },
  { key: 'review', label: 'Risk / Compliance Review', icon: 'shield' },
  { key: 'report', label: 'Report Generation', icon: 'download' },
  { key: 'final', label: 'Final Review', icon: 'check' },
]

// Workflow stage → presentation + recommended next action. Tones follow the
// semantic palette: teal = active/brand, amber = waiting on regulated input,
// green = complete, grey = draft. (Purple is reserved for lab/science chrome.)
export const STATUS_META = {
  draft: { label: 'Draft', tone: '#8B93A5', next: 'Start field walkthrough', step: 'walkthrough' },
  field_active: { label: 'Field Assessment', tone: '#5E9E3F', next: 'Build sampling plan', step: 'sampling' },
  lab_pending: { label: 'Lab Results Pending', tone: '#FBBF24', next: 'Enter lab results', step: 'lab' },
  lab_received: { label: 'Lab Results Received', tone: '#5E9E3F', next: 'Run compliance review', step: 'review' },
  review_ready: { label: 'Review Ready', tone: '#22D3EE', next: 'Generate report', step: 'report' },
  report_draft: { label: 'Draft Report Ready', tone: '#5E9E3F', next: 'Final review', step: 'final' },
  complete: { label: 'Complete', tone: '#22C55E', next: 'View report', step: 'report' },
}

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.draft
}

const SITE_TYPES = ['School', 'Private Well', 'Commercial Building', 'Healthcare', 'Childcare', 'Municipal', 'Residential', 'Industrial']
export { SITE_TYPES }

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// Sample projects, seeded once so a fresh install reads as a populated
// workspace (demo / first-run). They are ordinary, deletable projects.
function seeds() {
  const now = Date.now()
  const d = (days) => new Date(now - days * 86400000).toISOString()
  const steps = (done, active) => Object.fromEntries(WORKFLOW_STEPS.map((s) => [s.key, done.includes(s.key) ? 'done' : s.key === active ? 'active' : 'todo']))
  return [
    { id: 'seed-1', name: 'Montgomery Elementary School', siteType: 'School', location: 'Rockville, MD', status: 'lab_pending', samples: 12, updatedAt: d(1), createdAt: d(9), steps: steps(['walkthrough', 'sampling', 'coc'], 'lab'), seed: true },
    { id: 'seed-2', name: 'Community Well #4', siteType: 'Private Well', location: 'Lancaster County, PA', status: 'review_ready', samples: 6, updatedAt: d(2), createdAt: d(12), steps: steps(['walkthrough', 'sampling', 'coc', 'lab'], 'review'), seed: true },
    { id: 'seed-3', name: 'Office Building Domestic Water', siteType: 'Commercial Building', location: 'Arlington, VA', status: 'report_draft', samples: 9, updatedAt: d(4), createdAt: d(20), steps: steps(['walkthrough', 'sampling', 'coc', 'lab', 'review'], 'report'), seed: true },
  ]
}

export function listProjects() {
  let list = read()
  if (list == null) { list = seeds(); write(list) }
  return list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
}

export function createProject({ name, siteType, location }) {
  const list = read() || []
  const now = new Date().toISOString()
  const project = {
    id: `p-${Date.now()}`,
    name: (name || 'Untitled Project').trim(),
    siteType: siteType || 'Commercial Building',
    location: (location || '').trim(),
    status: 'draft',
    samples: 0,
    updatedAt: now,
    createdAt: now,
    steps: Object.fromEntries(WORKFLOW_STEPS.map((s, i) => [s.key, i === 0 ? 'active' : 'todo'])),
  }
  write([project, ...list])
  return project
}

export function updateProject(id, patch) {
  const list = read() || []
  const next = list.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
  write(next)
  return next
}

export function deleteProject(id) {
  const list = (read() || []).filter((p) => p.id !== id)
  write(list)
  return list
}
