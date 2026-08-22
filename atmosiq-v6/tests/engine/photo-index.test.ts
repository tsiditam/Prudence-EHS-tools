/**
 * Assessment photos are keyed by zone INDEX; overrides by zone NAME.
 *
 * `src/engines/validation.js` read photos as `photos[zoneName]`. Nothing has
 * ever written that shape — the walkthrough writes `photos['z0-wd']` — so the
 * HARD blocker "Critical/High finding without photo" fired for every zone with
 * a serious finding regardless of how many photos the assessor had taken. The
 * only way to clear it was to file a "photo capture not feasible" override,
 * which is the opposite of what the gate exists to do.
 *
 * The gate WAS partly covered — `finalization-gate-v27.test.ts` asserts that
 * a critical finding with no photos blocks, and that an override clears it.
 * Both pass `photos: {}`, so neither ever performed a lookup. The one case
 * nobody wrote is the only case the defect touched: **the assessor took a
 * photo, so the gate should pass**. It is asserted below.
 *
 * Several other fixtures carry a name-keyed `photos: { 'Zone 1': [...] }` and
 * look like coverage, but their zone scores hold no critical or high finding,
 * so the blocker path is never entered and the shape never mattered. A fixture
 * that cannot reach the code it appears to exercise is worse than none: it
 * reads as protection. Those have been moved to the real shape.
 *
 * This file asserts against the shape the APP writes, taken from
 * `MobileApp.jsx`'s `q.photo` branch.
 */
import { describe, it, expect } from 'vitest'

import { parsePhotoKey, photosForZone, zoneHasPhotos, photoCaption } from '../../src/utils/photoIndex.js'
import { validateAssessment } from '../../src/engines/validation.js'

/** The literal shape MobileApp writes: `photos[\`z${curZone}-${q.id}\`]`. */
const APP_SHAPE = {
  'z0-wd': [{ src: 'data:image/jpeg;base64,AAAA', ts: 1 }],
  'z1-mi': [{ src: 'data:image/jpeg;base64,BBBB', ts: 2 }, { src: 'data:image/jpeg;base64,CCCC', ts: 3 }],
}

describe('the key shape the app actually writes', () => {
  it('parses zone index and field id', () => {
    expect(parsePhotoKey('z0-wd')).toEqual({ zoneIndex: 0, fieldId: 'wd' })
    expect(parsePhotoKey('z12-dp')).toEqual({ zoneIndex: 12, fieldId: 'dp' })
  })

  it('rejects anything that is not that shape', () => {
    // 'Zone 1' is the shape the broken gate and its tests believed in.
    for (const bad of ['Zone 1', 'zone-1-wd', 'z-1-wd', 'wd', '', null, undefined, 42]) {
      expect(parsePhotoKey(bad as never), `${String(bad)} should not parse`).toBeNull()
    }
  })

  it('collects every photo in a zone across its question groups', () => {
    expect(photosForZone(APP_SHAPE, 0)).toHaveLength(1)
    expect(photosForZone(APP_SHAPE, 1)).toHaveLength(2)
    expect(photosForZone(APP_SHAPE, 2)).toHaveLength(0)
    expect(photosForZone(APP_SHAPE, 1).map((p) => p.fieldId)).toEqual(['mi', 'mi'])
  })

  it('captions from the question the assessor answered, not the raw key', () => {
    // The report rendered `titleCaseKey('z1-mi')` — literally "Mi".
    const caption = photoCaption('z1-mi', [{ zn: 'Lobby' }, { zn: 'Suite 200' }])
    expect(caption).toContain('Suite 200')
    expect(caption).not.toBe('Mi')
    expect(caption!.length).toBeGreaterThan('Mi'.length)
  })

  it('falls back to a positional zone name when the zone is unnamed', () => {
    expect(photoCaption('z2-wd', [])).toContain('Zone 3')
  })
})

describe('the Critical/High photo-evidence blocker', () => {
  const criticalZone = (zoneName: string) => ({
    zoneName,
    cats: [{ l: 'Contaminants', r: [{ t: 'CO exceeds PEL', sev: 'critical' }] }],
  })

  const build = (photos: Record<string, unknown>) => validateAssessment({
    building: { fn: 'Test Site' },
    presurvey: { ps_assessor: 'J. Smith, CIH', ps_recipient_name: 'A. Client', ps_recipient_role: 'FM' },
    zones: [{ zn: 'Zone A', oc: '10', ac: '2' }],
    zoneScores: [criticalZone('Zone A')],
    photos,
    photoOverrides: {},
  } as never) as { hardBlockers: Array<{ id: string }> }

  const photoBlockers = (r: { hardBlockers: Array<{ id: string }> }) =>
    r.hardBlockers.filter((b) => b.id.startsWith('photo_'))

  it('does NOT fire when the zone has a photo in the shape the app writes', () => {
    // This is the assertion that fails if the lookup reverts to photos[zoneName].
    expect(photoBlockers(build({ 'z0-wd': [{ src: 'x', ts: 1 }] }))).toEqual([])
  })

  it('fires when the zone genuinely has no photo', () => {
    expect(photoBlockers(build({}))).toHaveLength(1)
  })

  it('is not satisfied by a photo belonging to a different zone', () => {
    expect(photoBlockers(build({ 'z1-wd': [{ src: 'x', ts: 1 }] }))).toHaveLength(1)
  })

  it('is not satisfied by the name-keyed shape nothing writes', () => {
    // Guards the guard: if someone "helpfully" restores name-key support, the
    // gate goes back to passing on data no assessment contains.
    expect(photoBlockers(build({ 'Zone A': [{ id: 'p1' }] }))).toHaveLength(1)
  })
})
