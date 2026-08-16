/**
 * api/_cron-auth — the shared CRON_SECRET gate.
 *
 * Regression: the old per-handler check skipped auth entirely when
 * CRON_SECRET was unset (world-callable). This gate FAILS CLOSED.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { requireCronSecret } from '../../api/_cron-auth'

function mockRes() {
  const res = {
    code: 0 as number,
    body: null as unknown,
    status(c: number) { res.code = c; return res },
    json(b: Record<string, unknown>) { res.body = b; return res },
  }
  return res
}

const OLD = process.env.CRON_SECRET
beforeEach(() => { process.env.CRON_SECRET = 's3cret' })
afterEach(() => { if (OLD === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = OLD })

describe('requireCronSecret', () => {
  it('fails CLOSED (503) when the secret is not configured', () => {
    delete process.env.CRON_SECRET
    const res = mockRes()
    expect(requireCronSecret({ headers: { authorization: 'Bearer anything' } }, res)).toBe(false)
    expect(res.code).toBe(503)
  })

  it('401s a missing or wrong bearer token', () => {
    const r1 = mockRes()
    expect(requireCronSecret({ headers: {} }, r1)).toBe(false)
    expect(r1.code).toBe(401)

    const r2 = mockRes()
    expect(requireCronSecret({ headers: { authorization: 'Bearer wrong' } }, r2)).toBe(false)
    expect(r2.code).toBe(401)
  })

  it('allows the correct bearer token', () => {
    const res = mockRes()
    expect(requireCronSecret({ headers: { authorization: 'Bearer s3cret' } }, res)).toBe(true)
    expect(res.code).toBe(0)
  })

  it('handles a header delivered as an array', () => {
    const res = mockRes()
    expect(requireCronSecret({ headers: { authorization: ['Bearer s3cret'] } }, res)).toBe(true)
  })
})
