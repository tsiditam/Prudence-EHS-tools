// @vitest-environment jsdom
/**
 * photoCompaction — capture-time API added for the IndexedDB photo move
 * (audit 2026-09 §6): storePhoto / resolvePhotoSrc / rekeyPhotos, and the
 * expandPhotos fix that keeps aiAnalysis on an expanded record.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { storePhoto, resolvePhotoSrc, rekeyPhotos, expandPhotos, photoInlineSrc } from '../../src/utils/photoCompaction'
import { __test as blobStore, getPhoto } from '../../src/utils/photoBlobStore'
import { reportStorageWrite, __resetStorageWarning } from '../../src/components/ui/storageToast'
import { vi } from 'vitest'

const toasts: string[] = []
vi.mock('sonner', () => ({ toast: { error: (m: string) => { toasts.push(m) }, info: () => {}, success: () => {}, warning: () => {} } }))

const DATA_URL = 'data:image/jpeg;base64,' + Buffer.from('hello-photo').toString('base64')

let store: Map<string, Blob>
beforeEach(() => { store = new Map(); blobStore.setBackend(store); toasts.length = 0; __resetStorageWarning() })
afterEach(() => blobStore.reset())

describe('storePhoto / resolvePhotoSrc', () => {
  it('stores under the assessment namespace and resolves back to a data URL', async () => {
    const id = await storePhoto(DATA_URL, 'draft-1')
    expect(id).toMatch(/^atmosflow:draft-1:/)
    expect(store.has(id!)).toBe(true)
    const url = await resolvePhotoSrc({ idbId: id })
    expect(url).toBe(DATA_URL)
  })

  it('passes inline records through and returns null for unknown ids', async () => {
    expect(await resolvePhotoSrc({ src: DATA_URL })).toBe(DATA_URL)
    expect(await resolvePhotoSrc(DATA_URL)).toBe(DATA_URL)
    expect(await resolvePhotoSrc({ idbId: 'atmosflow:x:missing' })).toBeNull()
    expect(photoInlineSrc({ idbId: 'a' })).toBeNull()
  })

  it('returns null for a non data-URL', async () => {
    expect(await storePhoto('not-a-data-url', 'd')).toBeNull()
  })
})

describe('rekeyPhotos', () => {
  it('copies draft-namespaced blobs under the report id and leaves the rest alone', async () => {
    const id = await storePhoto(DATA_URL, 'draft-1')
    const photos = {
      'z0-dp': [{ idbId: id, ts: 't', aiAnalysis: { confidence: 'high' } }, { src: DATA_URL, ts: 't2' }],
      'z1-mi': [{ idbId: 'atmosflow:rpt-1:already', ts: 't3' }],
    }
    const { photos: out, moved } = await rekeyPhotos(photos, 'rpt-1')
    expect(moved).toBe(1)
    expect(out['z0-dp'][0].idbId).toMatch(/^atmosflow:rpt-1:/)
    expect(out['z0-dp'][0].aiAnalysis).toEqual({ confidence: 'high' })
    expect(out['z0-dp'][1]).toEqual({ src: DATA_URL, ts: 't2' })
    expect(out['z1-mi'][0].idbId).toBe('atmosflow:rpt-1:already')
    // The new blob exists; the old one is left for the draft purge.
    expect(await getPhoto(out['z0-dp'][0].idbId)).toBeTruthy()
    expect(await getPhoto(id!)).toBeTruthy()
  })

  it('keeps a ref whose blob cannot be read', async () => {
    const { photos: out, moved } = await rekeyPhotos({ 'z0-dp': [{ idbId: 'atmosflow:draft-1:gone', ts: 't' }] }, 'rpt-1')
    expect(moved).toBe(0)
    expect(out['z0-dp'][0].idbId).toBe('atmosflow:draft-1:gone')
  })
})

describe('expandPhotos keeps record metadata', () => {
  it('carries aiAnalysis onto the expanded record', async () => {
    const id = await storePhoto(DATA_URL, 'd')
    const { photos } = await expandPhotos({ 'z0-dp': [{ idbId: id, ts: 't', aiAnalysis: { confidence: 'low' } }] })
    expect(photos['z0-dp'][0]).toEqual({ src: DATA_URL, ts: 't', aiAnalysis: { confidence: 'low' } })
  })
})

describe('reportStorageWrite (quota toast)', () => {
  it('toasts once per run of failures and re-arms after a success', () => {
    expect(reportStorageWrite(true)).toBe(true)
    expect(reportStorageWrite(false, 'draft')).toBe(false)
    expect(reportStorageWrite(false, 'draft')).toBe(false)
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatch(/storage is full/i)
    expect(toasts[0]).toMatch(/draft/)
    reportStorageWrite(true)
    reportStorageWrite(false, 'report')
    expect(toasts).toHaveLength(2)
  })
})
