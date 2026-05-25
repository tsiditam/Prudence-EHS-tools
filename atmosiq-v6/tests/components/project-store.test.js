// @vitest-environment jsdom
/**
 * Project / Site Folder store — CRUD + content + activity-log contract.
 *
 * Persistence is the STO localStorage wrapper, so these run under jsdom
 * (which provides localStorage). Each test starts from a clean store.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getProjects, getProject, createProject, updateProject, deleteProject,
  addDocument, removeDocument, addEvidence, removeEvidence,
  addNote, removeNote, linkReport, unlinkReport, MAX_INLINE_FILE_BYTES,
} from '../../src/utils/projectStore.js'

beforeEach(() => { localStorage.clear() })

describe('projectStore — CRUD', () => {
  it('creates a project with defaults, an id, timestamps, and a created activity entry', async () => {
    const p = await createProject({ name: 'Meridian Tower', client: 'Demo LLC', siteType: 'Office' })
    expect(p.id).toMatch(/^proj-/)
    expect(p.name).toBe('Meridian Tower')
    expect(p.status).toBe('draft')
    expect(p.documents).toEqual([])
    expect(p.linkedReportIds).toEqual([])
    expect(p.createdAt).toBeTruthy()
    expect(p.activity[0].text).toMatch(/created/i)
    const all = await getProjects()
    expect(all).toHaveLength(1)
  })

  it('falls back to a placeholder name and a valid status', async () => {
    const p = await createProject({ name: '   ', status: 'bogus' })
    expect(p.name).toBe('Untitled site')
    expect(p.status).toBe('draft')
  })

  it('updates metadata and logs a status change', async () => {
    const p = await createProject({ name: 'A' })
    const up = await updateProject(p.id, { client: 'New Client', status: 'active' })
    expect(up.client).toBe('New Client')
    expect(up.status).toBe('active')
    expect(up.activity.some(a => /Status changed to "active"/.test(a.text))).toBe(true)
    expect(up.updatedAt >= p.updatedAt).toBe(true)
  })

  it('deletes a project', async () => {
    const p = await createProject({ name: 'Gone' })
    await deleteProject(p.id)
    expect(await getProject(p.id)).toBeNull()
    expect(await getProjects()).toHaveLength(0)
  })

  it('orders projects by most-recently-updated first', async () => {
    // Controlled clock so the updatedAt timestamps are strictly distinct
    // (sub-millisecond create/update would otherwise tie).
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-05-01T00:00:00Z'))
      const a = await createProject({ name: 'A' })
      vi.setSystemTime(new Date('2026-05-02T00:00:00Z'))
      await createProject({ name: 'B' })
      vi.setSystemTime(new Date('2026-05-03T00:00:00Z'))
      await updateProject(a.id, { client: 'touch' }) // bump A to newest
      const order = (await getProjects()).map(p => p.name)
      expect(order).toEqual(['A', 'B'])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('projectStore — documents & evidence', () => {
  it('adds and removes a document, logging activity', async () => {
    const p = await createProject({ name: 'Docs' })
    const res = await addDocument(p.id, { name: 'lab.pdf', type: 'application/pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AA==', category: 'Lab results', uploadedBy: 'J. Smith' })
    expect(res.error).toBeUndefined()
    expect(res.project.documents).toHaveLength(1)
    expect(res.project.documents[0].name).toBe('lab.pdf')
    expect(res.project.documents[0].category).toBe('Lab results')
    expect(res.project.activity[0].text).toMatch(/Document added: lab\.pdf/)

    const docId = res.project.documents[0].id
    const after = await removeDocument(p.id, docId)
    expect(after.documents).toHaveLength(0)
    expect(after.activity[0].text).toMatch(/Document removed/)
  })

  it('rejects a document over the inline size cap with an error message', async () => {
    const p = await createProject({ name: 'Big' })
    const res = await addDocument(p.id, { name: 'huge.pdf', size: MAX_INLINE_FILE_BYTES + 1, dataUrl: 'data:...' })
    expect(res.error).toBeTruthy()
    expect((await getProject(p.id)).documents).toHaveLength(0)
  })

  it('adds and removes evidence photos', async () => {
    const p = await createProject({ name: 'Ev' })
    const res = await addEvidence(p.id, { name: 'wd.jpg', size: 2048, dataUrl: 'data:image/jpeg;base64,AA==' })
    expect(res.project.evidence).toHaveLength(1)
    const evId = res.project.evidence[0].id
    const after = await removeEvidence(p.id, evId)
    expect(after.evidence).toHaveLength(0)
  })
})

describe('projectStore — notes & linked assessments', () => {
  it('adds and removes notes; ignores empty note text', async () => {
    const p = await createProject({ name: 'Notes' })
    expect(await addNote(p.id, { text: '   ' })).toBeNull()
    const withNote = await addNote(p.id, { text: 'Follow up on AHU-3', author: 'J. Smith' })
    expect(withNote.notes).toHaveLength(1)
    expect(withNote.notes[0].text).toBe('Follow up on AHU-3')
    const after = await removeNote(p.id, withNote.notes[0].id)
    expect(after.notes).toHaveLength(0)
  })

  it('links an assessment idempotently and unlinks it', async () => {
    const p = await createProject({ name: 'Linked' })
    await linkReport(p.id, 'rpt-1', 'Meridian Tower')
    const dup = await linkReport(p.id, 'rpt-1', 'Meridian Tower')
    expect(dup.linkedReportIds).toEqual(['rpt-1']) // no duplicate
    const after = await unlinkReport(p.id, 'rpt-1')
    expect(after.linkedReportIds).toEqual([])
    expect(after.activity.some(a => /linked/i.test(a.text))).toBe(true)
  })
})
