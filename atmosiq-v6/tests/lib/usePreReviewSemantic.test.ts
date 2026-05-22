// @vitest-environment jsdom
/**
 * usePreReviewSemantic — SSE client for the Layer 2 endpoint.
 *
 * Pins:
 *   • Initial state: running=false, issues=[], error=null
 *   • Rejects invalid input without firing fetch
 *   • Streams `issue` SSE frames into the issues array
 *   • Settles running=false on `done`
 *   • Surfaces non-OK HTTP responses as friendly errors
 *   • stop() aborts the in-flight fetch
 *   • reset() clears state for the next run
 *   • SSE 'error' frame surfaces a friendly error
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { usePreReviewSemantic } from '../../src/hooks/usePreReviewSemantic'

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
  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    push, close,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

describe('usePreReviewSemantic', () => {
  it('initial state', () => {
    const { result } = renderHook(() => usePreReviewSemantic())
    expect(result.current.running).toBe(false)
    expect(result.current.issues).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('rejects missing assessment without firing fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}))
    const { result } = renderHook(() => usePreReviewSemantic())
    let r: unknown
    await act(async () => { r = await result.current.run(null) })
    expect(r).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.current.error).toBeTruthy()
  })

  it('streams issue events into the issues array; done settles running=false', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => usePreReviewSemantic())

    let runPromise: Promise<unknown> | undefined
    await act(async () => { runPromise = result.current.run({ narrative: 'x' }) })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      push('issue', {
        id: 'sem-1', severity: 'warning', category: 'citation_mismatch',
        title: 'ASHRAE 62.1 misused', detail: '...', anchor: {}, source: 'semantic',
      })
      push('issue', {
        id: 'sem-2', severity: 'blocking', category: 'zone_not_found',
        title: 'Narrative references Zone Z which does not exist', detail: '', anchor: {}, source: 'semantic',
      })
      push('done', { issue_count: 2 })
      close()
      const final = await runPromise!
      expect(Array.isArray(final)).toBe(true)
      expect((final as unknown[]).length).toBe(2)
    })

    expect(result.current.running).toBe(false)
    expect(result.current.issues).toHaveLength(2)
    expect(result.current.issues[0]).toMatchObject({ category: 'citation_mismatch' })
    expect(result.current.issues[1]).toMatchObject({ category: 'zone_not_found' })
    expect(result.current.error).toBeNull()
  })

  it('surfaces non-OK HTTP response as a friendly error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      jsonResponse({ error: 'rate_limit_exceeded' }, 429),
    )
    const { result } = renderHook(() => usePreReviewSemantic())
    let r: unknown
    await act(async () => { r = await result.current.run({ narrative: 'x' }) })
    expect(r).toBeNull()
    expect(result.current.running).toBe(false)
    expect(result.current.error).toMatch(/limit/i)
  })

  it('surfaces SSE error frame as a friendly error', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => usePreReviewSemantic())

    let runPromise: Promise<unknown> | undefined
    await act(async () => { runPromise = result.current.run({ narrative: 'x' }) })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      push('error', { error: 'upstream_5xx_internal' })
      close()
      await runPromise!
    })
    expect(result.current.error).toMatch(/temporarily unavailable/i)
  })

  it('stop() aborts and flips running false', async () => {
    const { response, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => usePreReviewSemantic())

    let runPromise: Promise<unknown> | undefined
    await act(async () => { runPromise = result.current.run({ narrative: 'x' }) })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      result.current.stop()
      // Mocked stream doesn't auto-close on abort — close it so
      // the send-loop unwinds.
      close()
      await runPromise!
    })
    expect(result.current.running).toBe(false)
  })

  it('reset() clears issues + error', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => usePreReviewSemantic())

    let runPromise: Promise<unknown> | undefined
    await act(async () => { runPromise = result.current.run({ narrative: 'x' }) })
    await waitFor(() => expect(result.current.running).toBe(true))
    await act(async () => {
      push('issue', { severity: 'warning', title: 'x', detail: '', anchor: {} })
      push('done', { issue_count: 1 })
      close()
      await runPromise!
    })
    expect(result.current.issues).toHaveLength(1)

    await act(async () => { result.current.reset() })
    expect(result.current.issues).toEqual([])
    expect(result.current.error).toBeNull()
    expect(result.current.running).toBe(false)
  })
})
