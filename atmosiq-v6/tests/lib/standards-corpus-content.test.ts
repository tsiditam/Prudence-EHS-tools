/**
 * Content tests for the IAQ standards corpus (P1 item 5).
 *
 * Locks in the science fixes:
 *   • Mølhave TVOC tiers carry explicit µg/m³ equivalents (kills the
 *     ppb ↔ µg/m³ confusion observed in real outputs).
 *   • The general/LEED 500 µg/m³ TVOC target exists as a SEPARATE entry,
 *     explicitly distinguished from the Mølhave dose-response tiers.
 *   • The ASHRAE 55 humidity provision states the actual upper limit
 *     (humidity ratio 0.012, no lower limit), not a generic "30–60 % RH".
 */

import { describe, it, expect } from 'vitest'
import { STANDARDS_CORPUS } from '../../src/constants/standards-corpus.js'
import { searchCorpus } from '../../src/utils/corpus-search.js'

const byId = (id: string) => STANDARDS_CORPUS.find((c: { id: string }) => c.id === id)

describe('standards corpus — Mølhave tiers carry µg/m³ equivalents', () => {
  const molhave = byId('molhave-tvoc-framework') as { text: string } | undefined
  it('exists', () => expect(molhave).toBeDefined())
  it('states the µg/m³ equivalents', () => {
    expect(molhave!.text).toContain('200 µg/m³')
    expect(molhave!.text).toContain('200–3000 µg/m³')
    expect(molhave!.text).toContain('25000 µg/m³')
  })
  it('warns against ppb and against conflating the 500 target', () => {
    expect(molhave!.text).toMatch(/not expressed in ppb/i)
    expect(molhave!.text).toMatch(/500 µg\/m³/)
  })
})

describe('standards corpus — separate LEED/general 500 µg/m³ TVOC target', () => {
  const leed = byId('tvoc-500-green-building-target') as { text: string; tags: string[] } | undefined
  it('exists with LEED tags', () => {
    expect(leed).toBeDefined()
    expect(leed!.tags).toContain('leed')
    expect(leed!.tags).toContain('500')
  })
  it('names 500 µg/m³ as a green-building target, not a dose-response tier', () => {
    expect(leed!.text).toContain('500 µg/m³')
    expect(leed!.text).toMatch(/LEED/)
    expect(leed!.text).toMatch(/NOT one of the 1991 TVOC dose-response tiers/i)
  })
  it('is retrievable for a LEED/500 query', () => {
    const r = searchCorpus('LEED green building TVOC 500 µg/m³ target', { k: 3 })
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].chunk.id).toBe('tvoc-500-green-building-target')
  })
  it('does NOT displace the Mølhave query top-match', () => {
    const r = searchCorpus('Mølhave TVOC framework', { k: 3 })
    expect(r[0].chunk.id).toBe('molhave-tvoc-framework')
  })
})

describe('standards corpus — ASHRAE 55 actual humidity provision', () => {
  const a55 = byId('ashrae-55-comfort') as { text: string } | undefined
  it('exists', () => expect(a55).toBeDefined())
  it('states the humidity-ratio upper limit and no lower limit', () => {
    expect(a55!.text).toMatch(/humidity ratio of 0\.012/)
    expect(a55!.text).toMatch(/does NOT prescribe a lower humidity limit/i)
  })
  it('labels 30–60 % RH as a general rule of thumb, not an ASHRAE 55 requirement', () => {
    expect(a55!.text).toMatch(/rule of thumb/i)
    expect(a55!.text).toMatch(/not an ASHRAE 55 comfort requirement/i)
  })
})
