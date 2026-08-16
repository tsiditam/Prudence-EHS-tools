/**
 * Tests for scripts/cron-email-queue-processor.ts — focused on the scale
 * hardening: it throttles sends and BACKS OFF on a Resend 429 (stops the
 * batch) instead of hammering, leaving the un-sent rows for the next tick.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Isolate from template specifics — any known id renders a stub, 'unknown' is null.
vi.mock('../../lib/email-sequences', () => ({
  getTemplate: (id: string) => (id === 'unknown' ? null : { render: () => ({ subject: 'S', text: 'T' }) }),
}))

interface QueueRow { id: number; user_id: string; template_id: string; payload?: unknown; sent_at?: string | null }

function makeMockSupabase(dueRows: QueueRow[], emails: Record<string, string>) {
  const updated: number[] = []

  function emailQueueChain() {
    let mode: 'select' | 'update' = 'select'
    const chain: Record<string, unknown> = {
      select() { mode = 'select'; return chain },
      lte() { return chain },
      is() { return chain },
      order() { return chain },
      limit() { return Promise.resolve({ data: dueRows, error: null }) },
      update() { mode = 'update'; return chain },
      eq(_col: string, id: number) {
        if (mode === 'update') updated.push(id)
        return Promise.resolve({ error: null })
      },
    }
    return chain
  }

  function profilesChain() {
    const chain: Record<string, unknown> = {
      select() { return chain },
      in(_col: string, ids: string[]) {
        return Promise.resolve({ data: ids.map(id => ({ id, name: 'Test User', plan: 'free' })), error: null })
      },
    }
    return chain
  }

  return {
    state: { updated },
    from(table: string) {
      if (table === 'email_queue') return emailQueueChain()
      if (table === 'profiles') return profilesChain()
      throw new Error('unexpected table: ' + table)
    },
    auth: {
      admin: {
        getUserById: async (id: string) =>
          emails[id] ? { data: { user: { email: emails[id] } }, error: null } : { data: { user: null }, error: null },
      },
    },
  }
}

let activeMock: ReturnType<typeof makeMockSupabase> | null = null
vi.mock('@supabase/supabase-js', () => ({ createClient: () => activeMock }))

import { runEmailQueueProcessor } from '../../scripts/cron-email-queue-processor'

function resp(status: number, body: Record<string, unknown> = {}, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    text: async () => JSON.stringify(body),
    json: async () => body,
  }
}

const NOW = new Date('2026-08-16T00:00:00Z')
const rows: QueueRow[] = [
  { id: 1, user_id: 'u1', template_id: 'reassessment.reminder' },
  { id: 2, user_id: 'u2', template_id: 'reassessment.reminder' },
  { id: 3, user_id: 'u3', template_id: 'reassessment.reminder' },
]
const emails = { u1: 'a@x.com', u2: 'b@x.com', u3: 'c@x.com' }

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.RESEND_API_KEY = 'test-resend'
})
afterEach(() => {
  activeMock = null
  vi.restoreAllMocks()
  delete process.env.RESEND_API_KEY
})

describe('cron-email-queue-processor — send + backoff', () => {
  it('sends all due rows when Resend is healthy', async () => {
    activeMock = makeMockSupabase(rows, emails)
    const fetchMock = vi.fn().mockResolvedValue(resp(200, { id: 're_ok' }))
    vi.stubGlobal('fetch', fetchMock)

    const r = await runEmailQueueProcessor(NOW, { sendIntervalMs: 0 })
    expect(r.ok).toBe(true)
    expect(r.sent).toBe(3)
    expect(r.skipped).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(activeMock!.state.updated).toEqual([1, 2, 3])
  })

  it('stops the batch on a 429 and defers the rest (idempotent backoff)', async () => {
    activeMock = makeMockSupabase(rows, emails)
    // First send OK, second is rate-limited → back off, third never attempted.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(resp(200, { id: 're_ok' }))
      .mockResolvedValueOnce(resp(429, { error: 'rate_limited' }, '2'))
    vi.stubGlobal('fetch', fetchMock)

    const r = await runEmailQueueProcessor(NOW, { sendIntervalMs: 0 })
    expect(r.ok).toBe(true)
    expect(r.sent).toBe(1) // only the first drained
    expect(fetchMock).toHaveBeenCalledTimes(2) // stopped after the 429, row 3 untouched
    expect(activeMock!.state.updated).toEqual([1]) // row 2 + 3 stay unsent for next tick
    expect(r.errors.join(' ')).toMatch(/429/)
    expect(r.errors.join(' ')).toMatch(/retry-after=2s/)
  })

  it('returns ok=false when env is missing', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const r = await runEmailQueueProcessor(NOW, { sendIntervalMs: 0 })
    expect(r.ok).toBe(false)
  })
})
