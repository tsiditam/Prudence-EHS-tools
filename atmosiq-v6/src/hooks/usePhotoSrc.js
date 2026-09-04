/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * usePhotoSrc — turn a photo record into something an <img> can show.
 *
 * Since photos moved out of React state into IndexedDB (audit 2026-09 §6),
 * a record in `photos[key]` is `{ idbId, ts, aiAnalysis? }` — an id, not
 * the image. Thumbnails resolve it here; the data URL is cached per id so
 * a list of forty thumbnails does not hit IndexedDB on every re-render.
 * Legacy inline records (`{ src: 'data:…' }`) and bare strings pass
 * straight through.
 */

import { useEffect, useState } from 'react'
import { resolvePhotoSrc, photoInlineSrc } from '../utils/photoCompaction'

const MAX_CACHE = 200
const cache = new Map()

function remember(id, url) {
  if (!id || !url) return
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
  cache.set(id, url)
}

export function usePhotoSrc(photo) {
  const inline = photoInlineSrc(photo)
  const idbId = photo && typeof photo === 'object' ? photo.idbId || null : null
  const [src, setSrc] = useState(() => inline || (idbId && cache.get(idbId)) || null)

  useEffect(() => {
    if (inline) { setSrc(inline); return undefined }
    if (!idbId) { setSrc(null); return undefined }
    if (cache.has(idbId)) { setSrc(cache.get(idbId)); return undefined }
    let alive = true
    resolvePhotoSrc(photo).then((url) => {
      if (!alive) return
      remember(idbId, url)
      setSrc(url)
    })
    return () => { alive = false }
    // `photo` identity is not a dependency on purpose — only the id and the
    // inline source decide what is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inline, idbId])

  return src
}

/** Test hook. */
export function __clearPhotoSrcCache() { cache.clear() }

export default usePhotoSrc
