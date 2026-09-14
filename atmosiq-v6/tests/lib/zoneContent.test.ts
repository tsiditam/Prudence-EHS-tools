/**
 * zoneContent — blank-zone detection and position-safe zone removal.
 * See the source header for the finalize gap these close.
 */
import { describe, it, expect } from 'vitest'
import {
  isBlankZone, blankZoneIndices, zoneLabel, removeZoneAt, removeZonesAt,
  hasZoneId, newZoneId, ensureZoneIds, zoneIndexById, resolveProposalZone, appendZoneNote,
  appendZone,
} from '../../src/utils/zoneContent'
import { readFileSync } from 'node:fs'
import { linkableZones } from '../../src/components/sensor/sensorHelpers'

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

describe('zone identity — ensureZoneIds', () => {
  it('stamps a zid on every zone that lacks one and leaves the rest untouched', () => {
    const input = [{}, { zid: 'z-keep', zn: 'Lobby' }, { zn: 'Lab' }]
    const out = ensureZoneIds(input)
    expect(out).toHaveLength(3)
    expect(out.every(hasZoneId)).toBe(true)
    expect(out[1]).toBe(input[1]) // same reference: nothing to do
    expect(out[2]).toMatchObject({ zn: 'Lab' })
    expect(new Set(out.map((z) => z.zid)).size).toBe(3)
  })
  it('returns the same array when every zone already has an id, so a functional setZones is a no-op', () => {
    const input = [{ zid: 'a' }, { zid: 'b' }]
    expect(ensureZoneIds(input)).toBe(input)
  })
  it('does not mutate its input and tolerates holes and non-arrays', () => {
    const input: Array<Record<string, unknown> | null> = [null, {}]
    const out = ensureZoneIds(input)
    expect(input[0]).toBeNull()
    expect(input[1]).toEqual({})
    expect(out.every(hasZoneId)).toBe(true)
    expect(ensureZoneIds(undefined as never)).toEqual([])
  })
  it('treats a blank id as missing', () => {
    expect(hasZoneId({ zid: '  ' })).toBe(false)
    expect(hasZoneId({ zid: 'z-1' })).toBe(true)
    expect(ensureZoneIds([{ zid: '' }])[0].zid).not.toBe('')
  })
  it('mints ids that differ across calls at the same position', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newZoneId(0)))
    expect(ids.size).toBe(50)
  })
  it('ids survive removal of another zone', () => {
    const zones = ensureZoneIds([{ zn: 'A' }, { zn: 'B' }, { zn: 'C' }])
    const next = removeZoneAt({ zones, photos: {}, photoOverrides: {}, equipment: [], curZone: 0 }, 1)
    expect(next.zones.map((z: { zid: string }) => z.zid)).toEqual([zones[0].zid, zones[2].zid])
  })
})

describe('zone identity — resolveProposalZone', () => {
  // The discriminating case. Jasper proposed while Zone A was open; the
  // assessor moved on to Zone B before tapping Accept. The write must land
  // on A, and if A is gone it must land nowhere — never on B because B is
  // what happens to be open.
  const A = { zid: 'z-a', zn: 'Zone A' }
  const B = { zid: 'z-b', zn: 'Zone B' }

  it('lands on the bound zone by id regardless of which zone is open', () => {
    const zones = [A, B]
    expect(resolveProposalZone(zones, { type: 'add_zone_note', zid: 'z-a' })).toBe(0)
    // Position changed (A moved after B): still A.
    expect(resolveProposalZone([B, A], { type: 'add_zone_note', zid: 'z-a' })).toBe(1)
  })
  it('fails closed with no binding — an unbound proposal never falls back to the open zone', () => {
    const zones = [A, B]
    expect(resolveProposalZone(zones, { type: 'add_zone_note' })).toBe(-1)
    expect(resolveProposalZone(zones, { type: 'add_zone_note', zid: '' })).toBe(-1)
    expect(resolveProposalZone(zones, { type: 'add_zone_note', zid: 0 })).toBe(-1)
    expect(resolveProposalZone(zones, null)).toBe(-1)
  })
  it('fails closed when the bound zone has been removed since the proposal', () => {
    const after = removeZoneAt({ zones: [A, B], photos: {}, photoOverrides: {}, equipment: [], curZone: 1 }, 0)
    expect(after.zones).toEqual([B])
    expect(resolveProposalZone(after.zones, { type: 'record_zone_observation', zid: 'z-a' })).toBe(-1)
  })
  it('never matches a zone by name or position', () => {
    // Two zones with the same name: only the id tells them apart.
    const twins = [{ zid: 'z-1', zn: 'Office' }, { zid: 'z-2', zn: 'Office' }]
    expect(resolveProposalZone(twins, { zid: 'z-2' })).toBe(1)
    expect(zoneIndexById(twins, 'Office')).toBe(-1)
    expect(zoneIndexById(twins, '1' as never)).toBe(-1)
  })
})

describe('zone identity — appendZoneNote', () => {
  it('appends on a new line to the zone at idx and nothing else', () => {
    const zones = [{ zid: 'z-a', znt: 'first' }, { zid: 'z-b' }]
    const out = appendZoneNote(zones, 0, '  second  ')
    expect(out[0].znt).toBe('first\nsecond')
    expect(out[1]).toBe(zones[1])
    expect(zones[0].znt).toBe('first') // pure
  })
  it('starts the field when empty and refuses blank text or a bad index', () => {
    const zones = [{ zid: 'z-a' }]
    expect(appendZoneNote(zones, 0, 'note')[0].znt).toBe('note')
    expect(appendZoneNote(zones, 0, '   ')).toBe(zones)
    expect(appendZoneNote(zones, -1, 'note')).toBe(zones)
    expect(appendZoneNote(zones, 1, 'note')).toBe(zones)
  })
})

/**
 * A zone created away from the walkthrough — Logger Studio's "apply these
 * averages to a new zone" — carries its id from the moment it is written.
 *
 * It did not, and the gap was invisible until something else keyed on the
 * id in the same breath: the zone appeared in the assessment correctly and
 * simply could not be selected in the dataset-to-zone association, because
 * `ensureZoneIds` only ran on load and on the add-zone button. "Reopen the
 * draft and it works" is not a behavior, it is a race the assessor loses.
 */
describe('a zone created outside the walkthrough is identified immediately', () => {
  it('mints the id on creation, through the one convention', () => {
    const { zones, index } = appendZone([], 'Break Room')
    expect(index).toBe(0)
    expect(hasZoneId(zones[0])).toBe(true)
    expect(zones[0].zn).toBe('Break Room')
    // The same shape `newZoneId` produces — not a second scheme beside it.
    const shape = new RegExp('^' + newZoneId(0).replace(/[a-z0-9]+/g, '[a-z0-9]+') + '$')
    expect(zones[0].zid).toMatch(shape)
    // Unnamed falls back to the positional label, as it always did.
    expect(appendZone([{ zn: 'A' }], '  ').zones[1].zn).toBe('Zone 2')
    expect(appendZone(null as never, 'X').zones).toHaveLength(1)
  })

  it('is available for dataset linking with no reopen in between', () => {
    // The integration claim, stated against the selector's own projection:
    // what Logger Studio offers as an association target.
    const before = [{ zid: 'z-1', zn: 'Room 214' }]
    expect(linkableZones(before).map((z) => z.zid)).toEqual(['z-1'])
    const { zones, index } = appendZone(before, 'Break Room')
    const offered = linkableZones(zones)
    expect(offered).toHaveLength(2)
    expect(offered[1]).toEqual({ zid: zones[index].zid, name: 'Break Room' })
  })

  it('keeps that id when the draft is reopened', () => {
    const { zones } = appendZone([{ zid: 'z-1', zn: 'Room 214' }], 'Break Room')
    const minted = zones[1].zid
    // Reopening is `setZones(ensureZoneIds(d.zones))` over the stored record.
    const reopened = ensureZoneIds(JSON.parse(JSON.stringify(zones)))
    expect(reopened.map((z: any) => z.zid)).toEqual(['z-1', minted])
    // Nothing to mint, so the guarantee is already met and the array is
    // returned untouched rather than rebuilt.
    expect(ensureZoneIds(zones)).toBe(zones)
  })

  it('never reissues an id an existing zone already carries', () => {
    const existing = [{ zid: 'z-1', zn: 'A' }, { zid: 'z-2', zn: 'B' }]
    const { zones } = appendZone(existing, 'C')
    expect(zones.slice(0, 2)).toEqual(existing)
    expect(zones[0]).toBe(existing[0])
    expect(new Set(zones.map((z: any) => z.zid)).size).toBe(3)
    // A legacy zone with no id of its own is stamped rather than left
    // behind — the same thing its next reopen would have done anyway.
    const mixed = appendZone([{ zn: 'legacy' }], 'C').zones
    expect(mixed.every(hasZoneId)).toBe(true)
  })

  it('is the path applyAveragesToReport actually takes', () => {
    // A source pin: the defect was a bare zone literal pushed onto the list,
    // and nothing about the record afterwards says which path created it.
    const app = readFileSync('src/components/MobileApp.jsx', 'utf8')
    const start = app.indexOf('const applyAveragesToReport')
    const body = app.slice(start, app.indexOf('\n  }\n', start))
    expect(start).toBeGreaterThan(0)
    expect(body).toMatch(/appendZone\(nextZones, newZoneName\)/)
    expect(body).not.toMatch(/nextZones\.push\(/)
  })
})
