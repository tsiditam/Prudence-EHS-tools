/**
 * Tests for /api/report-templates (upload / list / delete).
 *
 * Same fake-Supabase shape as field-assistant-feedback.test.ts:
 * inject a chainable mock via __test.setSupabase and verify the
 * handler's HTTP contract + side effects on the in-memory tables
 * and the in-memory storage bucket.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { Document, Packer, Paragraph, TextRun } from 'docx'

interface FakeTemplateRow {
  id: string
  user_id: string
  name: string
  storage_path: string
  tokens_found: string[]
  tokens_missing: string[]
  size_bytes: number
  created_at: string
}

let templatesTable: FakeTemplateRow[] = []
let storageBucket: Map<string, Buffer> = new Map()
let nextUser: { id: string; email: string } | null = null
let nextAuthError: { message: string } | null = null
let nextInsertId = 1

function makeTemplatesChain() {
  const filters: Record<string, unknown> = {}
  let orderBy: { col: string; asc: boolean } | null = null
  let _selectCols: string | null = null
  let pendingInsert: Partial<FakeTemplateRow> | null = null
  let pendingUpdate: Partial<FakeTemplateRow> | null = null
  let pendingDelete = false

  const chain: any = {
    select: (cols?: string) => { _selectCols = cols || '*'; return chain },
    insert: (row: Partial<FakeTemplateRow>) => { pendingInsert = row; return chain },
    update: (row: Partial<FakeTemplateRow>) => { pendingUpdate = row; return chain },
    delete: () => { pendingDelete = true; return chain },
    eq: (col: string, val: unknown) => { filters[col] = val; return chain },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderBy = { col, asc: opts?.ascending !== false }
      return chain
    },
    maybeSingle: async () => {
      const found = templatesTable.find((r) => {
        for (const k of Object.keys(filters)) {
          if ((r as any)[k] !== filters[k]) return false
        }
        return true
      })
      return found ? { data: found, error: null } : { data: null, error: null }
    },
    single: async () => {
      if (pendingInsert) {
        const id = `tpl-${nextInsertId++}`
        const row: FakeTemplateRow = {
          id,
          user_id: (pendingInsert.user_id as string) || '',
          name: pendingInsert.name as string,
          storage_path: pendingInsert.storage_path as string,
          tokens_found: (pendingInsert.tokens_found as string[]) || [],
          tokens_missing: (pendingInsert.tokens_missing as string[]) || [],
          size_bytes: (pendingInsert.size_bytes as number) || 0,
          created_at: new Date().toISOString(),
        }
        templatesTable.push(row)
        return { data: { id }, error: null }
      }
      return { data: null, error: { message: 'no single op pending' } }
    },
    then: async (resolve: (v: unknown) => void) => {
      // Allow `await chain` without .single / .maybeSingle for
      // update / delete / list flows.
      if (pendingUpdate) {
        for (const row of templatesTable) {
          let match = true
          for (const k of Object.keys(filters)) {
            if ((row as any)[k] !== filters[k]) { match = false; break }
          }
          if (match) Object.assign(row, pendingUpdate)
        }
        resolve({ error: null })
        return
      }
      if (pendingDelete) {
        templatesTable = templatesTable.filter((row) => {
          for (const k of Object.keys(filters)) {
            if ((row as any)[k] !== filters[k]) return true
          }
          return false
        })
        resolve({ error: null })
        return
      }
      // select() list — apply filters + order
      let rows = templatesTable.filter((r) => {
        for (const k of Object.keys(filters)) {
          if ((r as any)[k] !== filters[k]) return false
        }
        return true
      })
      if (orderBy) {
        rows = [...rows].sort((a, b) => {
          const av = (a as any)[orderBy!.col]
          const bv = (b as any)[orderBy!.col]
          return orderBy!.asc ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1)
        })
      }
      resolve({ data: rows, error: null })
    },
  }
  return chain
}

const fakeStorage = {
  from: (bucket: string) => ({
    upload: async (path: string, buffer: Buffer, _opts: unknown) => {
      const key = `${bucket}/${path}`
      if (storageBucket.has(key)) {
        return { data: null, error: { message: 'exists' } }
      }
      storageBucket.set(key, Buffer.from(buffer))
      return { data: { path }, error: null }
    },
    remove: async (paths: string[]) => {
      for (const p of paths) storageBucket.delete(`${bucket}/${p}`)
      return { data: paths, error: null }
    },
    download: async (path: string) => {
      const key = `${bucket}/${path}`
      const buf = storageBucket.get(key)
      if (!buf) return { data: null, error: { message: 'not_found' } }
      return {
        data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
        error: null,
      }
    },
  }),
}

const fakeSupabase: any = {
  auth: {
    getUser: async (_token: string) => {
      if (nextAuthError) return { data: { user: null }, error: nextAuthError }
      return { data: { user: nextUser }, error: null }
    },
  },
  from: (table: string) => {
    if (table === 'report_templates') return makeTemplatesChain()
    throw new Error(`unexpected table: ${table}`)
  },
  storage: fakeStorage,
}

function makeRes() {
  const out: { status: number; json: unknown } = { status: 0, json: undefined }
  const res: any = {
    status(n: number) { out.status = n; return res },
    json(body: unknown) { out.json = body; return res },
    setHeader: () => res,
    end: () => res,
  }
  return { res, out }
}

let templateBuffer: Buffer
async function buildSampleTemplate(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      { children: [
        new Paragraph({ children: [new TextRun('For {{client.name}} at {{client.firm}}.')] }),
        new Paragraph({ children: [new TextRun('Bogus: {{nope}}')] }),
      ]},
    ],
  })
  return Packer.toBuffer(doc)
}

import handler, { __test } from '../../api/report-templates'

describe('/api/report-templates', () => {
  beforeAll(async () => { templateBuffer = await buildSampleTemplate() })

  beforeEach(() => {
    templatesTable = []
    storageBucket = new Map()
    nextUser = { id: 'user-1', email: 'a@b.com' }
    nextAuthError = null
    nextInsertId = 1
    __test.setSupabase(fakeSupabase)
  })

  it('405 on non-POST', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, body: {} } as any, res as any)
    expect(out.status).toBe(405)
  })

  it('401 on missing auth header', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: {}, body: { action: 'list' } } as any, res as any)
    expect(out.status).toBe(401)
  })

  it('400 on unknown action', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'frobnicate' } } as any, res as any)
    expect(out.status).toBe(400)
  })

  describe('upload', () => {
    it('400 on missing name', async () => {
      const { res, out } = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'upload', base64: 'xxx' } } as any, res as any)
      expect(out.status).toBe(400)
    })

    it('400 on missing base64', async () => {
      const { res, out } = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'upload', name: 'Federal' } } as any, res as any)
      expect(out.status).toBe(400)
    })

    it('400 on non-docx payload', async () => {
      const { res, out } = makeRes()
      const garbage = Buffer.from('definitely not a docx').toString('base64')
      await handler({
        method: 'POST', headers: { authorization: 'Bearer t' },
        body: { action: 'upload', name: 'Garbage', base64: garbage },
      } as any, res as any)
      expect(out.status).toBe(400)
    })

    it('400 on oversized payload', async () => {
      const big = Buffer.alloc(__test.MAX_TEMPLATE_BYTES + 1, 0x50).toString('base64')
      const { res, out } = makeRes()
      await handler({
        method: 'POST', headers: { authorization: 'Bearer t' },
        body: { action: 'upload', name: 'Big', base64: big },
      } as any, res as any)
      expect(out.status).toBe(400)
      expect(out.json).toMatchObject({ error: 'file_too_large' })
    })

    it('200 + writes catalog row + storage object on success', async () => {
      const { res, out } = makeRes()
      await handler({
        method: 'POST', headers: { authorization: 'Bearer t' },
        body: { action: 'upload', name: 'Federal', base64: templateBuffer.toString('base64') },
      } as any, res as any)
      expect(out.status).toBe(200)
      expect(out.json).toMatchObject({
        name: 'Federal',
        tokens_found: ['client.firm', 'client.name'],
        tokens_unknown: ['nope'],
      })
      expect(templatesTable).toHaveLength(1)
      expect(templatesTable[0].name).toBe('Federal')
      expect(templatesTable[0].user_id).toBe('user-1')
      expect(templatesTable[0].storage_path).toBe(`user-1/${templatesTable[0].id}.docx`)
      expect(storageBucket.has(`report-templates/${templatesTable[0].storage_path}`)).toBe(true)
    })

    it('strips a data:URL prefix from the base64 payload', async () => {
      const { res, out } = makeRes()
      const dataUrl = `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${templateBuffer.toString('base64')}`
      await handler({
        method: 'POST', headers: { authorization: 'Bearer t' },
        body: { action: 'upload', name: 'WithPrefix', base64: dataUrl },
      } as any, res as any)
      expect(out.status).toBe(200)
    })
  })

  describe('list', () => {
    it('returns the calling user\'s templates, newest first', async () => {
      templatesTable.push(
        { id: 'a', user_id: 'user-1', name: 'A', storage_path: 'user-1/a.docx', tokens_found: [], tokens_missing: [], size_bytes: 100, created_at: '2026-01-01T00:00:00Z' },
        { id: 'b', user_id: 'user-1', name: 'B', storage_path: 'user-1/b.docx', tokens_found: [], tokens_missing: [], size_bytes: 200, created_at: '2026-02-01T00:00:00Z' },
        { id: 'c', user_id: 'user-2', name: 'C', storage_path: 'user-2/c.docx', tokens_found: [], tokens_missing: [], size_bytes: 300, created_at: '2026-03-01T00:00:00Z' },
      )
      const { res, out } = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'list' } } as any, res as any)
      expect(out.status).toBe(200)
      const templates = (out.json as { templates: FakeTemplateRow[] }).templates
      expect(templates.map((t) => t.id)).toEqual(['b', 'a'])
    })
  })

  describe('delete', () => {
    it('404 when the id is unknown to this user', async () => {
      templatesTable.push({ id: 'foreign', user_id: 'user-2', name: 'X', storage_path: 'user-2/foreign.docx', tokens_found: [], tokens_missing: [], size_bytes: 0, created_at: '' })
      const { res, out } = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'delete', id: 'foreign' } } as any, res as any)
      expect(out.status).toBe(404)
    })

    it('200 + removes catalog row AND storage object', async () => {
      templatesTable.push({ id: 'mine', user_id: 'user-1', name: 'M', storage_path: 'user-1/mine.docx', tokens_found: [], tokens_missing: [], size_bytes: 0, created_at: '' })
      storageBucket.set('report-templates/user-1/mine.docx', Buffer.from('x'))
      const { res, out } = makeRes()
      await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { action: 'delete', id: 'mine' } } as any, res as any)
      expect(out.status).toBe(200)
      expect(templatesTable).toHaveLength(0)
      expect(storageBucket.has('report-templates/user-1/mine.docx')).toBe(false)
    })
  })
})
