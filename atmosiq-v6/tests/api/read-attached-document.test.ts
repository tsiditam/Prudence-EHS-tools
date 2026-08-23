/**
 * read_attached_document — an attached report survives past one turn.
 *
 * Before this, a digest rode inline in the user message and
 * chatAttachments.js said what that meant: "readable now but is NOT
 * retrievable on a later turn". A 41-page consultant assessment could be
 * asked one question and was then gone.
 *
 * The inline prefix is also the least useful part of an assessment report:
 * scope and method at the front, findings and recommendations at the back.
 * So the tool has to page and to seek, not just return the head.
 */
import { describe, it, expect } from 'vitest'
import { dispatchTool, DOCUMENT_WINDOW_CHARS } from '../../src/constants/field-assistant-tools'

const LONG =
  'SCOPE AND METHODOLOGY. '.repeat(600)      // ~13,800 chars — past one window
  + 'FINDINGS AND RECOMMENDATIONS. Carbon dioxide reached 1,850 ppm in Suite 200. '
  + 'tail. '.repeat(200)

const row = {
  id: 'doc-1', name: 'assessment.pdf', kind: 'pdf',
  pages: 41, pages_read: 38, chars: LONG.length, content: LONG,
}

/** Minimal Supabase stub: records the filters, returns the row. */
function store(rows = [row]) {
  const filters: Record<string, unknown> = {}
  const q: Record<string, unknown> = {
    select: () => q, order: () => q,
    eq: (col: string, val: unknown) => { filters[col] = val; return q },
    limit: async () => ({ data: rows }),
  }
  return { client: { from: () => q }, filters }
}

const ctx = (s = store()) => ({
  supabase: s.client as never, conversationId: 'conv-1', userId: 'user-1',
})

describe('reading a stored document', () => {
  it('returns the head and says the document continues', async () => {
    const r: any = await dispatchTool('read_attached_document', {}, ctx())
    expect(r.ok).toBe(true)
    expect(r.offset).toBe(0)
    expect(r.text.length).toBe(DOCUMENT_WINDOW_CHARS)
    expect(r.more_remains).toBe(true)
    expect(r.next_offset).toBe(DOCUMENT_WINDOW_CHARS)
    expect(r.note).toMatch(/Call again with offset/)
    // The pages that were never extracted travel with every read.
    expect(r.pages).toBe(41)
    expect(r.pages_read).toBe(38)
  })

  it('pages forward from an offset, continuing exactly where it left off', async () => {
    const first: any = await dispatchTool('read_attached_document', {}, ctx())
    const next: any = await dispatchTool(
      'read_attached_document', { offset: first.next_offset }, ctx(),
    )
    expect(next.offset).toBe(DOCUMENT_WINDOW_CHARS)
    // The window is the document's own slice — no gap, no overlap. A page
    // boundary that drops or repeats characters is how a value gets read
    // twice or missed entirely.
    expect(next.text).toBe(LONG.slice(DOCUMENT_WINDOW_CHARS, DOCUMENT_WINDOW_CHARS * 2))
    expect(first.text + next.text).toBe(LONG.slice(0, DOCUMENT_WINDOW_CHARS * 2))
  })

  it('seeks to a section by phrase, with the lead-in before it', async () => {
    // The point of the whole feature: reach the findings without paging
    // through the front matter.
    const r: any = await dispatchTool(
      'read_attached_document', { search: 'FINDINGS AND RECOMMENDATIONS' }, ctx(),
    )
    expect(r.search_found).toBe(true)
    expect(r.text).toContain('1,850 ppm in Suite 200')
    // Started BEFORE the match so the heading arrives with context.
    expect(r.offset).toBeLessThan(LONG.indexOf('FINDINGS AND RECOMMENDATIONS'))
  })

  it('reports a phrase that is not there rather than pretending', async () => {
    const r: any = await dispatchTool(
      'read_attached_document', { search: 'asbestos survey' }, ctx(),
    )
    expect(r.ok).toBe(true)
    expect(r.search_found).toBe(false)
  })

  it('says when it has reached the end', async () => {
    const short = { ...row, content: 'short report', chars: 12 }
    const r: any = await dispatchTool('read_attached_document', {}, ctx(store([short])))
    expect(r.more_remains).toBe(false)
    expect(r.next_offset).toBeNull()
    expect(r.note).toMatch(/reaches the end/)
  })
})

describe('a document belongs to its conversation', () => {
  it('scopes every read to this thread and this user', async () => {
    // Two open threads must not be able to read each other's documents by
    // guessing an id — the id alone is never the authorisation.
    const s = store()
    await dispatchTool('read_attached_document', { document_id: 'doc-1' }, ctx(s))
    expect(s.filters.conversation_id).toBe('conv-1')
    expect(s.filters.user_id).toBe('user-1')
    expect(s.filters.id).toBe('doc-1')
  })

  it('reports a miss instead of falling back to another document', async () => {
    const r: any = await dispatchTool(
      'read_attached_document', { document_id: 'doc-9' }, ctx(store([])),
    )
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_such_document')
    expect(r.message).toContain('doc-9')
  })

  it('degrades cleanly with no store available', async () => {
    const r: any = await dispatchTool('read_attached_document', {}, {})
    expect(r.ok).toBe(false)
    expect(r.error).toBe('no_document_store')
  })
})
