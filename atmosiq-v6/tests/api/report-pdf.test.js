// @vitest-environment node
/**
 * api/report-pdf.js — the PDF render endpoint. Verifies model validation, the
 * banned-language guard (no compliance/causation claim can reach a PDF), and
 * a successful render returning application/pdf bytes.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const handler = require('../../api/report-pdf.js')

// The endpoint verifies the Supabase JWT and then gates on the caller's
// credit entitlement. Inject a mock that accepts 'good-token' and rejects
// everything else; `profile` is what the entitlement lookup returns.
let profile = { plan: 'solo', credits_remaining: 3 }
let profileError = null
beforeEach(() => {
  profile = { plan: 'solo', credits_remaining: 3 }
  profileError = null
  delete process.env.UNLIMITED_USAGE_EMAILS
  handler.__test.setSupabase({
    auth: {
      getUser: async (token) =>
        token === 'good-token'
          ? { data: { user: { id: 'u1', email: 'u1@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid token' } },
    },
    from: (table) => {
      if (table !== 'profiles') throw new Error('unexpected table ' + table)
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: profileError ? null : profile, error: profileError }),
      }
      return chain
    },
  })
})

function mockRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    end(b) { this.body = b },
  }
}
const run = async (req) => { const res = mockRes(); await handler(req, res); return res }
// Authenticated request helper.
const authed = (req) => ({ ...req, headers: { authorization: 'Bearer good-token', ...(req.headers || {}) } })

const goodModel = {
  meta: { coverRows: [['Facility', 'X']], firm: 'PSEC', reportId: 'AIQ-OK01' },
  execSummary: 'Conditions are consistent with acceptable ventilation during the assessment window.',
  recommendations: { immediate: ['Verify supply airflow.'], shortTerm: [], mediumTerm: [] },
}

describe('POST /api/report-pdf', () => {
  it('rejects non-POST', async () => {
    const res = await run({ method: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('401 when no bearer token', async () => {
    const res = await run({ method: 'POST', body: { model: goodModel } })
    expect(res.statusCode).toBe(401)
  })

  it('401 when the token is invalid', async () => {
    const res = await run({ method: 'POST', headers: { authorization: 'Bearer nope' }, body: { model: goodModel } })
    expect(res.statusCode).toBe(401)
  })

  it('400 when no model', async () => {
    const res = await run(authed({ method: 'POST', body: {} }))
    expect(res.statusCode).toBe(400)
  })

  it('renders application/pdf for a clean model', async () => {
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(Buffer.isBuffer(res.body)).toBe(true)
    expect(res.body.slice(0, 5).toString()).toBe('%PDF-')
  })

  it('422-blocks banned language in AtmosFlow-AUTHORED narrative', async () => {
    const bad = { ...goodModel, execSummary: 'The elevated CO2 was caused by the HVAC system and the building is noncompliant with OSHA.' }
    const res = await run(authed({ method: 'POST', body: { model: bad } }))
    expect(res.statusCode).toBe(422)
    const j = JSON.parse(res.body)
    expect(j.error).toBe('banned_language')
    expect(j.hits.length).toBeGreaterThan(0)
  })

  it('402 insufficient_credits when the caller has no credits (server-side gate, no debit)', async () => {
    profile = { plan: 'free', credits_remaining: 0 }
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(402)
    expect(JSON.parse(res.body)).toEqual({ error: 'insufficient_credits' })
  })

  it('402 when the profile row is missing', async () => {
    profile = null
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(402)
  })

  it('fails closed (500) when the entitlement lookup errors', async () => {
    profileError = { message: 'db unavailable' }
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body)).toEqual({ error: 'entitlement_lookup_failed' })
  })

  it('lets a practice-plan user render with zero credits (unmetered tier)', async () => {
    profile = { plan: 'practice', credits_remaining: 0 }
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(200)
  })

  it('lets an UNLIMITED_USAGE_EMAILS account render with zero credits', async () => {
    process.env.UNLIMITED_USAGE_EMAILS = 'u1@example.com'
    profile = { plan: 'free', credits_remaining: 0 }
    const res = await run(authed({ method: 'POST', body: { model: goodModel } }))
    expect(res.statusCode).toBe(200)
  })

  it('does NOT block engine-authored finding/recommendation text (e.g. "elevated risk", "violation")', async () => {
    // The sacred engine legitimately uses screening phrases like "elevated
    // risk of G2 …" (ANSI/ISA) or "violation" in a finding string. These pass
    // through to the report and must NOT block it.
    const m = {
      ...goodModel,
      findings: { intro: 'Findings.', rows: [{ z: 'A', sev: 'elevated', conf: 'Moderate', f: 'Screening indicators consistent with elevated risk of G2 or worse; verification requires reactivity coupons. Possible violation of design intent noted.' }] },
      recommendations: { immediate: ['Correct to avoid a potential violation of the building O&M intent.'], shortTerm: [], mediumTerm: [] },
    }
    const res = await run(authed({ method: 'POST', body: { model: m } }))
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
  })
})
