// @vitest-environment jsdom
/**
 * useNetworkStatus — centralized online/offline source of truth.
 *
 * Pins:
 *   • Returns online=true in SSR-ish environments where navigator
 *     is undefined (module module-level guard)
 *   • Reflects navigator.onLine on mount
 *   • Updates when window emits 'offline' / 'online' events
 *   • wasOffline latches once the session has gone offline
 *   • isOnline() imperative read stays in sync with the hook
 *   • Test harness setOnline() drives state changes deterministically
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useNetworkStatus, isOnline, __test } from '../../src/hooks/useNetworkStatus'

afterEach(() => {
  __test.reset()
})

describe('useNetworkStatus', () => {
  it('returns online=true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    __test.reset()
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.online).toBe(true)
    expect(result.current.wasOffline).toBe(false)
  })

  it('flips to offline when window emits offline', () => {
    const { result } = renderHook(() => useNetworkStatus())
    act(() => { __test.setOnline(false) })
    expect(result.current.online).toBe(false)
  })

  it('flips back to online when reconnected and latches wasOffline', () => {
    const { result } = renderHook(() => useNetworkStatus())
    act(() => { __test.setOnline(false) })
    act(() => { __test.setOnline(true) })
    expect(result.current.online).toBe(true)
    expect(result.current.wasOffline).toBe(true)
  })

  it('updates the `since` timestamp on state transitions', () => {
    const { result } = renderHook(() => useNetworkStatus())
    const initial = result.current.since
    act(() => { __test.setOnline(false) })
    expect(result.current.since).not.toBe(initial)
  })

  it('isOnline() imperative read agrees with the hook state', () => {
    expect(isOnline()).toBe(true)
    act(() => { __test.setOnline(false) })
    expect(isOnline()).toBe(false)
    act(() => { __test.setOnline(true) })
    expect(isOnline()).toBe(true)
  })

  it('multiple consumers all see updates from a single setOnline call', () => {
    const a = renderHook(() => useNetworkStatus())
    const b = renderHook(() => useNetworkStatus())
    act(() => { __test.setOnline(false) })
    expect(a.result.current.online).toBe(false)
    expect(b.result.current.online).toBe(false)
  })

  it('no-ops when set to the current state (no spurious re-render)', () => {
    let renders = 0
    renderHook(() => {
      renders += 1
      return useNetworkStatus()
    })
    const before = renders
    act(() => { __test.setOnline(true) }) // already true
    expect(renders).toBe(before)
  })
})
