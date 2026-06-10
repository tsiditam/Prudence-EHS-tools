/**
 * buildConceptualSiteModelSection — DOCX body section for the CIH-reasoning
 * report style. Renders engine causalChains as source → pathway → receptor
 * chains with evidence + confidence.
 */

import { describe, it, expect } from 'vitest'
import { Table } from 'docx'
import { buildConceptualSiteModelSection } from '../../src/components/docx/sections-conceptual-model'

const CHAIN = {
  zone: 'Zone 8-D',
  type: 'Ventilation Deficiency',
  rootCause: 'Outdoor-air delivery appears insufficient for peak occupancy in the interior conference room.',
  evidence: ['CO2 peak 1,247 ppm during a six-person meeting', '815 ppm above outdoor baseline', 'recovery on adjournment'],
  confidence: 'Moderate',
  refutableBy: 'Airflow / BAS / TAB measurement showing adequate outdoor-air delivery',
  std: 'ASHRAE 62.1-2025 (screening indicator)',
}

describe('buildConceptualSiteModelSection', () => {
  it('is a no-op (null) when there are no causal chains', () => {
    expect(buildConceptualSiteModelSection(null)).toBeNull()
    expect(buildConceptualSiteModelSection([])).toBeNull()
    expect(buildConceptualSiteModelSection([null, undefined])).toBeNull()
  })

  it('returns a { title, children } descriptor with a table per chain', () => {
    const section = buildConceptualSiteModelSection([CHAIN])
    expect(section.title).toBe('Conceptual Site Model (Source → Pathway → Receptor)')
    expect(Array.isArray(section.children)).toBe(true)
    // intro paragraph + (heading + table + spacer) per chain
    expect(section.children.length).toBeGreaterThanOrEqual(4)
    expect(section.children.some(c => c instanceof Table)).toBe(true)
  })

  it('renders one chain block per chain', () => {
    const one = buildConceptualSiteModelSection([CHAIN])
    const two = buildConceptualSiteModelSection([CHAIN, { ...CHAIN, zone: 'Zone 12-B' }])
    const tablesIn = (s) => s.children.filter(c => c instanceof Table).length
    expect(tablesIn(two)).toBe(tablesIn(one) + 1)
  })

  it('tolerates a sparse chain (missing optional fields) without throwing', () => {
    const section = buildConceptualSiteModelSection([{ type: 'Thermal Comfort', zone: 'Zone 7-A' }])
    expect(section).not.toBeNull()
    expect(section.children.some(c => c instanceof Table)).toBe(true)
  })
})
