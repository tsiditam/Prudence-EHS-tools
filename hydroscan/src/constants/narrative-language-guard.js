/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Narrative language guard. A backstop (ported from AtmosFlow's
 * api/_banned-language.js) that scans a generated narrative for phrasing a
 * water-quality SCREENING narrative must never use — causation, safe/unsafe
 * claims, and compliance determinations (block), plus softer risk/causal
 * phrasings (warn). The system prompt already forbids these; this surfaces a
 * "review" status to the UI/report if any slip through. It never edits text.
 */

// Hard claims a screening narrative must not make → level 'block'.
const BLOCK_TERMS = [
  'caused by', 'is responsible for', 'attributable to',
  'safe to drink', 'unsafe to drink', 'safe for consumption', 'is potable',
  'in compliance with', 'compliant with', 'non-compliant', 'noncompliant',
  'is in violation', 'in violation of', 'violates the',
  'confirmed contamination', 'guaranteed', 'we certify',
]

// Softer phrasings worth a reviewer's eye → level 'warn'.
const WARN_TERMS = [
  'health risk', 'high risk', 'elevated risk', 'critical risk',
  'due to', 'responsible for', 'will prevent', 'ensures', 'eliminates',
  'poses a risk', 'dangerous',
]

function snippetAround(haystack, idx, term) {
  const start = Math.max(0, idx - 24)
  const end = Math.min(haystack.length, idx + term.length + 24)
  return (start > 0 ? '…' : '') + haystack.slice(start, end).trim() + (end < haystack.length ? '…' : '')
}

/**
 * scanNarrative(text) → { level: 'pass'|'warn'|'block', flags: [{term, snippet, level}] }
 */
export function scanNarrative(text) {
  const src = String(text || '')
  const lower = src.toLowerCase()
  const flags = []
  let level = 'pass'

  for (const term of BLOCK_TERMS) {
    const idx = lower.indexOf(term)
    if (idx >= 0) { flags.push({ term, snippet: snippetAround(src, idx, term), level: 'block' }); level = 'block' }
  }
  for (const term of WARN_TERMS) {
    const idx = lower.indexOf(term)
    if (idx >= 0) { flags.push({ term, snippet: snippetAround(src, idx, term), level: 'warn' }); if (level !== 'block') level = 'warn' }
  }
  return { level, flags }
}

export const NARRATIVE_GUARD_TERMS = { block: BLOCK_TERMS, warn: WARN_TERMS }
