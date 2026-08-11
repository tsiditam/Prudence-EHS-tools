import { describe, it, expect } from 'vitest'
import {
  IAQ_SCORE_VISIBLE_DEFAULT,
  isIaqScoreVisible,
} from '../../src/utils/featureFlags'

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)) },
    removeItem: (k: string) => { m.delete(k) },
  }
}

describe('IAQ score visibility flag', () => {
  it('is HIDDEN by default (scoring feature removed from the client experience)', () => {
    expect(IAQ_SCORE_VISIBLE_DEFAULT).toBe(false)
    expect(isIaqScoreVisible({ search: '', storage: fakeStorage() })).toBe(false)
  })

  it('?score=1 restores the score (and persists it sticky)', () => {
    const storage = fakeStorage()
    expect(isIaqScoreVisible({ search: '?score=1', storage })).toBe(true)
    // Persisted, so a later visit without the param stays visible.
    expect(isIaqScoreVisible({ search: '', storage })).toBe(true)
  })

  it('?score=0 hides it again (and persists)', () => {
    const storage = fakeStorage({ 'af.iaqScore': '1' })
    expect(isIaqScoreVisible({ search: '?score=0', storage })).toBe(false)
    expect(isIaqScoreVisible({ search: '', storage })).toBe(false)
  })

  it('honours a persisted localStorage choice with no URL param', () => {
    expect(isIaqScoreVisible({ search: '', storage: fakeStorage({ 'af.iaqScore': '1' }) })).toBe(true)
    expect(isIaqScoreVisible({ search: '', storage: fakeStorage({ 'af.iaqScore': '0' }) })).toBe(false)
  })
})
