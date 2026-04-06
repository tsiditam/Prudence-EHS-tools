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
 */

import { useRef } from 'react'
export default function PhotoCapture({ photos, onAdd, onRemove, isDesktop }) {
  const fileRef = useRef(null)
  const thumbSize = isDesktop ? 80 : 64
  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX = 400; let w = img.width, h = img.height
        if (w > MAX) { h = h * MAX / w; w = MAX } if (h > MAX) { w = w * MAX / h; h = MAX }
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        onAdd({ src: canvas.toDataURL('image/jpeg', 0.7), ts: new Date().toISOString() })
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file); e.target.value = ''
  }
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(photos || []).map((p, i) => {
          const src = typeof p === 'string' ? p : p.src, ts = typeof p === 'object' ? p.ts : null
          return (
            <div key={i} style={{ position: 'relative', width: thumbSize, height: thumbSize, borderRadius: 8, overflow: 'hidden', border: '1px solid #1A2030', transition: 'transform 0.2s ease' }}
              onMouseEnter={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1)' }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {ts && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000A', padding: '1px 3px', fontSize: 7, color: '#C8D0DC', textAlign: 'center' }}>{new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>}
              <button onClick={() => onRemove(i)} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: '#EF4444', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer' }}>x</button>
            </div>
          )
        })}
        <button onClick={() => fileRef.current?.click()} style={{ width: thumbSize, height: thumbSize, borderRadius: 8, border: '1.5px dashed #2A3040', background: 'transparent', color: '#5E6578', fontSize: 20, cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={e => { if (isDesktop) { e.target.style.borderColor = '#22D3EE'; e.target.style.color = '#22D3EE' } }}
          onMouseLeave={e => { if (isDesktop) { e.target.style.borderColor = '#2A3040'; e.target.style.color = '#5E6578' } }}>
          📷
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}
