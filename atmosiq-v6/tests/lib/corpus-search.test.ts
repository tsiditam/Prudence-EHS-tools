/**
 * TF-IDF corpus search — pins retrieval quality and contract.
 *
 * Contract:
 *   • tokenize() lowercases, drops stopwords, preserves digit+punct ids
 *   • searchCorpus() returns up to k results ranked by descending score
 *   • Empty / whitespace queries return []
 *   • Threshold filters low-similarity matches
 *   • Top match for canonical queries is the expected chunk
 *
 * Retrieval-quality tests are the load-bearing ones — they catch
 * tokenization regressions, weighting bugs, and index-build errors.
 */
import { describe, it, expect } from 'vitest'
import { searchCorpus, tokenize, __test } from '../../src/utils/corpus-search.js'
import { STANDARDS_CORPUS, summarizeCorpus } from '../../src/constants/standards-corpus.js'

describe('tokenize', () => {
  it('lowercases and splits on whitespace + punctuation', () => {
    expect(tokenize('Hello World!')).toEqual(['hello', 'world'])
  })

  it('drops stopwords', () => {
    expect(tokenize('the cat is on the mat')).toEqual(['cat', 'mat'])
  })

  it('preserves digit+punct identifiers like 1910.1000 and pm2.5', () => {
    const toks = tokenize('OSHA 29 CFR 1910.1000 PM2.5')
    expect(toks).toContain('1910.1000')
    expect(toks).toContain('pm2.5')
    expect(toks).toContain('osha')
    expect(toks).toContain('cfr')
  })

  it('normalizes unicode subscripts (CO₂ → co2)', () => {
    const toks = tokenize('CO₂ at 1500 ppm')
    expect(toks).toContain('co2')
    expect(toks).toContain('1500')
    expect(toks).toContain('ppm')
  })

  it('normalizes µ to u (µg/m³ → ug/m3)', () => {
    const toks = tokenize('9 µg/m³ annual NAAQS')
    expect(toks.some((t) => t.startsWith('ug'))).toBe(true)
  })

  it('drops single-character non-numeric tokens', () => {
    expect(tokenize('a b 1 2')).toEqual(['1', '2'])
  })

  it('handles empty/null/non-string input gracefully', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize(null as never)).toEqual([])
    expect(tokenize(undefined as never)).toEqual([])
    expect(tokenize(123 as never)).toEqual([])
  })
})

describe('index build', () => {
  it('builds vectors for every corpus chunk', () => {
    expect(__test._INDEX.docVectors).toHaveLength(STANDARDS_CORPUS.length)
  })

  it('produces non-empty IDF table', () => {
    expect(__test._INDEX.idf.size).toBeGreaterThan(100)
  })

  it('each doc vector is L2-normalized', () => {
    for (const vec of __test._INDEX.docVectors) {
      let normSq = 0
      for (const w of vec.values()) normSq += w * w
      expect(Math.sqrt(normSq)).toBeCloseTo(1, 5)
    }
  })
})

describe('searchCorpus', () => {
  it('returns empty array for empty query', () => {
    expect(searchCorpus('')).toEqual([])
    expect(searchCorpus('   ')).toEqual([])
  })

  it('returns empty array when query has only stopwords', () => {
    expect(searchCorpus('the of and is')).toEqual([])
  })

  it('returns empty array when no corpus term matches', () => {
    expect(searchCorpus('zzzzz qqqqq xxxxx unicorn')).toEqual([])
  })

  it('respects the k limit', () => {
    const r = searchCorpus('osha', { k: 2 })
    expect(r.length).toBeLessThanOrEqual(2)
  })

  it('caps k at 10', () => {
    const r = searchCorpus('the and ventilation osha sampling', { k: 100 })
    expect(r.length).toBeLessThanOrEqual(10)
  })

  it('ranks results by descending score', () => {
    const r = searchCorpus('mold IICRC condition', { k: 5 })
    for (let i = 1; i < r.length; i++) {
      expect(r[i].score).toBeLessThanOrEqual(r[i - 1].score)
    }
  })

  it('returns chunk metadata (id, title, citation, text)', () => {
    const r = searchCorpus('ASHRAE 241', { k: 1 })
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].chunk.id).toBeDefined()
    expect(r[0].chunk.title).toBeDefined()
    expect(r[0].chunk.citation).toBeDefined()
    expect(r[0].chunk.text.length).toBeGreaterThan(50)
  })

  it('filters by threshold', () => {
    const r = searchCorpus('ventilation', { k: 10, threshold: 0.99 })
    // 0.99 threshold is unreachable for any single-word query
    expect(r).toEqual([])
  })
})

describe('retrieval quality — canonical IAQ queries', () => {
  const cases: Array<{ query: string; expectedTopId: string; label: string }> = [
    { query: 'IICRC mold condition 3', expectedTopId: 'iicrc-s520-conditions', label: 'mold conditions' },
    { query: 'Mølhave TVOC framework', expectedTopId: 'molhave-tvoc-framework', label: 'Mølhave TVOC' },
    { query: 'ASHRAE 241 ECAi infection control', expectedTopId: 'ashrae-241-2023', label: 'ASHRAE 241' },
    { query: 'radon EPA action level pCi/L', expectedTopId: 'radon-screening', label: 'radon' },
    { query: 'chain of custody laboratory samples', expectedTopId: 'chain-of-custody', label: 'CoC' },
    { query: 'demand controlled ventilation CO2', expectedTopId: 'ashrae-621-co2-dcv', label: 'DCV' },
    { query: 'PM2.5 NAAQS 2024 revision', expectedTopId: 'epa-pm25-2024-revision', label: 'PM2.5 NAAQS' },
    { query: 'sick building syndrome', expectedTopId: 'sbs-bri', label: 'SBS/BRI' },
    { query: 'asbestos PCM TEM NIOSH 7400', expectedTopId: 'asbestos-pcm-tem', label: 'asbestos methods' },
    { query: 'IARC group 1 carcinogen classification', expectedTopId: 'iarc-carcinogen-groups', label: 'IARC groups' },
    { query: 'instrument calibration documentation', expectedTopId: 'instrument-calibration', label: 'calibration' },
    { query: 'screening vs compliance sampling', expectedTopId: 'screening-vs-compliance', label: 'screening vs compliance' },
    { query: 'lead RRP HUD wipe sample action level', expectedTopId: 'lead-rrp', label: 'lead RRP' },
    { query: 'mercury vapor spill cleanup', expectedTopId: 'mercury-vapor-response', label: 'mercury spill' },
  ]
  for (const c of cases) {
    it(`top match for "${c.label}" is ${c.expectedTopId}`, () => {
      const r = searchCorpus(c.query, { k: 3 })
      expect(r.length).toBeGreaterThan(0)
      expect(r[0].chunk.id).toBe(c.expectedTopId)
    })
  }
})

describe('summarizeCorpus', () => {
  it('returns chunk count and document list', () => {
    const s = summarizeCorpus()
    expect(s.chunkCount).toBe(STANDARDS_CORPUS.length)
    expect(Array.isArray(s.documents)).toBe(true)
    expect(s.documents.length).toBeGreaterThan(5)
    expect(s.documents).toContain('OSHA-CFR-1910')
    expect(s.documents).toContain('ASHRAE-62.1')
  })
})

describe('citation integrity — every chunk has required fields', () => {
  it('every chunk has id, title, citation, text, document, year, tags', () => {
    for (const chunk of STANDARDS_CORPUS) {
      expect(chunk.id, `chunk missing id`).toBeTruthy()
      expect(chunk.title, `${chunk.id} missing title`).toBeTruthy()
      expect(chunk.citation, `${chunk.id} missing citation`).toBeTruthy()
      expect(chunk.document, `${chunk.id} missing document`).toBeTruthy()
      expect(typeof chunk.year, `${chunk.id} year must be number`).toBe('number')
      expect(Array.isArray(chunk.tags), `${chunk.id} tags must be array`).toBe(true)
      expect(chunk.tags.length, `${chunk.id} has empty tags`).toBeGreaterThan(0)
      expect(chunk.text.length, `${chunk.id} text too short`).toBeGreaterThan(80)
      expect(chunk.text.length, `${chunk.id} text too long`).toBeLessThan(3000)
    }
  })

  it('every chunk id is unique', () => {
    const ids = STANDARDS_CORPUS.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})
