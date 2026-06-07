/**
 * Prudence EHS — hybrid corpus search (TF-IDF cosine + BM25 + synonyms)
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Pure-JS hybrid retrieval over the curated STANDARDS_CORPUS — the L3.5
 * retrieval primitive for the Field Assistant agent (Jasper). Claude
 * calls a `search_standards_corpus` tool, the tool dispatches here, this
 * returns the top-k matching chunks with their citations.
 *
 * Scoring is a blend: TF-IDF cosine (0..1) + a saturated BM25 lexical
 * signal (0..1), over a query expanded with curated IAQ synonyms and
 * acronyms (see SYNONYMS / PHRASE_SYNONYMS).
 *
 * Why this (not an embedding model):
 *   • Zero external dependencies — runs in the Vercel serverless
 *     function, no embedding API key, no vector DB, no per-query network
 *     call. Keeps the Jasper hot path lean.
 *   • Deterministic — same query always returns the same ranking, useful
 *     for testing and audit (and so the offline eval gate stays valid).
 *   • Fast — a few-thousand-term dot product + BM25 per query,
 *     sub-millisecond over ~40 chunks.
 *   • A query-time embedding/hybrid model (Voyage/OpenAI) remains a
 *     future option behind the same `searchCorpus(query, k)` interface
 *     — deferred because it adds a key, latency, cost, and breaks
 *     offline determinism.
 *
 * Recall:
 *   • Synonym/acronym expansion closes the lexical gap — e.g. "extended
 *     outdoor air" now retrieves the ventilation-rate-procedure chunk,
 *     and "DCV" / "CoC" / "SBS" / "ECAi" resolve to their concepts.
 *   • Tag tokens are still weighted 2× in the doc vector.
 *   • Stop words filtered minimally — we keep "co2" (lowercased) but
 *     drop "the", "of", "is", etc.
 *
 * Engine-sacred: pure data shaping. No engine logic touched.
 */

import { STANDARDS_CORPUS } from '../constants/standards-corpus.js'

// Minimal English stopword list — keeps technical content + numbers,
// drops only the most-generic function words. A bigger list would
// improve precision at the cost of dropping technically-relevant
// terms like "limit", "use", "with".
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that',
  'the', 'this', 'to', 'was', 'were', 'will', 'with', 'which', 'who',
  'how', 'what', 'when', 'where', 'why', 'than', 'then', 'so', 'if',
  'but', 'do', 'does', 'did', 'i', 'you', 'we', 'they', 'he', 'she',
])

/**
 * Tokenize: lowercase, strip non-alphanumeric (keep .,- inside numbers),
 * split on whitespace, drop stopwords + empty strings.
 *
 * We preserve digit-punctuation patterns ("pm2.5", "1910.1000",
 * "ashrae-62.1") because they're meaningful identifiers in this
 * corpus.
 */
export function tokenize(text) {
  if (!text || typeof text !== 'string') return []
  // Normalize unicode subscripts/superscripts that appear in chemistry text
  // (CO₂, PM₂.₅, NO₂, SO₂, H₂S, etc.) Map each subscript codepoint to its
  // ASCII digit equivalent (U+2080..U+2089 → 0..9).
  const subscriptMap = '0123456789'
  const normalized = text
    .toLowerCase()
    .replace(/[₀-₉]/g, (c) => subscriptMap[c.charCodeAt(0) - 0x2080])
    .replace(/[²³¹]/g, (c) => {
      // Superscripts ² ³ ¹ (m², m³, etc.)
      if (c === '²') return '2'
      if (c === '³') return '3'
      return '1'
    })
    .replace(/[µ]/g, 'u') // µ → u
    .replace(/[‐-―]/g, '-') // various dashes → hyphen
  // Split on whitespace and most punctuation, but keep . and - inside
  // tokens (so "pm2.5" and "ashrae-62.1" stay intact).
  const raw = normalized.split(/[\s,;:!?()[\]{}"'`/\\<>|+=*&^%$#@~]+/)
  const out = []
  for (const t of raw) {
    if (!t) continue
    // Trim trailing . or - that aren't part of a number/identifier
    const trimmed = t.replace(/^[.-]+|[.-]+$/g, '')
    if (!trimmed) continue
    if (STOPWORDS.has(trimmed)) continue
    if (trimmed.length === 1 && !/[0-9]/.test(trimmed)) continue
    out.push(trimmed)
    // For hyphenated alphabetic compounds ("demand-controlled",
    // "self-hosted"), also emit each part so queries that use the
    // parts separately can match. Keep the compound too. Skip if any
    // part is a stopword or single non-numeric char.
    if (trimmed.includes('-') && /[a-z]-[a-z]/.test(trimmed)) {
      for (const part of trimmed.split('-')) {
        if (!part) continue
        if (STOPWORDS.has(part)) continue
        if (part.length === 1 && !/[0-9]/.test(part)) continue
        if (part !== trimmed) out.push(part)
      }
    }
  }
  return out
}

/**
 * Build the doc-vector representation of a chunk. We weight tag
 * tokens 2× because tags are curated keywords and reliably indicate
 * topic — boosting their TF lifts recall on technical-acronym queries
 * (e.g. "PEL", "TLV", "ECAi") that may appear only in tags.
 */
function chunkTokens(chunk) {
  const titleTokens = tokenize(chunk.title)
  const textTokens = tokenize(chunk.text)
  const citationTokens = tokenize(chunk.citation)
  // Tag tokens repeated 2× to weight them higher in TF computation
  const tagTokens = (chunk.tags || []).flatMap((t) => {
    const toks = tokenize(t)
    return [...toks, ...toks]
  })
  return [...titleTokens, ...textTokens, ...citationTokens, ...tagTokens]
}

/**
 * Compute term-frequency vector (Map term → count) for a token stream.
 */
function tfVector(tokens) {
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
  return tf
}

// ── Synonym / acronym query expansion (L3.5 hybrid) ───────────────────
// Curated, deterministic, offline. Maps IAQ acronyms and key terms to
// their expanded forms so a query phrased with an acronym (or a synonym)
// still retrieves the chunk that spells the concept out. Expansion is
// ADDITIVE and query-side only — it never mutates the corpus index, so
// it can't change L2-normalization or doc vectors. Keep entries
// conservative: each expansion should be unambiguous in IAQ practice.
const SYNONYMS = {
  dcv: ['demand', 'controlled', 'ventilation'],
  oa: ['outdoor', 'air'],
  rh: ['relative', 'humidity', 'moisture'],
  coc: ['chain', 'custody', 'laboratory'],
  iaq: ['indoor', 'air', 'quality'],
  voc: ['volatile', 'organic', 'compound'],
  vocs: ['volatile', 'organic', 'compound'],
  tvoc: ['total', 'volatile', 'organic', 'compound'],
  mvoc: ['microbial', 'volatile', 'organic', 'compound'],
  sbs: ['sick', 'building', 'syndrome'],
  bri: ['building', 'related', 'illness'],
  pel: ['permissible', 'exposure', 'limit'],
  tlv: ['threshold', 'limit', 'value'],
  rel: ['recommended', 'exposure', 'limit'],
  idlh: ['immediately', 'dangerous', 'life', 'health'],
  naaqs: ['national', 'ambient', 'air', 'quality', 'standard'],
  pcm: ['phase', 'contrast', 'microscopy'],
  tem: ['transmission', 'electron', 'microscopy'],
  ecai: ['equivalent', 'clean', 'airflow', 'infection'],
  co2: ['carbon', 'dioxide'],
  rrp: ['renovation', 'repair', 'painting', 'lead'],
  ahu: ['air', 'handling', 'unit'],
  hcho: ['formaldehyde'],
}

// Phrase-level synonyms — scanned against the lowercased query string so
// multi-word concepts expand too (e.g. the documented "extended outdoor
// air" → "ventilation rate procedure" gap).
const PHRASE_SYNONYMS = [
  ['extended outdoor air', ['ventilation', 'rate', 'procedure']],
  ['outdoor air', ['ventilation', 'rate']],
  ['fresh air', ['outdoor', 'air', 'ventilation']],
  ['make-up air', ['outdoor', 'air']],
  ['makeup air', ['outdoor', 'air']],
  ['chain of custody', ['coc', 'laboratory', 'sample']],
]

/**
 * Expand a query string with curated synonyms/acronyms. Returns the
 * original query plus any expansion words appended (so downstream
 * tokenization/scoring picks them up). Pure + deterministic.
 */
export function expandQuery(query) {
  if (!query || typeof query !== 'string') return query || ''
  const extra = []
  for (const t of tokenize(query)) {
    const syn = SYNONYMS[t]
    if (syn) extra.push(...syn)
  }
  const lower = ' ' + query.toLowerCase() + ' '
  for (const [phrase, words] of PHRASE_SYNONYMS) {
    if (lower.includes(phrase)) extra.push(...words)
  }
  return extra.length ? `${query} ${extra.join(' ')}` : query
}

// ── BM25 lexical scoring (blended with TF-IDF cosine) ─────────────────
const BM25_K1 = 1.5
const BM25_B = 0.75
// Saturation constant — maps a raw BM25 score into [0, 1) via
// s / (s + BM25_SAT) so it blends with the 0..1 cosine and preserves the
// cosine-scale threshold semantics callers rely on.
const BM25_SAT = 8
// Blend weight: final = (1-λ)·cosine + λ·bm25Normalized.
const HYBRID_LAMBDA = 0.5

// ── Build the index once at module load ──────────────────────────────
// Recomputed only if the corpus is mutated, which it isn't at runtime.

function buildIndex(corpus) {
  const N = corpus.length
  const docTokens = corpus.map(chunkTokens)
  // Document frequency: how many docs contain each term?
  const df = new Map()
  for (const tokens of docTokens) {
    const unique = new Set(tokens)
    for (const t of unique) df.set(t, (df.get(t) || 0) + 1)
  }
  // Inverse document frequency: log((N+1)/(df+1)) + 1
  // Smoothed so unseen terms get a non-zero idf when we score queries.
  const idf = new Map()
  for (const [term, freq] of df.entries()) {
    idf.set(term, Math.log((N + 1) / (freq + 1)) + 1)
  }
  // Pre-compute the L2-normalized TF-IDF vector for each doc.
  const docVectors = docTokens.map((tokens) => {
    const tf = tfVector(tokens)
    const vec = new Map()
    let normSq = 0
    for (const [term, count] of tf.entries()) {
      const w = count * (idf.get(term) || 0)
      vec.set(term, w)
      normSq += w * w
    }
    const norm = Math.sqrt(normSq) || 1
    for (const [term, w] of vec.entries()) vec.set(term, w / norm)
    return vec
  })
  // BM25 stats (separate from the L2-normalized TF-IDF vectors above).
  const docTermFreqs = docTokens.map(tfVector)
  const docLengths = docTokens.map((t) => t.length)
  const avgDocLen = N > 0 ? docLengths.reduce((a, b) => a + b, 0) / N : 0
  // BM25 idf: ln(1 + (N - df + 0.5)/(df + 0.5)) — always >= 0.
  const idfBm25 = new Map()
  for (const [term, freq] of df.entries()) {
    idfBm25.set(term, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)))
  }
  return { idf, docVectors, N, docTermFreqs, docLengths, avgDocLen, df, idfBm25 }
}

const _INDEX = buildIndex(STANDARDS_CORPUS)

/**
 * BM25 score of a doc (by index) for a set of query tokens. Each distinct
 * query term contributes once (idf-weighted, TF-saturated, length-
 * normalized). Returns a raw non-negative score.
 */
function bm25Score(queryTokens, i) {
  const tf = _INDEX.docTermFreqs[i]
  const dl = _INDEX.docLengths[i]
  const avgdl = _INDEX.avgDocLen || 1
  let score = 0
  const seen = new Set()
  for (const term of queryTokens) {
    if (seen.has(term)) continue
    seen.add(term)
    const f = tf.get(term) || 0
    if (f === 0) continue
    const idf = _INDEX.idfBm25.get(term) || 0
    const denom = f + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl))
    score += (idf * (f * (BM25_K1 + 1))) / denom
  }
  return score
}

/**
 * Build a normalized TF-IDF vector for a query string using the
 * pre-computed corpus IDF table. Unknown terms (not in the corpus)
 * get zero weight — they can't lift any doc's score.
 */
function queryVector(query, idf) {
  const tokens = tokenize(query)
  if (tokens.length === 0) return null
  const tf = tfVector(tokens)
  const vec = new Map()
  let normSq = 0
  for (const [term, count] of tf.entries()) {
    const w = count * (idf.get(term) || 0)
    if (w === 0) continue
    vec.set(term, w)
    normSq += w * w
  }
  if (normSq === 0) return null
  const norm = Math.sqrt(normSq)
  for (const [term, w] of vec.entries()) vec.set(term, w / norm)
  return vec
}

/**
 * Cosine similarity between two sparse TF-IDF vectors (Map). Both are
 * already L2-normalized, so cosine == dot product.
 */
function cosineSimilarity(a, b) {
  if (!a || !b) return 0
  // Iterate the smaller map for efficiency
  const [small, large] = a.size < b.size ? [a, b] : [b, a]
  let dot = 0
  for (const [term, wa] of small.entries()) {
    const wb = large.get(term)
    if (wb) dot += wa * wb
  }
  return dot
}

/**
 * Search the corpus for chunks matching the query. Returns up to k
 * matches above the (zero-by-default) threshold, ranked by similarity.
 *
 * @param {string} query — free-text query
 * @param {object} [opts]
 * @param {number} [opts.k=3] — max matches to return
 * @param {number} [opts.threshold=0.05] — minimum cosine similarity
 *   (very low default — TF-IDF cosines are small for short queries)
 * @returns {Array<{chunk: object, score: number}>}
 */
export function searchCorpus(query, opts = {}) {
  const k = typeof opts.k === 'number' && opts.k > 0 ? Math.min(opts.k, 10) : 3
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : 0.05
  // Synonym/acronym expansion (L3.5): additive, query-side only.
  const expanded = expandQuery(query)
  const qVec = queryVector(expanded, _INDEX.idf)
  if (!qVec) return []
  const qTokens = tokenize(expanded)
  const scored = []
  for (let i = 0; i < _INDEX.docVectors.length; i++) {
    // Hybrid score: blend TF-IDF cosine (0..1) with a saturated BM25
    // signal (0..1). Both bounded so the score stays on the cosine scale
    // and the threshold semantics are preserved.
    const cos = cosineSimilarity(qVec, _INDEX.docVectors[i])
    const bm = bm25Score(qTokens, i)
    const bmN = bm / (bm + BM25_SAT)
    const score = (1 - HYBRID_LAMBDA) * cos + HYBRID_LAMBDA * bmN
    if (score >= threshold) {
      scored.push({ chunk: STANDARDS_CORPUS[i], score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k)
}

// Test-only exports
export const __test = {
  tokenize,
  buildIndex,
  queryVector,
  cosineSimilarity,
  expandQuery,
  bm25Score,
  _INDEX,
  STOPWORDS,
  SYNONYMS,
  PHRASE_SYNONYMS,
  HYBRID_LAMBDA,
  BM25_SAT,
}
