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

describe('standards corpus — the TVOC dose-response entry is gone', () => {
  // `molhave-tvoc-framework` recited the four 1991 tiers with their µg/m³
  // equivalents, a warning against expressing them in ppb, and a warning
  // against conflating them with the LEED 500 µg/m³ target. All of that was
  // careful, and none of it should have been in the corpus: this is what
  // Jasper CITES from, so an entry describing a four-tier construct is a
  // threshold the assistant will quote whether or not the engine applies one.
  // Removed in 2026-08 with every other TVOC threshold — see
  // tests/engine/no-molhave.test.ts.
  it('holds no dose-response entry for TVOC under any id', () => {
    expect(byId('molhave-tvoc-framework')).toBeUndefined()
    for (const c of STANDARDS_CORPUS as Array<{ id: string; citation?: string; text: string }>) {
      expect(c.id, 'corpus id').not.toMatch(/molhave|mølhave/i)
      expect(String(c.citation || ''), `citation on ${c.id}`).not.toMatch(/molhave|mølhave/i)
    }
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
  it('is now the only TVOC figure in the corpus, and says the platform applies none', () => {
    // This used to assert the LEED entry did not displace the Mølhave one as
    // the top match for a Mølhave query. There is no Mølhave entry to
    // displace. What matters instead is that the surviving 500 µg/m³ figure
    // cannot be read as AtmosFlow's own threshold, so its text says outright
    // that the platform applies none — the entry is kept because an assessor
    // meets that number in a green-building specification and needs to know
    // what it is, not because anything here compares a reading to it.
    expect(leed!.text).toMatch(/AtmosFlow itself applies NO TVOC threshold/i)
    const r = searchCorpus('TVOC limit threshold', { k: 5 })
    for (const hit of r) {
      expect(hit.chunk.id, 'a TVOC threshold entry came back').not.toMatch(/molhave|mølhave/i)
    }
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
