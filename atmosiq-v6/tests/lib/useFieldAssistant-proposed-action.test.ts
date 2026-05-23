/**
 * useFieldAssistant — proposed_action SSE → proposedActions state.
 *
 * Pins the agentic-action wire-up:
 *   • proposedActions starts empty
 *   • A 'proposed_action' SSE frame appends an entry with
 *     status='pending', the action payload, and a stable id
 *   • markActionAccepted / markActionRejected flip status
 *   • reset() clears proposedActions
 *   • Frames without a valid action are ignored (no crash)
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

import { useFieldAssistant } from '../../src/hooks/useFieldAssistant'

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

describe('useFieldAssistant — proposed_action', () => {
  it('proposedActions starts empty', () => {
    const { result } = renderHook(() => useFieldAssistant())
    expect(result.current.proposedActions).toEqual([])
  })

  it('appends an entry with status="pending" on proposed_action frame', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('open reports')) })
    await waitFor(() => expect(result.current.sending).toBe(true))

    await act(async () => {
      push('meta', { conversation_id: 'c1', message_id: 'm1' })
      push('proposed_action', {
        id: 'action-1',
        action: { type: 'navigate', target: 'history' },
        summary: 'Open Reports',
      })
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })

    expect(result.current.proposedActions).toHaveLength(1)
    expect(result.current.proposedActions[0]).toMatchObject({
      id: 'action-1',
      status: 'pending',
      summary: 'Open Reports',
      action: { type: 'navigate', target: 'history' },
    })
  })

  it('generates an id when the server frame omits one', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))

    await act(async () => {
      push('meta', { conversation_id: 'c2', message_id: 'm2' })
      push('proposed_action', {
        action: { type: 'add_zone_note', note_text: 'Carpet smelled musty' },
        summary: 'Add note',
      })
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })

    expect(result.current.proposedActions).toHaveLength(1)
    expect(typeof result.current.proposedActions[0].id).toBe('string')
    expect(result.current.proposedActions[0].id.length).toBeGreaterThan(0)
  })

  it('ignores frames without a valid action', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))

    await act(async () => {
      push('meta', {})
      push('proposed_action', { summary: 'No action attached' })
      push('proposed_action', { action: 'string-not-object' })
      push('proposed_action', { action: { /* no type */ } })
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })

    expect(result.current.proposedActions).toEqual([])
  })

  it('markActionAccepted / markActionRejected flip status', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('open')) })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await act(async () => {
      push('proposed_action', {
        id: 'a1', action: { type: 'navigate', target: 'history' }, summary: 'Open Reports',
      })
      push('proposed_action', {
        id: 'a2', action: { type: 'navigate', target: 'settings' }, summary: 'Open Settings',
      })
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })

    expect(result.current.proposedActions).toHaveLength(2)
    await act(async () => { result.current.markActionAccepted('a1') })
    expect(result.current.proposedActions[0].status).toBe('accepted')
    expect(result.current.proposedActions[1].status).toBe('pending')

    await act(async () => { result.current.markActionRejected('a2') })
    expect(result.current.proposedActions[1].status).toBe('rejected')
  })

  it('reset() clears proposedActions', async () => {
    const { response, push, close } = makeControllableSseResponse()
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(response as unknown as Response)
    const { result } = renderHook(() => useFieldAssistant())

    let sendPromise: Promise<unknown> | undefined
    await act(async () => { sendPromise = Promise.resolve(result.current.sendMessage('hi')) })
    await waitFor(() => expect(result.current.sending).toBe(true))
    await act(async () => {
      push('proposed_action', { id: 'a1', action: { type: 'navigate', target: 'dash' }, summary: 'Home' })
      push('done', {})
      close()
      await new Promise((r) => setTimeout(r, 0))
      if (sendPromise) await sendPromise
    })
    expect(result.current.proposedActions).toHaveLength(1)
    await act(async () => { result.current.reset() })
    expect(result.current.proposedActions).toEqual([])
  })
})
