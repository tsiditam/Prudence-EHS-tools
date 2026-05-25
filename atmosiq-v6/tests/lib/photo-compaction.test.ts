/**
 * @vitest-environment jsdom
 *
 * Photo Compaction — round-trip + edge cases.
 *
 * compactPhotos: walks the photos object, offloads inline base64
 * blobs to IndexedDB, replaces `src` with `idbId` refs.
 *
 * expandPhotos: the inverse — reads IDB blobs back to data URLs and
 * inlines them as `src`. Missing blobs yield { src: null,
 * _missingBlob: true } so the DOCX renderer's try/catch fallback
 * still produces a graceful "[Photo: <label>]" placeholder.
 *
 * Wire-format invariant: consumers above the storage layer (DOCX,
 * PrintReport, in-app viewer) ALWAYS receive expanded inline shape.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { compactPhotos, expandPhotos, purgeAssessmentPhotos } from '../../src/utils/photoCompaction.js'
import { __test, getPhoto } from '../../src/utils/photoBlobStore.js'

const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const SECOND_DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7+ooooA//2Q=='

beforeEach(() => {
  __test.setBackend(new Map())
})

afterEach(() => {
  __test.reset()
})

describe('compactPhotos', () => {
  it('returns an empty object for null / undefined / non-object input', async () => {
    expect((await compactPhotos(null, 'A-1')).photos).toEqual({})
    expect((await compactPhotos(undefined, 'A-1')).photos).toEqual({})
    expect((await compactPhotos('not-an-object', 'A-1')).photos).toEqual('not-an-object')
  })

  it('offloads inline photos to IndexedDB and replaces them with idbId refs', async () => {
    const photos = {
      'z0-dp': [{ src: SAMPLE_DATA_URL, ts: '2026-05-19T10:00:00Z' }],
      'z0-mi': [{ src: SECOND_DATA_URL, ts: '2026-05-19T10:01:00Z' }],
    }
    const { photos: compact, offloaded, skipped } = await compactPhotos(photos, 'A-1')
    expect(offloaded).toBe(2)
    expect(skipped).toBe(0)
    expect(compact['z0-dp'][0].src).toBeUndefined()
    expect(compact['z0-dp'][0].idbId).toMatch(/^atmosflow:A-1:/)
    expect(compact['z0-dp'][0].ts).toBe('2026-05-19T10:00:00Z')
    expect(compact['z0-mi'][0].idbId).toMatch(/^atmosflow:A-1:/)
    // Photos that share the same id namespace get distinct uuids.
    expect(compact['z0-dp'][0].idbId).not.toBe(compact['z0-mi'][0].idbId)
  })

  it('does not double-offload already-compact photos', async () => {
    const photos = {
      'z0-dp': [
        { src: SAMPLE_DATA_URL, ts: '2026-05-19T10:00:00Z' },
        { idbId: 'atmosflow:A-1:existing', ts: '2026-05-19T09:00:00Z' },
      ],
    }
    const { photos: compact, offloaded } = await compactPhotos(photos, 'A-1')
    expect(offloaded).toBe(1)
    // The pre-existing idbId is preserved verbatim
    expect(compact['z0-dp'][1].idbId).toBe('atmosflow:A-1:existing')
  })

  it('preserves the input object (no mutation)', async () => {
    const photos = { 'z0-dp': [{ src: SAMPLE_DATA_URL, ts: 't' }] }
    const snapshot = JSON.parse(JSON.stringify(photos))
    await compactPhotos(photos, 'A-1')
    expect(photos).toEqual(snapshot)
  })

  it('passes through unknown photo shapes without throwing', async () => {
    const photos = { 'z0-dp': [{ url: 'not-our-shape' }, null, 42 as unknown] }
    const { photos: compact, offloaded, skipped } = await compactPhotos(photos, 'A-1')
    expect(offloaded).toBe(0)
    expect(skipped).toBe(0)
    // null is dropped (no `if (!photo) continue` push); 42 passes through.
    expect(compact['z0-dp']).toContainEqual({ url: 'not-our-shape' })
  })
})

describe('expandPhotos', () => {
  it('round-trips compactPhotos → expandPhotos (data URLs survive)', async () => {
    const photos = {
      'z0-dp': [{ src: SAMPLE_DATA_URL, ts: '2026-05-19T10:00:00Z' }],
    }
    const { photos: compact } = await compactPhotos(photos, 'A-1')
    const { photos: expanded, expanded: nExpanded, missing } = await expandPhotos(compact)
    expect(nExpanded).toBe(1)
    expect(missing).toBe(0)
    expect(expanded['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
    expect(expanded['z0-dp'][0].ts).toBe('2026-05-19T10:00:00Z')
    expect(expanded['z0-dp'][0].idbId).toBeUndefined()
  })

  it('passes inline photos through unchanged', async () => {
    const photos = { 'z0-dp': [{ src: SAMPLE_DATA_URL, ts: 't' }] }
    const { photos: expanded, expanded: nExpanded, missing } = await expandPhotos(photos)
    expect(nExpanded).toBe(0)
    expect(missing).toBe(0)
    expect(expanded['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
  })

  it('marks photos as missing when the IDB blob has been purged', async () => {
    // Reference an id that was never put in the store.
    const photos = {
      'z0-dp': [{ idbId: 'atmosflow:A-1:ghost', ts: '2026-05-19T10:00:00Z' }],
    }
    const { photos: expanded, expanded: nExpanded, missing } = await expandPhotos(photos)
    expect(nExpanded).toBe(0)
    expect(missing).toBe(1)
    expect(expanded['z0-dp'][0].src).toBeNull()
    expect(expanded['z0-dp'][0]._missingBlob).toBe(true)
  })

  it('handles mixed inline + compact photos in the same array', async () => {
    const inline = { 'z0-dp': [{ src: SAMPLE_DATA_URL, ts: 't' }] }
    const { photos: compactOnly } = await compactPhotos(inline, 'A-1')
    const mixed = {
      'z0-dp': [
        compactOnly['z0-dp'][0],
        { src: SECOND_DATA_URL, ts: 't2' },
      ],
    }
    const { photos: expanded, expanded: nExpanded } = await expandPhotos(mixed)
    expect(nExpanded).toBe(1)
    expect(expanded['z0-dp'][0].src).toBe(SAMPLE_DATA_URL)
    expect(expanded['z0-dp'][1].src).toBe(SECOND_DATA_URL)
  })
})

describe('purgeAssessmentPhotos', () => {
  it('removes every blob keyed under the assessment id', async () => {
    const photos = {
      'z0-dp': [{ src: SAMPLE_DATA_URL, ts: 't1' }],
      'z0-mi': [{ src: SECOND_DATA_URL, ts: 't2' }],
    }
    const { photos: compact } = await compactPhotos(photos, 'A-1')
    // Sanity — both blobs exist before purge.
    const id1 = compact['z0-dp'][0].idbId
    const id2 = compact['z0-mi'][0].idbId
    expect(await getPhoto(id1)).not.toBeNull()
    expect(await getPhoto(id2)).not.toBeNull()

    const n = await purgeAssessmentPhotos('A-1')
    expect(n).toBe(2)
    expect(await getPhoto(id1)).toBeNull()
    expect(await getPhoto(id2)).toBeNull()
  })

  it('does not touch photos belonging to a different assessment', async () => {
    const photosA = { 'z0-dp': [{ src: SAMPLE_DATA_URL, ts: 't' }] }
    const photosB = { 'z0-dp': [{ src: SECOND_DATA_URL, ts: 't' }] }
    const { photos: cA } = await compactPhotos(photosA, 'A-1')
    const { photos: cB } = await compactPhotos(photosB, 'B-2')
    await purgeAssessmentPhotos('A-1')
    expect(await getPhoto(cB['z0-dp'][0].idbId)).not.toBeNull()
    expect(await getPhoto(cA['z0-dp'][0].idbId)).toBeNull()
  })
})
