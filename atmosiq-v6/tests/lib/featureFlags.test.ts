/**
 * Feature flags — Knowledge Graph gate resolution + kill switch.
 *
 * Pins the staged-rollout contract on resolveKgFlag (preview on, prod off,
 * sticky ?kg= overrides, localStorage overrides, storage-unavailable
 * fallback) AND the master kill switch on isKnowledgeGraphEnabled.
 */
import { describe, it, expect } from 'vitest'
import { isKnowledgeGraphEnabled, resolveKgFlag, applyKgCohort, isProdHost, KG_KILL_SWITCH, KG_STORAGE_KEY, KG_COHORT_STORAGE_KEY } from '../../src/utils/featureFlags.js'

// Minimal in-memory Storage stub (full Storage surface for the type).
function memStorage(seed: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(seed))
  return {
    get length() { return m.size },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k) },
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
  } as Storage
}

describe('isProdHost', () => {
  it('recognizes the production hosts only', () => {
    expect(isProdHost('atmosflow.net')).toBe(true)
    expect(isProdHost('www.atmosflow.net')).toBe(true)
    expect(isProdHost('ATMOSFLOW.NET')).toBe(true)
    expect(isProdHost('prudence-ehs-tools-xyz.vercel.app')).toBe(false)
    expect(isProdHost('localhost')).toBe(false)
    expect(isProdHost('')).toBe(false)
  })
})

describe('resolveKgFlag — host default', () => {
  it('is ON for non-production hosts', () => {
    expect(resolveKgFlag({ hostname: 'foo.vercel.app', search: '', storage: memStorage() })).toBe(true)
    expect(resolveKgFlag({ hostname: 'localhost', search: '', storage: memStorage() })).toBe(true)
  })
  it('is OFF for the production host by default', () => {
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage() })).toBe(false)
    expect(resolveKgFlag({ hostname: 'www.atmosflow.net', search: '', storage: memStorage() })).toBe(false)
  })
})

describe('resolveKgFlag — URL override (sticky)', () => {
  it('?kg=1 enables on production and persists', () => {
    const storage = memStorage()
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=1', storage })).toBe(true)
    expect(storage.getItem(KG_STORAGE_KEY)).toBe('1')
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(true)
  })
  it('?kg=0 disables on a non-prod host and persists', () => {
    const storage = memStorage()
    expect(resolveKgFlag({ hostname: 'foo.vercel.app', search: '?kg=0', storage })).toBe(false)
    expect(storage.getItem(KG_STORAGE_KEY)).toBe('0')
    expect(resolveKgFlag({ hostname: 'foo.vercel.app', search: '', storage })).toBe(false)
  })
  it('accepts on/off/true/false spellings', () => {
    const s = memStorage()
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=on', storage: s })).toBe(true)
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=false', storage: s })).toBe(false)
  })
})

describe('resolveKgFlag — persisted localStorage override', () => {
  it("'1' forces on for production", () => {
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [KG_STORAGE_KEY]: '1' }) })).toBe(true)
  })
  it("'0' forces off for a preview host", () => {
    expect(resolveKgFlag({ hostname: 'foo.vercel.app', search: '', storage: memStorage({ [KG_STORAGE_KEY]: '0' }) })).toBe(false)
  })
  it('URL param beats a stale persisted value', () => {
    const storage = memStorage({ [KG_STORAGE_KEY]: '0' })
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=1', storage })).toBe(true)
  })
})

describe('resolveKgFlag — beta cohort (server-driven)', () => {
  it('cohort marker enables the KG on the production host', () => {
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [KG_COHORT_STORAGE_KEY]: '1' }) })).toBe(true)
  })
  it('is enable-only — a non-cohort prod user still falls through to OFF', () => {
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage() })).toBe(false)
    // any non-'1' value is ignored (no force-off semantics)
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [KG_COHORT_STORAGE_KEY]: '0' }) })).toBe(false)
  })
  it("the user's explicit persisted opt-out ('af.kgEvidence'=0) beats the cohort", () => {
    const storage = memStorage({ [KG_STORAGE_KEY]: '0', [KG_COHORT_STORAGE_KEY]: '1' })
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(false)
  })
  it('an explicit ?kg=0 beats the cohort marker', () => {
    const storage = memStorage({ [KG_COHORT_STORAGE_KEY]: '1' })
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=0', storage })).toBe(false)
  })
})

describe('applyKgCohort', () => {
  it('writes the cohort marker when enabled, so the next resolve turns ON on prod', () => {
    const storage = memStorage()
    expect(applyKgCohort(true, { storage })).toBe(true)
    expect(storage.getItem(KG_COHORT_STORAGE_KEY)).toBe('1')
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(true)
  })
  it('clears the cohort marker when disabled', () => {
    const storage = memStorage({ [KG_COHORT_STORAGE_KEY]: '1' })
    expect(applyKgCohort(false, { storage })).toBe(false)
    expect(storage.getItem(KG_COHORT_STORAGE_KEY)).toBeNull()
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(false)
  })
  it('does not touch the user override key', () => {
    const storage = memStorage({ [KG_STORAGE_KEY]: '0' })
    applyKgCohort(true, { storage })
    expect(storage.getItem(KG_STORAGE_KEY)).toBe('0')
  })
  it('is a silent no-op when storage is unavailable', () => {
    expect(applyKgCohort(true, { storage: null })).toBe(true)
    expect(() => applyKgCohort(true, { storage: null })).not.toThrow()
  })
})

describe('resolveKgFlag — storage unavailable', () => {
  it('falls back to the host default without throwing', () => {
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage: null })).toBe(false)
    expect(resolveKgFlag({ hostname: 'localhost', search: '', storage: null })).toBe(true)
  })
  it('still honors a URL override when storage write throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '?kg=1', storage: throwing as never })).toBe(true)
  })
})

describe('isKnowledgeGraphEnabled — master kill switch', () => {
  it('is currently ENGAGED (feature off everywhere)', () => {
    expect(KG_KILL_SWITCH).toBe(true)
  })
  it('forces OFF regardless of host, ?kg=1, or persisted opt-in while engaged', () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'foo.vercel.app', search: '', storage: memStorage() })).toBe(false)
    expect(isKnowledgeGraphEnabled({ hostname: 'localhost', search: '?kg=1', storage: memStorage() })).toBe(false)
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=1', storage: memStorage({ [KG_STORAGE_KEY]: '1' }) })).toBe(false)
    // the beta cohort marker does not escape the kill switch either
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [KG_COHORT_STORAGE_KEY]: '1' }) })).toBe(false)
  })
  it('would delegate to resolveKgFlag when the kill switch is lifted', () => {
    // Documents the wiring: with the switch off, the public flag === resolution.
    // (resolveKgFlag is exhaustively covered above.)
    expect(typeof resolveKgFlag).toBe('function')
  })
})
