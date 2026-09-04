/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 *
 * Play 1 (multimodal photo analysis) — when a photo is captured, the
 * component (a) immediately calls onAdd with the photo so the
 * walkthrough UI is non-blocking, then (b) fires a background call
 * to /api/photo-analyze and, on success, calls onAnalyze with the
 * AI screening output. The parent merges that analysis onto the
 * stored photo metadata.
 *
 * The analysis path is best-effort: rate limit, offline, server error,
 * or unparseable model output all resolve to null — the photo still
 * saves, the walkthrough continues, the consultant DOCX simply omits
 * the AI-screening block under that photo. Screening-only positioning
 * (CLAUDE.md) is preserved: every analysis renders downstream with
 * "AI-PROPOSED · IH REVIEW REQUIRED" framing.
 *
 * Storage (audit 2026-09 §6). The 400 px JPEG is written to IndexedDB
 * (src/utils/photoBlobStore.js) and the record handed to `onAdd` is
 * `{ idbId, ts }` — an id and metadata, not base64. That keeps a
 * fifty-photo assessment out of React state and out of the localStorage
 * quota. When IndexedDB is unavailable the record falls back to the
 * legacy `{ src, ts }` shape, so nothing is worse than before. Thumbnails
 * resolve ids through usePhotoSrc; exports expand them with
 * photoCompaction.expandPhotos.
 */

import { useRef, useState } from 'react'
import { analyzePhoto } from '../utils/photoAnalysis'
import { storePhoto } from '../utils/photoCompaction'
import { usePhotoSrc } from '../hooks/usePhotoSrc'

/** A thumbnail for a photo record of either shape. */
export function PhotoThumb({ photo, size = 48, alt = '', style }) {
  const src = usePhotoSrc(photo)
  if (!src) {
    return (
      <div aria-hidden="true" style={{ width: size, height: size, borderRadius: 6, background: 'var(--surface)', flexShrink: 0, ...style }} />
    )
  }
  return <img src={src} alt={alt} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, flexShrink: 0, ...style }} />
}

function photoKey(p, i) {
  if (p && typeof p === 'object') return p.idbId || p.ts || `i${i}`
  return `i${i}`
}

export default function PhotoCapture({ photos, onAdd, onAnalyze, onRemove, isDesktop, analysisContext, assessmentId }) {
  const fileRef = useRef(null)
  const [analyzingIdx, setAnalyzingIdx] = useState(null)
  const thumbSize = isDesktop ? 80 : 64

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const MAX = 400; let w = img.width, h = img.height
        if (w > MAX) { h = h * MAX / w; w = MAX } if (h > MAX) { w = w * MAX / h; h = MAX }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const src = canvas.toDataURL('image/jpeg', 0.7)
        const ts = new Date().toISOString()
        // The parent appends the photo at its tail position; we use that
        // index for the deferred analysis callback.
        const nextIdx = (photos || []).length
        // Blob to IndexedDB, id to state. Falls back to the inline shape
        // when the store is unavailable (private browsing, quota).
        let idbId = null
        try { idbId = await storePhoto(src, assessmentId) } catch { idbId = null }
        onAdd(idbId ? { idbId, ts } : { src, ts })
        if (onAnalyze) {
          setAnalyzingIdx(nextIdx)
          analyzePhoto(src, { context: analysisContext })
            .then((analysis) => {
              if (analysis) onAnalyze(nextIdx, analysis)
            })
            .catch(() => { /* best-effort; null already returned */ })
            .finally(() => setAnalyzingIdx((current) => current === nextIdx ? null : current))
        }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file); e.target.value = ''
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(photos || []).map((p, i) => {
          const ts = p && typeof p === 'object' ? p.ts : null
          const ana = p && typeof p === 'object' ? p.aiAnalysis : null
          const isAnalyzing = analyzingIdx === i
          return (
            // Keyed by the record (idbId / timestamp), not the index: with
            // index keys, removing a middle photo re-associated the
            // remaining thumbnails with the wrong records.
            <div key={photoKey(p, i)} style={{ position: 'relative', width: thumbSize, height: thumbSize, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', transition: 'transform 0.2s ease' }}
              onMouseEnter={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1)' }}>
              <PhotoThumb photo={p} size={thumbSize} alt={`Photo ${i + 1}${ts ? ` taken ${new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`} style={{ width: '100%', height: '100%', borderRadius: 0 }} />
              {ts && <div aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000A', padding: '1px 3px', fontSize: 7, color: '#C8D0DC', textAlign: 'center' }}>{new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
              {ana && (
                <div
                  title={`AI screening: ${ana.confidence} confidence · IH review required`}
                  aria-label={`AI screening analysis present, ${ana.confidence} confidence`}
                  style={{ position: 'absolute', top: 2, left: 2, padding: '1px 5px', borderRadius: 8, background: '#7C3AED', color: '#FFFFFF', fontSize: 7, fontWeight: 700, letterSpacing: '0.3px', boxShadow: '0 0 0 1px rgba(0,0,0,0.35)' }}>
                  AI
                </div>
              )}
              {isAnalyzing && !ana && (
                <div
                  title="AI screening in progress"
                  aria-label="AI screening in progress"
                  style={{ position: 'absolute', top: 2, left: 2, padding: '1px 5px', borderRadius: 8, background: 'rgba(0,0,0,0.5)', color: '#FFFFFF', fontSize: 7, fontWeight: 700, letterSpacing: '0.3px' }}>
                  …
                </div>
              )}
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove photo ${i + 1}`} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--danger)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer' }}>x</button>
            </div>
          )
        })}
        <button type="button" onClick={() => fileRef.current?.click()} aria-label="Add photo" style={{ width: thumbSize, height: thumbSize, borderRadius: 8, border: '1.5px dashed #2A3040', background: 'transparent', color: 'var(--dim)', fontSize: 20, cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => { if (isDesktop) { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--accent)' } }}
          onMouseLeave={e => { if (isDesktop) { e.target.style.borderColor = '#2A3040'; e.target.style.color = 'var(--dim)' } }}>
          📷
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} aria-label="Take or choose a photo" style={{ display: 'none' }} />
    </div>
  )
}
