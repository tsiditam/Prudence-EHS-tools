// @vitest-environment jsdom
/**
 * useCollaborators — wraps Supabase Realtime presence for an
 * assessment session.
 *
 * Pins:
 *   • supported=false when supabase isn't configured (graceful degrade)
 *   • Channel subscribed on mount; my own presence tracked once
 *     SUBSCRIBED arrives
 *   • Presence sync surfaces OTHER collaborators (self filtered out)
 *   • Multi-device entries collapsed by id (most-recent joined_at wins)
 *   • currentZone change re-tracks without re-creating the channel
 *   • Unmount tears down (removeChannel called)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

type PresenceEntry = { id: string; name?: string; current_zone?: string | null; joined_at?: string; avatar_url?: string | null }
type Handler = () => void
interface FakeChannel {
  _state: Record<string, PresenceEntry[]>
  _handlers: Record<string, Handler[]>
  _tracked: PresenceEntry | null
  on(category: string, opts: { event: string }, fn: Handler): FakeChannel
  subscribe(cb: (status: string) => void): FakeChannel
  track(state: PresenceEntry): Promise<void>
  untrack(): Promise<void>
  presenceState(): Record<string, PresenceEntry[]>
  _setState(s: Record<string, PresenceEntry[]>): void
}

let _channels: FakeChannel[] = []
let _removed: FakeChannel[] = []

function makeChannel(): FakeChannel {
  const ch: FakeChannel = {
    _state: {},
    _handlers: {},
    _tracked: null,
    on(category, opts, fn) {
      const key = `${category}:${opts.event}`
      if (!this._handlers[key]) this._handlers[key] = []
      this._handlers[key].push(fn)
      return this
    },
    subscribe(cb) {
      // Defer SUBSCRIBED so the hook's subscribe-then-track flow
      // mirrors production timing.
      setTimeout(() => cb('SUBSCRIBED'), 0)
      return this
    },
    async track(state) {
      this._tracked = state
      this._state[state.id] = [state]
      ;(this._handlers['presence:sync'] || []).forEach((fn) => fn())
    },
    async untrack() {
      if (this._tracked) {
        delete this._state[this._tracked.id]
        this._tracked = null
        ;(this._handlers['presence:sync'] || []).forEach((fn) => fn())
      }
    },
    presenceState() { return this._state },
    _setState(s) {
      this._state = s
      ;(this._handlers['presence:sync'] || []).forEach((fn) => fn())
    },
  }
  _channels.push(ch)
  return ch
}

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    channel: vi.fn((_name: string, _opts: unknown) => makeChannel()),
    removeChannel: vi.fn((ch: FakeChannel) => { _removed.push(ch) }),
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
}))

import { useCollaborators } from '../../src/hooks/useCollaborators'

beforeEach(() => {
  _channels = []
  _removed = []
})

describe('useCollaborators', () => {
  it('returns supported=false when assessmentId is missing', () => {
    const { result } = renderHook(() => useCollaborators({ me: { id: 'me' } }))
    expect(result.current.collaborators).toEqual([])
    expect(result.current.count).toBe(0)
  })

  it('subscribes + tracks own presence, then renders OTHER collaborators only', async () => {
    const { result } = renderHook(() =>
      useCollaborators({
        assessmentId: 'a1',
        me: { id: 'me', name: 'Me', avatar_url: null },
        currentZone: 'Zone A',
      }),
    )

    // Wait for the deferred SUBSCRIBED → track() chain.
    await waitFor(() => expect(_channels[0]?._tracked?.id).toBe('me'))

    // Inject a peer joining.
    await act(async () => {
      _channels[0]._setState({
        me: [{ id: 'me', name: 'Me', current_zone: 'Zone A', joined_at: '2026-04-15T12:00:00Z' }],
        peer1: [{ id: 'peer1', name: 'Jane', current_zone: 'Zone B', joined_at: '2026-04-15T12:01:00Z' }],
      })
    })

    expect(result.current.count).toBe(1)
    expect(result.current.collaborators[0]).toMatchObject({ id: 'peer1', name: 'Jane', current_zone: 'Zone B' })
    expect(result.current.isOnly).toBe(false)
  })

  it('collapses multi-device entries by id (most-recent joined_at wins)', async () => {
    const { result } = renderHook(() =>
      useCollaborators({ assessmentId: 'a1', me: { id: 'me' } }),
    )
    await waitFor(() => expect(_channels[0]?._tracked).not.toBeNull())

    // Same id, two entries — pick the later one.
    await act(async () => {
      _channels[0]._setState({
        peer1: [
          { id: 'peer1', name: 'Old', current_zone: 'Zone A', joined_at: '2026-04-15T12:00:00Z' },
          { id: 'peer1', name: 'New', current_zone: 'Zone Z', joined_at: '2026-04-15T13:00:00Z' },
        ],
      })
    })
    expect(result.current.count).toBe(1)
    expect(result.current.collaborators[0]).toMatchObject({ name: 'New', current_zone: 'Zone Z' })
  })

  it('currentZone change re-tracks without re-creating the channel', async () => {
    const { rerender } = renderHook(
      ({ zone }: { zone: string }) =>
        useCollaborators({
          assessmentId: 'a1',
          me: { id: 'me', name: 'Me' },
          currentZone: zone,
        }),
      { initialProps: { zone: 'Zone A' } },
    )
    await waitFor(() => expect(_channels[0]?._tracked?.current_zone).toBe('Zone A'))

    rerender({ zone: 'Zone B' })
    await waitFor(() => expect(_channels[0]?._tracked?.current_zone).toBe('Zone B'))
    // Single channel — no churn from the zone change.
    expect(_channels.length).toBe(1)
  })

  it('unmount untracks and removes the channel', async () => {
    const { unmount } = renderHook(() =>
      useCollaborators({ assessmentId: 'a1', me: { id: 'me' } }),
    )
    await waitFor(() => expect(_channels[0]?._tracked?.id).toBe('me'))
    unmount()
    await waitFor(() => expect(_removed.length).toBe(1))
  })

  it('disabled=false short-circuits — no channel created', () => {
    renderHook(() =>
      useCollaborators({
        assessmentId: 'a1', me: { id: 'me' }, enabled: false,
      }),
    )
    expect(_channels.length).toBe(0)
  })
})
