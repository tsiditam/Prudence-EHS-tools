/**
 * Unit tests for lib/unlimited-usage.js — the allowlist that bypasses
 * the per-minute / per-day / free-tier rate limits in
 * api/narrative.js, api/field-assistant.ts, and api/photo-analyze.js.
 *
 * Contract:
 * - UNLIMITED_USAGE_EMAILS env var is comma-separated; case-
 *   insensitive; whitespace around commas is tolerated.
 * - Missing or empty env var means no one is allowlisted.
 * - Null/undefined/non-string emails never match.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { hasUnlimitedUsage, parseAllowlist } from '../../lib/unlimited-usage.js'

const ENV_KEY = 'UNLIMITED_USAGE_EMAILS'

describe('parseAllowlist', () => {
  it('returns an empty list for missing input', () => {
    expect(parseAllowlist(undefined)).toEqual([])
    expect(parseAllowlist(null)).toEqual([])
    expect(parseAllowlist('')).toEqual([])
  })

  it('splits, trims, lowercases, and drops empties', () => {
    expect(parseAllowlist('a@b.com, B@C.COM ,, c@d.io')).toEqual([
      'a@b.com',
      'b@c.com',
      'c@d.io',
    ])
  })
})

describe('hasUnlimitedUsage', () => {
  const original = process.env[ENV_KEY]

  beforeEach(() => {
    delete process.env[ENV_KEY]
  })
  afterEach(() => {
    if (original === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = original
  })

  it('returns false when the env var is unset', () => {
    expect(hasUnlimitedUsage('mujuflystudio@gmail.com')).toBe(false)
  })

  it('returns false when the env var is empty', () => {
    process.env[ENV_KEY] = ''
    expect(hasUnlimitedUsage('mujuflystudio@gmail.com')).toBe(false)
  })

  it('matches an exact email', () => {
    process.env[ENV_KEY] = 'mujuflystudio@gmail.com'
    expect(hasUnlimitedUsage('mujuflystudio@gmail.com')).toBe(true)
  })

  it('matches case-insensitively in both directions', () => {
    process.env[ENV_KEY] = 'MUJUFLY@Example.com'
    expect(hasUnlimitedUsage('mujufly@example.com')).toBe(true)
    process.env[ENV_KEY] = 'mujufly@example.com'
    expect(hasUnlimitedUsage('MUJUFLY@EXAMPLE.COM')).toBe(true)
  })

  it('handles multi-email lists with surrounding whitespace', () => {
    process.env[ENV_KEY] = ' a@b.com , mujufly@example.com ,c@d.io '
    expect(hasUnlimitedUsage('a@b.com')).toBe(true)
    expect(hasUnlimitedUsage('mujufly@example.com')).toBe(true)
    expect(hasUnlimitedUsage('c@d.io')).toBe(true)
    expect(hasUnlimitedUsage('not-in-list@example.com')).toBe(false)
  })

  it('does not match non-string inputs', () => {
    process.env[ENV_KEY] = 'mujufly@example.com'
    expect(hasUnlimitedUsage(null)).toBe(false)
    expect(hasUnlimitedUsage(undefined)).toBe(false)
    expect(hasUnlimitedUsage(123 as unknown as string)).toBe(false)
    expect(hasUnlimitedUsage('')).toBe(false)
  })

  it('trims the input email before matching', () => {
    process.env[ENV_KEY] = 'mujufly@example.com'
    expect(hasUnlimitedUsage('  mujufly@example.com  ')).toBe(true)
  })
})
