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
  it('exposes five tools with the expected names', () => {
    const names = FIELD_ASSISTANT_TOOLS.map((t: { name: string }) => t.name)
    expect(names).toEqual([
      'lookup_exposure_limit',
      'lookup_sampling_method',
      'lookup_health_effects',
      'list_known_analytes',
      'search_standards_corpus',
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
  it('returns status:ok with HCHO data for "formaldehyde"', () => {
    const r = dispatchTool('lookup_exposure_limit', { analyte: 'formaldehyde' })
    expect(r.status).toBe('ok')
    expect(r.analyte).toContain('Formaldehyde')
    expect(r.osha.value).toBe(0.75)
  })

  it('handles abbreviations + CAS numbers + case variations', () => {
    expect(dispatchTool('lookup_exposure_limit', { analyte: 'HCHO' }).status).toBe('ok')
    expect(dispatchTool('lookup_exposure_limit', { analyte: '50-00-0' }).status).toBe('ok')
    expect(dispatchTool('lookup_exposure_limit', { analyte: 'co' }).status).toBe('ok')
    expect(dispatchTool('lookup_exposure_limit', { analyte: 'CO2' }).status).toBe('ok')
  })

  it('returns status:not_found for unknown analyte', () => {
    const r = dispatchTool('lookup_exposure_limit', { analyte: 'unobtainium' })
    expect(r.status).toBe('not_found')
    expect(r.message).toMatch(/not in the curated table|do not invent|consult/i)
  })

  it('returns status:not_found for missing analyte input', () => {
    const r = dispatchTool('lookup_exposure_limit', {})
    expect(r.status).toBe('not_found')
  })
})

describe('dispatchTool — lookup_sampling_method', () => {
  it('returns status:ok with method list for asbestos', () => {
    const r = dispatchTool('lookup_sampling_method', { analyte: 'asbestos' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.methods)).toBe(true)
    expect(r.methods.length).toBeGreaterThan(2)
  })

  it('returns status:not_found for unknown analyte', () => {
    expect(dispatchTool('lookup_sampling_method', { analyte: 'argon' }).status).toBe('not_found')
  })
})

describe('dispatchTool — lookup_health_effects', () => {
  it('returns status:ok with chronic effects for benzene', () => {
    const r = dispatchTool('lookup_health_effects', { analyte: 'benzene' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.chronic)).toBe(true)
    expect(r.chronic.length).toBeGreaterThan(0)
    expect(Array.isArray(r.sources)).toBe(true)
  })

  it('returns status:not_found for unknown analyte', () => {
    expect(dispatchTool('lookup_health_effects', { analyte: 'krypton' }).status).toBe('not_found')
  })
})

describe('dispatchTool — list_known_analytes', () => {
  it('returns the canonical analyte list with aliases', () => {
    const r = dispatchTool('list_known_analytes', {})
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.analytes)).toBe(true)
    expect(r.analytes.length).toBeGreaterThan(10)
    expect(r.analytes[0].key).toBeDefined()
    expect(r.analytes[0].aliases).toBeDefined()
  })
})

describe('dispatchTool — search_standards_corpus', () => {
  it('returns status:ok with passages for a methodology query', () => {
    const r = dispatchTool('search_standards_corpus', { query: 'IICRC mold condition' })
    expect(r.status).toBe('ok')
    expect(Array.isArray(r.results)).toBe(true)
    expect(r.results.length).toBeGreaterThan(0)
    expect(r.results[0].id).toBe('iicrc-s520-conditions')
    expect(r.results[0].citation).toBeDefined()
    expect(r.results[0].text).toBeDefined()
    expect(typeof r.results[0].relevance).toBe('number')
  })

  it('respects the k parameter', () => {
    const r = dispatchTool('search_standards_corpus', { query: 'ventilation', k: 2 })
    expect(r.status).toBe('ok')
    expect(r.results.length).toBeLessThanOrEqual(2)
  })

  it('returns status:no_matches with corpus summary for off-topic query', () => {
    const r = dispatchTool('search_standards_corpus', { query: 'zzzzz qqqqq unicornsparkle' })
    expect(r.status).toBe('no_matches')
    expect(r.corpus_summary).toBeDefined()
    expect(r.corpus_summary.chunkCount).toBeGreaterThan(0)
  })

  it('returns status:error for empty query', () => {
    const r = dispatchTool('search_standards_corpus', { query: '' })
    expect(r.status).toBe('error')
    expect(r.error).toBe('empty_query')
  })

  it('returns status:error for missing query field', () => {
    const r = dispatchTool('search_standards_corpus', {})
    expect(r.status).toBe('error')
  })
})

describe('dispatchTool — error handling', () => {
  it('returns status:error for unknown tool name', () => {
    const r = dispatchTool('lookup_something_nonexistent', {})
    expect(r.status).toBe('error')
    expect(r.error).toBe('unknown_tool')
  })

  it('does not throw on malformed input', () => {
    expect(() => dispatchTool('lookup_exposure_limit', null as never)).not.toThrow()
    expect(() => dispatchTool('lookup_exposure_limit', { analyte: 123 } as never)).not.toThrow()
  })
})
