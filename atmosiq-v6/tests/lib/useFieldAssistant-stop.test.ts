/**
 * useFieldAssistant — stop() action + activeTool / tool-call SSE wiring.
 *
 * Pins the modern-AI-app affordances we just shipped:
 *   • activeTool starts null
 *   • SSE 'tool_start' frame sets activeTool to { name, input }
 *   • SSE 'tool_call' (completion) frame clears activeTool
 *   • SSE 'token' frame after a tool clears activeTool
 *   • SSE 'done' frame clears activeTool
 *   • stop() aborts the in-flight fetch + flips sending → false
 *
 * jsdom env so fetch / TextDecoder / ReadableStream exist.
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Restore global spies (notably fetch) between tests. Without this the
// per-test `mockResolvedValueOnce` queues leak across tests, so a later
// test consumes an earlier test's queued response and the SSE frames
// land on the wrong stream.
afterEach(() => { vi.restoreAllMocks() })

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { useFieldAssistant } from '../../src/hooks/useFieldAssistant'

/**
 * Build a controllable SSE stream that the hook will consume. The
 * test pushes frames and closes the stream via the returned helpers.
 * Wraps the standard Response.body shape (ReadableStream).
 */
function makeControllableSseResponse() {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
  })
  const push = (event: string, data: unknown) => {
    controller?.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  }
  const close = () => controller?.close()
  const response = new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
  return { response, push, close }
}

describe('useFieldAssistant — activeTool + stop', () => {
  it('activeTool starts null', () => {
    const { result } = renderHook(() => useFieldAssistant())
    expect(result.current.activeTool).toBeNull()
  })

  it('tool_start sets activeTool, token clears it', async () => {
    const { response, push, close } = makeControllableSseResponse()
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => {
      sendPromise = Promise.resolve(result.current.sendMessage('hi'))
    })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await act(async () => {
      push('meta', { conversation_id: 'c1', message_id: 'm1' })
      push('tool_start', { id: 't1', name: 'search_iaq_corpus', input: { query: 'CO2 thresholds' } })
      // Settle microtasks so the hook processes the SSE frames
      // before we assert.
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.activeTool).toMatchObject({
      name: 'search_iaq_corpus',
      input: { query: 'CO2 thresholds' },
    })

    await act(async () => {
      push('token', { text: 'CO2 levels above 1000 ppm…' })
      await new Promise((r) => setTimeout(r, 0))
    })

    expect(result.current.activeTool).toBeNull()

    await act(async () => {
      push('done', { quota: { used_today: 1, limit_today: 100, plan: 'free' } })
      close()
      if (sendPromise) await sendPromise
    })
  })

  it('tool_call (completion) frame clears activeTool', async () => {
    const { response, push, close } = makeControllableSseResponse()
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))
    // The perceived-effort hold runs before fetch; wait for the request
    // to actually fire before pushing SSE frames.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await act(async () => {
      push('meta', { conversation_id: 'c2', message_id: 'm2' })
      push('tool_start', { id: 't2', name: 'analyze_photo', input: {} })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.activeTool).toMatchObject({ name: 'analyze_photo' })

    await act(async () => {
      push('tool_call', { id: 't2', name: 'analyze_photo', status: 'ok' })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.activeTool).toBeNull()

    await act(async () => {
      push('done', {})
      close()
      if (sendPromise) await sendPromise
    })
  })

  it('stop() aborts the in-flight fetch and flips sending to false', async () => {
    const { response, push, close } = makeControllableSseResponse()
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await act(async () => {
      push('meta', { conversation_id: 'c3', message_id: 'm3' })
      push('tool_start', { id: 't3', name: 'search_iaq_corpus', input: { query: 'humidity' } })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.activeTool).not.toBeNull()
    expect(result.current.sending).toBe(true)

    await act(async () => {
      result.current.stop()
      // Mocked ReadableStream doesn't auto-close on AbortController
      // abort the way the real fetch does, so we close it here to
      // unblock the reader and let the send-loop unwind.
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })
    expect(result.current.activeTool).toBeNull()
    expect(result.current.sending).toBe(false)
  })

  it('done frame clears activeTool even if no completion fired', async () => {
    const { response, push, close } = makeControllableSseResponse()
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    await act(async () => {
      push('meta', { conversation_id: 'c4', message_id: 'm4' })
      push('tool_start', { id: 't4', name: 'lookup_standard', input: { standard: 'ASHRAE 62.1' } })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.activeTool).toMatchObject({ name: 'lookup_standard' })

    await act(async () => {
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })
    expect(result.current.activeTool).toBeNull()
  })
})
