/**
 * Tests for /api/marketing-agent/chat.
 *
 * Pins the lead-capture contract for the landing marketing agent:
 *   • intent score is a deterministic 1–100 from the answers
 *   • "message" / "event" actions are cheap acks (no persistence)
 *   • "lead" validates name + email, scores, and inserts to Postgres
 *   • bad email → 400; unknown action → 400; GET → 405
 */
import { describe, it, expect, beforeEach } from 'vitest'

let handler: any
const inserts: Array<{ table: string; row: any }> = []

function makeSupabaseMock() {
  return {
    from(table: string) {
      return {
        // rate-limit path: .select(...).eq(...).gte(...) resolves to { count }
        select() { return this },
        eq() { return this },
        gte() { return Promise.resolve({ count: 0, error: null }) },
        insert(row: any) { inserts.push({ table, row }); return Promise.resolve({ error: null }) },
      }
    },
  }
}

function makeRes() {
  const res: any = { statusCode: 0, body: null }
  res.status = (c: number) => { res.statusCode = c; return res }
  res.json = (b: any) => { res.body = b; return res }
  return res
}

function makeReq(body: any, method = 'POST') {
  return { method, headers: { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'jest' }, socket: {}, body }
}

beforeEach(async () => {
  inserts.length = 0
  delete process.env.RESEND_API_KEY
  const mod: any = await import('../../api/marketing-agent/chat.js')
  handler = mod.default ?? mod
  handler.__test.setSupabase(makeSupabaseMock())
})

describe('computeIntentScore', () => {
  it('is bounded 1..100 and warmer for high-fit answers', async () => {
    const mod: any = await import('../../api/marketing-agent/chat.js')
    const score = mod.__test.computeIntentScore
    const hot = score({ role: 'IH consultant', reportsMethod: 'Manual (Word/Excel)', usesLoggerData: 'Yes', biggestPain: 'Time', wantsBeta: 'Yes' })
    const cold = score({ role: 'Just exploring', reportsMethod: 'Other', usesLoggerData: 'No', biggestPain: 'Other', wantsBeta: 'Just browsing' })
    expect(hot).toBeGreaterThan(cold)
    expect(hot).toBeLessThanOrEqual(100)
    expect(cold).toBeGreaterThanOrEqual(1)
    expect(score({})).toBe(1) // floor
  })
})

describe('/api/marketing-agent/chat', () => {
  it('rejects non-POST', async () => {
    const res = makeRes()
    await handler(makeReq({}, 'GET'), res)
    expect(res.statusCode).toBe(405)
  })

  it('acks message/event actions without persisting', async () => {
    const res = makeRes()
    await handler(makeReq({ action: 'event', name: 'widget_opened' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(inserts.length).toBe(0)
  })

  it('rejects an unknown action', async () => {
    const res = makeRes()
    await handler(makeReq({ action: 'frobnicate' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('requires a valid email on lead capture', async () => {
    const res = makeRes()
    await handler(makeReq({ action: 'lead', lead: { name: 'Jane', email: 'nope' } }), res)
    expect(res.statusCode).toBe(400)
    expect(inserts.length).toBe(0)
  })

  it('captures a valid lead, scores it, and inserts to Postgres', async () => {
    const res = makeRes()
    await handler(
      makeReq({
        action: 'lead',
        sessionId: 'ma_test',
        lead: { name: 'Jane Smith', email: 'jane@firm.com', company: 'Acme IH', role: 'IH consultant', useCase: 'Faster report drafting' },
        answers: { role: 'IH consultant', reportsMethod: 'Manual (Word/Excel)', usesLoggerData: 'Yes', biggestPain: 'Time', wantsBeta: 'Yes' },
        transcript: [{ from: 'bot', text: 'hi' }],
      }),
      res
    )
    expect(res.statusCode).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.leadId).toMatch(/^MA-/)
    expect(res.body.intentScore).toBeGreaterThan(50)
    expect(inserts.length).toBe(1)
    expect(inserts[0].table).toBe('marketing_agent_leads')
    expect(inserts[0].row.email).toBe('jane@firm.com')
    expect(inserts[0].row.intent_score).toBe(res.body.intentScore)
  })
})
