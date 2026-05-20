/**
 * Prudence EHS — TF-IDF corpus search
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Pure-JS TF-IDF + cosine-similarity retrieval over the curated
 * STANDARDS_CORPUS. Designed as the L3 retrieval primitive for the
 * Field Assistant agent (Jasper) — Claude calls a `search_standards_corpus`
 * tool, the tool dispatches here, this returns the top-k matching
 * chunks with their citations.
 *
 * Why TF-IDF (not embeddings) for v1:
 *   • Zero external dependencies — runs in the Vercel serverless
 *     function, no embedding API key, no vector DB.
 *   • Deterministic — same query always returns same ranking, useful
 *     for testing and audit.
 *   • Fast — ~40 chunks × ~200 tokens ≈ 8K-vector dot products per
 *     query, sub-millisecond.
 *   • Forward-compatible — when we add Voyage/OpenAI embeddings in
 *     L3.5, the same `searchCorpus(query, k)` interface stays; only
 *     the internal scoring changes.
 *
 * Quality limits (TF-IDF):
 *   • Lexical match only — "extended outdoor air" won't match a chunk
 *     about "ventilation rate procedure" unless the words overlap.
 *     Mitigated by rich `tags` arrays on each chunk (acronyms +
 *     synonyms) which the indexer includes in the doc vector.
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
  return { idf, docVectors, N }
}

const _INDEX = buildIndex(STANDARDS_CORPUS)

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
  const qVec = queryVector(query, _INDEX.idf)
  if (!qVec) return []
  const scored = []
  for (let i = 0; i < _INDEX.docVectors.length; i++) {
    const score = cosineSimilarity(qVec, _INDEX.docVectors[i])
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
  _INDEX,
  STOPWORDS,
}
