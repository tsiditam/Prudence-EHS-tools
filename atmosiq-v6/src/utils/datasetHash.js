/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * datasetHash — a fingerprint of the readings a monitoring report was built
 * from, printed in the report's colophon.
 *
 * What it is for: two copies of a report claiming the same monitoring session
 * can be checked against each other, and a report can be checked against the
 * file it came from, without either party trusting the other's word. That is
 * the whole job, and it constrains the design in one specific way:
 *
 *   THE HASH COVERS THE MEASUREMENTS, NOT THE PAPERWORK.
 *
 * Editing the client name, fixing a typo in the objective, or re-issuing the
 * Technical edition must NOT change it — otherwise the number stops meaning
 * "this is the same data" and starts meaning "this is the same file", which
 * is a question nobody asks. Conversely a single altered reading, a dropped
 * row, or a re-mapped column must change it, or it certifies nothing.
 *
 * ── Canonical form ─────────────────────────────────────────────────────
 * Hashing `JSON.stringify(dataset)` would be wrong twice over: object key
 * order is an implementation detail of whichever parser produced the points,
 * and the dataset object carries metadata that is not measurement. So the
 * digest runs over an explicit canonical text:
 *
 *     v1
 *     co2|ppm
 *     temp|°F
 *     --
 *     1784073600000|473.5352400355041|68.2887775242697
 *     1784074200000|…
 *
 * Parameters are sorted, so a re-ordered column mapping that selects the same
 * columns yields the same hash. Points keep their own order, because the
 * sequence of a time series IS part of the data. Numbers are serialized at
 * full IEEE-754 precision via `String(n)` — rounding here would let two
 * genuinely different datasets collide.
 */

const isNum = (v) => v != null && Number.isFinite(v)

/** Schema tag. Bump only if the canonical form below changes shape. */
export const DATASET_HASH_VERSION = 'v1'

/**
 * The exact bytes that get digested.
 *
 * Exported because it is the part worth testing directly: if this string is
 * stable and complete, the digest over it inherits both properties.
 */
export function canonicalDatasetText(dataset) {
  const d = dataset && typeof dataset === 'object' ? dataset : {}
  const units = d.units && typeof d.units === 'object' ? d.units : {}
  const points = Array.isArray(d.points) ? d.points : []

  // Sorted, so a column mapping that picks the same columns in a different
  // order fingerprints the same. Falls back to the keys actually present in
  // the readings when the dataset declares no parameter list.
  const declared = Array.isArray(d.params) ? d.params.filter((p) => typeof p === 'string') : []
  const params = (declared.length
    ? [...new Set(declared)]
    : [...new Set(points.flatMap((p) => Object.keys(p || {})))].filter((k) => k !== 't')
  ).sort()

  const head = [DATASET_HASH_VERSION, ...params.map((p) => `${p}|${units[p] ?? ''}`), '--']

  const rows = points.map((pt) => {
    const p = pt && typeof pt === 'object' ? pt : {}
    // A missing reading and a present one are different data, so a gap is an
    // empty field rather than a zero or a skipped column.
    const cells = params.map((k) => (isNum(p[k]) ? String(p[k]) : ''))
    return [isNum(p.t) ? String(p.t) : '', ...cells].join('|')
  })

  return [...head, ...rows].join('\n')
}

/** Web Crypto where it exists, Node's webcrypto otherwise. */
function subtle() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {}
  return (g.crypto && g.crypto.subtle) || null
}

/**
 * SHA-256 of a dataset's canonical form, lowercase hex.
 *
 * Returns null rather than throwing where no Web Crypto implementation is
 * available — a report generated in such a context prints an em dash for the
 * hash instead of failing to generate at all. It cannot silently fall back to
 * a weaker digest: a value in that field that is not SHA-256 would be a lie
 * about what was verified.
 *
 * @returns {Promise<string|null>} 64 hex characters
 */
export async function sha256Hex(text) {
  const s = subtle()
  if (!s || typeof TextEncoder === 'undefined') return null
  try {
    const bytes = new TextEncoder().encode(String(text ?? ''))
    const digest = await s.digest('SHA-256', bytes)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** SHA-256 of a parsed logger dataset. */
export async function hashDataset(dataset) {
  return sha256Hex(canonicalDatasetText(dataset))
}

/**
 * The hash as the colophon prints it — first 8 and last 4 characters.
 *
 * Long enough that two datasets colliding on it is not a practical concern,
 * short enough to read aloud over a phone, and it keeps the tail so a
 * truncation that dropped the end would be visible.
 */
export function shortHash(hex) {
  const h = typeof hex === 'string' ? hex : ''
  if (h.length < 16) return h || null
  return `${h.slice(0, 8)}…${h.slice(-4)}`
}
