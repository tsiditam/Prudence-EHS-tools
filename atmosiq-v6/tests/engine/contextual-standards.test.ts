/**
 * Standards-Currency layer — bibliographic references not yet
 * codified in the deterministic scoring engine.
 *
 * This file pins the three things the rendered report depends on:
 *   • CONTEXTUAL_STANDARDS shape (id, citation, summary, rationale
 *     are all non-empty strings)
 *   • getContextualStandards is stable + does not mutate the array
 *   • Every entry's citation matches its claimed primary source
 *     so a future bump can't silently drift to an unverified value
 *
 * Engine-sacred audit (test-side): this file references the manifest
 * via src/constants/standards.js but reads NO scoring threshold from
 * STD. If a future change accidentally moves data from
 * CONTEXTUAL_STANDARDS into STD.c.* (which would be a scoring
 * change), the manifest-membership test below would still pass —
 * the engine-sacred guard is a code-review concern, not a test
 * concern. Flagged in the PR description.
 */
import { describe, it, expect } from 'vitest'
import { CONTEXTUAL_STANDARDS, getContextualStandards } from '../../src/engines/contextualStandards.js'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'

describe('CONTEXTUAL_STANDARDS shape', () => {
  it('exports at least the three Move 5 references', () => {
    const ids = CONTEXTUAL_STANDARDS.map((e: { id: string }) => e.id)
    expect(ids).toContain('ashrae-241-2023')
    expect(ids).toContain('epa-pm25-annual-naaqs-2024')
    expect(ids).toContain('acgih-tlv-2025')
  })

  it('every entry has all required fields, non-empty', () => {
    for (const entry of CONTEXTUAL_STANDARDS) {
      expect(typeof entry.id).toBe('string')
      expect(entry.id.length).toBeGreaterThan(0)
      expect(typeof entry.citation).toBe('string')
      expect(entry.citation.length).toBeGreaterThan(20)
      expect(typeof entry.summary).toBe('string')
      expect(entry.summary.length).toBeGreaterThan(0)
      expect(typeof entry.rationale).toBe('string')
      // Rationale should be a substantive paragraph, not a tagline.
      expect(entry.rationale.length).toBeGreaterThan(120)
    }
  })

  it('CONTEXTUAL_STANDARDS is frozen', () => {
    expect(Object.isFrozen(CONTEXTUAL_STANDARDS)).toBe(true)
  })
})

describe('citation provenance — primary source matches', () => {
  function find(id: string) {
    const entry = CONTEXTUAL_STANDARDS.find((e: { id: string }) => e.id === id)
    if (!entry) throw new Error(`Missing entry: ${id}`)
    return entry
  }

  it('ASHRAE 241-2023 citation names the standard and year', () => {
    const e = find('ashrae-241-2023')
    expect(e.citation).toMatch(/ASHRAE\s+(?:Standard\s+)?241-2023/)
    expect(e.citation).toMatch(/Infectious Aerosols/i)
  })

  it('EPA PM2.5 NAAQS revision cites 89 FR 16202 and the effective date', () => {
    const e = find('epa-pm25-annual-naaqs-2024')
    expect(e.citation).toMatch(/89 Fed\.\s?Reg\.\s?16202/)
    expect(e.citation).toMatch(/March 6,? 2024/)
    expect(e.citation).toMatch(/May 6,? 2024/)
    // Rationale should explicitly state the new annual value and
    // confirm the 24-hr value is unchanged — both are key to the
    // "what's in / what's not in" framing.
    expect(e.rationale).toMatch(/9\s?µg\/m³|9\s?µg\/m3/)
    expect(e.rationale).toMatch(/35\s?µg\/m³|35\s?µg\/m3/)
  })

  it('ACGIH TLV 2025 cites the publishing body + year', () => {
    const e = find('acgih-tlv-2025')
    expect(e.citation).toMatch(/American Conference of Governmental Industrial Hygienists|ACGIH/)
    expect(e.citation).toMatch(/2025/)
  })
})

describe('manifest membership', () => {
  it('STANDARDS_MANIFEST has matching bibliographic keys for each contextual reference', () => {
    expect(STANDARDS_MANIFEST['ASHRAE 241']).toBeDefined()
    expect(STANDARDS_MANIFEST['EPA PM2.5 Annual NAAQS Revision']).toBeDefined()
    expect(STANDARDS_MANIFEST['ACGIH TLVs and BEIs']).toBeDefined()
  })

  it('the pre-existing engine-relevant manifest entries are still present', () => {
    // Move 5 must be ADDITIVE only — guard against accidental deletion
    // of existing entries during the bibliographic expansion.
    expect(STANDARDS_MANIFEST['ASHRAE 62.1']).toBeDefined()
    expect(STANDARDS_MANIFEST['OSHA Z-1 PELs']).toBeDefined()
    expect(STANDARDS_MANIFEST['EPA NAAQS']).toBeDefined()
    expect(STANDARDS_MANIFEST['IICRC S520']).toBeDefined()
    expect(STANDARDS_MANIFEST['ASHRAE 55']).toBeDefined()
    expect(STANDARDS_MANIFEST['WHO Air Quality Guidelines']).toBeDefined()
  })
})

describe('getContextualStandards', () => {
  it('returns the CONTEXTUAL_STANDARDS array', () => {
    expect(getContextualStandards()).toBe(CONTEXTUAL_STANDARDS)
  })

  it('ignores its optional ctx argument (passthrough today)', () => {
    expect(getContextualStandards({ buildingType: 'residential' })).toBe(CONTEXTUAL_STANDARDS)
    expect(getContextualStandards(null)).toBe(CONTEXTUAL_STANDARDS)
    expect(getContextualStandards(undefined)).toBe(CONTEXTUAL_STANDARDS)
  })
})
