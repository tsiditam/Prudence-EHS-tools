/**
 * Mold module feature flag — staged-rollout resolution + kill switch.
 *
 * The mold module ships dark (MOLD_KILL_SWITCH === true), so isMoldModuleEnabled
 * is OFF everywhere today. These tests pin (1) that master-off behaviour, (2)
 * the pure resolveMoldFlag contract it will use once the switch lifts — proving
 * it reuses the SAME shared resolver as the KG flag with its own keys — and (3)
 * that the mold and KG flags are independent (one cohort never enables the
 * other).
 */
import { describe, it, expect } from 'vitest'
import {
  isMoldModuleEnabled, resolveMoldFlag, applyMoldCohort, resolveKgFlag,
  MOLD_KILL_SWITCH, MOLD_STORAGE_KEY, MOLD_COHORT_STORAGE_KEY, KG_COHORT_STORAGE_KEY,
} from '../../src/utils/featureFlags.js'

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

describe('isMoldModuleEnabled — master kill switch (lifted; staged rollout active)', () => {
  it('the switch is LIFTED', () => {
    expect(MOLD_KILL_SWITCH).toBe(false)
  })
  it('delegates to resolveMoldFlag — on everywhere by default (Beta); opt-out hides it', () => {
    expect(isMoldModuleEnabled({ hostname: 'localhost', search: '', storage: memStorage() })).toBe(true)
    expect(isMoldModuleEnabled({ hostname: 'foo.vercel.app', search: '', storage: memStorage() })).toBe(true)
    expect(isMoldModuleEnabled({ hostname: 'atmosflow.net', search: '', storage: memStorage() })).toBe(true)
    expect(isMoldModuleEnabled({ hostname: 'atmosflow.net', search: '?mold=0', storage: memStorage() })).toBe(false)
  })
})

describe('resolveMoldFlag — the staged contract for when the switch lifts', () => {
  it('is ON everywhere by default — production included (Beta rollout)', () => {
    expect(resolveMoldFlag({ hostname: 'localhost', search: '', storage: memStorage() })).toBe(true)
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage() })).toBe(true)
  })
  it('?mold=0 hides it per-browser and persists (sticky opt-out)', () => {
    const storage = memStorage()
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '?mold=0', storage })).toBe(false)
    expect(storage.getItem(MOLD_STORAGE_KEY)).toBe('0')
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(false)
  })
  it('?mold=1 stays on and persists (sticky)', () => {
    const storage = memStorage()
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '?mold=1', storage })).toBe(true)
    expect(storage.getItem(MOLD_STORAGE_KEY)).toBe('1')
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(true)
  })
  it('the beta cohort marker enables it on production (enable-only)', () => {
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage: memStorage({ [MOLD_COHORT_STORAGE_KEY]: '1' }) })).toBe(true)
  })
  it("the user's explicit ?mold=0 opt-out beats the cohort", () => {
    const storage = memStorage({ [MOLD_STORAGE_KEY]: '0', [MOLD_COHORT_STORAGE_KEY]: '1' })
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(false)
  })
})

describe('applyMoldCohort', () => {
  it('writes / clears the mold cohort marker and never touches the KG cohort', () => {
    const storage = memStorage({ [KG_COHORT_STORAGE_KEY]: '1' })
    expect(applyMoldCohort(true, { storage })).toBe(true)
    expect(storage.getItem(MOLD_COHORT_STORAGE_KEY)).toBe('1')
    expect(storage.getItem(KG_COHORT_STORAGE_KEY)).toBe('1') // untouched
    applyMoldCohort(false, { storage })
    expect(storage.getItem(MOLD_COHORT_STORAGE_KEY)).toBeNull()
  })
})

describe('mold and KG flags are independent', () => {
  it('a mold cohort marker does not enable the KG (separate keys, same resolver)', () => {
    const storage = memStorage({ [MOLD_COHORT_STORAGE_KEY]: '1' })
    expect(resolveMoldFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(true)
    expect(resolveKgFlag({ hostname: 'atmosflow.net', search: '', storage })).toBe(false)
  })
})
