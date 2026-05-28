/**
 * useGhostText — debounce + cancellation + ghost suffix-slide tests.
 *
 * Pins the behavioral contract that the Smart-Compose UX depends on:
 *   • Below minLength → no fetch, no ghost
 *   • Stable text past debounce → fetch fires + ghost set
 *   • Typing more chars cancels the pending debounce
 *   • Typing into the existing ghost shrinks the ghost forward
 *   • Typing OFF the ghost path drops it
 *   • Backspace clears the ghost (we don't refire immediately)
 *   • dismiss() suppresses re-fetch until text changes
 *   • disabled=false clears + cancels in-flight
 *
 * Uses vi.useFakeTimers() to deterministically step past the
 * debounce window.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { useGhostText } from '../../src/hooks/useGhostText'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('useGhostText', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns empty ghost when text is shorter than minLength', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ completion: 'x' }))
    const { result } = renderHook(() =>
      useGhostText({ text: 'short', minLength: 12, debounceMs: 100 }),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(result.current.ghost).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fires fetch after debounce + sets ghost on success', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ completion: ' levels in the conference room.' }),
    )
    const { result } = renderHook(() =>
      useGhostText({
        text: 'CO2 measured at elevated',
        minLength: 12,
        debounceMs: 100,
      }),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.ghost).toBe(' levels in the conference room.'))
  })

  it('rerunning with new text before debounce settles cancels the prior debounce', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ completion: 'X' }))
    const { rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 200 }),
      { initialProps: { text: 'something' } },
    )
    // Halfway through the debounce, rerender with new text.
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    rerender({ text: 'something else' })
    // Original debounce should've been canceled — let it expire.
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(fetchMock).not.toHaveBeenCalled()
    // Now let the new debounce settle.
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('shrinks ghost when user types its leading characters', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ completion: ' room conditions stable.' }),
    )
    const { result, rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 50 }),
      { initialProps: { text: 'Conference' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await waitFor(() => expect(result.current.ghost).toBe(' room conditions stable.'))

    // User types " roo" — the first 4 chars of the ghost. Ghost
    // should slide forward to "m conditions stable."
    rerender({ text: 'Conference roo' })
    await waitFor(() => expect(result.current.ghost).toBe('m conditions stable.'))
  })

  it('drops ghost when user types something that diverges from it', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ completion: ' room conditions stable.' }),
    )
    const { result, rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 50 }),
      { initialProps: { text: 'Conference' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await waitFor(() => expect(result.current.ghost).toBe(' room conditions stable.'))

    // User types " hall" instead of " room" — diverges from ghost.
    rerender({ text: 'Conference hall' })
    expect(result.current.ghost).toBe('')
  })

  it('clears ghost on backspace (text shrinks)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ completion: ' completed successfully.' }),
    )
    const { result, rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 50 }),
      { initialProps: { text: 'The walkthrough was' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await waitFor(() => expect(result.current.ghost).toBe(' completed successfully.'))

    rerender({ text: 'The walkthrough w' }) // backspaced
    expect(result.current.ghost).toBe('')
  })

  it('dismiss() suppresses refetch until text changes again', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ completion: ' continuation' }),
    )
    const { result, rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 50 }),
      { initialProps: { text: 'observation note here' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    await act(async () => { result.current.dismiss() })
    expect(result.current.ghost).toBe('')

    // Force the effect to re-run with the same text. The dismissed
    // marker should suppress a refetch.
    rerender({ text: 'observation note here' })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // New typing clears the dismissed marker — fetch fires again.
    rerender({ text: 'observation note here.' })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it('enabled=false clears the ghost and cancels any pending request', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({ completion: 'x' }))
    const { result, rerender } = renderHook(
      ({ text, enabled }) => useGhostText({ text, enabled, minLength: 4, debounceMs: 100 }),
      { initialProps: { text: 'observation', enabled: true } },
    )
    // Mid-debounce, flip enabled off.
    await act(async () => { await vi.advanceTimersByTimeAsync(40) })
    rerender({ text: 'observation', enabled: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(result.current.ghost).toBe('')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('silent on non-OK HTTP responses (no ghost set, no error surface)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ error: 'rate_limit_exceeded' }, 429),
    )
    const { result } = renderHook(() =>
      useGhostText({ text: 'observation note', minLength: 4, debounceMs: 50 }),
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(150) })
    expect(result.current.ghost).toBe('')
  })

  it('discards stale completion if text moved on mid-flight', async () => {
    let resolveFetch: ((res: Response) => void) | null = null
    const fetchMock = vi.spyOn(global, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => { resolveFetch = resolve }) as unknown as Promise<Response>,
    )
    const { result, rerender } = renderHook(
      ({ text }) => useGhostText({ text, minLength: 4, debounceMs: 50 }),
      { initialProps: { text: 'original text' } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // While the fetch is pending, the user keeps typing.
    rerender({ text: 'original text changed' })

    // Now resolve the stale fetch with a completion that no longer
    // applies to the current text.
    await act(async () => {
      resolveFetch?.(jsonResponse({ completion: ' stale stuff' }))
      await vi.advanceTimersByTimeAsync(10)
    })
    // Hook should NOT have applied the stale ghost — the for-text
    // mismatch guards against it.
    expect(result.current.ghost).toBe('')
  })
})
