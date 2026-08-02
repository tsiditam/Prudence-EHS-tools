/**
 * useFieldAssistant — data-file attachments.
 *
 * The contract worth pinning is what crosses the network. The file is
 * parsed in the browser and only a bounded digest is sent, so this test
 * inspects the actual request body: raw rows appearing there would mean
 * the parse-on-client design had quietly regressed into an upload.
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'test-token' } } })),
    },
  },
}))

import { useFieldAssistant } from '../../src/hooks/useFieldAssistant'
import { MAX_ATTACHMENTS_PER_REQUEST } from '../../src/utils/chatAttachments'

const T0 = Date.UTC(2026, 6, 13, 12, 0)
// A per-row value in a column the parser does not recognise. Nothing in a
// digest summarises an unrecognised column's CONTENTS — only its name — so
// this string appearing on the wire could only mean raw rows were sent.
// (A sentinel in a measured column would be a poor probe: the max of a
// series is a statistic a digest is supposed to report.)
const ROW_SENTINEL = 'ZZ-ROW-MARKER'

function loggerCsv(rows = 40) {
  const lines = ['Timestamp,CO2 (ppm),Temperature (F),RH (%),Operator Remark']
  for (let i = 0; i < rows; i++) {
    const t = new Date(T0 + i * 300_000).toISOString().slice(0, 19).replace('T', ' ')
    lines.push(`${t},${640 + (i % 30) * 7},${71 + (i % 4) * 0.5},${47 + (i % 6)},${ROW_SENTINEL}-${i}`)
  }
  return lines.join('\n')
}

/** jsdom File lacks a working .text(); back it with a real string. */
function csvFile(name: string, body: string): File {
  const f = new File([body], name, { type: 'text/csv' })
  Object.defineProperty(f, 'text', { value: async () => body, configurable: true })
  return f
}

/** SSE stream the hook can consume, so sendMessage completes cleanly. */
function sseResponse() {
  const body = [
    'event: meta\ndata: {"conversation_id":"c1","message_id":"m1","assistant_message_id":"a1"}\n\n',
    'event: delta\ndata: {"text":"ok"}\n\n',
    'event: done\ndata: {}\n\n',
  ].join('')
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        let sent = false
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: new TextEncoder().encode(body) }
          },
          releaseLock() {},
        }
      },
    },
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('useFieldAssistant — attaching a data file', () => {
  it('stages a parsed digest, not the file', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachFile(csvFile('qtrak.csv', loggerCsv(40)))
    })
    expect(result.current.attachments).toHaveLength(1)
    const a = result.current.attachments[0]
    expect(a.kind).toBe('sensor')
    expect(a.name).toBe('qtrak.csv')
    expect(a.summary).toContain('40 readings')
    // The staged entry holds a digest — there is no file handle or raw text.
    expect(a.digest.parameters.map((p: any) => p.param).sort()).toEqual(['co2', 'rh', 'temp'])
  })

  it('surfaces a readable reason when the file cannot be parsed', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachFile(csvFile('junk.csv', 'a,b\n1,2'))
    })
    expect(result.current.attachments).toHaveLength(0)
    expect(result.current.error).toMatch(/could not recognise/i)
  })

  it('caps the number of files per message', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    for (let i = 0; i < MAX_ATTACHMENTS_PER_REQUEST; i++) {
      await act(async () => {
        await result.current.attachFile(csvFile(`f${i}.csv`, loggerCsv(10)))
      })
    }
    expect(result.current.attachments).toHaveLength(MAX_ATTACHMENTS_PER_REQUEST)
    let r: any
    await act(async () => {
      r = await result.current.attachFile(csvFile('overflow.csv', loggerCsv(10)))
    })
    expect(r.ok).toBe(false)
    expect(result.current.attachments).toHaveLength(MAX_ATTACHMENTS_PER_REQUEST)
  })

  it('removes one attachment without disturbing the others', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachFile(csvFile('a.csv', loggerCsv(10)))
      await result.current.attachFile(csvFile('b.csv', loggerCsv(10)))
    })
    const firstId = result.current.attachments[0].id
    act(() => result.current.removeAttachment(firstId))
    expect(result.current.attachments).toHaveLength(1)
    expect(result.current.attachments[0].name).toBe('b.csv')
  })

  it('routes a CSV to attachFile and an image to attachPhoto through attachAny', async () => {
    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachAny(csvFile('log.csv', loggerCsv(10)))
      await result.current.attachAny(new File(['x'], 'grille.jpg', { type: 'image/jpeg' }))
    })
    expect(result.current.attachments).toHaveLength(1)
    expect(result.current.attachedPhotos).toHaveLength(1)
  })
})

describe('useFieldAssistant — what the attachment sends', () => {
  it('sends the digest and NOT the file contents, then clears the chips', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: any) => sseResponse() as any)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachFile(csvFile('qtrak.csv', loggerCsv(40)))
    })
    await act(async () => {
      await result.current.sendMessage('What does this show?', {})
    })
    await waitFor(() => expect(result.current.sending).toBe(false))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.attachments).toHaveLength(1)
    expect(body.attachments[0].name).toBe('qtrak.csv')
    expect(body.attachments[0].kind).toBe('sensor')
    expect(body.attachments[0].text).toContain('Readings: 40')

    // The whole point of the design: no raw row ever leaves the browser.
    const wire = JSON.stringify(body)
    expect(wire).not.toContain(ROW_SENTINEL)
    expect(wire).not.toContain('Timestamp,CO2')
    // The unrecognised column is named — that is worth knowing — but its
    // values are not carried.
    expect(body.attachments[0].text).toContain('Operator Remark')

    // Chips clear so the next turn does not silently re-send them.
    await waitFor(() => expect(result.current.attachments).toHaveLength(0))
  })

  it('omits the attachments field entirely when nothing is attached', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: any) => sseResponse() as any)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.sendMessage('plain question', {})
    })
    await waitFor(() => expect(result.current.sending).toBe(false))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.attachments).toBeUndefined()
  })

  it('records the file on the user bubble so the turn stays readable', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: any) => sseResponse() as any)
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useFieldAssistant())
    await act(async () => {
      await result.current.attachFile(csvFile('lab.csv', loggerCsv(12)))
    })
    await act(async () => {
      await result.current.sendMessage('anything odd?', {})
    })
    await waitFor(() => expect(result.current.sending).toBe(false))

    const userMsg = result.current.messages.find((m: any) => m.role === 'user')
    expect(userMsg.files).toEqual([expect.objectContaining({ name: 'lab.csv', kind: 'sensor' })])
  })
})
