/**
 * Tests for /api/report-editorial-review.
 *
 * Pins the contract that matters for safety:
 *   • parseSuggestions tolerates fenced / prose-wrapped / malformed JSON
 *   • resolveSuggestions maps model ids → real targets and CANNOT fabricate
 *     a target (unknown id / bad kind dropped), dedupes, defaults confidence
 *   • handler: 405 non-POST, 401 no auth, 400 missing digest, happy path
 *     returns resolved suggestions from a mocked model response
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../api/_audit', () => ({ auditLog: vi.fn(async () => undefined) }))
vi.mock('../../lib/unlimited-usage', () => ({ hasUnlimitedUsage: () => false }))

import handler, { __test as T } from '../../api/report-editorial-review'

let nextUser: { id: string; email: string } | null = null

function makeChain(table: string): any {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => (table === 'profiles' ? { data: { plan: 'pro' }, error: null } : { data: null, error: null }),
    insert: async () => ({ error: null }),
    // Count queries (checkRateLimits) await the chain directly.
    then: (resolve: (v: any) => void) => resolve({ count: 0, error: null }),
  }
  return chain
}

const supabaseMock = {
  auth: {
    getUser: async () => (nextUser ? { data: { user: nextUser }, error: null } : { data: { user: null }, error: { message: 'no' } }),
  },
  from: (table: string) => makeChain(table),
}

function makeRes() {
  const res: any = {
    _status: 0,
    _json: null,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this },
    json(obj: any) { this._json = obj; return this },
    setHeader(k: string, v: string) { this._headers[k] = v },
  }
  return res
}

const DIGEST = {
  reportDigest: {
    items: [
      { id: 'i0', kind: 'recommendation', target: { kind: 'recommendation', priority: 'further_evaluation', action: 'Particle counts at ISO size thresholds.' }, text: 'ISO 14644 particle counts' },
      { id: 'i1', kind: 'finding', target: { kind: 'finding', findingId: 'f-legionella' }, text: 'Legionella escalation' },
      { id: 'i2', kind: 'section', target: { kind: 'section', anchorId: 'glossary' }, text: 'Glossary' },
    ],
  },
  caseFacts: { buildingType: 'commercial office', cleanroomScope: false },
}

function modelResponse(suggestions: any) {
  return {
    ok: true,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ suggestions }) }],
      usage: { input_tokens: 200, output_tokens: 60 },
    }),
  }
}

beforeEach(() => {
  nextUser = { id: 'u1', email: 'cih@example.com' }
  process.env.ANTHROPIC_API_KEY = 'test-key'
  T.setSupabase(supabaseMock)
  T.resetFetch()
})

describe('parseSuggestions', () => {
  it('parses clean JSON', () => {
    expect(T.parseSuggestions('{"suggestions":[{"id":"i0"}]}')).toEqual([{ id: 'i0' }])
  })
  it('parses code-fenced JSON', () => {
    expect(T.parseSuggestions('```json\n{"suggestions":[{"id":"i1"}]}\n```')).toEqual([{ id: 'i1' }])
  })
  it('parses JSON wrapped in prose', () => {
    expect(T.parseSuggestions('Here you go:\n{"suggestions":[{"id":"i2"}]}\nThanks')).toEqual([{ id: 'i2' }])
  })
  it('returns [] on malformed input', () => {
    expect(T.parseSuggestions('not json at all')).toEqual([])
    expect(T.parseSuggestions('')).toEqual([])
    expect(T.parseSuggestions(null)).toEqual([])
  })
})

describe('resolveSuggestions — cannot fabricate targets', () => {
  it('maps known ids to their real targets and defaults confidence', () => {
    const out = T.resolveSuggestions([{ id: 'i0', rationale: 'no cleanroom scope' }], DIGEST.reportDigest.items)
    expect(out.length).toBe(1)
    expect(out[0].target).toEqual({ kind: 'recommendation', priority: 'further_evaluation', action: 'Particle counts at ISO size thresholds.' })
    expect(out[0].label).toBe('ISO 14644 particle counts')
    expect(out[0].rationale).toBe('no cleanroom scope')
    expect(out[0].confidence).toBe('medium')
  })
  it('drops unknown ids and dedupes repeats', () => {
    const out = T.resolveSuggestions(
      [{ id: 'i0' }, { id: 'i0' }, { id: 'does-not-exist' }],
      DIGEST.reportDigest.items,
    )
    expect(out.length).toBe(1)
  })
  it('honors a valid confidence value', () => {
    const out = T.resolveSuggestions([{ id: 'i1', confidence: 'high' }], DIGEST.reportDigest.items)
    expect(out[0].confidence).toBe('high')
  })
})

describe('handler', () => {
  it('405 for non-POST', async () => {
    const res = makeRes()
    await handler({ method: 'GET', headers: {} }, res)
    expect(res._status).toBe(405)
  })
  it('401 when unauthenticated', async () => {
    const res = makeRes()
    await handler({ method: 'POST', headers: {}, body: { payload: DIGEST } }, res)
    expect(res._status).toBe(401)
  })
  it('400 when the digest is missing', async () => {
    const res = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { payload: {} } }, res)
    expect(res._status).toBe(400)
  })
  it('happy path returns resolved suggestions', async () => {
    T.setFetch(async () => modelResponse([
      { id: 'i0', rationale: 'no cleanroom or data-center scope in this office', confidence: 'high' },
      { id: 'i1', rationale: 'dirty pan does not establish a Legionella pathway', confidence: 'medium' },
      { id: 'ghost', rationale: 'should be dropped' },
    ]))
    const res = makeRes()
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { payload: DIGEST } }, res)
    expect(res._status).toBe(200)
    expect(res._json.suggestions.length).toBe(2)
    expect(res._json.suggestions[0].target.kind).toBe('recommendation')
    expect(res._json.suggestions[1].target.findingId).toBe('f-legionella')
    expect(res._json.usage.input_tokens).toBe(200)
  })
})
