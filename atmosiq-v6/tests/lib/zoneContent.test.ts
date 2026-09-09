/**
 * zoneContent — blank-zone detection and position-safe zone removal.
 * See the source header for the finalize gap these close.
 */
import { describe, it, expect } from 'vitest'
import { isBlankZone, blankZoneIndices, zoneLabel, removeZoneAt, removeZonesAt } from '../../src/utils/zoneContent'

const OUTDOOR = ['co2o', 'tfo', 'rho', 'pmo', 'tvo']

describe('isBlankZone', () => {
  it('treats the seeded {} as blank', () => {
    expect(isBlankZone({}, OUTDOOR)).toBe(true)
    expect(isBlankZone(null, OUTDOOR)).toBe(true)
  })
  it('ignores the structural keys the app stamps without the assessor typing', () => {
    expect(isBlankZone({ zid: 'z-abc-1', servingEquipmentIds: [] }, OUTDOOR)).toBe(true)
  })
  it('ignores outdoor baselines propagated into every zone', () => {
    expect(isBlankZone({ co2o: '420', tfo: '70', rho: '45' }, OUTDOOR)).toBe(true)
  })
  it('is not blank once anything is recorded — a name, a reading, a choice, a photo-less note', () => {
    expect(isBlankZone({ zn: 'Room 1' }, OUTDOOR)).toBe(false)
    expect(isBlankZone({ co2: '900' }, OUTDOOR)).toBe(false)
    expect(isBlankZone({ cx: 'No complaints' }, OUTDOOR)).toBe(false)
    expect(isBlankZone({ sy: ['Headache'] }, OUTDOOR)).toBe(false)
    expect(isBlankZone({ oc: 0 }, OUTDOOR)).toBe(false) // a zero is an answer
  })
  it('does not count an equipment mapping alone as a survey', () => {
    expect(isBlankZone({ zid: 'z-1', servingEquipmentIds: ['eq-1'] }, OUTDOOR)).toBe(true)
  })
  it('whitespace-only text is blank', () => {
    expect(isBlankZone({ zn: '   ' }, OUTDOOR)).toBe(true)
  })
})

describe('blankZoneIndices / zoneLabel', () => {
  it('lists the blank positions and labels by name or position', () => {
    const zones = [{ zn: 'Lobby' }, {}, { zn: '' , co2o: '420' }, { zn: 'Lab' }]
    expect(blankZoneIndices(zones, OUTDOOR)).toEqual([1, 2])
    expect(zoneLabel(zones, 0)).toBe('Lobby')
    expect(zoneLabel(zones, 1)).toBe('Zone 2')
    expect(zoneLabel(zones, 2)).toBe('Zone 3')
  })
})

describe('removeZoneAt', () => {
  const state = () => ({
    zones: [{ zn: 'A', zid: 'za' }, { zn: 'B', zid: 'zb' }, { zn: 'C', zid: 'zc' }],
    photos: { 'z0-dp': [{ src: 'a' }], 'z1-wd': [{ src: 'b' }], 'z2-mi': [{ src: 'c' }], 'z2-dp': [{ src: 'c2' }] },
    photoOverrides: { A: { reason: 'r' }, B: { reason: 'r' } },
    equipment: [{ id: 'eq1', servedZoneIds: ['za', 'zb'] }, { id: 'eq2', servedZoneIds: ['zc'] }],
    curZone: 2,
  })

  it('re-keys photos of every later zone down one slot and drops the removed slot', () => {
    const next = removeZoneAt(state(), 1)
    expect(next.zones.map((z) => z.zn)).toEqual(['A', 'C'])
    expect(Object.keys(next.photos).sort()).toEqual(['z0-dp', 'z1-dp', 'z1-mi'])
    expect(next.photos['z1-mi']).toEqual([{ src: 'c' }])
    expect(next.photos['z1-dp']).toEqual([{ src: 'c2' }])
  })

  it('prunes the zone id from equipment and its name from overrides', () => {
    const next = removeZoneAt(state(), 1)
    expect(next.equipment[0].servedZoneIds).toEqual(['za'])
    expect(next.equipment[1].servedZoneIds).toEqual(['zc'])
    expect(next.photoOverrides).toEqual({ A: { reason: 'r' } })
  })

  it('keeps a name-keyed override when another zone still bears the name', () => {
    const s = state(); s.zones[2] = { zn: 'B', zid: 'zc' }
    const next = removeZoneAt(s, 1)
    expect(next.photoOverrides).toEqual({ A: { reason: 'r' }, B: { reason: 'r' } })
  })

  it('slides the current pointer down when a zone before it is removed', () => {
    expect(removeZoneAt(state(), 1).curZone).toBe(1)
    expect(removeZoneAt(state(), 0).curZone).toBe(1)
  })

  it('clamps the pointer when the current (last) zone is the one removed', () => {
    expect(removeZoneAt(state(), 2).curZone).toBe(1)
  })

  it('leaves the pointer alone when a later zone is removed', () => {
    const s = state(); s.curZone = 0
    expect(removeZoneAt(s, 2).curZone).toBe(0)
  })

  it('refuses to remove the last remaining zone or an out-of-range index', () => {
    const one = { zones: [{ zn: 'A' }], photos: {}, photoOverrides: {}, equipment: [], curZone: 0 }
    expect(removeZoneAt(one, 0)).toBe(one)
    expect(removeZoneAt(state(), 5)).toEqual(state())
    expect(removeZoneAt(state(), -1)).toEqual(state())
  })

  it('does not mutate its input', () => {
    const s = state(); const snap = JSON.stringify(s)
    removeZoneAt(s, 1)
    expect(JSON.stringify(s)).toBe(snap)
  })
})

describe('removeZonesAt', () => {
  it('removes several indices in one pass with photos re-keyed consistently', () => {
    const s = {
      zones: [{ zn: 'A' }, {}, { zn: 'C' }, {}, { zn: 'E' }],
      photos: { 'z0-dp': ['a'], 'z2-dp': ['c'], 'z4-dp': ['e'] },
      photoOverrides: {}, equipment: [], curZone: 4,
    }
    const next = removeZonesAt(s, [1, 3])
    expect(next.zones.map((z) => z.zn)).toEqual(['A', 'C', 'E'])
    expect(next.photos).toEqual({ 'z0-dp': ['a'], 'z1-dp': ['c'], 'z2-dp': ['e'] })
    expect(next.curZone).toBe(2)
  })
  it('tolerates duplicates and unsorted input', () => {
    const s = { zones: [{ zn: 'A' }, {}, {}], photos: {}, photoOverrides: {}, equipment: [], curZone: 0 }
    expect(removeZonesAt(s, [2, 1, 2]).zones).toEqual([{ zn: 'A' }])
  })
})
