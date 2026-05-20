/**
 * @vitest-environment jsdom
 *
 * Photo analysis client helper — analyzePhoto + small formatters.
 *
 * Never throws; resolves to null on every failure mode so the
 * caller (PhotoCapture) treats the analysis as opt-in. This file
 * pins each failure mode + the happy-path return shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { analyzePhoto, confidenceLabel, clampCaption } from '../../src/utils/photoAnalysis.js'

const VALID_IMAGE = 'data:image/jpeg;base64,/9j/4AAQ'

vi.mock('../../src/utils/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-jwt' } } }),
    },
  },
  trackEvent: vi.fn(),
}))

beforeEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('analyzePhoto — guard clauses (resolve null without fetching)', () => {
  it('rejects non-data-URL input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    expect(await analyzePhoto('not-a-data-url')).toBeNull()
    expect(await analyzePhoto('')).toBeNull()
    expect(await analyzePhoto(null as unknown as string)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('skips when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('analyzePhoto — failure modes (best-effort, never throws)', () => {
  it('returns null on 429 rate-limit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 429 }))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
  })

  it('returns null on 500 server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
  })

  it('returns null when fetch itself throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
  })

  it('returns null when the response body is malformed JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
  })

  it('returns null when the body lacks an analysis field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ usage: {} }), { status: 200 }))
    expect(await analyzePhoto(VALID_IMAGE)).toBeNull()
  })
})

describe('analyzePhoto — happy path', () => {
  it('returns the analysis object from a 200 response', async () => {
    const analysis = {
      observed: 'Dark growth on drywall.',
      concerns: ['Visible biological growth'],
      probable_iaq_class: 'Possible IICRC S520 Condition 2',
      recommended_actions: ['Air-O-Cell sample'],
      confidence: 'medium',
      citations: ['IICRC S520-2024'],
      disclaimers: 'Screening-level only.',
      ih_review_required: true,
      model: 'claude-sonnet-4-6',
      generated_at: '2026-05-19T00:00:00Z',
    }
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ analysis, usage: {} }), { status: 200 })
    )
    const out = await analyzePhoto(VALID_IMAGE, { context: 'Zone A — Mold indicators' })
    expect(out).toEqual(analysis)
    // Confirm the request was POST + bearer-authed + carried the
    // image + context.
    expect(fetchSpy).toHaveBeenCalledOnce()
    const call = fetchSpy.mock.calls[0]
    expect(call[0]).toBe('/api/photo-analyze')
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toMatch(/^Bearer /)
    const body = JSON.parse(init.body as string)
    expect(body.image).toBe(VALID_IMAGE)
    expect(body.context).toBe('Zone A — Mold indicators')
  })
})

describe('confidenceLabel', () => {
  it('formats each confidence value', () => {
    expect(confidenceLabel('high')).toBe('high confidence')
    expect(confidenceLabel('medium')).toBe('medium confidence')
    expect(confidenceLabel('low')).toBe('low confidence')
  })

  it('falls back to low confidence for unexpected values', () => {
    expect(confidenceLabel(undefined as unknown as string)).toBe('low confidence')
    expect(confidenceLabel('extreme')).toBe('low confidence')
  })
})

describe('clampCaption', () => {
  it('passes short text through unchanged', () => {
    expect(clampCaption('short')).toBe('short')
  })

  it('truncates with an ellipsis when over the max', () => {
    const long = 'a'.repeat(200)
    const out = clampCaption(long, 50)
    expect(out.length).toBe(50)
    expect(out.endsWith('…')).toBe(true)
  })

  it('returns "" for non-string input', () => {
    expect(clampCaption(null as unknown as string)).toBe('')
    expect(clampCaption(undefined as unknown as string)).toBe('')
  })
})
