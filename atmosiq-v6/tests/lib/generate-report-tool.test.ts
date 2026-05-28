/**
 * Focused tests for the generate_report branch of dispatchTool().
 *
 * Exercises the dispatcher directly with an injected fake supabase
 * + an injected renderTemplate stub, so we cover the
 * lookup → resolve → download → render flow without the full
 * field-assistant handler harness.
 *
 * Pins:
 *   • render_unavailable when ctx lacks supabase/userId
 *   • no_templates_saved when the user has no saved templates
 *   • needs_disambiguation when multiple templates exist and no hint
 *   • needs_disambiguation when the name_hint matches >1 template
 *   • not_found when an id_hint doesn't match
 *   • ok + base64 + stripped tokens metadata on a successful render
 *   • auto-picks the only template when there's exactly one saved
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchTool } from '../../src/constants/field-assistant-tools.js'

interface FakeTplRow {
  id: string
  name: string
  user_id: string
  storage_path: string
  created_at: string
}

let tplTable: FakeTplRow[] = []
let storageBucket: Map<string, Buffer> = new Map()
let listErrorOnce: { message: string } | null = null

function makeTplChain() {
  const filters: Record<string, unknown> = {}
  let orderCol: string | null = null
  let orderAsc = true
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters[col] = val; return chain },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col
      orderAsc = opts?.ascending !== false
      return chain
    },
    then: async (resolve: (v: unknown) => void) => {
      if (listErrorOnce) {
        const err = listErrorOnce
        listErrorOnce = null
        resolve({ data: null, error: err })
        return
      }
      let rows = tplTable.filter((r) => {
        for (const k of Object.keys(filters)) {
          if ((r as any)[k] !== filters[k]) return false
        }
        return true
      })
      if (orderCol) {
        rows = [...rows].sort((a, b) => {
          const av = (a as any)[orderCol!]
          const bv = (b as any)[orderCol!]
          return orderAsc ? (av > bv ? 1 : -1) : (av > bv ? -1 : 1)
        })
      }
      resolve({ data: rows, error: null })
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
  from: (table: string) => {
    if (table === 'report_templates') return makeTplChain()
    throw new Error(`unexpected table: ${table}`)
  },
  storage: fakeStorage,
}

// Stub renderer — never invoke the real PizZip path here. Returns
// a deterministic buffer + the token lists the dispatcher echoes.
function fakeRender() {
  return {
    buffer: Buffer.from('FAKE_DOCX_BYTES'),
    tokens_filled: ['client.name'],
    tokens_empty: [],
    tokens_unknown: [],
  }
}

const baseCtx = {
  supabase: fakeSupabase,
  userId: 'user-1',
  assessmentContext: { presurvey: { ps_recipient_name: 'Jane' } },
  renderTemplate: fakeRender,
}

describe('dispatchTool: generate_report', () => {
  beforeEach(() => {
    tplTable = []
    storageBucket = new Map()
    listErrorOnce = null
  })

  it('returns render_unavailable when ctx lacks supabase/userId', async () => {
    const out = await dispatchTool('generate_report', {}, {})
    expect(out).toMatchObject({ status: 'error', error: 'render_unavailable' })
  })

  it('returns no_templates_saved when the user has no templates', async () => {
    const out = await dispatchTool('generate_report', {}, baseCtx)
    expect(out).toMatchObject({ status: 'no_templates_saved' })
  })

  it('auto-picks the only template when exactly one exists', async () => {
    tplTable = [{
      id: 'only', name: 'Federal', user_id: 'user-1',
      storage_path: 'user-1/only.docx', created_at: '2026-05-01T00:00:00Z',
    }]
    storageBucket.set('report-templates/user-1/only.docx', Buffer.from('TPL'))
    const out = await dispatchTool('generate_report', {}, baseCtx)
    expect(out).toMatchObject({
      status: 'ok',
      template_id: 'only',
      template_name: 'Federal',
      tokens_filled: ['client.name'],
    })
    expect((out as { base64: string }).base64).toBe(Buffer.from('FAKE_DOCX_BYTES').toString('base64'))
    expect((out as { file_name: string }).file_name).toMatch(/^Federal_\d{4}-\d{2}-\d{2}\.docx$/)
  })

  it('returns needs_disambiguation when multiple templates exist and no hint', async () => {
    tplTable = [
      { id: 'a', name: 'Federal', user_id: 'user-1', storage_path: 'user-1/a.docx', created_at: '2026-05-02T00:00:00Z' },
      { id: 'b', name: 'Acme',    user_id: 'user-1', storage_path: 'user-1/b.docx', created_at: '2026-05-01T00:00:00Z' },
    ]
    const out = await dispatchTool('generate_report', {}, baseCtx)
    expect(out).toMatchObject({ status: 'needs_disambiguation' })
    const candidates = (out as { candidates: Array<{ id: string; name: string }> }).candidates
    expect(candidates.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('returns needs_disambiguation when the name_hint matches >1 template', async () => {
    tplTable = [
      { id: 'a', name: 'Federal client', user_id: 'user-1', storage_path: 'user-1/a.docx', created_at: '2026-05-02T00:00:00Z' },
      { id: 'b', name: 'Federal site',   user_id: 'user-1', storage_path: 'user-1/b.docx', created_at: '2026-05-01T00:00:00Z' },
      { id: 'c', name: 'Acme',           user_id: 'user-1', storage_path: 'user-1/c.docx', created_at: '2026-05-01T00:00:00Z' },
    ]
    const out = await dispatchTool('generate_report', { template_name_hint: 'federal' }, baseCtx)
    expect(out).toMatchObject({ status: 'needs_disambiguation' })
    const candidates = (out as { candidates: Array<{ id: string; name: string }> }).candidates
    expect(candidates.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })

  it('returns not_found when template_id does not match', async () => {
    tplTable = [{
      id: 'only', name: 'Federal', user_id: 'user-1',
      storage_path: 'user-1/only.docx', created_at: '2026-05-01T00:00:00Z',
    }]
    const out = await dispatchTool('generate_report', { template_id: 'nope' }, baseCtx)
    expect(out).toMatchObject({ status: 'not_found' })
  })

  it('resolves a single-match name hint and renders successfully', async () => {
    tplTable = [
      { id: 'fed', name: 'Federal Letterhead', user_id: 'user-1', storage_path: 'user-1/fed.docx', created_at: '2026-05-02T00:00:00Z' },
      { id: 'acme', name: 'Acme',              user_id: 'user-1', storage_path: 'user-1/acme.docx', created_at: '2026-05-01T00:00:00Z' },
    ]
    storageBucket.set('report-templates/user-1/fed.docx', Buffer.from('TPL'))
    const out = await dispatchTool(
      'generate_report',
      { template_name_hint: 'Federal', file_name: 'Custom_Report' },
      baseCtx,
    )
    expect(out).toMatchObject({
      status: 'ok',
      template_id: 'fed',
      template_name: 'Federal Letterhead',
      file_name: 'Custom_Report.docx',
    })
  })

  it('returns storage_download_failed when the file is missing', async () => {
    tplTable = [{
      id: 'orphan', name: 'Federal', user_id: 'user-1',
      storage_path: 'user-1/orphan.docx', created_at: '2026-05-01T00:00:00Z',
    }]
    const out = await dispatchTool('generate_report', {}, baseCtx)
    expect(out).toMatchObject({ status: 'error', error: 'storage_download_failed' })
  })
})
