/**
 * @vitest-environment jsdom
 *
 * Offline sync queue — observability surface.
 *
 * Tests for getSyncState() / getQueueDepth() / _queueSync() event
 * dispatch / processSyncQueue() state-update behavior. These guard
 * the contract the PendingSyncIndicator + useSyncState hook rely on.
 *
 * Does not exercise the actual Supabase wire calls — those are
 * already covered by existing supabaseStorage tests. This file
 * scopes to the state observability layer added in Move 3a.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

beforeEach(() => {
  // Reset module registry so supabaseStorage's module-load listener
  // re-binds against the fresh window between tests.
  vi.resetModules()
  localStorage.clear()
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Storage.getQueueDepth', () => {
  it('returns 0 when no queue exists', async () => {
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    expect(await Storage.getQueueDepth()).toBe(0)
  })

  it('returns the number of items in the queue', async () => {
    localStorage.setItem(
      'atmosiq-sync-queue',
      JSON.stringify([
        { type: 'assessment', data: { id: '1' } },
        { type: 'assessment', data: { id: '2' } },
        { type: 'delete', data: { id: '3' } },
      ]),
    )
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    expect(await Storage.getQueueDepth()).toBe(3)
  })
})

describe('Storage.getSyncState', () => {
  it('returns a queueDepth + null timestamps on a fresh install', async () => {
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    const s = await Storage.getSyncState()
    expect(s.queueDepth).toBe(0)
    expect(s.lastAttempt).toBeNull()
    expect(s.lastSuccess).toBeNull()
    expect(s.lastError).toBeNull()
    expect(s.inFlight).toBe(false)
  })

  it('reads persisted state from localStorage', async () => {
    localStorage.setItem('atmosiq-sync-state', JSON.stringify({
      inFlight: false,
      lastAttempt: '2026-05-19T10:00:00.000Z',
      lastSuccess: '2026-05-19T10:00:05.000Z',
      lastError: null,
    }))
    localStorage.setItem('atmosiq-sync-queue', JSON.stringify([{ type: 'profile', data: {} }]))
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    const s = await Storage.getSyncState()
    expect(s.queueDepth).toBe(1)
    expect(s.lastAttempt).toBe('2026-05-19T10:00:00.000Z')
    expect(s.lastSuccess).toBe('2026-05-19T10:00:05.000Z')
    expect(s.lastError).toBeNull()
  })
})

describe('Storage._queueSync', () => {
  it('appends an item to the queue', async () => {
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    await Storage._queueSync('assessment', { id: 'A-1', facility_name: 'X' })
    const raw = localStorage.getItem('atmosiq-sync-queue') || '[]'
    const queue = JSON.parse(raw)
    expect(queue).toHaveLength(1)
    expect(queue[0].type).toBe('assessment')
    expect(queue[0].data.id).toBe('A-1')
    expect(typeof queue[0].queuedAt).toBe('string')
  })

  it('dispatches the sync-state-changed event after enqueue', async () => {
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    const handler = vi.fn()
    window.addEventListener('atmosflow:sync-state-changed', handler)
    await Storage._queueSync('profile', { name: 'tester' })
    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('atmosflow:sync-state-changed', handler)
  })
})

describe('Storage.processSyncQueue — state updates', () => {
  it('no-ops when the queue is empty', async () => {
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    const handler = vi.fn()
    window.addEventListener('atmosflow:sync-state-changed', handler)
    await Storage.processSyncQueue()
    expect(handler).not.toHaveBeenCalled()
    const s = await Storage.getSyncState()
    expect(s.lastAttempt).toBeNull()
    window.removeEventListener('atmosflow:sync-state-changed', handler)
  })

  it('no-ops when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    localStorage.setItem('atmosiq-sync-queue', JSON.stringify([{ type: 'profile', data: {} }]))
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    await Storage.processSyncQueue()
    const s = await Storage.getSyncState()
    expect(s.lastAttempt).toBeNull()
  })

  it('skips when supabase is not configured (offline-equivalent)', async () => {
    // Without VITE_SUPABASE_URL the supabase client is null. The
    // isOnline() check in supabaseStorage gates on `!!supabase`, so
    // processSyncQueue should short-circuit before touching state.
    localStorage.setItem('atmosiq-sync-queue', JSON.stringify([{ type: 'profile', data: {} }]))
    const { default: Storage } = await import('../../src/utils/supabaseStorage')
    await Storage.processSyncQueue()
    const s = await Storage.getSyncState()
    expect(s.lastAttempt).toBeNull()
    // The queue should still be there
    expect(s.queueDepth).toBe(1)
  })
})
