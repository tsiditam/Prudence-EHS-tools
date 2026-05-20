// @vitest-environment jsdom
/**
 * PendingSyncIndicator — UI contract.
 *
 * The component is invisible when the queue is empty and there is no
 * recent error. When there is something to surface, it renders one
 * of three pill states: syncing, pending, error. A "Sync now" button
 * appears in the pending + error cases when the device is online.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import PendingSyncIndicator from '../../src/components/PendingSyncIndicator'

// Mock the cloudStorage facade so we can drive getSyncState() return
// values per test without touching localStorage or real Supabase.
const getSyncState = vi.fn()
const processSyncQueue = vi.fn(() => Promise.resolve())
vi.mock('../../src/utils/cloudStorage', () => ({
  default: {
    getSyncState: () => getSyncState(),
    processSyncQueue: () => processSyncQueue(),
  },
}))

beforeEach(() => {
  getSyncState.mockReset()
  processSyncQueue.mockReset()
})

afterEach(() => {
  cleanup()
})

async function flushEffects() {
  // Allow the hook's initial async refresh to settle.
  await act(async () => { await Promise.resolve() })
}

describe('PendingSyncIndicator', () => {
  it('renders nothing when caught up (queueDepth 0, online, no error)', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 0, inFlight: false, lastAttempt: null, lastSuccess: null, lastError: null, online: true,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    expect(screen.queryByTestId('pending-sync-indicator')).toBeNull()
  })

  it('renders the amber pending pill with item count when offline + queue non-empty', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 3, inFlight: false, lastAttempt: null, lastSuccess: null, lastError: null, online: false,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    const pill = screen.getByTestId('pending-sync-indicator')
    expect(pill).toBeTruthy()
    expect(pill.textContent).toContain('3 items pending sync')
    // "Sync now" should NOT be offered while offline
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull()
  })

  it('uses singular wording when exactly one item is pending', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 1, inFlight: false, lastAttempt: null, lastSuccess: null, lastError: null, online: true,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    const pill = screen.getByTestId('pending-sync-indicator')
    expect(pill.textContent).toContain('1 item pending sync')
  })

  it('renders the blue syncing pill while inFlight is true', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 2, inFlight: true, lastAttempt: '2026-05-19T10:00:00Z', lastSuccess: null, lastError: null, online: true,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    const pill = screen.getByTestId('pending-sync-indicator')
    expect(pill.textContent).toContain('Syncing 2 items')
    // No "Sync now" while a drain is already in flight.
    expect(screen.queryByRole('button', { name: /sync now/i })).toBeNull()
  })

  it('renders the red error pill when lastError + items remain', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 1, inFlight: false, lastAttempt: '2026-05-19T10:00:00Z', lastSuccess: null, lastError: 'network_failed', online: true,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    const pill = screen.getByTestId('pending-sync-indicator')
    expect(pill.textContent).toContain('Sync had errors')
    expect(pill.textContent).toContain('1 pending')
    expect(screen.getByRole('button', { name: /sync now/i })).toBeTruthy()
  })

  it('Sync now button calls Storage.processSyncQueue', async () => {
    getSyncState.mockResolvedValue({
      queueDepth: 2, inFlight: false, lastAttempt: null, lastSuccess: null, lastError: null, online: true,
    })
    render(<PendingSyncIndicator />)
    await flushEffects()
    const btn = screen.getByRole('button', { name: /sync now/i })
    fireEvent.click(btn)
    expect(processSyncQueue).toHaveBeenCalledTimes(1)
  })
})
