/**
 * api/_with-sentry.ts + api/_with-sentry-cjs.js — the wrapper every handler's
 * default export goes through (audit 2026-09 §2.10: server-side Sentry was
 * never initialised on Vercel and captureException had zero callers).
 *
 *   • init runs once per module (guarded), and is a no-op without a DSN
 *   • a throwing handler becomes a 500 with a stable code — never the
 *     error text
 *   • when the response already started (SSE), the wrapper only ends it
 *   • a non-throwing handler is passed through untouched
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { withSentry, __test as tsHooks } from '../../api/_with-sentry'

const require = createRequire(import.meta.url)
const cjs = require('../../api/_with-sentry-cjs.js')

function makeRes() {
  const res: any = { _status: 0, _body: null, headersSent: false, ended: false }
  res.status = (c: number) => { res._status = c; return res }
  res.json = (b: unknown) => { res._body = b; res.headersSent = true; return res }
  res.end = () => { res.ended = true; return res }
  return res
}

beforeEach(() => {
  tsHooks.reset()
  cjs.__test.reset()
  delete process.env.SENTRY_DSN
})

for (const [label, wrap, hooks] of [
  ['TypeScript wrapper', withSentry, tsHooks],
  ['CommonJS wrapper', cjs.withSentry, cjs.__test],
] as const) {
  describe(label, () => {
    it('passes a clean handler through and initialises exactly once', async () => {
      const inner = vi.fn(async (_req: unknown, res: any) => res.status(200).json({ ok: true }))
      const wrapped = wrap(inner, { route: 'x' })
      const r1 = makeRes()
      await wrapped({ method: 'GET' }, r1)
      const r2 = makeRes()
      await wrapped({ method: 'GET' }, r2)
      expect(r1._body).toEqual({ ok: true })
      expect(r2._body).toEqual({ ok: true })
      expect(inner).toHaveBeenCalledTimes(2)
      expect(hooks.isInitialised()).toBe(true)
    })

    it('turns a throw into a stable 500 without the error text', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrap(async () => { throw new Error('relation "profiles" does not exist at line 42') }, { route: 'x', code: 'x_unhandled' })
      const res = makeRes()
      await wrapped({ method: 'POST' }, res)
      expect(res._status).toBe(500)
      expect(res._body).toEqual({ error: 'internal_error', code: 'x_unhandled' })
      expect(JSON.stringify(res._body)).not.toContain('profiles')
      spy.mockRestore()
    })

    it('only ends the response when headers were already sent (SSE mid-stream)', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapped = wrap(async (_req: unknown, res: any) => { res.headersSent = true; throw new Error('mid-stream') })
      const res = makeRes()
      await wrapped({ method: 'POST' }, res)
      expect(res._status).toBe(0)     // no status write over the stream
      expect(res._body).toBeNull()
      expect(res.ended).toBe(true)
      spy.mockRestore()
    })
  })
}

describe('every handler in api/** is wrapped', () => {
  it('exports its handler through withSentry', () => {
    const root = path.resolve('api')
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(js|ts)$/.test(e) && !e.startsWith('_')) files.push(full)
      }
    }
    walk(root)
    expect(files.length).toBeGreaterThan(20)
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      expect(src, path.relative(root, f)).toMatch(/withSentry\(/)
      // The default export is the wrapped function, not the bare handler.
      expect(src, path.relative(root, f)).not.toMatch(/^export default handler\s*$/m)
      expect(src, path.relative(root, f)).not.toMatch(/^module\.exports = handler\s*$/m)
      expect(src, path.relative(root, f)).not.toMatch(/^module\.exports = async function handler/m)
    }
  })
})
