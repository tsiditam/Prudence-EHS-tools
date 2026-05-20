/**
 * useFieldAssistant — photo attach/remove + request-body wiring.
 *
 * Pins L4 frontend contract:
 *   • attachPhoto validates MIME + size before staging
 *   • removePhoto clears one entry; clearPhotos clears all
 *   • sendMessage includes photos[] in the request body when staged
 *   • Successful send clears the staged photos
 *   • The user message bubble carries a `photos` array of {id, label}
 *
 * Uses jsdom env so FileReader / fetch / crypto.randomUUID exist.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Stub supabase auth before importing the hook — it pulls session token
// for the bearer header. The hook gracefully handles a null session
// but throws a UI-visible "Not signed in" without one. Tests use a
// valid stubbed session so the actual fetch path runs.
vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { useFieldAssistant, MAX_PHOTOS_PER_REQUEST, MAX_PHOTO_BYTES } from '../../src/hooks/useFieldAssistant'

// Helper: build a fake File for MIME + size testing. JSDOM's FileReader
// hits the real implementation, so we use a small UTF-8 string for
// the body and rely on .readAsDataURL.
function makeFile(name: string, type: string, size = 100): File {
  const content = 'x'.repeat(size)
  return new File([content], name, { type })
}

describe('useFieldAssistant — photo attach', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('attachedPhotos starts empty', () => {
    const { result } = renderHook(() => useFieldAssistant())
    expect(result.current.attachedPhotos).toEqual([])
  })

  it('attachPhoto stages a valid JPEG and assigns an id + label', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    let attachResult: { ok: boolean; id?: string } | undefined
    await act(async () => {
      attachResult = await result.current.attachPhoto(makeFile('zone3.jpg', 'image/jpeg', 1000), 'Zone 3 supply')
    })
    expect(attachResult?.ok).toBe(true)
    expect(attachResult?.id).toMatch(/^photo-/)
    expect(result.current.attachedPhotos).toHaveLength(1)
    expect(result.current.attachedPhotos[0].label).toBe('Zone 3 supply')
    expect(result.current.attachedPhotos[0].dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('falls back to file.name when label is omitted', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachPhoto(makeFile('mold.png', 'image/png'))
    })
    expect(result.current.attachedPhotos[0].label).toBe('mold.png')
  })

  it('rejects unsupported MIME types', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    let r: { ok: boolean; error?: string } | undefined
    await act(async () => {
      r = await result.current.attachPhoto(makeFile('bad.gif', 'image/gif'))
    })
    expect(r?.ok).toBe(false)
    expect(result.current.attachedPhotos).toHaveLength(0)
    expect(result.current.error).toMatch(/JPEG|PNG|WebP/i)
  })

  it('rejects files larger than MAX_PHOTO_BYTES', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    let r: { ok: boolean } | undefined
    await act(async () => {
      r = await result.current.attachPhoto(makeFile('big.jpg', 'image/jpeg', MAX_PHOTO_BYTES + 1))
    })
    expect(r?.ok).toBe(false)
    expect(result.current.attachedPhotos).toHaveLength(0)
    expect(result.current.error).toMatch(/MB limit/i)
  })

  it('rejects more than MAX_PHOTOS_PER_REQUEST staged photos', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    for (let i = 0; i < MAX_PHOTOS_PER_REQUEST; i++) {
      await act(async () => {
        await result.current.attachPhoto(makeFile(`p${i}.jpg`, 'image/jpeg'))
      })
    }
    expect(result.current.attachedPhotos).toHaveLength(MAX_PHOTOS_PER_REQUEST)
    let r: { ok: boolean } | undefined
    await act(async () => {
      r = await result.current.attachPhoto(makeFile('overflow.jpg', 'image/jpeg'))
    })
    expect(r?.ok).toBe(false)
    expect(result.current.attachedPhotos).toHaveLength(MAX_PHOTOS_PER_REQUEST)
  })

  it('removePhoto removes one entry by id', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    let r1: { id?: string } = {}
    await act(async () => {
      r1 = (await result.current.attachPhoto(makeFile('a.jpg', 'image/jpeg'))) as never
      await result.current.attachPhoto(makeFile('b.jpg', 'image/jpeg'))
    })
    expect(result.current.attachedPhotos).toHaveLength(2)
    act(() => {
      result.current.removePhoto(r1.id!)
    })
    expect(result.current.attachedPhotos).toHaveLength(1)
    expect(result.current.attachedPhotos[0].label).toBe('b.jpg')
  })

  it('clearPhotos empties the staged list', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachPhoto(makeFile('a.jpg', 'image/jpeg'))
      await result.current.attachPhoto(makeFile('b.jpg', 'image/jpeg'))
    })
    expect(result.current.attachedPhotos).toHaveLength(2)
    act(() => {
      result.current.clearPhotos()
    })
    expect(result.current.attachedPhotos).toEqual([])
  })

  it('reset clears attachedPhotos along with messages + conversation', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachPhoto(makeFile('a.jpg', 'image/jpeg'))
    })
    expect(result.current.attachedPhotos).toHaveLength(1)
    act(() => {
      result.current.reset()
    })
    expect(result.current.attachedPhotos).toEqual([])
  })
})

describe('useFieldAssistant — sendMessage with photos', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('includes photos in the request body and clears them on successful send', async () => {
    // Mock the SSE response. Provides one token + done event so the
    // hook completes cleanly and clears staged photos.
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: meta\ndata: ${JSON.stringify({ conversation_id: 'c1', message_id: 'm1' })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: 'Hi' })}\n\n`))
        controller.enqueue(
          encoder.encode(`event: done\ndata: ${JSON.stringify({ usage: {}, quota: null })}\n\n`),
        )
        controller.close()
      },
    })
    const fetchSpy = vi.fn(async () => new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useFieldAssistant())

    await act(async () => {
      await result.current.attachPhoto(makeFile('zone3.jpg', 'image/jpeg'), 'Zone 3')
    })
    expect(result.current.attachedPhotos).toHaveLength(1)

    await act(async () => {
      await result.current.sendMessage('what do you see?', { view: 'zone' })
    })

    await waitFor(() => {
      expect(result.current.sending).toBe(false)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const call = fetchSpy.mock.calls[0] as unknown as [unknown, RequestInit]
    const body = JSON.parse((call[1].body as string) || '{}')
    expect(body.message).toBe('what do you see?')
    expect(Array.isArray(body.photos)).toBe(true)
    expect(body.photos).toHaveLength(1)
    expect(body.photos[0].id).toMatch(/^photo-/)
    expect(body.photos[0].label).toBe('Zone 3')
    expect(body.photos[0].dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)

    // Staged photos cleared after successful send
    expect(result.current.attachedPhotos).toEqual([])

    // User-message bubble has photos annotation for the UI badge
    const userMsg = result.current.messages.find((m) => m.role === 'user')
    expect(userMsg?.photos).toHaveLength(1)
    expect(userMsg?.photos?.[0].label).toBe('Zone 3')
  })

  it('omits photos field when no photos are staged', async () => {
    const encoder = new TextEncoder()
    const sseBody = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: meta\ndata: ${JSON.stringify({ conversation_id: 'c1', message_id: 'm1' })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ text: 'Hi' })}\n\n`))
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ usage: {} })}\n\n`))
        controller.close()
      },
    })
    const fetchSpy = vi.fn(async () => new Response(sseBody, { status: 200 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.sendMessage('hello', {})
    })
    await waitFor(() => expect(result.current.sending).toBe(false))

    const call = fetchSpy.mock.calls[0] as unknown as [unknown, RequestInit]
    const body = JSON.parse((call[1].body as string) || '{}')
    expect('photos' in body).toBe(false)
  })
})
