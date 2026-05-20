/**
 * @vitest-environment jsdom
 *
 * Photo Blob Store — IndexedDB CRUD.
 *
 * Uses the __test.setBackend(map) injection point to swap the real
 * IndexedDB for an in-memory Map, matching the established pattern
 * from CLAUDE.md ("each handler exports __test = { setX(mock),
 * reset() }"). No fake-indexeddb dep needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { putPhoto, getPhoto, deletePhoto, deletePhotosByPrefix, blobToDataUrl, dataUrlToBlob, __test } from '../../src/utils/photoBlobStore.js'

const SAMPLE_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

beforeEach(() => {
  __test.setBackend(new Map())
})

afterEach(() => {
  __test.reset()
})

describe('photoBlobStore CRUD', () => {
  it('round-trips put → get → blobToDataUrl', async () => {
    const blob = dataUrlToBlob(SAMPLE_DATA_URL)
    expect(blob).not.toBeNull()
    expect(await putPhoto('abc', blob!)).toBe(true)
    const out = await getPhoto('abc')
    expect(out).not.toBeNull()
    const restored = await blobToDataUrl(out!)
    expect(restored).toBe(SAMPLE_DATA_URL)
  })

  it('getPhoto returns null for unknown ids', async () => {
    expect(await getPhoto('does-not-exist')).toBeNull()
  })

  it('deletePhoto removes a stored blob', async () => {
    const blob = dataUrlToBlob(SAMPLE_DATA_URL)!
    await putPhoto('xyz', blob)
    expect(await getPhoto('xyz')).not.toBeNull()
    expect(await deletePhoto('xyz')).toBe(true)
    expect(await getPhoto('xyz')).toBeNull()
  })

  it('deletePhotosByPrefix removes only matching ids', async () => {
    const blob = dataUrlToBlob(SAMPLE_DATA_URL)!
    await putPhoto('atmosflow:A:1', blob)
    await putPhoto('atmosflow:A:2', blob)
    await putPhoto('atmosflow:B:1', blob)
    const n = await deletePhotosByPrefix('atmosflow:A:')
    expect(n).toBe(2)
    expect(await getPhoto('atmosflow:A:1')).toBeNull()
    expect(await getPhoto('atmosflow:A:2')).toBeNull()
    expect(await getPhoto('atmosflow:B:1')).not.toBeNull()
  })

  it('rejects null/empty ids and blobs gracefully', async () => {
    expect(await putPhoto('', new Blob())).toBe(false)
    expect(await putPhoto('id', null as unknown as Blob)).toBe(false)
    expect(await getPhoto('')).toBeNull()
    expect(await deletePhoto('')).toBe(false)
    expect(await deletePhotosByPrefix('')).toBe(0)
  })
})

describe('dataUrlToBlob / blobToDataUrl', () => {
  it('decodes a base64 data URL into a Blob with the right MIME type', () => {
    const b = dataUrlToBlob(SAMPLE_DATA_URL)
    expect(b).not.toBeNull()
    expect(b!.type).toBe('image/png')
    expect(b!.size).toBeGreaterThan(0)
  })

  it('returns null for non-data-URL strings', () => {
    expect(dataUrlToBlob('not-a-data-url')).toBeNull()
    expect(dataUrlToBlob('')).toBeNull()
    expect(dataUrlToBlob(undefined as unknown as string)).toBeNull()
  })
})
