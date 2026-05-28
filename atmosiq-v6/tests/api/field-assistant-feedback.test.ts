/**
 * Tests for /api/field-assistant-feedback.
 *
 * Pins the contract:
 *   • 405 on non-POST
 *   • 401 on missing / invalid auth header
 *   • 400 on missing message_id or bad rating
 *   • 404 when the message exists but belongs to a different user
 *   • 400 when the message is a USER turn (feedback only valid on
 *     assistant turns)
 *   • 200 + UPSERT on a valid thumbs-up
 *   • 200 + UPSERT on a valid thumbs-down with reason
 *   • Re-rating the same message UPDATES instead of stacking
 */

import { describe, it, expect, beforeEach } from 'vitest'

interface FakeMsgRow {
  id: string
  conversation_id: string
  user_id: string
  role: 'user' | 'assistant'
}
interface FakeFeedbackRow {
  message_id: string
  conversation_id: string
  user_id: string
  rating: 'up' | 'down'
  reason: string | null
}

let messagesTable: FakeMsgRow[] = []
let feedbackTable: FakeFeedbackRow[] = []
let nextUser: { id: string; email: string } | null = null
let nextAuthError: { message: string } | null = null

function makeMsgChain() {
  const filters: Record<string, unknown> = {}
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { filters[col] = val; return chain },
    maybeSingle: async () => {
      const row = messagesTable.find((m) => {
        for (const k of Object.keys(filters)) {
          if ((m as any)[k] !== filters[k]) return false
        }
        return true
      })
      return row ? { data: row, error: null } : { data: null, error: null }
    },
  }
  return chain
}

function makeFeedbackChain() {
  return {
    upsert: async (row: FakeFeedbackRow, _opts: { onConflict: string }) => {
      const idx = feedbackTable.findIndex((r) => r.message_id === row.message_id)
      if (idx >= 0) feedbackTable[idx] = { ...feedbackTable[idx], ...row }
      else feedbackTable.push(row)
      return { error: null }
    },
  }
}

const fakeSupabase: any = {
  auth: {
    getUser: async (_token: string) => {
      if (nextAuthError) return { data: { user: null }, error: nextAuthError }
      return { data: { user: nextUser }, error: null }
    },
  },
  from: (table: string) => {
    if (table === 'field_assistant_messages') return makeMsgChain()
    if (table === 'field_assistant_feedback') return makeFeedbackChain()
    throw new Error(`unexpected table: ${table}`)
  },
}

// Mock response builder
function makeRes() {
  const out = {
    status: 0,
    json: undefined as unknown,
    setHeader: () => {},
  }
  const res: any = {
    status(n: number) { out.status = n; return res },
    json(body: unknown) { out.json = body; return res },
    setHeader: () => res,
  }
  return { res, out }
}

import handler, { __test } from '../../api/field-assistant-feedback'

describe('/api/field-assistant-feedback', () => {
  beforeEach(() => {
    messagesTable = [
      { id: 'msg-asst-1', conversation_id: 'c-1', user_id: 'user-1', role: 'assistant' },
      { id: 'msg-user-1', conversation_id: 'c-1', user_id: 'user-1', role: 'user' },
      { id: 'msg-foreign', conversation_id: 'c-2', user_id: 'user-2', role: 'assistant' },
    ]
    feedbackTable = []
    nextUser = { id: 'user-1', email: 'a@b.com' }
    nextAuthError = null
    __test.setSupabase(fakeSupabase)
  })

  it('405 on non-POST', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, body: {} } as any, res as any)
    expect(out.status).toBe(405)
  })

  it('401 on missing auth header', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: {}, body: { message_id: 'msg-asst-1', rating: 'up' } } as any, res as any)
    expect(out.status).toBe(401)
  })

  it('401 on invalid token', async () => {
    nextUser = null
    nextAuthError = { message: 'bad token' }
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'up' } } as any, res as any)
    expect(out.status).toBe(401)
  })

  it('400 on missing message_id', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { rating: 'up' } } as any, res as any)
    expect(out.status).toBe(400)
  })

  it('400 on bad rating', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'maybe' } } as any, res as any)
    expect(out.status).toBe(400)
  })

  it('404 when message belongs to another user', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-foreign', rating: 'up' } } as any, res as any)
    expect(out.status).toBe(404)
  })

  it('400 when rating a user (non-assistant) message', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-user-1', rating: 'up' } } as any, res as any)
    expect(out.status).toBe(400)
    expect(out.json).toMatchObject({ error: 'not_an_assistant_message' })
  })

  it('200 on valid thumbs-up + writes feedback row', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'up' } } as any, res as any)
    expect(out.status).toBe(200)
    expect(feedbackTable).toHaveLength(1)
    expect(feedbackTable[0]).toMatchObject({
      message_id: 'msg-asst-1',
      conversation_id: 'c-1',
      user_id: 'user-1',
      rating: 'up',
      reason: null,
    })
  })

  it('200 on thumbs-down with reason (trimmed + stored)', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'down', reason: '  cited a wrong standard  ' } } as any, res as any)
    expect(out.status).toBe(200)
    expect(feedbackTable[0]).toMatchObject({ rating: 'down', reason: 'cited a wrong standard' })
  })

  it('re-rating the same message UPDATES instead of stacking', async () => {
    const { res } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'up' } } as any, res as any)
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: { message_id: 'msg-asst-1', rating: 'down', reason: 'changed my mind' } } as any, res as any)
    expect(feedbackTable).toHaveLength(1)
    expect(feedbackTable[0]).toMatchObject({ rating: 'down', reason: 'changed my mind' })
  })

  it('accepts a stringified JSON body (matches Vercel behavior)', async () => {
    const { res, out } = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ message_id: 'msg-asst-1', rating: 'up' }) } as any, res as any)
    expect(out.status).toBe(200)
  })
})
