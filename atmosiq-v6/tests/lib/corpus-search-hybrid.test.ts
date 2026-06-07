/**
 * Hybrid retrieval tests (P2 item 7) — synonym/acronym expansion + BM25
 * blended with TF-IDF cosine. Deterministic, offline, no external API.
 *
 * These pin the RECALL IMPROVEMENT: acronym- and synonym-phrased queries
 * now retrieve the chunk that spells the concept out — including the
 * documented "extended outdoor air" → "ventilation rate procedure" gap
 * that pure lexical TF-IDF missed.
 */

import { describe, it, expect } from 'vitest'
import { searchCorpus, __test } from '../../src/utils/corpus-search.js'

const { expandQuery, bm25Score, _INDEX } = __test as unknown as {
  expandQuery: (q: string) => string
  bm25Score: (tokens: string[], i: number) => number
  _INDEX: { docTermFreqs: Map<string, number>[]; avgDocLen: number; idfBm25: Map<string, number> }
}

describe('expandQuery — curated synonym/acronym expansion', () => {
  it('expands acronyms additively (original preserved)', () => {
    const e = expandQuery('DCV setup')
    expect(e).toContain('DCV setup') // original kept
    expect(e.toLowerCase()).toContain('demand')
    expect(e.toLowerCase()).toContain('controlled')
    expect(e.toLowerCase()).toContain('ventilation')
  })

  it('expands the documented multi-word gap', () => {
    const e = expandQuery('extended outdoor air').toLowerCase()
    expect(e).toContain('ventilation')
    expect(e).toContain('rate')
    expect(e).toContain('procedure')
  })

  it('leaves a query with no known synonyms unchanged', () => {
    expect(expandQuery('asbestos fiber count')).toBe('asbestos fiber count')
  })

  it('handles empty / non-string input', () => {
    expect(expandQuery('')).toBe('')
    expect(expandQuery(null as never)).toBe('')
  })
})

describe('hybrid retrieval — acronym / synonym recall', () => {
  const cases: Array<{ query: string; expectedTopId: string }> = [
    { query: 'DCV', expectedTopId: 'ashrae-621-co2-dcv' },
    { query: 'CoC', expectedTopId: 'chain-of-custody' },
    { query: 'SBS', expectedTopId: 'sbs-bri' },
    { query: 'RH limits', expectedTopId: 'ashrae-55-comfort' },
    { query: 'TEM and PCM', expectedTopId: 'asbestos-pcm-tem' },
    { query: 'ECAi', expectedTopId: 'ashrae-241-2023' },
    { query: 'RRP wipe sample', expectedTopId: 'lead-rrp' },
    // The documented lexical-gap example — must now resolve to the
    // ventilation-rate-procedure chunk.
    { query: 'extended outdoor air', expectedTopId: 'ashrae-621-vrp' },
    { query: 'fresh air delivery', expectedTopId: 'ashrae-621-vrp' },
  ]
  for (const c of cases) {
    it(`"${c.query}" → ${c.expectedTopId}`, () => {
      const r = searchCorpus(c.query, { k: 3 })
      expect(r.length).toBeGreaterThan(0)
      expect(r[0].chunk.id).toBe(c.expectedTopId)
    })
  }
})

describe('hybrid scoring — bounds + BM25 sanity', () => {
  it('blended scores stay on the 0..1 cosine scale', () => {
    const r = searchCorpus('ventilation osha sampling mold', { k: 10 })
    for (const x of r) {
      expect(x.score).toBeGreaterThan(0)
      expect(x.score).toBeLessThanOrEqual(1)
    }
  })

  it('bm25Score is positive for a matching term and zero for a miss', () => {
    // Find a doc whose term-freq map contains "ventilation".
    const idx = _INDEX.docTermFreqs.findIndex((tf) => tf.has('ventilation'))
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(bm25Score(['ventilation'], idx)).toBeGreaterThan(0)
    expect(bm25Score(['zzzzznotaword'], idx)).toBe(0)
  })
})
