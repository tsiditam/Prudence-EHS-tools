// @vitest-environment jsdom
/**
 * PhotoCapture — photos go to IndexedDB, ids go to state (audit 2026-09 §6).
 *
 * jsdom has no canvas or image decoding, so the capture pipeline is
 * stubbed at Image / canvas and the blob store is given its in-memory
 * test backend. Pins:
 *   • onAdd receives { idbId, ts } and the blob is in the store
 *   • onAdd falls back to { src, ts } when the store is unavailable
 *   • thumbnails render an <img> for both record shapes (id resolved)
 *   • thumbnails are keyed by record, so removing the first photo keeps
 *     the second one's DOM node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { __test as blobStore } from '../../src/utils/photoBlobStore'
import { __clearPhotoSrcCache } from '../../src/hooks/usePhotoSrc'

vi.mock('../../src/utils/photoAnalysis', () => ({ analyzePhoto: vi.fn().mockResolvedValue(null) }))

import PhotoCapture, { PhotoThumb } from '../../src/components/PhotoCapture'

const DATA_URL = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

let store: Map<string, Blob>
const origImage = globalThis.Image
const origGetContext = HTMLCanvasElement.prototype.getContext
const origToDataURL = HTMLCanvasElement.prototype.toDataURL

beforeEach(() => {
  store = new Map()
  blobStore.setBackend(store)
  __clearPhotoSrcCache()
  // Image: fire onload as soon as src is set.
  class FakeImage {
    width = 800; height = 600; onload: null | (() => void) = null
    set src(_v: string) { queueMicrotask(() => this.onload && this.onload()) }
  }
  ;(globalThis as unknown as { Image: unknown }).Image = FakeImage
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage() {} })) as never
  HTMLCanvasElement.prototype.toDataURL = () => DATA_URL
})
afterEach(() => {
  cleanup()
  blobStore.reset()
  ;(globalThis as unknown as { Image: unknown }).Image = origImage
  HTMLCanvasElement.prototype.getContext = origGetContext
  HTMLCanvasElement.prototype.toDataURL = origToDataURL
})

function pickFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('PhotoCapture', () => {
  it('stores the blob in IndexedDB and hands back an id, not base64', async () => {
    const onAdd = vi.fn()
    const { container } = render(<PhotoCapture photos={[]} onAdd={onAdd} onRemove={() => {}} assessmentId="draft-42" />)
    pickFile(container)
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const rec = onAdd.mock.calls[0][0]
    expect(rec.src).toBeUndefined()
    expect(rec.idbId).toMatch(/^atmosflow:draft-42:/)
    expect(typeof rec.ts).toBe('string')
    expect(store.has(rec.idbId)).toBe(true)
    expect(store.get(rec.idbId)!.type).toBe('image/jpeg')
  })

  it('falls back to the inline shape when the store is unavailable', async () => {
    blobStore.reset() // real IndexedDB — absent in jsdom → putPhoto resolves false
    const onAdd = vi.fn()
    const { container } = render(<PhotoCapture photos={[]} onAdd={onAdd} onRemove={() => {}} assessmentId="draft-42" />)
    pickFile(container)
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1))
    const rec = onAdd.mock.calls[0][0]
    expect(rec.idbId).toBeUndefined()
    expect(rec.src).toBe(DATA_URL)
  })

  it('renders thumbnails for id records and inline records alike', async () => {
    store.set('atmosflow:d:1', new Blob(['abc'], { type: 'image/jpeg' }))
    render(
      <PhotoCapture
        photos={[{ idbId: 'atmosflow:d:1', ts: '2026-09-04T10:00:00Z' }, { src: DATA_URL, ts: '2026-09-04T10:01:00Z' }]}
        onAdd={() => {}} onRemove={() => {}} assessmentId="d"
      />,
    )
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    const [a, b] = screen.getAllByRole('img') as HTMLImageElement[]
    expect(a.src.startsWith('data:image/jpeg')).toBe(true)
    expect(b.src).toBe(DATA_URL)
  })

  it('keys thumbnails by record so removing the first keeps the second node', async () => {
    const photos = [{ idbId: 'atmosflow:d:1', ts: 't1' }, { idbId: 'atmosflow:d:2', ts: 't2' }]
    store.set('atmosflow:d:1', new Blob(['a'], { type: 'image/jpeg' }))
    store.set('atmosflow:d:2', new Blob(['b'], { type: 'image/jpeg' }))
    const { rerender } = render(<PhotoCapture photos={photos} onAdd={() => {}} onRemove={() => {}} assessmentId="d" />)
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    const second = screen.getByRole('button', { name: 'Remove photo 2' }).parentElement
    rerender(<PhotoCapture photos={[photos[1]]} onAdd={() => {}} onRemove={() => {}} assessmentId="d" />)
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Remove photo 1' }).parentElement).toBe(second)
  })

  it('PhotoThumb resolves an id record to a data URL', async () => {
    store.set('atmosflow:d:9', new Blob(['zzz'], { type: 'image/png' }))
    render(<PhotoThumb photo={{ idbId: 'atmosflow:d:9' }} alt="thumb" />)
    const img = await screen.findByRole('img', { name: 'thumb' }) as HTMLImageElement
    expect(img.src.startsWith('data:image/png')).toBe(true)
  })
})
