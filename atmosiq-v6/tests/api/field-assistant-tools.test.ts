/**
 * Tests for /api/field-assistant tool use (Phase 2).
 *
 * Pins the contract:
 *   • lookup_standard returns thresholds for known names, error for unknown
 *   • get_assessment requires assessment_id and rejects cross-user reads
 *   • get_zone_readings validates both args
 *   • Multi-round tool loop: handler executes the tool, sends result back,
 *     gets a final text response, and emits tool_use + tool_result SSE
 *   • Tool-loop cap fires when Claude won't stop calling tools
 *   • Final SSE events include `rounds` count
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))

// ─── Captured state ─────────────────────────────────────────────────
type Generation = {
  user_id: string
  generation_type: string
  generated_at: string
  input_tokens: number | null
  output_tokens: number | null
  estimated_cost_usd: number | null
}
const generations: Generation[] = []
const conversations: { id: string; user_id: string; title: string | null }[] = []
const messages: { conversation_id: string; user_id: string; role: 'user' | 'assistant'; content: string; context_view: string | null }[] = []
const assessmentsTable: Record<string, any> = {}
let now = Date.parse('2026-05-15T12:00:00Z')
let nextUser: { id: string; email: string } | null = null
let nextProfile: { plan: string } | null = null

function resetState() {
  generations.length = 0
  conversations.length = 0
  messages.length = 0
  for (const k of Object.keys(assessmentsTable)) delete assessmentsTable[k]
  now = Date.parse('2026-05-15T12:00:00Z')
  nextUser = { id: 'user-1', email: 'assessor@example.com' }
  nextProfile = { plan: 'pro' }
}

function makeChain(table: string): any {
  const ctx: any = {
    _filters: {} as Record<string, unknown>,
    _gte: null as null | { col: string; val: string },
    _isCount: false,
    _isInsert: false,
    _selectAfterInsert: false,
  }
  const chain: any = {
    select: (_sel?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts && opts.count === 'exact') ctx._isCount = true
      if (ctx._isInsert) ctx._selectAfterInsert = true
      return chain
    },
    eq: (col: string, val: unknown) => { ctx._filters[col] = val; return chain },
    gte: (col: string, val: string) => { ctx._gte = { col, val }; return chain },
    order: () => chain,
    limit: () => chain,
    single: async () => {
      if (table === 'profiles') return { data: nextProfile, error: null }
      if (table === 'narrative_generations') {
        return { data: null, error: null }
      }
      if (table === 'field_assistant_conversations' && ctx._selectAfterInsert) {
        const last = conversations[conversations.length - 1]
        return { data: last ? { id: last.id } : null, error: null }
      }
      if (table === 'assessments') {
        const id = ctx._filters.id
        const userId = ctx._filters.user_id
        const row = assessmentsTable[String(id)]
        if (!row || row.user_id !== userId) {
          return { data: null, error: { message: 'not found' } }
        }
        return { data: row, error: null }
      }
      return { data: null, error: null }
    },
    insert: (row: any) => {
      ctx._isInsert = true
      if (table === 'narrative_generations') {
        generations.push({
          user_id: row.user_id,
          generation_type: row.generation_type || 'narrative',
          generated_at: new Date(now).toISOString(),
          input_tokens: row.input_tokens, output_tokens: row.output_tokens, estimated_cost_usd: row.estimated_cost_usd,
        })
      }
      if (table === 'field_assistant_conversations') {
        const id = `conv-${conversations.length + 1}`
        conversations.push({ id, user_id: row.user_id, title: row.title || null })
      }
      if (table === 'field_assistant_messages') {
        messages.push({
          conversation_id: row.conversation_id, user_id: row.user_id,
          role: row.role, content: row.content, context_view: row.context_view || null,
        })
      }
      return chain
    },
  }
  ;(chain as any).then = (resolve: (r: any) => void) => {
    if (table === 'narrative_generations' && ctx._isCount) {
      resolve({ data: null, error: null, count: 0 })
      return
    }
    if (table === 'field_assistant_messages' && !ctx._isInsert) {
      resolve({ data: [], error: null })
      return
    }
    resolve({ data: null, error: null })
  }
  return chain
}

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => ({ data: { user: nextUser }, error: null }) },
    from: (table: string) => makeChain(table),
  }
}

// ─── Stream helpers ─────────────────────────────────────────────────
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function streamFromFrames(frames: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const f of frames) controller.enqueue(encoder.encode(f))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 }) as Response
}

// Build a tool_use-only round (Claude wants to call a tool).
function toolUseStreamFrames(toolName: string, toolInput: unknown, toolId = 'toolu_1') {
  const inputJson = JSON.stringify(toolInput)
  return [
    frame('message_start', { type: 'message_start', message: { usage: { input_tokens: 100, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 } } }),
    frame('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: toolId, name: toolName, input: {} } }),
    frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: inputJson } }),
    frame('content_block_stop', { type: 'content_block_stop', index: 0 }),
    frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } }),
    frame('message_stop', { type: 'message_stop' }),
  ]
}

// Build a text-only final round.
function textStreamFrames(text: string) {
  return [
    frame('message_start', { type: 'message_start', message: { usage: { input_tokens: 150, cache_read_input_tokens: 140, cache_creation_input_tokens: 0 } } }),
    frame('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }),
    frame('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 30 } }),
    frame('message_stop', { type: 'message_stop' }),
  ]
}

// ─── Req/Res helpers ────────────────────────────────────────────────
function makeReq(body: unknown): any {
  return { method: 'POST', headers: { authorization: 'Bearer fake-jwt' }, body, socket: {} }
}

function makeRes() {
  const captured: any = { statusCode: 200, headers: {}, body: undefined, sseChunks: [] as string[], ended: false }
  const res = {
    status(c: number) { captured.statusCode = c; return res },
    json(b: unknown) { captured.body = b },
    setHeader(n: string, v: string) { captured.headers[n] = v },
    write(c: string) { captured.sseChunks.push(c) },
    end() { captured.ended = true },
  }
  return { res, captured }
}

function sseEvents(captured: any): { event: string; data: any }[] {
  const out: { event: string; data: any }[] = []
  for (const block of captured.sseChunks.join('').split('\n\n')) {
    const lines = block.split('\n')
    const ev = lines.find((l: string) => l.startsWith('event: '))
    const dt = lines.find((l: string) => l.startsWith('data: '))
    if (!ev || !dt) continue
    out.push({ event: ev.slice(7), data: JSON.parse(dt.slice(6)) })
  }
  return out
}

import * as handlerMod from '../../api/field-assistant'
const fnHandler = (handlerMod as any).default
const t = (handlerMod as any).__test as typeof import('../../api/field-assistant').__test

beforeEach(() => {
  resetState()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  t.setSupabase(makeSupabaseMock() as any)
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

// ── Unit tests for tool implementations ────────────────────────────
describe('field-assistant tool implementations', () => {
  it('lookup_standard returns version for a known standard', () => {
    const r = t.toolLookupStandard({ name: 'ASHRAE 62.1' })
    expect(r.ok).toBe(true)
    expect((r.data as any).name).toMatch(/62\.1/)
    expect((r.data as any).version).toBeTruthy()
  })

  it('lookup_standard does case-insensitive substring match', () => {
    const r = t.toolLookupStandard({ name: 'naaqs' })
    expect(r.ok).toBe(true)
    expect((r.data as any).name).toMatch(/NAAQS/)
  })

  it('lookup_standard returns error for unknown standard', () => {
    const r = t.toolLookupStandard({ name: 'ASHRAE 80085' })
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it('lookup_standard rejects empty name', () => {
    const r = t.toolLookupStandard({ name: '' })
    expect(r.ok).toBe(false)
  })

  it('get_assessment rejects missing assessment_id', async () => {
    const r = await t.toolGetAssessment(makeSupabaseMock() as any, 'user-1', {})
    expect(r.ok).toBe(false)
  })

  it('get_assessment returns row owned by the user', async () => {
    assessmentsTable['a-owned'] = { id: 'a-owned', user_id: 'user-1', facility_name: 'Acme HQ', zones: [], zone_scores: {} }
    const r = await t.toolGetAssessment(makeSupabaseMock() as any, 'user-1', { assessment_id: 'a-owned' })
    expect(r.ok).toBe(true)
    expect((r.data as any).facility_name).toBe('Acme HQ')
  })

  it('get_assessment refuses to read another user\'s assessment', async () => {
    assessmentsTable['a-other'] = { id: 'a-other', user_id: 'user-other', facility_name: 'Other Co' }
    const r = await t.toolGetAssessment(makeSupabaseMock() as any, 'user-1', { assessment_id: 'a-other' })
    expect(r.ok).toBe(false)
  })

  it('get_zone_readings rejects missing args', async () => {
    const r1 = await t.toolGetZoneReadings(makeSupabaseMock() as any, 'user-1', {})
    expect(r1.ok).toBe(false)
    const r2 = await t.toolGetZoneReadings(makeSupabaseMock() as any, 'user-1', { assessment_id: 'x' })
    expect(r2.ok).toBe(false)
  })

  it('get_zone_readings returns the requested zone', async () => {
    assessmentsTable['a-z'] = {
      id: 'a-z', user_id: 'user-1',
      zones: [{ zn: 'Zone A', co2: '900' }, { zn: 'Zone B', co2: '1400' }],
      zone_scores: { '1': { tot: 62 } },
    }
    const r = await t.toolGetZoneReadings(makeSupabaseMock() as any, 'user-1', { assessment_id: 'a-z', zone_index: 1 })
    expect(r.ok).toBe(true)
    expect((r.data as any).zone.zn).toBe('Zone B')
    expect((r.data as any).score?.tot).toBe(62)
  })

  it('executeTool dispatches by name and rejects unknown tools', async () => {
    const r = await t.executeTool(makeSupabaseMock() as any, 'user-1', 'no_such_tool', {})
    expect(r.ok).toBe(false)
  })
})

// ── Integration test for the tool loop in the handler ──────────────
describe('field-assistant tool loop', () => {
  it('runs a tool, sends result back, and emits tool_use + tool_result SSE', async () => {
    // First call: Claude requests lookup_standard. Second call: final text.
    let call = 0
    t.setFetch(((_url: string) => {
      call++
      if (call === 1) {
        return Promise.resolve(streamFromFrames(toolUseStreamFrames('lookup_standard', { name: 'ASHRAE 62.1' })))
      }
      return Promise.resolve(streamFromFrames(textStreamFrames('ASHRAE 62.1 sets ventilation rates.')))
    }) as any)

    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'Tell me about ASHRAE 62.1.' }), res as any)

    expect(call).toBe(2)
    const events = sseEvents(captured)
    const toolUseEv = events.find((e) => e.event === 'tool_use')
    const toolResEv = events.find((e) => e.event === 'tool_result')
    const tokenEvs = events.filter((e) => e.event === 'token')
    const doneEv = events.find((e) => e.event === 'done')
    expect(toolUseEv).toBeDefined()
    expect(toolUseEv?.data.name).toBe('lookup_standard')
    expect(toolResEv).toBeDefined()
    expect(toolResEv?.data.ok).toBe(true)
    expect(tokenEvs.length).toBeGreaterThan(0)
    expect(doneEv).toBeDefined()
    expect(doneEv?.data.rounds).toBe(2)
  })

  it('caps tool-loop rounds when the model keeps calling tools', async () => {
    // Always return a tool_use stream so the loop must self-terminate.
    t.setFetch(((_url: string) =>
      Promise.resolve(streamFromFrames(toolUseStreamFrames('lookup_standard', { name: 'ASHRAE 62.1' })))) as any)

    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'Loop forever please.' }), res as any)

    const events = sseEvents(captured)
    const doneEv = events.find((e) => e.event === 'done')
    expect(doneEv).toBeDefined()
    // 1 initial + MAX_TOOL_ROUNDS = 6 calls allowed, then break.
    expect(doneEv?.data.rounds).toBeLessThanOrEqual(6)
    // tool_use events should fire on each round
    expect(events.filter((e) => e.event === 'tool_use').length).toBeGreaterThanOrEqual(5)
  })
})
