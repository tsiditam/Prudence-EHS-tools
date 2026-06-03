/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Tiny dependency-free TF-IDF search over a curated corpus. Used by Marlow's
 * search_standards_corpus tool to retrieve the most relevant primary-source
 * chunks for a query. Deterministic and offline — no embeddings, no network.
 */

const STOP = new Set('a an the of for to in on at is are be by or and with as from this that it its'.split(' '))

function tokenize(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

/**
 * Rank corpus chunks against a query by TF-IDF cosine-ish overlap.
 * @param {Array<{id:string,title:string,text:string,citation?:string}>} chunks
 * @param {string} query
 * @param {number} k max results
 * @returns top-k chunks with a score, highest first
 */
export function searchCorpus(chunks, query, k = 4) {
  if (!Array.isArray(chunks) || chunks.length === 0) return []
  const qTerms = tokenize(query)
  if (qTerms.length === 0) return []

  const N = chunks.length
  const docTokens = chunks.map((c) => tokenize(`${c.title} ${c.text}`))
  // Document frequency per term.
  const df = new Map()
  docTokens.forEach((toks) => {
    new Set(toks).forEach((t) => df.set(t, (df.get(t) || 0) + 1))
  })
  const idf = (t) => Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1

  const scored = chunks.map((c, i) => {
    const toks = docTokens[i]
    const tf = new Map()
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1))
    let score = 0
    for (const qt of qTerms) {
      if (tf.has(qt)) score += (tf.get(qt) / toks.length) * idf(qt)
      // Title hits weigh extra.
      if (c.title && c.title.toLowerCase().includes(qt)) score += 0.5
    }
    return { chunk: c, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s.chunk, score: Number(s.score.toFixed(4)) }))
}
