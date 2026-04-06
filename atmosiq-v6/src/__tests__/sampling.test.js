import { describe, it, expect } from 'vitest'
import { generateSamplingPlan } from '../engines/sampling'

describe('generateSamplingPlan', () => {
  it('returns empty plan for clean zones', () => {
    const zones = [{ zn: 'Lobby' }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    expect(result.plan).toHaveLength(0)
    expect(result.outdoorGaps).toHaveLength(0)
  })

  it('recommends bioaerosol sampling for visible mold', () => {
    const zones = [{ zn: 'Basement', mi: 'Extensive — >30 sq ft' }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const bio = result.plan.find(p => p.type === 'Bioaerosol')
    expect(bio).toBeDefined()
    expect(bio.priority).toBe('critical')
    expect(bio.method).toContain('Andersen impactor')
  })

  it('recommends moisture mapping for active leak', () => {
    const zones = [{ zn: 'Mech Room', wd: 'Active leak' }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const moist = result.plan.find(p => p.type === 'Moisture / Bioaerosol')
    expect(moist).toBeDefined()
    expect(moist.priority).toBe('high')
  })

  it('recommends formaldehyde sampling when elevated', () => {
    const zones = [{ zn: 'Office', hc: '0.05' }] // above NIOSH 0.016
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const hcho = result.plan.find(p => p.type === 'Formaldehyde')
    expect(hcho).toBeDefined()
    expect(hcho.standard).toContain('1910.1048')
  })

  it('recommends combustion gas investigation for elevated CO', () => {
    const zones = [{ zn: 'Loading Dock', co: '15' }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const comb = result.plan.find(p => p.type === 'Combustion Gas')
    expect(comb).toBeDefined()
    expect(comb.priority).toBe('medium')
  })

  it('flags outdoor PM2.5 data gap', () => {
    const zones = [{ zn: 'Office', pm: '20' }] // has indoor PM but no outdoor
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    expect(result.outdoorGaps.some(g => g.includes('Outdoor PM2.5'))).toBe(true)
  })

  it('recommends hidden bioaerosol for musty odor without visible mold', () => {
    const zones = [{ zn: 'Closet', ot: ['Musty / Earthy'] }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const hidden = result.plan.find(p => p.type === 'Hidden Bioaerosol')
    expect(hidden).toBeDefined()
    expect(hidden.method).toContain('Wall cavity')
  })

  it('recommends sewer gas testing for sewage odor', () => {
    const zones = [{ zn: 'Restroom', ot: ['Sewage'] }]
    const bldg = {}
    const result = generateSamplingPlan(zones, bldg)
    const sewer = result.plan.find(p => p.type === 'Sewer Gas')
    expect(sewer).toBeDefined()
    expect(sewer.method).toContain('H2S')
  })
})
