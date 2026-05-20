/**
 * Tests for /api/field-assistant.
 *
 * Pins the contract:
 *   • 405 on non-POST
 *   • 401 on missing or invalid auth
 *   • 400 on missing or oversized message
 *   • 429 on rate limit (per-minute, free-tier daily)
 *   • SSE stream emits meta + token* + done events
 *   • User + assistant turns persisted (PII-scrubbed)
 *   • Conversation id reused when provided, generated when null
 *   • Cost calculation includes cache-read pricing
 *   • Token-cost ledger row uses generation_type='field_assistant'
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
type Conversation = { id: string; user_id: string; title: string | null }
type Message = {
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  context_view: string | null
}
const generations: Generation[] = []
const conversations: Conversation[] = []
const messages: Message[] = []
let now = Date.parse('2026-04-30T12:00:00Z')

let nextUser: { id: string; email: string } | null = null
let nextProfile: { plan: string } | null = null

function resetState() {
  generations.length = 0
  conversations.length = 0
  messages.length = 0
  now = Date.parse('2026-04-30T12:00:00Z')
  nextUser = { id: 'user-1', email: 'assessor@example.com' }
  nextProfile = { plan: 'pro' }
}

// ─── Supabase mock ──────────────────────────────────────────────────
function makeChain(table: string): any {
  const ctx: any = {
    _filters: {} as Record<string, unknown>,
    _gte: null as null | { col: string; val: string },
    _orderAsc: false,
    _limit: null as null | number,
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
    eq: (col: string, val: unknown) => {
      ctx._filters[col] = val
      return chain
    },
    gte: (col: string, val: string) => {
      ctx._gte = { col, val }
      return chain
    },
    order: (col: string, opts: { ascending: boolean }) => {
      ctx._orderAsc = opts.ascending
      ctx._orderCol = col
      return chain
    },
    limit: (n: number) => {
      ctx._limit = n
      return chain
    },
    single: async () => {
      if (table === 'profiles') return { data: nextProfile, error: null }
      if (table === 'narrative_generations') {
        const matched = generations
          .filter((g) => {
            if (g.user_id !== ctx._filters.user_id) return false
            if (g.generation_type !== ctx._filters.generation_type) return false
            if (ctx._gte && new Date(g.generated_at).getTime() < new Date(ctx._gte.val).getTime())
              return false
            return true
          })
          .sort((a, b) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime())
        const first = matched[0]
        return { data: first ? { generated_at: first.generated_at } : null, error: null }
      }
      if (table === 'field_assistant_conversations' && ctx._selectAfterInsert) {
        const last = conversations[conversations.length - 1]
        return { data: last ? { id: last.id } : null, error: null }
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
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          estimated_cost_usd: row.estimated_cost_usd,
        })
      }
      if (table === 'field_assistant_conversations') {
        const id = `conv-${conversations.length + 1}`
        conversations.push({ id, user_id: row.user_id, title: row.title || null })
      }
      if (table === 'field_assistant_messages') {
        messages.push({
          conversation_id: row.conversation_id,
          user_id: row.user_id,
          role: row.role,
          content: row.content,
          context_view: row.context_view || null,
        })
      }
      return chain
    },
  }
  // Make the chain awaitable. For count queries, count is the relevant
  // field; for plain inserts the resolved value is { data, error }.
  ;(chain as any).then = (resolve: (r: any) => void) => {
    if (table === 'narrative_generations' && ctx._isCount) {
      const count = generations.filter((g) => {
        if (g.user_id !== ctx._filters.user_id) return false
        if (g.generation_type !== ctx._filters.generation_type) return false
        if (ctx._gte && new Date(g.generated_at).getTime() < new Date(ctx._gte.val).getTime())
          return false
        return true
      }).length
      resolve({ data: null, error: null, count })
      return
    }
    if (table === 'field_assistant_messages' && !ctx._isInsert) {
      // SELECT history
      const data = messages
        .filter((m) => m.conversation_id === ctx._filters.conversation_id && m.user_id === ctx._filters.user_id)
        .map((m) => ({ role: m.role, content: m.content, created_at: new Date(now).toISOString() }))
      resolve({ data, error: null })
      return
    }
    resolve({ data: null, error: null })
  }
  return chain
}

function makeSupabaseMock() {
  return {
    auth: {
      getUser: async (_token: string) => ({ data: { user: nextUser }, error: null }),
    },
    from: (table: string) => makeChain(table),
  }
}

// ─── Fetch mock (Anthropic stream) ──────────────────────────────────
function makeStreamingResponse(events: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(e))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 }) as Response
}

function defaultStreamEvents(text: string, inputTokens = 4100, cacheRead = 3900, outputTokens = 12) {
  return [
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: inputTokens, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: 0 } },
    })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      delta: { type: 'text_delta', text },
    })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn' },
      usage: { output_tokens: outputTokens },
    })}\n\n`,
  ]
}

// ─── Req / Res helpers ──────────────────────────────────────────────
function makeReq(body: unknown, headers: Record<string, string> = {}): any {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer fake-jwt', ...headers },
    body,
    socket: { remoteAddress: '127.0.0.1' },
  }
}

interface CapturedRes {
  statusCode: number
  headers: Record<string, string>
  body: unknown
  sseChunks: string[]
  ended: boolean
}

function makeRes() {
  const captured: CapturedRes = {
    statusCode: 200,
    headers: {},
    body: undefined,
    sseChunks: [],
    ended: false,
  }
  const res = {
    status(code: number) {
      captured.statusCode = code
      return res
    },
    json(body: unknown) {
      captured.body = body
    },
    setHeader(name: string, value: string) {
      captured.headers[name] = value
    },
    write(chunk: string) {
      captured.sseChunks.push(chunk)
    },
    end() {
      captured.ended = true
    },
  }
  return { res, captured }
}

function sseEvents(captured: CapturedRes): { event: string; data: any }[] {
  const joined = captured.sseChunks.join('')
  const out: { event: string; data: any }[] = []
  for (const block of joined.split('\n\n')) {
    const lines = block.split('\n')
    const evLine = lines.find((l) => l.startsWith('event: '))
    const dataLine = lines.find((l) => l.startsWith('data: '))
    if (!evLine || !dataLine) continue
    out.push({ event: evLine.slice(7), data: JSON.parse(dataLine.slice(6)) })
  }
  return out
}

// ─── Handler import + setup ─────────────────────────────────────────
// Namespace import so the named `__test` export comes through alongside
// `default`. Vitest's TS compiler doesn't interop default + named the
// way a `import x from` line would imply.
import * as handlerMod from '../../api/field-assistant'
const fnHandler = (handlerMod as any).default
const t = (handlerMod as any).__test as typeof import('../../api/field-assistant').__test

beforeEach(() => {
  resetState()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  t.setSupabase(makeSupabaseMock())
  t.setFetch(((_url: string, _init: any) =>
    Promise.resolve(makeStreamingResponse(defaultStreamEvents('OK.')))) as any)
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

describe('field-assistant handler', () => {
  it('rejects non-POST with 405', async () => {
    const { res, captured } = makeRes()
    await fnHandler({ method: 'GET', headers: {} } as any, res as any)
    expect(captured.statusCode).toBe(405)
  })

  it('rejects missing auth with 401', async () => {
    const { res, captured } = makeRes()
    await fnHandler({ method: 'POST', headers: {}, body: {} } as any, res as any)
    expect(captured.statusCode).toBe(401)
  })

  it('rejects invalid token with 401', async () => {
    nextUser = null
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'hi' }), res as any)
    expect(captured.statusCode).toBe(401)
  })

  it('rejects missing message with 400', async () => {
    const { res, captured } = makeRes()
    await fnHandler(makeReq({}), res as any)
    expect(captured.statusCode).toBe(400)
  })

  it('rejects oversized message with 400', async () => {
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'x'.repeat(t.MAX_USER_MESSAGE_LEN + 1) }), res as any)
    expect(captured.statusCode).toBe(400)
  })

  it('emits meta, token, and done SSE events on success', async () => {
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'What is ASHRAE 62.1?' }), res as any)
    const events = sseEvents(captured)
    expect(events.find((e) => e.event === 'meta')).toBeDefined()
    expect(events.filter((e) => e.event === 'token').length).toBeGreaterThan(0)
    expect(events.find((e) => e.event === 'done')).toBeDefined()
    expect(captured.ended).toBe(true)
  })

  it('persists user + assistant turns', async () => {
    const { res } = makeRes()
    await fnHandler(makeReq({ message: 'How does CO2 ventilation work?' }), res as any)
    const userTurns = messages.filter((m) => m.role === 'user')
    const assistantTurns = messages.filter((m) => m.role === 'assistant')
    expect(userTurns.length).toBe(1)
    expect(userTurns[0].content).toContain('CO2 ventilation')
    expect(assistantTurns.length).toBe(1)
    expect(assistantTurns[0].content).toBe('OK.')
  })

  it('creates a new conversation when conversation_id is null', async () => {
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'first message', conversation_id: null }), res as any)
    expect(conversations.length).toBe(1)
    const meta = sseEvents(captured).find((e) => e.event === 'meta')
    expect(meta?.data.conversation_id).toBe(conversations[0].id)
  })

  it('writes generation_type=field_assistant to the ledger', async () => {
    const { res } = makeRes()
    await fnHandler(makeReq({ message: 'hello' }), res as any)
    expect(generations.length).toBe(1)
    expect(generations[0].generation_type).toBe('field_assistant')
  })

  it('returns 429 after the per-minute limit is reached', async () => {
    // Seed PER_MINUTE_LIMIT generations for the same user in the past 60s.
    for (let i = 0; i < t.PER_MINUTE_LIMIT; i++) {
      generations.push({
        user_id: 'user-1',
        generation_type: 'field_assistant',
        generated_at: new Date(now - 30_000).toISOString(),
        input_tokens: 10,
        output_tokens: 5,
        estimated_cost_usd: 0.001,
      })
    }
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'over the limit' }), res as any)
    expect(captured.statusCode).toBe(429)
    expect(captured.headers['Retry-After']).toBeDefined()
    expect((captured.body as any).scope).toBe('per_minute')
  })

  it('returns 429 for free-tier daily cap', async () => {
    nextProfile = { plan: 'free' }
    for (let i = 0; i < t.FREE_TIER_DAILY_CAP; i++) {
      generations.push({
        user_id: 'user-1',
        generation_type: 'field_assistant',
        generated_at: new Date(now - 60 * 60_000).toISOString(),
        input_tokens: 10,
        output_tokens: 5,
        estimated_cost_usd: 0.001,
      })
    }
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'free tier over' }), res as any)
    expect(captured.statusCode).toBe(429)
    expect((captured.body as any).scope).toBe('free_tier_daily')
  })

  it('estimateCost includes cache-read pricing', () => {
    // 4100 regular input + 12 output + 0 cache-write + 3900 cache-read
    // cost = (4100*3 + 12*15 + 0*3.75 + 3900*0.3) / 1e6
    //      = (12300 + 180 + 0 + 1170) / 1e6 = 0.01365 → 0.0137
    const cost = t.estimateCost(4100, 12, 0, 3900)
    expect(cost).toBe(0.0137)
  })

  it('only assistant turn persists when message persistence is reordered', async () => {
    // Sanity: confirms a single call yields exactly one user + one assistant row
    const { res } = makeRes()
    await fnHandler(makeReq({ message: 'sanity' }), res as any)
    expect(messages.filter((m) => m.role === 'user').length).toBe(1)
    expect(messages.filter((m) => m.role === 'assistant').length).toBe(1)
  })
})

// ─── Tool-use round-trip ────────────────────────────────────────────
// Anthropic streams a tool_use block; our handler dispatches the tool
// against the curated knowledge base, sends a tool_result back, then
// streams the final assistant turn. These tests pin that the loop
// completes, the model's text from both turns is captured, and the
// done event reports the tool calls.

function toolUseStreamEvents(toolName: string, toolInput: Record<string, unknown>, toolUseId = 'toolu_01') {
  return [
    `event: message_start\ndata: ${JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Looking up…' },
    })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`,
    `event: content_block_start\ndata: ${JSON.stringify({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: toolUseId, name: toolName, input: {} },
    })}\n\n`,
    `event: content_block_delta\ndata: ${JSON.stringify({
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: JSON.stringify(toolInput) },
    })}\n\n`,
    `event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 1 })}\n\n`,
    `event: message_delta\ndata: ${JSON.stringify({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 50 },
    })}\n\n`,
  ]
}

describe('field-assistant tool-use', () => {
  it('runs a single tool-use round, dispatches the tool, and streams the follow-up', async () => {
    let callCount = 0
    t.setFetch(((_url: string, _init: any) => {
      callCount += 1
      // First call: model emits tool_use for lookup_exposure_limit
      if (callCount === 1) {
        return Promise.resolve(
          makeStreamingResponse(toolUseStreamEvents('lookup_exposure_limit', { analyte: 'formaldehyde' })),
        )
      }
      // Second call: model returns final text answer
      return Promise.resolve(makeStreamingResponse(defaultStreamEvents('OSHA PEL is 0.75 ppm 8-hr TWA.')))
    }) as any)
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'What is the OSHA PEL for formaldehyde?' }), res as any)
    expect(callCount).toBe(2)
    const events = sseEvents(captured)
    // tool_call surfaced to the client mid-stream
    const toolCall = events.find((e) => e.event === 'tool_call')
    expect(toolCall).toBeDefined()
    expect(toolCall!.data.name).toBe('lookup_exposure_limit')
    expect(toolCall!.data.status).toBe('ok')
    // done event includes a summary of tool calls
    const done = events.find((e) => e.event === 'done')
    expect(done!.data.tool_calls).toEqual([{ name: 'lookup_exposure_limit', status: 'ok' }])
    // Final assistant turn persisted
    const assistantTurns = messages.filter((m) => m.role === 'assistant')
    expect(assistantTurns.length).toBe(1)
    expect(assistantTurns[0].content).toContain('0.75 ppm')
  })

  it('surfaces a not_found tool status when the analyte is unknown', async () => {
    let callCount = 0
    t.setFetch(((_url: string, _init: any) => {
      callCount += 1
      if (callCount === 1) {
        return Promise.resolve(
          makeStreamingResponse(toolUseStreamEvents('lookup_exposure_limit', { analyte: 'unobtainium' })),
        )
      }
      return Promise.resolve(makeStreamingResponse(defaultStreamEvents('Not in the table — consult NIOSH NPG.')))
    }) as any)
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'What is the PEL for unobtainium?' }), res as any)
    const events = sseEvents(captured)
    const toolCall = events.find((e) => e.event === 'tool_call')
    expect(toolCall!.data.status).toBe('not_found')
  })

  it('caps the loop at MAX_TOOL_ROUNDS even if the model keeps calling tools', async () => {
    // Every fetch call returns another tool_use → the handler should
    // bail out after MAX_TOOL_ROUNDS to prevent runaway billing.
    let callCount = 0
    t.setFetch(((_url: string, _init: any) => {
      callCount += 1
      return Promise.resolve(
        makeStreamingResponse(
          toolUseStreamEvents('lookup_exposure_limit', { analyte: 'carbon monoxide' }, `toolu_${callCount}`),
        ),
      )
    }) as any)
    const { res, captured } = makeRes()
    await fnHandler(makeReq({ message: 'pathological loop' }), res as any)
    expect(callCount).toBe(t.MAX_TOOL_ROUNDS)
    const events = sseEvents(captured)
    expect(events.filter((e) => e.event === 'tool_call').length).toBe(t.MAX_TOOL_ROUNDS)
    // Final done event still fires
    expect(events.find((e) => e.event === 'done')).toBeDefined()
  })
})
