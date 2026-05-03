/**
 * AtmosFlow engine v2.8.0 — HVAC equipment-scoped recommendations.
 *
 * Acceptance criteria (from the v2.8.0 PR spec):
 *   1. Two zones served by the same AHU produce ONE drain-pan
 *      action labeled to the AHU with both zones under "Affects:".
 *   2. Two zones served by DIFFERENT AHUs produce TWO drain-pan
 *      actions, each labeled to its own AHU.
 *   3. A zone with unmapped equipment triggers a building-scoped
 *      fallback action prefixed "HVAC equipment not yet identified —".
 *   4. The mixed case (some zones mapped, some unmapped) emits both
 *      equipment-scoped actions for mapped zones and a building-scoped
 *      fallback for unmapped zones.
 *   5. Zone-scoped actions remain per-zone (NIOSH IEQ, IICRC S500
 *      water-damage, occupant relocation, clearance criteria).
 *   6. Building-scoped tail actions (preventive HVAC maintenance,
 *      periodic reassessment) are emitted exactly once.
 *   7. The Recommendations object shape is the new
 *      RecommendationAction[] (each action has scope/text/affectedZoneIds).
 *   8. Renderer normalization (groupActions) groups by equipment label
 *      with affectedZoneNames carried for the "Affects:" line.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { genRecs } from '../../src/engines/scoring.js'
import { groupActions, normalizeAction } from '../../src/utils/recFormatting.js'

// Two zones with drain-pan + filter + symptom-cluster + water findings,
// both served by the same AHU. Mirrors the screenshots from the v2.7
// duplicate-recs report at Meridian Commerce Tower.
function meridianFixture(equipmentTopology: 'shared-ahu' | 'split-ahu' | 'unmapped' | 'mixed') {
  const baseFindings = (zoneName: string) => ({
    zoneName,
    cats: [
      // Drain pan critical → triggers drainpan_immediate (equipment) +
      // drainpan_clean (equipment) + legionella_188 (equipment)
      { l: 'HVAC', r: [{ t: 'Drain pan: standing water — Critical', sev: 'critical' }] },
      // Filter issue high → triggers filter_replace_imm + filter_replace_high
      { l: 'HVAC', r: [{ t: 'Filter condition: heavily loaded — High', sev: 'high' }] },
      // Maintenance overdue medium → triggers comprehensive_hvac_overdue
      { l: 'HVAC', r: [{ t: 'HVAC maintenance overdue', sev: 'medium' }] },
      // OA delivery high → triggers oa_damper
      { l: 'Ventilation', r: [{ t: 'OA delivery rate below ASHRAE 62.1', sev: 'high' }] },
      // Symptom cluster (Complaints category, sev high) → zone-scoped
      // HEPA + ATSDR + relocation. These must remain per-zone.
      { l: 'Complaints', r: [{ t: 'Occupant symptom cluster', sev: 'high' }] },
      // Water + leak → zone-scoped IICRC S500 action.
      { l: 'Environment', r: [{ t: 'Active water leak observed', sev: 'critical' }] },
    ],
  })

  const zoneScores = [baseFindings('3rd Floor Open Office'), baseFindings('Conference Room B')]
  const zones: any[] = [
    { zid: 'z-3f', zn: '3rd Floor Open Office', servingEquipmentIds: [] },
    { zid: 'z-cb', zn: 'Conference Room B', servingEquipmentIds: [] },
  ]
  let equipment: any[] = []

  if (equipmentTopology === 'shared-ahu') {
    equipment = [{ id: 'eq-ahu-1', label: 'AHU-1', type: 'AHU', servedZoneIds: ['z-3f', 'z-cb'] }]
    zones[0].servingEquipmentIds = ['eq-ahu-1']
    zones[1].servingEquipmentIds = ['eq-ahu-1']
  } else if (equipmentTopology === 'split-ahu') {
    equipment = [
      { id: 'eq-ahu-1', label: 'AHU-1', type: 'AHU', servedZoneIds: ['z-3f'] },
      { id: 'eq-ahu-2', label: 'AHU-2', type: 'AHU', servedZoneIds: ['z-cb'] },
    ]
    zones[0].servingEquipmentIds = ['eq-ahu-1']
    zones[1].servingEquipmentIds = ['eq-ahu-2']
  } else if (equipmentTopology === 'mixed') {
    equipment = [{ id: 'eq-ahu-1', label: 'AHU-1', type: 'AHU', servedZoneIds: ['z-3f'] }]
    zones[0].servingEquipmentIds = ['eq-ahu-1']
    zones[1].servingEquipmentIds = []
  }
  // 'unmapped' leaves both zones with [] and equipment empty.

  return { zoneScores, zones, equipment, bldg: {} }
}

const drainPanText = 'Clean drain pan, treat with EPA-registered biocide, and verify proper slope and condensate disposal.'
const drainPanImmediateText = 'Address drain pan condition immediately. Evaluate for microbial growth.'
const ashrae188Text = 'Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If building lacks a Water Management Program, consider Legionella sampling given active occupant respiratory symptoms.'
const oaDamperText = 'Evaluate outdoor air delivery rate and verify OA damper position within 24–72 hours.'
const niosh = 'Document affected occupants using NIOSH IEQ questionnaire or equivalent structured symptom instrument.'
const iicrc500 = 'Repair water intrusion source. Assess affected materials within 48 hours per IICRC S500.'

describe('Engine v2.8.0 — equipment-scoped recommendations', () => {
  it('AC#1 two zones same AHU → ONE drain-pan action labeled to AHU with both zones in Affects', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('shared-ahu')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    const drainPanActions = recs.imm.filter((a: any) => a.text === drainPanText)
    expect(drainPanActions.length).toBe(1)
    expect(drainPanActions[0].scope).toBe('equipment')
    expect(drainPanActions[0].equipmentId).toBe('eq-ahu-1')
    expect(drainPanActions[0].equipmentLabel).toBe('AHU-1')
    expect(new Set(drainPanActions[0].affectedZoneNames)).toEqual(new Set(['3rd Floor Open Office', 'Conference Room B']))
  })

  it('AC#2 two zones served by DIFFERENT AHUs → TWO drain-pan actions, one per AHU', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('split-ahu')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    const drainPanActions = recs.imm.filter((a: any) => a.text === drainPanText)
    expect(drainPanActions.length).toBe(2)
    const labels = drainPanActions.map((a: any) => a.equipmentLabel).sort()
    expect(labels).toEqual(['AHU-1', 'AHU-2'])
    for (const a of drainPanActions) {
      expect(a.scope).toBe('equipment')
      expect(a.affectedZoneNames.length).toBe(1)
    }
  })

  it('AC#3 unmapped zones → single building-scoped fallback prefixed "HVAC equipment not yet identified —"', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('unmapped')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    const fallback = recs.imm.find((a: any) =>
      a.scope === 'building' && a.text.startsWith('HVAC equipment not yet identified —') && a.text.endsWith(drainPanText)
    )
    expect(fallback).toBeDefined()
    expect(new Set(fallback.affectedZoneNames)).toEqual(new Set(['3rd Floor Open Office', 'Conference Room B']))
    // No equipment-scoped actions when nothing is mapped
    const equipScoped = recs.imm.filter((a: any) => a.scope === 'equipment')
    expect(equipScoped.length).toBe(0)
  })

  it('AC#4 mixed mapping → equipment-scoped for mapped + fallback for unmapped', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('mixed')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    const equipScoped = recs.imm.filter((a: any) => a.scope === 'equipment' && a.text === drainPanText)
    expect(equipScoped.length).toBe(1)
    expect(equipScoped[0].equipmentLabel).toBe('AHU-1')
    expect(equipScoped[0].affectedZoneNames).toEqual(['3rd Floor Open Office'])
    const fallback = recs.imm.find((a: any) =>
      a.scope === 'building' && a.text.startsWith('HVAC equipment not yet identified —') && a.text.endsWith(drainPanText)
    )
    expect(fallback).toBeDefined()
    expect(fallback.affectedZoneNames).toEqual(['Conference Room B'])
  })

  it('AC#5 zone-scoped actions (NIOSH IEQ, IICRC S500, relocation, clearance) remain per-zone', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('shared-ahu')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    // NIOSH IEQ documentation surfaces in adm — one per zone
    const nioshActions = recs.adm.filter((a: any) => a.text === niosh)
    expect(nioshActions.length).toBe(2)
    expect(new Set(nioshActions.map((a: any) => a.zoneName))).toEqual(new Set(['3rd Floor Open Office', 'Conference Room B']))
    for (const a of nioshActions) expect(a.scope).toBe('zone')
    // IICRC S500 in imm — one per zone
    const s500 = recs.imm.filter((a: any) => a.text === iicrc500)
    expect(s500.length).toBe(2)
    for (const a of s500) expect(a.scope).toBe('zone')
  })

  it('AC#6 building-scoped tail (preventive HVAC, periodic reassessment) emitted once', () => {
    const { zoneScores, zones, equipment } = meridianFixture('shared-ahu')
    const recs = genRecs(zoneScores, { hm: 'Unknown' }, { zones, equipment })
    const preventive = recs.adm.filter((a: any) => a.scope === 'building' && a.text === 'Establish preventive HVAC maintenance schedule.')
    const reassessment = recs.mon.filter((a: any) => a.scope === 'building' && a.text === 'Conduct periodic reassessment to verify corrective action effectiveness.')
    expect(preventive.length).toBe(1)
    expect(reassessment.length).toBe(1)
  })

  it('AC#7 every action carries scope/text/affectedZoneIds in the new shape', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('shared-ahu')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    for (const bucket of ['imm', 'eng', 'adm', 'mon'] as const) {
      for (const a of recs[bucket]) {
        expect(typeof a).toBe('object')
        expect(['zone', 'equipment', 'building']).toContain(a.scope)
        expect(typeof a.text).toBe('string')
        expect(Array.isArray(a.affectedZoneIds)).toBe(true)
        if (a.scope === 'equipment') expect(a.equipmentId).toBeTruthy()
        if (a.scope === 'zone') expect(a.zoneId).toBeTruthy()
      }
    }
  })

  it('AC#8 groupActions renders one equipment header with bullets + Affects line', () => {
    const { zoneScores, zones, equipment, bldg } = meridianFixture('shared-ahu')
    const recs = genRecs(zoneScores, bldg, { zones, equipment })
    const groups = groupActions(recs.imm, ['3rd Floor Open Office', 'Conference Room B'])
    const ahuGroup = groups.find(g => g.scope === 'equipment' && g.label === 'AHU-1 (Equipment)')
    expect(ahuGroup).toBeDefined()
    expect(ahuGroup!.actions.length).toBeGreaterThanOrEqual(2) // drainpan_immediate + drainpan_clean (+ filter_replace_imm)
    // Affected zone names merge across all equipment-scoped actions in the group
    expect(new Set(ahuGroup!.affectedZoneNames)).toEqual(new Set(['3rd Floor Open Office', 'Conference Room B']))
    // Sort order: zone groups first, then equipment, then building
    const scopes = groups.map(g => g.scope)
    const firstEq = scopes.indexOf('equipment')
    const firstBuilding = scopes.indexOf('building')
    const lastZone = scopes.lastIndexOf('zone')
    if (firstEq !== -1 && lastZone !== -1) expect(lastZone).toBeLessThan(firstEq)
    if (firstBuilding !== -1 && firstEq !== -1) expect(firstEq).toBeLessThan(firstBuilding)
  })
})

describe('Engine v2.8.0 — backward-compatible normalization', () => {
  it('normalizeAction parses legacy "ZoneName: text" strings to zone-scoped objects', () => {
    const a = normalizeAction('Conference Room B: Arrest water intrusion. Assess materials within 48 hours.', ['3rd Floor Open Office', 'Conference Room B'])
    expect(a.scope).toBe('zone')
    expect(a.zoneName).toBe('Conference Room B')
    expect(a.text).toBe('Arrest water intrusion. Assess materials within 48 hours.')
  })

  it('normalizeAction does not mistake citations like "29 CFR 1910.1048:" for zone prefixes', () => {
    const a = normalizeAction('29 CFR 1910.1048: implement controls.')
    expect(a.scope).toBe('building')
  })

  it('normalizeAction is idempotent on already-objectified actions', () => {
    const obj = { scope: 'equipment' as const, text: 'Clean drain pan', equipmentId: 'eq-1', equipmentLabel: 'AHU-1', affectedZoneIds: ['z-1'] }
    const a = normalizeAction(obj as any)
    expect(a).toBe(obj)
  })

  it('groupActions handles a mixed string/object array (legacy + new) without crashing', () => {
    const mixed = [
      'Conference Room B: Arrest water intrusion.',
      { scope: 'equipment', text: 'Clean drain pan', equipmentId: 'eq-1', equipmentLabel: 'AHU-1', affectedZoneIds: ['z-1', 'z-2'], affectedZoneNames: ['3rd Floor Open Office', 'Conference Room B'] },
      'Conduct periodic reassessment.',
    ]
    const groups = groupActions(mixed, ['3rd Floor Open Office', 'Conference Room B'])
    expect(groups.length).toBe(3)
    expect(groups[0].scope).toBe('zone')
    expect(groups[1].scope).toBe('equipment')
    expect(groups[2].scope).toBe('building')
  })
})
