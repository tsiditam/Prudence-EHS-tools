/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Cached grounding corpus for Marlow — a byte-stable string assembled FROM
 * the standards manifest + the curated corpus, sent as an Anthropic
 * cache_control:'ephemeral' system block so the bulk of input tokens hit the
 * prompt cache after the first warm request. It is GENERATED from the
 * manifest (never hand-typed), so it can never drift from the hardcoded
 * values in src/constants/standards.js.
 */

import { ALL_PARAMS, STATE_STDS, STANDARDS_MANIFEST } from './standards.js'
import { WATER_STANDARDS_CORPUS } from './water-standards-corpus.js'

function fmtLimit(p) {
  const parts = []
  if (p.mcl != null) parts.push(`MCL ${p.mcl}${typeof p.mcl === 'number' ? ' ' + p.unit : ''}`)
  if (p.al != null) parts.push(`Action Level ${p.al} ${p.unit}`)
  if (p.mrdl != null) parts.push(`MRDL ${p.mrdl} ${p.unit}`)
  if (p.mclg != null) parts.push(`MCLG ${p.mclg}`)
  if (p.smcl != null && typeof p.smcl === 'number') parts.push(`SMCL ${p.smcl} ${p.unit}`)
  if (p.smcl != null && typeof p.smcl === 'object') parts.push(`SMCL ${p.smcl.min}-${p.smcl.max}`)
  if (p.who != null && typeof p.who === 'number') parts.push(`WHO ${p.who} ${p.unit}`)
  if (p.healthAdv != null) parts.push(`Health Advisory ${p.healthAdv} ${p.unit}`)
  if (p.epaAdv != null) parts.push(`EPA Advisory ${p.epaAdv} ${p.unit}`)
  if (p.crc) parts.push(`IARC ${p.crc}`)
  return parts.join(', ') || 'no numeric limit'
}

/** Build the cached corpus string. Deterministic for prompt-cache stability. */
export function buildStandardsCorpus() {
  const lines = []
  lines.push(`# HydroScan Standards Manifest (v${STANDARDS_MANIFEST.version})`)
  lines.push('Authoritative sources:')
  for (const s of STANDARDS_MANIFEST.sources) lines.push(`- ${s.title} — ${s.citation}`)

  lines.push('\n# Parameter limits (the only values you may quote)')
  for (const p of ALL_PARAMS) {
    lines.push(`- ${p.name} (${p.unit}) [${p.cat}]: ${fmtLimit(p)}`)
  }

  lines.push('\n# State limits (stricter than federal)')
  for (const [code, row] of Object.entries(STATE_STDS)) {
    const { label, ...limits } = row
    const pairs = Object.entries(limits)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')
    lines.push(`- ${code} (${label}): ${pairs || 'program-level limits'}`)
  }

  lines.push('\n# Regulatory corpus')
  for (const c of WATER_STANDARDS_CORPUS) {
    lines.push(`\n## ${c.title}\nCitation: ${c.citation}\n${c.text}`)
  }

  return lines.join('\n')
}

// Precomputed once at module load — byte-stable across requests.
export const STANDARDS_CORPUS_TEXT = buildStandardsCorpus()
