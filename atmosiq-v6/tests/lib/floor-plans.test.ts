/**
 * @vitest-environment jsdom
 *
 * Floor plans as a list — migration, where a pin sits, and the image store.
 *
 * An assessment used to carry one `floorPlan` data URL with every zone's
 * mapX/mapY implicitly on it. It now carries `floorPlans`, and a pin names
 * its plan. Nothing rewrites a stored record: every reader normalizes, so a
 * legacy record and a new one look the same downstream. Images live in
 * IndexedDB under the assessment's photo namespace (utils/floorPlans.js).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
// @ts-ignore js
import { LEGACY_PLAN_ID, normalizeFloorPlans, resolvePlanId, planLabel, clearPinsOnPlan, storeFloorPlanImage, compactFloorPlans, expandFloorPlans, offloadFloorPlans, rekeyFloorPlans } from '../../src/utils/floorPlans.js'
import { __test, getPhoto } from '../../src/utils/photoBlobStore.js'
import { purgeAssessmentPhotos } from '../../src/utils/photoCompaction.js'
// @ts-ignore js
import { hasDraftContent } from '../../src/utils/draftContent.js'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

beforeEach(() => { __test.setBackend(new Map()) })
afterEach(() => { __test.reset() })

describe('normalizeFloorPlans reads either shape', () => {
  it('a legacy single plan is a one-item list under the legacy id', () => {
    expect(normalizeFloorPlans({ floorPlan: PNG })).toEqual([{ id: LEGACY_PLAN_ID, label: '', image: PNG, idbId: null }])
    // The export path's composed figure rides along.
    const composed = { imageDataUrl: PNG, width: 400, height: 300, pinsDrawn: true }
    expect(normalizeFloorPlans({ floorPlan: composed })[0].composed).toBe(composed)
  })

  it('a record with no plan, or a plan that is not an image, has none', () => {
    expect(normalizeFloorPlans({})).toEqual([])
    expect(normalizeFloorPlans(null)).toEqual([])
    expect(normalizeFloorPlans({ floorPlan: null })).toEqual([])
    expect(normalizeFloorPlans({ floorPlan: 'not-an-image' })).toEqual([])
    expect(normalizeFloorPlans({ floorPlan: { url: 'fp' } })).toEqual([])
  })

  it('the list shape wins over the legacy field, and is sanitized', () => {
    const plans = normalizeFloorPlans({
      floorPlan: PNG,
      floorPlans: [{ id: 'a', label: 'Level 1', image: PNG }, { id: 'a', label: 'dup id', idbId: 'atmosflow:x:1' }, null, { image: 'junk' }],
    })
    expect(plans.map(p => p.id)).toEqual(['a', 'a-2', 'plan-4'])
    expect(plans[0]).toEqual({ id: 'a', label: 'Level 1', image: PNG, idbId: null })
    expect(plans[1].idbId).toBe('atmosflow:x:1')
    expect(plans[2].image).toBeNull()
  })

  it('names a plan by its label, else by position — but only when there is a choice', () => {
    expect(planLabel({ label: 'Mezzanine' }, 0, 1)).toBe('Mezzanine')
    expect(planLabel({ label: '  ' }, 0, 1)).toBe('Floor plan')
    expect(planLabel({}, 1, 3)).toBe('Plan 2')
  })
})

describe('where a pin sits', () => {
  const PLANS = [{ id: 'l1' }, { id: 'l2' }]

  it('an unassigned pin is on the first plan; an assigned one on its own; a stale one on none', () => {
    expect(resolvePlanId(undefined, PLANS)).toBe('l1')
    expect(resolvePlanId(null, PLANS)).toBe('l1')
    expect(resolvePlanId('l2', PLANS)).toBe('l2')
    expect(resolvePlanId('gone', PLANS)).toBeNull()
    expect(resolvePlanId('l1', [])).toBeNull()
  })

  it('removing a plan lifts exactly the pins on it, in one pass, without mutating the inputs', () => {
    const zones = [
      { zn: 'A', mapX: 10, mapY: 10 },                  // unassigned → first plan
      { zn: 'B', mapX: 20, mapY: 20, mapPlan: 'l2' },
      { zn: 'C', mapX: 30, mapY: 30, mapPlan: 'l1' },
      { zn: 'D' },
    ]
    const building = { fn: 'Site', outdoorMapX: 5, outdoorMapY: 95, outdoorMapPlan: 'l1' }
    const out = clearPinsOnPlan(zones, building, 'l1', PLANS)
    expect(out.zones.map(z => z.mapX ?? null)).toEqual([null, 20, null, null])
    expect(out.zones[0].mapPlan).toBeNull()
    expect(out.zones[1]).toBe(zones[1]) // untouched, same object
    expect(out.building).toEqual({ fn: 'Site', outdoorMapX: null, outdoorMapY: null, outdoorMapPlan: null })
    expect(zones[0].mapX).toBe(10)
    expect(building.outdoorMapX).toBe(5)
    // Removing the other plan leaves the outdoor reference alone.
    expect(clearPinsOnPlan(zones, building, 'l2', PLANS).building).toBe(building)
  })
})

describe('the image store', () => {
  it('stores under the assessment namespace, compacts to a ref, expands back to the image', async () => {
    const idbId = await storeFloorPlanImage(PNG, 'draft-1')
    expect(idbId).toMatch(/^atmosflow:draft-1:/)
    const inMemory = [{ id: 'p1', label: 'L1', image: PNG, idbId }]
    const onDisk = compactFloorPlans(inMemory)
    expect(onDisk).toEqual([{ id: 'p1', label: 'L1', idbId }])
    const back = await expandFloorPlans(onDisk)
    expect(back[0].image).toBe(PNG)
    expect(back[0].idbId).toBe(idbId)
  })

  it('a plan with no ref stays inline on disk (IndexedDB unavailable), and a missing blob says so', async () => {
    const inline = [{ id: 'p1', label: '', image: PNG, idbId: null }]
    expect(compactFloorPlans(inline)).toEqual(inline)
    const gone = await expandFloorPlans([{ id: 'p2', label: '', idbId: 'atmosflow:draft-1:missing' }])
    expect(gone[0].image).toBeNull()
    expect(gone[0]._missingBlob).toBe(true)
  })

  it('offloads a cloud record’s inline images and leaves refs alone', async () => {
    const out = await offloadFloorPlans([{ id: 'p1', label: '', image: PNG }, { id: 'p2', label: '', idbId: 'atmosflow:a:1' }], 'rpt-9')
    expect(out[0].idbId).toMatch(/^atmosflow:rpt-9:/)
    expect(out[0].image).toBe(PNG)
    expect(out[1].idbId).toBe('atmosflow:a:1')
    expect(await getPhoto(out[0].idbId)).toBeTruthy()
  })

  it('re-keys under the report id so the draft purge does not take the plan with it', async () => {
    const idbId = await storeFloorPlanImage(PNG, 'draft-1')
    const moved = await rekeyFloorPlans([{ id: 'p1', label: '', idbId }], 'rpt-1')
    expect(moved[0].idbId).toMatch(/^atmosflow:rpt-1:/)
    await purgeAssessmentPhotos('draft-1')
    expect(await getPhoto(idbId)).toBeNull()
    expect(await getPhoto(moved[0].idbId)).toBeTruthy()
    // Already under the report id: untouched.
    expect(await rekeyFloorPlans(moved, 'rpt-1')).toEqual(moved)
  })
})

describe('a plan counts as draft content in either shape', () => {
  it('list or legacy', () => {
    expect(hasDraftContent({ floorPlans: [{ id: 'p1' }] })).toBe(true)
    expect(hasDraftContent({ floorPlan: PNG })).toBe(true)
    expect(hasDraftContent({ floorPlans: [] })).toBe(false)
  })
})
