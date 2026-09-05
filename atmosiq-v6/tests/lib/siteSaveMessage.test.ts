/**
 * siteSaveMessage — no machine token ever reaches the user.
 *
 * From a field report: the Save-site sheet rendered the bare string
 * "internal_error" as its whole error message, because the save path
 * threw `new Error(json.error)` and the sheet prints `e.message`. The
 * property worth pinning is not the wording of any one sentence but
 * that EVERY branch returns prose — a future API code nobody mapped
 * must still produce something a person can act on, which is exactly
 * the case the original code got wrong.
 */
import { describe, it, expect } from 'vitest'
import { siteSaveMessage } from '../../src/utils/siteSaveMessage.js'

/** Looks like prose, not like an identifier. */
const isSentence = (s: string) =>
  typeof s === 'string' && /\s/.test(s) && /[.!]$/.test(s) && !/^[a-z0-9_]+$/.test(s)

describe('siteSaveMessage', () => {
  it('never returns a machine token, for any input', () => {
    const inputs: unknown[] = [
      'not_configured', 'not_authenticated', 'invalid_token', 'name_required',
      'site_required', 'site_not_found', 'insert_failed', 'update_failed',
      'query_failed', 'delete_failed',
      // The ones that caused the report, plus shapes nobody mapped.
      'internal_error', 'save_failed', 'some_future_code', '', null, undefined, 42, {},
    ]
    for (const i of inputs) {
      const msg = siteSaveMessage(i, 500)
      expect(isSentence(msg), `not a sentence for input ${JSON.stringify(i)}: ${msg}`).toBe(true)
      expect(msg).not.toMatch(/internal_error|_failed\b|not_configured/)
    }
  })

  it('tells the assessor the deployment is misconfigured rather than asking them to retry', () => {
    const msg = siteSaveMessage('not_configured', 503)
    expect(msg).toMatch(/administrator/i)
    // Retrying cannot fix a missing env var; the message must not suggest it.
    expect(msg).not.toMatch(/retry|try again/i)
  })

  it('says the assessment is safe, which is the thing the user most needs to know', () => {
    for (const code of ['not_configured', 'insert_failed', 'update_failed']) {
      expect(siteSaveMessage(code, 500)).toMatch(/assessment is saved/i)
    }
  })

  it('routes an expired session to signing in, not to retrying', () => {
    expect(siteSaveMessage('invalid_token', 401)).toMatch(/[Ss]ign in again/)
  })

  it('distinguishes an unmapped 5xx from an unmapped 4xx', () => {
    expect(siteSaveMessage('mystery', 500)).not.toBe(siteSaveMessage('mystery', 400))
  })
})
