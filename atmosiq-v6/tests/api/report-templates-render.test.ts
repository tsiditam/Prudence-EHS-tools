/**
 * Tests for /api/report-templates-render.
 *
 * Pins:
 *   • 401 / 403 / 404 auth + ownership behavior
 *   • 200 + base64 envelope on the default (JSON) response mode
 *   • 200 + bytes + correct Content-Disposition when client asks
 *     for response_mode='bytes'
 *   • filename sanitisation (path separators stripped, .docx appended)
 *   • 422 + typed error code when the rendered template is malformed
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { Document, Packer, Paragraph, TextRun } from 'docx'

interface FakeTemplateRow {
  id: string
  user_id: string
  name: string
  storage_path: string
}

let templatesTable: FakeTemplateRow[] = []
let storageBucket: Map<string, Buffer> = new Map()
let nextUser: { id: string; email: string } | null = null

function makeTemplatesChain() {
  const filters: Record<string, unknown> = {}
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters[col] = val; return chain },
    maybeSingle: async () => {
      const found = templatesTable.find((r) => {
        for (const k of Object.keys(filters)) {
          if ((r as any)[k] !== filters[k]) return false
        }
        return true
      })
      return found ? { data: found, error: null } : { data: null, error: null }
    },
  }
  return chain
}

const fakeStorage = {
  from: (bucket: string) => ({
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
    getUser: async () => ({ data: { user: nextUser }, error: nextUser ? null : { message: 'no user' } }),
  },
  from: (table: string) => {
    if (table === 'report_templates') return makeTemplatesChain()
    throw new Error(`unexpected table: ${table}`)
  },
  storage: fakeStorage,
}

function makeRes() {
  const out: { status: number; json: unknown; body: Buffer | string | null; headers: Record<string, string> } = {
    status: 0, json: undefined, body: null, headers: {},
  }
  const res: any = {
    status(n: number) { out.status = n; return res },
    json(body: unknown) { out.json = body; return res },
    setHeader(k: string, v: string) { out.headers[k] = v; return res },
    end(body?: Buffer | string) { if (body !== undefined) out.body = body; return res },
  }
  return { res, out }
}

let templateBuffer: Buffer

async function buildSampleTemplate(): Promise<Buffer> {
  const doc = new Document({
    sections: [{ children: [
      new Paragraph({ children: [new TextRun('Hello {{client.name}} at {{client.firm}}.')] }),
    ]}],
  })
  return Packer.toBuffer(doc)
}

async function buildMalformedTemplate(): Promise<Buffer> {
  // Unbalanced {{ — should trigger render_failed.
  const doc = new Document({
    sections: [{ children: [
      new Paragraph({ children: [new TextRun('Hello {{client.name at {{client.firm}}.')] }),
    ]}],
  })
  return Packer.toBuffer(doc)
}

import handler, { __test } from '../../api/report-templates-render'

describe('/api/report-templates-render', () => {
  beforeAll(async () => { templateBuffer = await buildSampleTemplate() })

  beforeEach(() => {
    templatesTable = [
      { id: 'mine',    user_id: 'user-1', name: 'Federal', storage_path: 'user-1/mine.docx' },
      { id: 'foreign', user_id: 'user-2', name: 'Other',   storage_path: 'user-2/foreign.docx' },
    ]
    storageBucket = new Map()
    storageBucket.set('report-templates/user-1/mine.docx', templateBuffer)
    storageBucket.set('report-templates/user-2/foreign.docx', templateBuffer)
    nextUser = { id: 'user-1', email: 'a@b.com' }
    __test.setSupabase(fakeSupabase)
  })

  it('405 on non-POST', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'GET', headers: {}, body: {} } as any, res as any)
    expect(out.status).toBe(405)
  })

  it('401 on missing auth header', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: {}, body: { template_id: 'mine' } } as any, res as any)
    expect(out.status).toBe(401)
  })

  it('400 on missing template_id', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: {} } as any, res as any)
    expect(out.status).toBe(400)
  })

  it('404 on unknown template_id', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { template_id: 'nope', assessment_context: {} } } as any, res as any)
    expect(out.status).toBe(404)
  })

  it('403 when template belongs to another user', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { template_id: 'foreign', assessment_context: {} } } as any, res as any)
    expect(out.status).toBe(403)
  })

  it('200 + base64 envelope on default JSON response mode', async () => {
    const { res, out } = makeRes()
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: {
        template_id: 'mine',
        assessment_context: {
          presurvey: { ps_recipient_name: 'Jane', ps_recipient_firm: 'Acme' },
        },
      },
    } as any, res as any)
    expect(out.status).toBe(200)
    const json = out.json as { ok: boolean; file_name: string; base64: string; tokens_filled: string[] }
    expect(json.ok).toBe(true)
    expect(json.file_name).toBe('Report.docx')
    expect(json.tokens_filled).toEqual(['client.firm', 'client.name'])
    expect(json.base64.length).toBeGreaterThan(100)
  })

  it('200 + bytes when response_mode="bytes"', async () => {
    const { res, out } = makeRes()
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: {
        template_id: 'mine',
        assessment_context: { presurvey: { ps_recipient_name: 'Jane', ps_recipient_firm: 'Acme' } },
        response_mode: 'bytes',
        file_name: 'Acme_Federal_Report',
      },
    } as any, res as any)
    expect(out.status).toBe(200)
    expect(out.headers['Content-Type']).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(out.headers['Content-Disposition']).toBe('attachment; filename="Acme_Federal_Report.docx"')
    expect(Buffer.isBuffer(out.body)).toBe(true)
  })

  it('sanitises file_name (strips path separators, appends .docx)', async () => {
    const { res, out } = makeRes()
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: { template_id: 'mine', assessment_context: {}, response_mode: 'bytes', file_name: '../etc/passwd' },
    } as any, res as any)
    expect(out.status).toBe(200)
    expect(out.headers['Content-Disposition']).toBe('attachment; filename=".._etc_passwd.docx"')
  })

  it('422 with typed error on a malformed template', async () => {
    const malformed = await buildMalformedTemplate()
    storageBucket.set('report-templates/user-1/mine.docx', malformed)
    const { res, out } = makeRes()
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer t' },
      body: { template_id: 'mine', assessment_context: {} },
    } as any, res as any)
    expect(out.status).toBe(422)
    expect((out.json as { error: string }).error).toMatch(/render_failed|template_parse_failed/)
  })
})
