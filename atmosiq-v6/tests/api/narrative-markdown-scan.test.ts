/**
 * Banned-language scanner × markdown formatting.
 *
 * The narrative prompt now emits Markdown (headings / bullets / tables).
 * The defensibility scanner (api/_banned-language.js) runs on the RAW
 * model text server-side, before any rendering. These tests pin that
 * markdown formatting does NOT weaken the scan, and document the one
 * residual evasion (mid-word emphasis split) that the prompt forbids by
 * construction.
 *
 * The scanner itself is parity-locked to src/engine/report/cih-validation.ts
 * and is NOT edited here — tests only.
 */
import { describe, it, expect } from 'vitest'
import * as bannedNs from '../../api/_banned-language.js'

const mod: any = (bannedNs as any).default ?? bannedNs
const scan = mod.scan as (text: string) => Array<{ term: string }>

describe('banned-language scan with markdown formatting', () => {
  it('still flags a banned tone term wrapped in bold markers', () => {
    const hits = scan('The deficiency was **caused by** poor maintenance.')
    expect(hits.some(h => h.term.toLowerCase() === 'caused by')).toBe(true)
  })

  it('still flags a banned term inside a GFM table cell', () => {
    const md = [
      '| Finding | Note |',
      '| --- | --- |',
      '| HVAC | caused by inadequate maintenance |',
    ].join('\n')
    const hits = scan(md)
    expect(hits.some(h => h.term.toLowerCase() === 'caused by')).toBe(true)
  })

  it('passes a clean, fully-formatted screening narrative (no false positives from markdown)', () => {
    const md = [
      '## Assessment Context',
      '- Building: Test Office, 2026-05-31.',
      '',
      '## Hypotheses',
      '- **Under-ventilation:** CO2 ran elevated relative to the outdoor reference, an indicator of insufficient outdoor air delivery.',
      '',
      '| Hypothesis | Increases confidence | Decreases confidence |',
      '| --- | --- | --- |',
      '| Under-ventilation | Timed CO2 decay test | Measured outdoor-air rate at the per-occupancy reference |',
      '',
      '## Data Gaps',
      '- No outdoor CO2 baseline was recorded.',
      '',
      'IH Review Required — screening output; not a compliance determination or causation finding.',
    ].join('\n')
    expect(scan(md)).toEqual([])
  })

  it('documents the residual evasion: a term split mid-word by emphasis is NOT caught', () => {
    // This is exactly why the prompt forbids placing causal/clinical
    // vocabulary inside emphasis markers — the scanner matches on intact
    // \b-bounded terms, so "caus**ed by**" has no contiguous "caused by".
    const hits = scan('The deficiency was caus**ed by** poor maintenance.')
    expect(hits.some(h => h.term.toLowerCase() === 'caused by')).toBe(false)
  })
})
