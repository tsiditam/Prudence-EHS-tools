/**
 * Field Assistant tool definitions + dispatcher.
 *
 * Pins the Anthropic tool-use contract:
 *   • Every tool has a valid input_schema (object type, required props)
 *   • dispatchTool returns { status: 'ok' | 'not_found' | 'error', ... }
 *   • Never throws — failure modes are encoded as status='error'
 *   • Tool output for known analytes matches lookup table values
 */
import { describe, it, expect } from 'vitest'
import { FIELD_ASSISTANT_TOOLS, dispatchTool } from '../../src/constants/field-assistant-tools.js'

describe('FIELD_ASSISTANT_TOOLS schema', () => {
  it('exposes six tools with the expected names', () => {
    const names = FIELD_ASSISTANT_TOOLS.map((t: { name: string }) => t.name)
    expect(names).toEqual([
      'lookup_exposure_limit',
      'lookup_sampling_method',
      'lookup_health_effects',
      'list_known_analytes',
      'search_standards_corpus',
      'analyze_photo',
    ])
  })

  it('every tool has name, description, and input_schema', () => {
    for (const t of FIELD_ASSISTANT_TOOLS) {
      expect(typeof t.name).toBe('string')
      expect(typeof t.description).toBe('string')
      expect(t.description.length).toBeGreaterThan(40) // meaningful descriptions
      expect(t.input_schema).toBeDefined()
      expect(t.input_schema.type).toBe('object')
    }
  })

  it('analyte-taking tools require an "analyte" string field', () => {
    for (const name of ['lookup_exposure_limit', 'lookup_sampling_method', 'lookup_health_effects']) {
      const t = FIELD_ASSISTANT_TOOLS.find((x: { name: string }) => x.name === name)
      expect(t!.input_schema.required).toContain('analyte')
      expect(t!.input_schema.properties.analyte.type).toBe('string')
    }
  })
})

describe('dispatchTool — lookup_exposure_limit', () => {
  it('returns status:ok with HCHO data for "formaldehyde"', async () => {
    const r = await dispatchTool('lookup_exposure_limit', { analyte: 'formaldehyde' })
    expect(r.status).toBe('ok')
    expect(r.analyte).toContain('Formaldehyde')
    expect(r.osha.value).toBe(0.75)
  })

  it('handles abbreviations + CAS numbers + case variations', async () => {
    expect((await dispatchTool('lookup_exposure_limit', { analyte: 'HCHO' })).status).toBe('ok')
    expect((await dispatchTool('lookup_exposure_limit', { analyte: '50-00-0' })).status).toBe('ok')
    expect((await dispatchTool('lookup_exposure_limit', { analyte: 'co' })).status).toBe('ok')
    expect((await dispatchTool('lookup_exposure_limit', { analyte: 'CO2' })).status).toBe('ok')
  })

  it('returns status:not_found for unknown analyte', async () => {
    const r = await dispatchTool('lookup_exposure_limit', { analyte: 'unobtainium' })
    expect(r.status).toBe('not_found')
    expect(r.message).toMatch(/not in the curated table|do not invent|consult/i)
  })

  it('returns status:not_found for missing analyte input', async () => {
    const r = await dispatchTool('lookup_exposure_limit', {})
    expect(r.status).toBe('not_found')
  })
})

describe('dispatchTool — lookup_sampling_method', () => {
  it('returns status:ok with method list for asbestos', async () => {
    const r = await dispatchTool('lookup_sampling_method', { analyte: 'asbestos' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.methods)).toBe(true)
    expect(r.methods.length).toBeGreaterThan(2)
  })

  it('returns status:not_found for unknown analyte', async () => {
    expect((await dispatchTool('lookup_sampling_method', { analyte: 'argon' })).status).toBe('not_found')
  })
})

describe('dispatchTool — lookup_health_effects', () => {
  it('returns status:ok with chronic effects for benzene', async () => {
    const r = await dispatchTool('lookup_health_effects', { analyte: 'benzene' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.chronic)).toBe(true)
    expect(r.chronic.length).toBeGreaterThan(0)
    expect(Array.isArray(r.sources)).toBe(true)
  })

  it('returns status:not_found for unknown analyte', async () => {
    expect((await dispatchTool('lookup_health_effects', { analyte: 'krypton' })).status).toBe('not_found')
  })
})

describe('dispatchTool — list_known_analytes', () => {
  it('returns the canonical analyte list with aliases', async () => {
    const r = await dispatchTool('list_known_analytes', {})
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.analytes)).toBe(true)
    expect(r.analytes.length).toBeGreaterThan(10)
    expect(r.analytes[0].key).toBeDefined()
    expect(r.analytes[0].aliases).toBeDefined()
  })
})

describe('dispatchTool — search_standards_corpus', () => {
  it('returns status:ok with passages for a methodology query', async () => {
    const r = await dispatchTool('search_standards_corpus', { query: 'IICRC mold condition' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.results)).toBe(true)
    expect(r.results.length).toBeGreaterThan(0)
    expect(r.results[0].id).toBe('iicrc-s520-conditions')
    expect(r.results[0].citation).toBeDefined()
    expect(r.results[0].text).toBeDefined()
    expect(typeof r.results[0].relevance).toBe('number')
  })

  it('respects the k parameter', async () => {
    const r = await dispatchTool('search_standards_corpus', { query: 'ventilation', k: 2 })
    expect(r.status).toBe('ok')
    expect(r.results.length).toBeLessThanOrEqual(2)
  })

  it('returns status:no_matches with corpus summary for off-topic query', async () => {
    const r = await dispatchTool('search_standards_corpus', { query: 'zzzzz qqqqq unicornsparkle' })
    expect(r.status).toBe('no_matches')
    expect(r.corpus_summary).toBeDefined()
    expect(r.corpus_summary.chunkCount).toBeGreaterThan(0)
  })

  it('returns status:error for empty query', async () => {
    const r = await dispatchTool('search_standards_corpus', { query: '' })
    expect(r.status).toBe('error')
    expect(r.error).toBe('empty_query')
  })

  it('returns status:error for missing query field', async () => {
    const r = await dispatchTool('search_standards_corpus', {})
    expect(r.status).toBe('error')
  })
})

describe('dispatchTool — analyze_photo', () => {
  // Helper: build a minimal valid PNG data URL (a 1x1 transparent PNG)
  // and a minimal ctx with a photo map.
  const TINY_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  function mockVisionResponse() {
    return new Response(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              observed: 'Dark staining on what appears to be drywall near a window.',
              concerns: ['Possible water intrusion at window frame', 'Discoloration suggests substrate moisture exposure'],
              probable_iaq_class: 'Possible IICRC S520 Condition 2 (settled spores or indirectly-contaminated materials)',
              recommended_actions: ['Document moisture content with pin meter', 'Inspect exterior flashing'],
              confidence: 'medium',
              citations: ['IICRC S520-2024'],
              disclaimers: 'Screening only — IH review required before client distribution.',
            }),
          },
        ],
        usage: { input_tokens: 250, output_tokens: 80 },
      }),
      { status: 200 },
    )
  }

  function makeCtx(photoEntries: Array<{ id: string; dataUrl: string; label?: string | null }>, fetchFn?: typeof fetch) {
    const photos = new Map<string, { id: string; dataUrl: string; label?: string | null }>()
    for (const p of photoEntries) photos.set(p.id, p)
    return {
      photos,
      anthropicApiKey: 'test-key',
      fetchFn: (fetchFn || (() => Promise.resolve(mockVisionResponse()))) as unknown as typeof fetch,
      recordVisionUsage: () => {},
    }
  }

  it('returns status:ok with parsed analysis on a valid photo', async () => {
    const ctx = makeCtx([{ id: 'p1', dataUrl: TINY_PNG, label: 'Window frame, Zone 3' }])
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1', focus: 'moisture' }, ctx)
    expect(r.status).toBe('ok')
    expect(r.photo_id).toBe('p1')
    expect(r.photo_label).toBe('Window frame, Zone 3')
    expect(r.focus).toBe('moisture')
    expect(r.analysis.observed).toContain('staining')
    expect(r.analysis.ih_review_required).toBe(true)
    expect(r.analysis.confidence).toBe('medium')
    expect(r.analysis.concerns.length).toBeGreaterThan(0)
  })

  it('defaults focus to "general" when omitted', async () => {
    const ctx = makeCtx([{ id: 'p1', dataUrl: TINY_PNG }])
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, ctx)
    expect(r.status).toBe('ok')
    expect(r.focus).toBe('general')
  })

  it('returns status:no_photos_attached when ctx has no photo map', async () => {
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, {})
    expect(r.status).toBe('no_photos_attached')
  })

  it('returns status:not_found with known IDs listed when photo_id is unknown', async () => {
    const ctx = makeCtx([
      { id: 'p1', dataUrl: TINY_PNG },
      { id: 'p2', dataUrl: TINY_PNG },
    ])
    const r = await dispatchTool('analyze_photo', { photo_id: 'p99' }, ctx)
    expect(r.status).toBe('not_found')
    expect(r.known_photo_ids).toContain('p1')
    expect(r.known_photo_ids).toContain('p2')
  })

  it('returns status:error for missing photo_id', async () => {
    const ctx = makeCtx([{ id: 'p1', dataUrl: TINY_PNG }])
    const r = await dispatchTool('analyze_photo', {}, ctx)
    expect(r.status).toBe('error')
    expect(r.error).toBe('missing_photo_id')
  })

  it('returns status:error when photo data URL is malformed', async () => {
    const ctx = makeCtx([{ id: 'p1', dataUrl: 'not-a-data-url' }])
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, ctx)
    expect(r.status).toBe('error')
    expect(r.error).toBe('invalid_photo')
  })

  it('returns status:error when vision is not available (no fetch fn in ctx)', async () => {
    const photos = new Map<string, { id: string; dataUrl: string }>()
    photos.set('p1', { id: 'p1', dataUrl: TINY_PNG })
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, { photos })
    expect(r.status).toBe('error')
    expect(r.error).toBe('vision_unavailable')
  })

  it('returns status:error when upstream returns non-2xx', async () => {
    const failingFetch = () => Promise.resolve(new Response('rate limited', { status: 429 }))
    const ctx = makeCtx([{ id: 'p1', dataUrl: TINY_PNG }], failingFetch as unknown as typeof fetch)
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, ctx)
    expect(r.status).toBe('error')
    expect(r.error).toBe('vision_upstream_error')
    expect(r.upstream_status).toBe(429)
  })

  it('returns status:error when vision response is unparseable', async () => {
    const garbageFetch = () =>
      Promise.resolve(new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json' }] }), { status: 200 }))
    const ctx = makeCtx([{ id: 'p1', dataUrl: TINY_PNG }], garbageFetch as unknown as typeof fetch)
    const r = await dispatchTool('analyze_photo', { photo_id: 'p1' }, ctx)
    expect(r.status).toBe('error')
    expect(r.error).toBe('vision_unparseable')
  })

  it('calls recordVisionUsage with telemetry on success', async () => {
    const usages: unknown[] = []
    const ctx = {
      photos: new Map([['p1', { id: 'p1', dataUrl: TINY_PNG, label: null }]]),
      anthropicApiKey: 'test-key',
      fetchFn: (() => Promise.resolve(mockVisionResponse())) as unknown as typeof fetch,
      recordVisionUsage: (u: unknown) => usages.push(u),
    }
    await dispatchTool('analyze_photo', { photo_id: 'p1', focus: 'mold' }, ctx)
    expect(usages.length).toBe(1)
    const usage = usages[0] as { photo_id: string; focus: string; input_tokens: number; output_tokens: number; confidence: string }
    expect(usage.photo_id).toBe('p1')
    expect(usage.focus).toBe('mold')
    expect(usage.input_tokens).toBe(250)
    expect(usage.output_tokens).toBe(80)
    expect(usage.confidence).toBe('medium')
  })
})

describe('dispatchTool — error handling', () => {
  it('returns status:error for unknown tool name', async () => {
    const r = await dispatchTool('lookup_something_nonexistent', {})
    expect(r.status).toBe('error')
    expect(r.error).toBe('unknown_tool')
  })

  it('does not throw on malformed input', async () => {
    // dispatchTool returns a Promise; rejection (not throwing) would be the failure mode.
    await expect(dispatchTool('lookup_exposure_limit', null as never)).resolves.toBeDefined()
    await expect(dispatchTool('lookup_exposure_limit', { analyte: 123 } as never)).resolves.toBeDefined()
  })
})
