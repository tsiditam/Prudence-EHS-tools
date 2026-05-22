/**
 * useInlineAi — POST /api/inline-ai + SSE streaming surface.
 *
 * Pins the hook contract that the inline-AI button + bottom-sheet
 * depend on:
 *   • running starts false, action null, result '', error null
 *   • run() rejects unknown actions + empty text without firing fetch
 *   • run() streams the result into the `result` state token-by-token
 *   • a 'done' SSE frame settles `running` back to false
 *   • an 'error' SSE frame surfaces a friendly message via `error`
 *   • stop() aborts the in-flight fetch and flips running to false
 *   • reset() clears the result so the next action starts clean
 */
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { useInlineAi, VALID_ACTIONS } from '../../src/hooks/useInlineAi'

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

describe('useInlineAi', () => {
  it('VALID_ACTIONS includes the four canonical actions', () => {
    expect(VALID_ACTIONS).toEqual(expect.arrayContaining(['improve', 'expand', 'concise', 'professional']))
  })

  it('starts with running=false, action=null, result empty, error null', () => {
    const { result } = renderHook(() => useInlineAi())
    expect(result.current.running).toBe(false)
    expect(result.current.action).toBeNull()
    expect(result.current.result).toBe('')
    expect(result.current.error).toBeNull()
  })

  it('rejects unknown action without firing fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    const { result } = renderHook(() => useInlineAi())
    let r: string | null = 'placeholder'
    await act(async () => {
      r = await result.current.run({ action: 'bogus' as never, text: 'hi' })
    })
    expect(r).toBeNull()
    expect(result.current.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty text without firing fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 200 }))
    const { result } = renderHook(() => useInlineAi())
    let r: string | null = 'placeholder'
    await act(async () => {
      r = await result.current.run({ action: 'improve', text: '   ' })
    })
    expect(r).toBeNull()
    expect(result.current.error).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('streams tokens into result state and settles on done', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useInlineAi())

    let runPromise: Promise<string | null> | undefined
    await act(async () => {
      runPromise = result.current.run({ action: 'improve', text: 'CO2 high' })
    })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      push('token', { text: 'Carbon ' })
      push('token', { text: 'dioxide ' })
      push('token', { text: 'elevated.' })
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(result.current.result).toBe('Carbon dioxide elevated.')

    await act(async () => {
      push('done', { input_tokens: 12, output_tokens: 6 })
      close()
      const final = await runPromise!
      expect(final).toBe('Carbon dioxide elevated.')
    })
    expect(result.current.running).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('surfaces an SSE error frame as a friendly error', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useInlineAi())

    let runPromise: Promise<string | null> | undefined
    await act(async () => {
      runPromise = result.current.run({ action: 'expand', text: 'hi' })
    })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      push('error', { error: 'upstream_429_rate' })
      close()
      const r = await runPromise!
      expect(r).toBeNull()
    })
    expect(result.current.running).toBe(false)
    expect(result.current.error).toMatch(/busy|try again/i)
  })

  it('surfaces non-OK HTTP responses as a friendly error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
        status: 429, headers: { 'content-type': 'application/json' },
      }) as Response,
    )
    const { result } = renderHook(() => useInlineAi())
    let r: string | null = 'placeholder'
    await act(async () => {
      r = await result.current.run({ action: 'concise', text: 'hi there' })
    })
    expect(r).toBeNull()
    expect(result.current.running).toBe(false)
    expect(result.current.error).toMatch(/limit/i)
  })

  it('stop() aborts the fetch and flips running to false', async () => {
    const { response, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useInlineAi())

    let runPromise: Promise<string | null> | undefined
    await act(async () => {
      runPromise = result.current.run({ action: 'improve', text: 'hi' })
    })
    await waitFor(() => expect(result.current.running).toBe(true))

    await act(async () => {
      result.current.stop()
      // Mocked stream doesn't auto-close on abort; close it so the
      // send-loop can unwind.
      close()
      await runPromise!
    })
    expect(result.current.running).toBe(false)
  })

  it('reset() clears result + action so the next run starts clean', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useInlineAi())

    let runPromise: Promise<string | null> | undefined
    await act(async () => {
      runPromise = result.current.run({ action: 'improve', text: 'hi' })
    })
    await waitFor(() => expect(result.current.running).toBe(true))
    await act(async () => {
      push('token', { text: 'something' })
      push('done', {})
      close()
      await runPromise!
    })
    expect(result.current.result).toBe('something')

    await act(async () => { result.current.reset() })
    expect(result.current.result).toBe('')
    expect(result.current.action).toBeNull()
    expect(result.current.error).toBeNull()
  })
})
