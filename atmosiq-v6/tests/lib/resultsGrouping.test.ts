/**
 * resultsGrouping — the results screen folds per-zone engine output into
 * one row per distinct item. Pins: nothing is lost in the fold (every
 * zone, hypothesis, evidence line and action is still reachable), the
 * strongest confidence / priority wins, and order is first-seen.
 */
import { describe, it, expect } from 'vitest'
import { groupPathways, groupSamplingPlan, groupActionsByText } from '../../src/utils/resultsGrouping'

describe('groupPathways', () => {
  const chains = [
    { zone: 'Office', type: 'Ventilation Deficiency', rootCause: 'Inadequate ventilation rate', evidence: ['CO₂ 1450 ppm'], confidence: 'Moderate' },
    { zone: 'Office', type: 'VOC Source (Hypothesis)', rootCause: 'New materials may be contributing', evidence: ['Odor: Chemical'], confidence: 'Possible' },
    { zone: 'Conference', type: 'Ventilation Deficiency', rootCause: 'Outdoor air damper restriction', evidence: ['CO₂ 1600 ppm', 'Damper closed'], confidence: 'Strong' },
  ]

  it('folds the same pathway across zones into one row that lists both zones', () => {
    const g = groupPathways(chains)
    expect(g.map((x) => x.type)).toEqual(['Ventilation Deficiency', 'VOC Source (Hypothesis)'])
    expect(g[0].zones).toEqual(['Office', 'Conference'])
    expect(g[1].zones).toEqual(['Office'])
  })

  it('keeps the strongest confidence and every distinct hypothesis', () => {
    const g = groupPathways(chains)[0]
    expect(g.confidence).toBe('Strong')
    expect(g.rootCauses).toEqual(['Inadequate ventilation rate', 'Outdoor air damper restriction'])
  })

  it('loses no evidence line: the per-zone detail is carried on the row', () => {
    const g = groupPathways(chains)[0]
    expect(g.byZone).toHaveLength(2)
    expect(g.byZone.flatMap((z) => z.evidence)).toEqual(['CO₂ 1450 ppm', 'CO₂ 1600 ppm', 'Damper closed'])
  })

  it('tolerates an empty or missing input', () => {
    expect(groupPathways(undefined)).toEqual([])
    expect(groupPathways([])).toEqual([])
  })
})

describe('groupSamplingPlan', () => {
  const plan = [
    { zone: 'Office', type: 'Bioaerosol', priority: 'high', hypothesis: 'Visible mold (Moderate)', method: 'Spore trap', controls: 'Outdoor control', standard: 'AIHA' },
    { zone: 'Conference', type: 'Bioaerosol', priority: 'critical', hypothesis: 'Visible mold (Extensive)', method: 'Spore trap', controls: 'Outdoor control', standard: 'AIHA' },
    { zone: 'Office', type: 'Formaldehyde', priority: 'high', hypothesis: 'HCHO 0.12 ppm', method: 'NIOSH 2016', controls: 'Outdoor', standard: 'OSHA' },
  ]

  it('folds the same method across zones and keeps the higher priority', () => {
    const g = groupSamplingPlan(plan)
    expect(g).toHaveLength(2)
    expect(g[0].zones).toEqual(['Office', 'Conference'])
    expect(g[0].priority).toBe('critical')
    expect(g[0].hypotheses).toEqual(['Visible mold (Moderate)', 'Visible mold (Extensive)'])
  })

  it('keeps a different method under the same type as its own row', () => {
    const g = groupSamplingPlan([...plan, { zone: 'Lab', type: 'Bioaerosol', priority: 'medium', hypothesis: 'Musty odor', method: 'Wall cavity', controls: '', standard: '' }])
    expect(g.map((x) => `${x.type}/${x.method}`)).toEqual(['Bioaerosol/Spore trap', 'Formaldehyde/NIOSH 2016', 'Bioaerosol/Wall cavity'])
  })
})

describe('groupActionsByText', () => {
  it('lists each distinct action once with every location it applies to', () => {
    const actions = [
      { scope: 'zone', zoneName: 'Office', text: 'Repair water intrusion source.', affectedZoneIds: [], affectedZoneNames: [] },
      { scope: 'zone', zoneName: 'Office', text: 'Deploy HEPA units.', affectedZoneIds: [], affectedZoneNames: [] },
      { scope: 'zone', zoneName: 'Conference', text: 'Repair water intrusion source.', affectedZoneIds: [], affectedZoneNames: [] },
      { scope: 'equipment', equipmentId: 'AHU-4', text: 'Clean the drain pan.', affectedZoneIds: [], affectedZoneNames: ['Office', 'Conference'] },
      { scope: 'building', text: 'Post occupant notice.', affectedZoneIds: [], affectedZoneNames: [] },
    ]
    const g = groupActionsByText(actions, ['Office', 'Conference'])
    expect(g.map((x) => x.text)).toEqual(['Repair water intrusion source.', 'Deploy HEPA units.', 'Clean the drain pan.', 'Post occupant notice.'])
    expect(g[0].locations).toEqual(['Office', 'Conference'])
    expect(g[1].locations).toEqual(['Office'])
    expect(g[2].locations).toEqual(['AHU-4 (Equipment)', 'Office', 'Conference'])
    expect(g[3].locations).toEqual(['Building-wide'])
  })

  it('accepts the legacy "Zone: text" string shape', () => {
    const g = groupActionsByText(['Office: Replace filters.', 'Conference: Replace filters.', 'Increase outdoor air.'], ['Office', 'Conference'])
    expect(g).toEqual([
      { text: 'Replace filters.', locations: ['Office', 'Conference'], scope: 'zone' },
      { text: 'Increase outdoor air.', locations: ['Building-wide'], scope: 'building' },
    ])
  })
})
