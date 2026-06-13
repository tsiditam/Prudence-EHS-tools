/**
 * Feature flags — Knowledge Graph gate resolution.
 *
 * Pins the staged-rollout contract: preview/localhost on by default,
 * production off by default, ?kg=1/0 overrides (sticky), localStorage
 * overrides, and graceful behavior when storage is unavailable.
 */
import { describe, it, expect } from 'vitest'
import { isKnowledgeGraphEnabled, isProdHost, KG_STORAGE_KEY } from '../../src/utils/featureFlags.js'

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

describe('isKnowledgeGraphEnabled — host default', () => {
  it('is ON for non-production hosts', () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'foo.vercel.app', search: '', storage: memStorage() })).toBe(true)
    expect(isKnowledgeGraphEnabled({ hostname: 'localhost', search: '', storage: memStorage() })).toBe(true)
  })
  it('is OFF for the production host by default', () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '', storage: memStorage() })).toBe(false)
    expect(isKnowledgeGraphEnabled({ hostname: 'www.atmosflow.net', search: '', storage: memStorage() })).toBe(false)
  })
})

describe('isKnowledgeGraphEnabled — URL override (sticky)', () => {
  it('?kg=1 enables on production and persists', () => {
    const storage = memStorage()
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=1', storage })).toBe(true)
    expect(storage.getItem(KG_STORAGE_KEY)).toBe('1')
    // sticky on the next visit without the param
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '', storage })).toBe(true)
  })
  it('?kg=0 disables on a non-prod host and persists', () => {
    const storage = memStorage()
    expect(isKnowledgeGraphEnabled({ hostname: 'foo.vercel.app', search: '?kg=0', storage })).toBe(false)
    expect(storage.getItem(KG_STORAGE_KEY)).toBe('0')
    expect(isKnowledgeGraphEnabled({ hostname: 'foo.vercel.app', search: '', storage })).toBe(false)
  })
  it('accepts on/off/true/false spellings', () => {
    const s = memStorage()
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=on', storage: s })).toBe(true)
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=false', storage: s })).toBe(false)
  })
})

describe('isKnowledgeGraphEnabled — persisted localStorage override', () => {
  it("'1' forces on for production", () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [KG_STORAGE_KEY]: '1' }) })).toBe(true)
  })
  it("'0' forces off for a preview host", () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'foo.vercel.app', search: '', storage: memStorage({ [KG_STORAGE_KEY]: '0' }) })).toBe(false)
  })
  it('URL param beats a stale persisted value', () => {
    const storage = memStorage({ [KG_STORAGE_KEY]: '0' })
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=1', storage })).toBe(true)
  })
})

describe('isKnowledgeGraphEnabled — storage unavailable', () => {
  it('falls back to the host default without throwing', () => {
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '', storage: null })).toBe(false)
    expect(isKnowledgeGraphEnabled({ hostname: 'localhost', search: '', storage: null })).toBe(true)
  })
  it('still honors a URL override when storage write throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(isKnowledgeGraphEnabled({ hostname: 'atmosflow.net', search: '?kg=1', storage: throwing as never })).toBe(true)
  })
})
