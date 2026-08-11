import { describe, it, expect } from 'vitest'
import {
  INVESTIGATION_KILL_SWITCH,
  isInvestigationFrameworkEnabled,
  resolveInvestigationFrameworkFlag,
} from '../../src/utils/featureFlags'

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

describe('Investigation-framework feature flag (Phase 3)', () => {
  it('is staged DARK — kill switch on, so production stays on 2.x', () => {
    expect(INVESTIGATION_KILL_SWITCH).toBe(true)
  })

  it('is OFF everywhere while the kill switch is on (prod, preview, and explicit ?ide=1)', () => {
    expect(isInvestigationFrameworkEnabled({ hostname: 'atmosflow.net', search: '', storage: fakeStorage() })).toBe(false)
    expect(isInvestigationFrameworkEnabled({ hostname: 'localhost', search: '', storage: fakeStorage() })).toBe(false)
    expect(isInvestigationFrameworkEnabled({ hostname: 'atmosflow.net', search: '?ide=1', storage: fakeStorage() })).toBe(false)
  })

  it('once the kill switch lifts, the resolver follows the staged pattern (prod-off, preview-on, ?ide opt-in)', () => {
    // resolveInvestigationFrameworkFlag ignores the kill switch (the rollout logic).
    expect(resolveInvestigationFrameworkFlag({ hostname: 'atmosflow.net', search: '', storage: fakeStorage() })).toBe(false)
    expect(resolveInvestigationFrameworkFlag({ hostname: 'localhost', search: '', storage: fakeStorage() })).toBe(true)
    expect(resolveInvestigationFrameworkFlag({ hostname: 'atmosflow.net', search: '?ide=1', storage: fakeStorage() })).toBe(true)
    expect(resolveInvestigationFrameworkFlag({ hostname: 'localhost', search: '?ide=0', storage: fakeStorage() })).toBe(false)
  })
})
