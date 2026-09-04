// @vitest-environment jsdom
/**
 * AuthContext.consumeCredit — the analytics balance comes from the
 * functional-setter result, not a closed-over `credits` (audit 2026-09 §8).
 *
 * Two debits fired in the same tick used to report the same balance
 * because both read the stale closure value.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

const trackEvent = vi.fn()
vi.mock('../../src/utils/supabaseClient', () => ({ supabase: null, trackEvent: (...a: unknown[]) => trackEvent(...a) }))
vi.mock('../../src/utils/cloudStorage', () => ({
  default: {
    getSession: async () => null, getUser: async () => null, getProfile: async () => null,
    onAuthChange: () => () => {}, processSyncQueue: () => {}, fullSync: () => {}, signOut: async () => {},
  },
}))
vi.mock('../../src/utils/profiles', () => ({ default: { getActiveProfile: async () => null } }))

import { AuthProvider, useAuth } from '../../src/contexts/AuthContext'

afterEach(() => cleanup())

let api: ReturnType<typeof useAuth> | null = null
function Probe() {
  api = useAuth()
  return <span data-testid="credits">{api.credits}</span>
}

describe('consumeCredit', () => {
  it('reports the post-debit balance for back-to-back debits', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(screen.getByTestId('credits').textContent).toBe('5')

    await act(async () => {
      await Promise.all([
        api!.consumeCredit(1, 'assessment'),
        api!.consumeCredit(1, 'narrative'),
      ])
    })

    expect(screen.getByTestId('credits').textContent).toBe('3')
    const balances = trackEvent.mock.calls
      .filter((c) => c[0] === 'credit_consumed')
      .map((c) => (c[1] as { balance: number }).balance)
    expect(balances).toEqual([4, 3])
  })

  it('never reports a negative balance', async () => {
    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await api!.consumeCredit(50, 'assessment') })
    expect(screen.getByTestId('credits').textContent).toBe('0')
    const last = trackEvent.mock.calls.filter((c) => c[0] === 'credit_consumed').pop()!
    expect((last[1] as { balance: number }).balance).toBe(0)
  })
})
