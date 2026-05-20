/**
 * Photo Analyze handler — unit + integration coverage.
 *
 * Same __test injection pattern as api/narrative.js (per CLAUDE.md
 * note 2): the handler exports setSupabase / setFetch so we never
 * touch real Anthropic / Supabase in tests. Pure helpers
 * (estimateCost, parseImageDataUrl, parseModelResponse,
 * checkRateLimits) are exported on __test for direct exercise.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import handlerModule from '../../api/photo-analyze.js'

type TestHooks = Record<string, unknown> & {
  parseImageDataUrl: (s: unknown) => { mediaType: string; data: string } | null
  parseModelResponse: (d: unknown) => Record<string, unknown> | null
  setSupabase: (m: unknown) => void
  setFetch: (m: unknown) => void
  resetSupabase: () => void
  resetFetch: () => void
  SYSTEM_PROMPT: string
  ANTHROPIC_MODEL: string
  FREE_TIER_DAILY_CAP: number
}
type HandlerWithTest = ((req: Record<string, unknown>, res: Record<string, unknown>) => Promise<void>) & {
  __test: TestHooks
}
const handler = handlerModule as unknown as HandlerWithTest
const { __test } = handler

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const VALID_IMAGE = `data:image/png;base64,${PNG_PIXEL}`

function makeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v },
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
  return res
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    body: { image: VALID_IMAGE },
    ...overrides,
  }
}

function setEnv() {
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
}

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } }, error: null }),
    },
    from: vi.fn(() => ({
      select() { return this },
      eq() { return this },
      gte() { return this },
      order() { return this },
      limit() { return this },
      single: vi.fn().mockResolvedValue({ data: { plan: 'paid' }, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
    ...overrides,
  }
}

function makeFetchMock(payload: Record<string, unknown>, opts: { status?: number; ok?: boolean } = {}) {
  return vi.fn().mockResolvedValue({
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  })
}

const MODEL_RESPONSE_OK = {
  content: [{
    type: 'text',
    text: JSON.stringify({
      observed: 'Dark green growth on drywall corner near baseboard, with surrounding tide marks consistent with prior wetting.',
      concerns: ['Visible dark biological growth', 'Adjacent water-staining tide marks'],
      probable_iaq_class: 'Possible IICRC S520 Condition 2 (settled spores or indirectly-contaminated materials)',
      recommended_actions: [
        'Consider Air-O-Cell spore-trap sampling with outdoor reference',
        'Document moisture content with pin or pinless meter',
      ],
      confidence: 'medium',
      citations: ['IICRC S520-2024', 'EPA Mold Remediation in Schools and Commercial Buildings'],
      disclaimers: 'Screening-level visual only. Genus and species ID require laboratory analysis. IH must review.',
    }),
  }],
  usage: { input_tokens: 1500, output_tokens: 230 },
}

beforeEach(() => {
  setEnv()
})

afterEach(() => {
  __test.resetSupabase()
  __test.resetFetch()
})

describe('parseImageDataUrl', () => {
  it('parses a valid PNG data URL', () => {
    const parsed = __test.parseImageDataUrl(`data:image/png;base64,${PNG_PIXEL}`)
    expect(parsed).toEqual({ mediaType: 'image/png', data: PNG_PIXEL })
  })

  it('normalizes image/jpg to image/jpeg', () => {
    const parsed = __test.parseImageDataUrl(`data:image/jpg;base64,${PNG_PIXEL}`)
    expect(parsed.mediaType).toBe('image/jpeg')
  })

  it('accepts webp', () => {
    const parsed = __test.parseImageDataUrl(`data:image/webp;base64,${PNG_PIXEL}`)
    expect(parsed.mediaType).toBe('image/webp')
  })

  it('rejects non-image MIME types', () => {
    expect(__test.parseImageDataUrl('data:text/plain;base64,SGVsbG8=')).toBeNull()
  })

  it('rejects non-data-URL strings', () => {
    expect(__test.parseImageDataUrl('not a data url')).toBeNull()
    expect(__test.parseImageDataUrl('')).toBeNull()
    expect(__test.parseImageDataUrl(null)).toBeNull()
  })
})

describe('parseModelResponse', () => {
  it('parses the canonical JSON shape', () => {
    const out = __test.parseModelResponse(MODEL_RESPONSE_OK)
    expect(out.observed).toMatch(/Dark green growth/)
    expect(out.concerns).toHaveLength(2)
    expect(out.recommended_actions).toHaveLength(2)
    expect(out.confidence).toBe('medium')
    expect(out.citations).toContain('IICRC S520-2024')
    expect(out.ih_review_required).toBe(true)
    expect(out.model).toBe(__test.ANTHROPIC_MODEL)
    expect(typeof out.generated_at).toBe('string')
  })

  it('strips ``` ```json code fences if the model returns them', () => {
    const fenced = {
      content: [{ type: 'text', text: '```json\n{"observed":"x","concerns":[],"probable_iaq_class":null,"recommended_actions":[],"confidence":"low","citations":[],"disclaimers":"d"}\n```' }],
    }
    const out = __test.parseModelResponse(fenced)
    expect(out).not.toBeNull()
    expect(out.observed).toBe('x')
  })

  it('coerces an out-of-range confidence to "low"', () => {
    const bad = {
      content: [{ type: 'text', text: JSON.stringify({ observed: 'x', concerns: [], probable_iaq_class: null, recommended_actions: [], confidence: 'extreme', citations: [], disclaimers: 'd' }) }],
    }
    const out = __test.parseModelResponse(bad)
    expect(out.confidence).toBe('low')
  })

  it('clamps overly-long concerns / recommended_actions arrays to 5', () => {
    const long = Array.from({ length: 10 }, (_, i) => `c${i}`)
    const padded = {
      content: [{ type: 'text', text: JSON.stringify({ observed: 'x', concerns: long, probable_iaq_class: null, recommended_actions: long, confidence: 'low', citations: [], disclaimers: 'd' }) }],
    }
    const out = __test.parseModelResponse(padded)
    expect(out.concerns).toHaveLength(5)
    expect(out.recommended_actions).toHaveLength(5)
  })

  it('returns null when the response has no text block', () => {
    expect(__test.parseModelResponse({ content: [] })).toBeNull()
    expect(__test.parseModelResponse({ content: [{ type: 'image' }] })).toBeNull()
  })

  it('returns null when the JSON body is malformed', () => {
    expect(__test.parseModelResponse({ content: [{ type: 'text', text: 'not json at all' }] })).toBeNull()
  })

  it('always forces ih_review_required: true even if the model omits it', () => {
    const without = {
      content: [{ type: 'text', text: JSON.stringify({ observed: 'x', concerns: [], probable_iaq_class: null, recommended_actions: [], confidence: 'low', citations: [], disclaimers: 'd' }) }],
    }
    const out = __test.parseModelResponse(without)
    expect(out.ih_review_required).toBe(true)
  })

  it('provides a fallback disclaimer when the model omits one', () => {
    const without = {
      content: [{ type: 'text', text: JSON.stringify({ observed: 'x', concerns: [], probable_iaq_class: null, recommended_actions: [], confidence: 'low', citations: [] }) }],
    }
    const out = __test.parseModelResponse(without)
    expect(out.disclaimers).toMatch(/industrial hygienist|IH/i)
  })
})

describe('handler — auth + validation', () => {
  it('returns 405 for non-POST methods', async () => {
    const res = makeRes()
    await handler(makeReq({ method: 'GET' }), res)
    expect(res.statusCode).toBe(405)
  })

  it('returns 500 when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringMatching(/API key/) }))
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = makeRes()
    await handler(makeReq({ headers: {} }), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token does not resolve to a user', async () => {
    __test.setSupabase({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'bad' } }) },
      from: vi.fn(),
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when image field is missing', async () => {
    __test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(makeReq({ body: {} }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual(expect.objectContaining({ error: expect.stringMatching(/image/i) }))
  })

  it('returns 400 when image is not a data URL', async () => {
    __test.setSupabase(makeSupabaseMock())
    const res = makeRes()
    await handler(makeReq({ body: { image: 'not a data url' } }), res)
    expect(res.statusCode).toBe(400)
  })
})

describe('handler — rate limiting', () => {
  it('returns 429 with Retry-After when free-tier daily cap is hit', async () => {
    __test.setSupabase({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u', email: 'e' } }, error: null }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return { select() { return this }, eq() { return this }, single: vi.fn().mockResolvedValue({ data: { plan: 'free' } }) }
        }
        return {
          select(_: string, opts?: { count?: string }) { return { ...this, _opts: opts } },
          eq() { return this },
          gte() { return Promise.resolve({ count: __test.FREE_TIER_DAILY_CAP, error: null }) },
        }
      }),
    })
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(429)
    expect(res.body).toEqual(expect.objectContaining({ error: 'rate_limit_exceeded', scope: 'free_tier_daily' }))
    expect(res.headers['Retry-After']).toBeDefined()
  })
})

describe('handler — happy path', () => {
  it('returns analysis + usage on a successful vision call', async () => {
    __test.setSupabase(makeSupabaseMock())
    __test.setFetch(makeFetchMock(MODEL_RESPONSE_OK))
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(200)
    const body = res.body as { analysis: { observed: string; ih_review_required: boolean; confidence: string }, usage: { input_tokens: number } }
    expect(body.analysis.observed).toMatch(/Dark green growth/)
    expect(body.analysis.ih_review_required).toBe(true)
    expect(body.analysis.confidence).toBe('medium')
    expect(body.usage.input_tokens).toBe(1500)
  })

  it('returns 502 when the model emits unparseable JSON', async () => {
    __test.setSupabase(makeSupabaseMock())
    __test.setFetch(makeFetchMock({ content: [{ type: 'text', text: 'not json' }], usage: { input_tokens: 1, output_tokens: 1 } }))
    const res = makeRes()
    await handler(makeReq(), res)
    expect(res.statusCode).toBe(502)
  })
})

describe('SYSTEM_PROMPT — defensibility guardrails', () => {
  it('forbids definitive species ID + final remediation tier', () => {
    expect(__test.SYSTEM_PROMPT).toMatch(/screening-only/i)
    expect(__test.SYSTEM_PROMPT).toMatch(/NEVER claim definitive species identification/i)
    expect(__test.SYSTEM_PROMPT).toMatch(/Never invent a citation/i)
    expect(__test.SYSTEM_PROMPT).toMatch(/IICRC S520/)
  })

  it('enforces JSON-only output with required fields', () => {
    expect(__test.SYSTEM_PROMPT).toMatch(/JSON object only/i)
    expect(__test.SYSTEM_PROMPT).toMatch(/"observed":/)
    expect(__test.SYSTEM_PROMPT).toMatch(/"confidence":/)
    expect(__test.SYSTEM_PROMPT).toMatch(/"citations":/)
  })
})
