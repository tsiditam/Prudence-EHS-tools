/**
 * Tests for scripts/check-env.mjs — the startup assertion that lists the
 * server-side variables a deployment is missing.
 */

import { describe, it, expect } from 'vitest'
import { checkEnv, formatReport, REQUIRED_SERVER_VARS } from '../../scripts/check-env.mjs'

const FULL = Object.fromEntries(REQUIRED_SERVER_VARS.map(k => [k, 'set']))

describe('checkEnv', () => {
  it('passes when every required variable is set', () => {
    const r = checkEnv(FULL)
    expect(r.ok).toBe(true)
    expect(r.missing).toEqual([])
  })

  it('lists every missing required variable and nothing else', () => {
    const env = { ...FULL }
    delete env.STRIPE_WEBHOOK_SECRET
    delete env.CRON_SECRET
    const r = checkEnv(env)
    expect(r.ok).toBe(false)
    expect(r.missing).toEqual(['STRIPE_WEBHOOK_SECRET', 'CRON_SECRET'])
  })

  it('accepts VITE_SUPABASE_URL in place of SUPABASE_URL (every handler falls back to it)', () => {
    const env = { ...FULL }
    delete env.SUPABASE_URL
    env.VITE_SUPABASE_URL = 'https://x.supabase.co'
    expect(checkEnv(env).missing).toEqual([])
  })

  it('treats whitespace-only values as unset', () => {
    const r = checkEnv({ ...FULL, ANTHROPIC_API_KEY: '   ' })
    expect(r.missing).toEqual(['ANTHROPIC_API_KEY'])
  })

  it('formats a readable report', () => {
    const text = formatReport(checkEnv({ ...FULL, SENTRY_DSN: 'x' }))
    expect(text).toContain('all required server variables are set')
    expect(text).toContain('optional, unset:')
    expect(text).not.toContain('SENTRY_DSN')
  })
})
