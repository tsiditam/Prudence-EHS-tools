/**
 * Tests for the banned-language gate on /api/narrative.
 *
 * The AI narrative path is linted with the same ruleset as the
 * deterministic engine prose. The handler does NOT hard-block (per the
 * advisory-issuance product decision); instead it returns
 * language_review + banned_language so the client can drop unclean AI
 * text and fall back to the validated deterministic report.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Anthropic response text, set per test.
let anthropicText = 'A clean screening narrative consistent with insufficient outdoor air delivery.'

function makeChain(table: string): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => table === 'profiles' ? { data: { plan: 'pro' }, error: null } : { data: null, error: null },
    insert: async () => ({ data: null, error: null }),
  }
  // Awaitable count query → 0 (under all rate limits).
  chain.then = (resolve: (r: any) => void) => resolve({ data: null, error: null, count: 0 })
  return chain
}

function makeSupabaseMock() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'pro@example.com' } }, error: null }) },
    from: (table: string) => makeChain(table),
  }
}

function makeFetchMock() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text: anthropicText }], usage: { input_tokens: 100, output_tokens: 50 } }),
    text: async () => '',
  })
}

function makeReq() {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-jwt' },
    body: { system: 'sys', payload: { foo: 'bar' } },
    socket: { remoteAddress: '127.0.0.1' },
  } as any
}
function makeRes() {
  const res: any = { _status: 200, _body: null, _headers: {} }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: any) => { res._body = b; return res }
  res.setHeader = (k: string, v: string) => { res._headers[k] = v }
  res.end = () => res
  return res
}

let handler: any

beforeEach(async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  vi.resetModules()
  const mod: any = await import('../../api/narrative.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
  handler.__test.setFetch(makeFetchMock())
})

describe('POST /api/narrative — banned-language gate', () => {
  it('flags banned language in the AI narrative without blocking the 200', async () => {
    anthropicText = 'The data definitively confirms the building is in compliance with ASHRAE 62.1 and caused the illness.'
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(r._body.language_review).toBe('failed')
    expect(r._body.banned_language.length).toBeGreaterThan(0)
    expect(r._body.narrative).toBe(anthropicText) // still returned; client decides
  })

  it('passes clean screening narrative', async () => {
    anthropicText = 'Carbon dioxide readings were elevated relative to the outdoor reference, consistent with insufficient outdoor air delivery. Further evaluation is recommended.'
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(r._body.language_review).toBe('passed')
    expect(r._body.banned_language).toEqual([])
  })
})
