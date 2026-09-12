/**
 * One classifier for an upstream (Anthropic) failure — api/_upstream-error.js.
 *
 * The defect it closes: an exhausted API account is reported by Anthropic as a
 * 400 carrying "Your credit balance is too low", which /api/narrative and
 * /api/report-sections passed through as a bare `upstream_400`. The client
 * turned that into "try again in a moment" — advice that cannot work, because
 * no number of retries adds credit to an account. Two other endpoints each
 * carried their own copy of a detector that DID catch it, so one upstream
 * condition produced different answers on different screens.
 *
 * Pinned here: billing is detected by BODY not status, the non-retryable
 * cases never tell the reader to try again, the vendor is never named to an
 * end user, and every endpoint that calls the model reads this one module.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
// @ts-ignore CommonJS helper
import { classifyUpstream, statusForUpstream, friendlyUpstreamError } from '../../api/_upstream-error.js'

const CREDIT_400 = JSON.stringify({
  type: 'error',
  error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' },
})

describe('billing is classified off the body, because its status is a plain 400', () => {
  it('detects the real Anthropic credit-balance payload', () => {
    const out = classifyUpstream(400, CREDIT_400)
    expect(out.code).toBe('billing')
    expect(out.retryable).toBe(false)
  })

  it('never tells the reader to try again', () => {
    expect(classifyUpstream(400, CREDIT_400).message).not.toMatch(/try again/i)
    expect(classifyUpstream(401, '').message).not.toMatch(/try again/i)
  })

  it('does not name the vendor or quote the upstream text to an end user', () => {
    const { message } = classifyUpstream(400, CREDIT_400)
    expect(message).not.toMatch(/anthropic/i)
    expect(message).not.toMatch(/Plans & Billing/)
    expect(message).toMatch(/administrator/i)
  })

  it('a plain 400 that is NOT about billing stays unknown', () => {
    const out = classifyUpstream(400, JSON.stringify({ error: { message: 'max_tokens: must be >= 1' } }))
    expect(out.code).toBe('unknown')
  })
})

describe('the other upstream shapes', () => {
  it('401/403 is auth and needs a person; 429 and 5xx are retryable', () => {
    expect(classifyUpstream(401, '').code).toBe('auth')
    expect(classifyUpstream(403, '').code).toBe('auth')
    expect(classifyUpstream(401, '').retryable).toBe(false)
    expect(classifyUpstream(429, '').code).toBe('rate_limit')
    expect(classifyUpstream(429, '').retryable).toBe(true)
    expect(classifyUpstream(503, '').code).toBe('unavailable')
    expect(classifyUpstream(503, '').retryable).toBe(true)
  })

  it('the subject is substituted so each surface names itself', () => {
    expect(classifyUpstream(429, '', 'Report sections are').message).toMatch(/^Report sections are busy/)
  })
})

describe('the status this API answers with', () => {
  it('passes a 429 through, answers 503 for the cases a retry cannot fix, 502 otherwise', () => {
    expect(statusForUpstream(429, 'rate_limit')).toBe(429)
    expect(statusForUpstream(400, 'billing')).toBe(503)
    expect(statusForUpstream(401, 'auth')).toBe(503)
    expect(statusForUpstream(500, 'unavailable')).toBe(502)
  })
})

describe('friendlyUpstreamError — the streaming handlers pass one string', () => {
  it('parses the status out of an `upstream_NNN: body` string', () => {
    expect(friendlyUpstreamError('upstream_429: {}')).toMatch(/busy/i)
    expect(friendlyUpstreamError(`upstream_400: ${CREDIT_400}`)).toMatch(/billing/i)
  })
})

describe('every endpoint that calls the model reads this module', () => {
  const API_DIR = path.resolve('api')

  /** Source with comments removed — prose about AtmosFlow's OWN credit
   *  balance is not a second detector, and must not read as one. */
  const code = (file: string) =>
    readFileSync(path.join(API_DIR, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('no handler carries its own credit-balance check any more', () => {
    const offenders: string[] = []
    for (const f of readdirSync(API_DIR)) {
      if (!/\.(js|ts)$/.test(f) || f === '_upstream-error.js') continue
      const src = code(f)
      if (/credit balance/i.test(src) && !/_upstream-error\.js/.test(src)) offenders.push(f)
    }
    expect(offenders, 'these files should import the shared classifier').toEqual([])
  })

  it('every endpoint that calls the model imports it', () => {
    for (const f of ['narrative.js', 'report-sections.js', 'inline-ai.js', 'field-assistant.ts', 'photo-analyze.js', 'inline-complete.js', 'pre-review-semantic.js']) {
      expect(code(f), f).toMatch(/_upstream-error\.js/)
    }
  })
})
