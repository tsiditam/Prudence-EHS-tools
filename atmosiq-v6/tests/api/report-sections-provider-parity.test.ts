// @vitest-environment node
/**
 * Provider-extraction parity for /api/report-sections.
 *
 * The provider-specific pieces — model name, request body, sampling
 * controls, response extraction, upstream error classification, pricing —
 * moved behind `api/_report-authoring-provider.js`. Nothing else was meant
 * to change, and "meant to" is not a guarantee, so this pins the two things
 * a refactor of that shape can silently alter:
 *
 *   1. the bytes AtmosFlow sends to the provider;
 *   2. the bytes AtmosFlow sends back to the client.
 *
 * The expected values below were CAPTURED FROM THE CODE BEFORE the
 * extraction, by running this same harness against the pre-refactor handler
 * and recording what it produced. They are not a description of the new
 * implementation written after the fact — that is the difference between a
 * parity test and a snapshot of whatever happened.
 *
 * `system` is compared by length rather than content: the prompt is pinned
 * byte-for-byte by `report-sections-prompt-parity.test.ts`, and inlining
 * fifteen kilobytes here would only make this file lie about what it checks.
 *
 * ── The goldens moved once, deliberately ───────────────────────────────
 * The authoring plan changed two of these values ON PURPOSE, and they are
 * recorded here rather than quietly re-baselined:
 *
 *   • `system_chars` 14711 -> 17874, because the prompt gained a planning
 *     contract and an output schema that admits the plan;
 *   • the response body gained exactly one key, `authoring_plan`.
 *
 * Everything else is unchanged and still pinned — the request's field SET,
 * every section value, the language review, the usage block, and all three
 * failure shapes. A future change that moves any of those is a regression,
 * not a re-baseline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

let anthropicText = JSON.stringify({
  executive_summary: 'Carbon dioxide was elevated at this site relative to the outdoor reference.',
  discussion: 'The pattern is consistent with insufficient outdoor-air delivery.',
})

function makeChain(table: string): any {
  let inserted = false
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    order: () => chain,
    limit: () => chain,
    single: async () => {
      if (table === 'profiles') return { data: { plan: 'pro' }, error: null }
      if (inserted) return { data: { id: 1 }, error: null }
      return { data: null, error: null }
    },
    insert: () => { inserted = true; return chain },
    update: () => chain,
    delete: () => chain,
  }
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
    json: async () => ({ content: [{ type: 'text', text: anthropicText }], usage: { input_tokens: 400, output_tokens: 300 } }),
    text: async () => '',
  })
}

function makeReq(payload: unknown = { evidence: { version: 1, facts: [] } }) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-jwt' },
    body: { payload },
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
  const mod: any = await import('../../api/report-sections.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
  handler.__test.setFetch(makeFetchMock())
})


/** Exactly what the handler sent and returned before the extraction. */
const GOLDEN_REQUEST = {
  model: 'claude-sonnet-4-6',
  max_tokens: 4000,
  temperature: 0.7,
  system_chars: 17874,
  messages: [{
    role: 'user',
    content: 'Based ONLY on this evidence package, write the report sections as the strict JSON schema requires:\n\n{"evidence":{"version":1,"facts":[]}}',
  }],
}

const GOLDEN_RESPONSE = {
  status: 200,
  body: {
    sections: {
      executive_summary: 'A clean summary sentence.',
      discussion: 'A discussion paragraph.',
      parameter_background: { co2: 'CO2 background.' },
    },
    model: 'claude-sonnet-4-6',
    language_review: {
      executive_summary: 'passed',
      discussion: 'passed',
      'parameter_background.co2': 'passed',
    },
    banned_language: {},
    style_flags: {},
    any_banned: false,
    // Null here because this fixture replies in the pre-plan shape, which
    // the handler still accepts — see the tolerance test below.
    authoring_plan: null,
    usage: { input_tokens: 1234, output_tokens: 567, estimated_cost_usd: 0.0122 },
  },
}

const UPSTREAM_TEXT = '{"executive_summary":"A clean summary sentence.","discussion":"A discussion paragraph.","parameter_background":{"co2":"CO2 background."}}'

/** One canned provider reply, and a record of what was sent to get it. */
function instrument() {
  const seen: { body: any } = { body: null }
  handler.__test.setFetch(async (_url: string, init: any) => {
    seen.body = JSON.parse(init.body)
    return {
      ok: true, status: 200,
      json: async () => ({
        content: [{ type: 'text', text: UPSTREAM_TEXT }],
        usage: { input_tokens: 1234, output_tokens: 567 },
      }),
    }
  })
  return seen
}

describe('the bytes going out are unchanged', () => {
  it('sends the same request body, field for field', async () => {
    const seen = instrument()
    await handler(makeReq(), makeRes())
    const { system, ...rest } = seen.body
    expect({ ...rest, system_chars: String(system).length }).toEqual(GOLDEN_REQUEST)
  })

  it('carries no field the provider was not already being sent', async () => {
    // A refactor that "tidied" the request by adding a parameter would
    // change behavior on a live model without changing any test that looks
    // only at the response.
    const seen = instrument()
    await handler(makeReq(), makeRes())
    expect(Object.keys(seen.body).sort()).toEqual(['max_tokens', 'messages', 'model', 'system', 'temperature'])
  })
})

describe('the bytes coming back are unchanged', () => {
  it('returns the same response body, field for field', async () => {
    instrument()
    const r = makeRes()
    await handler(makeReq(), r)
    expect({ status: r._status, body: r._body }).toEqual(GOLDEN_RESPONSE)
  })

  it('still reports the model as provenance', async () => {
    // Provenance is allowed and wanted — what the extraction removes is the
    // authoring code DECIDING the vendor, not the record of which one ran.
    instrument()
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._body.model).toBe('claude-sonnet-4-6')
  })
})

describe('failure behavior is unchanged', () => {
  it('a thrown request still yields 502 upstream_unreachable', async () => {
    handler.__test.setFetch(async () => { throw new Error('network down') })
    const r = makeRes()
    await handler(makeReq(), r)
    expect({ status: r._status, body: r._body }).toEqual({ status: 502, body: { error: 'upstream_unreachable' } })
  })

  it('a non-2xx still classifies through the shared helper', async () => {
    handler.__test.setFetch(async () => ({ ok: false, status: 429, text: async () => 'rate limited upstream' }))
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._body.error).toBe('upstream_429')
    expect(r._body.code).toBeTruthy()
    expect(r._body.message).toBeTruthy()
    expect(typeof r._body.retryable).toBe('boolean')
    // The provider's own words never reach the assessor.
    expect(JSON.stringify(r._body)).not.toContain('rate limited upstream')
  })

  it('an unparseable reply still yields empty sections rather than an error', async () => {
    handler.__test.setFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({ content: [{ type: 'text', text: 'I am sorry, I cannot.' }], usage: {} }),
    }))
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._status).toBe(200)
    expect(r._body.sections).toEqual({})
  })
})

describe('the authoring handler no longer knows which vendor wrote the prose', () => {
  it('names no provider, model, endpoint or sampling control', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../api/report-sections.js', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // header and block comments
      .replace(/^\s*\/\/.*$/gm, '')       // line comments
    for (const token of ['claude-', 'api.anthropic.com', 'anthropic-version', 'temperature', 'max_tokens']) {
      expect(src, token).not.toContain(token)
    }
    // The one permitted exception, and it is deployment configuration
    // rather than a code dependency: the secret keeps its deployed name.
    expect(src).toContain('ANTHROPIC_API_KEY')
  })

  it('and the adapter is where all of it lives', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('../../api/_report-authoring-provider.js', import.meta.url), 'utf8')
    for (const token of ['claude-', 'api.anthropic.com', 'anthropic-version', 'temperature', 'max_tokens']) {
      expect(src, token).toContain(token)
    }
  })
})

describe('the plan rides beside the sections without displacing them', () => {
  it('a model that ignores the wrapper still gets its five sections', async () => {
    // Tolerance on purpose. A planning experiment must not be able to cost
    // an assessor the sections they would have had without it, so the
    // pre-plan response shape is still read as sections.
    instrument()
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._body.sections.executive_summary).toBe('A clean summary sentence.')
    expect(r._body.authoring_plan).toBeNull()
  })

  it('a wrapped response yields both, and the plan is passed through unvalidated', async () => {
    const plan = { overall_conclusion: 'Something was found.', primary_findings: ['find-abc'] }
    handler.__test.setFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ authoring_plan: plan, sections: { discussion: 'A discussion paragraph.' } }) }],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }))
    const r = makeRes()
    await handler(makeReq(), r)
    expect(r._body.sections).toEqual({ discussion: 'A discussion paragraph.' })
    // Verbatim: the client holds the wire package these ids must resolve
    // against, so the client is the only place a check means anything.
    expect(r._body.authoring_plan).toEqual(plan)
  })

  it('a plan that is not an object is dropped rather than passed on', async () => {
    for (const bad of ['a plan', 42, ['x'], null]) {
      handler.__test.setFetch(async () => ({
        ok: true, status: 200,
        json: async () => ({
          content: [{ type: 'text', text: JSON.stringify({ authoring_plan: bad, sections: { discussion: 'x' } }) }],
          usage: {},
        }),
      }))
      const r = makeRes()
      await handler(makeReq(), r)
      expect(r._body.authoring_plan, JSON.stringify(bad)).toBeNull()
      expect(r._body.sections.discussion).toBe('x')
    }
  })

  it('the plan is never scanned as a section', async () => {
    // It never renders, so scanning it could only cost a usable plan for
    // prose no reader will ever see.
    handler.__test.setFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({
        content: [{ type: 'text', text: JSON.stringify({
          authoring_plan: { overall_conclusion: 'The building is unsafe and this is confirmed.' },
          sections: { discussion: 'A discussion paragraph.' },
        }) }],
        usage: {},
      }),
    }))
    const r = makeRes()
    await handler(makeReq(), r)
    expect(Object.keys(r._body.language_review)).toEqual(['discussion'])
    expect(r._body.any_banned).toBe(false)
  })
})
