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
 * Move 4b — Photo capture now records the device's geolocation at
 * capture time and attaches it to the photo metadata. The coordinates
 * survive through the storage layer and render in the DOCX caption,
 * so finding photos carry a courtroom-defensible "where + when"
 * audit trail. Existing JPEGs without GPS (legacy assessments) render
 * unchanged.
 *
 * EXIF stripping is already implicit: the canvas re-encode at
 * toDataURL('image/jpeg') drops every EXIF tag from the source file
 * (device serial, owner metadata, original timestamps, etc.). No
 * piexifjs needed.
 */

import { useRef, useState, useCallback } from 'react'
import { captureGpsReading, formatGpsCoord } from '../utils/gpsFormat'

export default function PhotoCapture({ photos, onAdd, onRemove, isDesktop }) {
  const fileRef = useRef(null)
  const [capturing, setCapturing] = useState(false)
  const thumbSize = isDesktop ? 80 : 64

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCapturing(true)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const canvas = document.createElement('canvas')
        const MAX = 400
        let w = img.width
        let h = img.height
        if (w > MAX) { h = h * MAX / w; w = MAX }
        if (h > MAX) { w = w * MAX / h; h = MAX }
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        // Capture GPS in parallel with the canvas encode. Both
        // complete before we hand off to the parent — slight delay
        // (~1-3s typical) but trades latency for one-shot capture
        // of the location reading. Always resolves (never rejects);
        // returns null when geolocation is denied / unavailable.
        const [src, gps] = await Promise.all([
          Promise.resolve(canvas.toDataURL('image/jpeg', 0.7)),
          captureGpsReading(),
        ])
        const photo = { src, ts: new Date().toISOString() }
        if (gps) photo.gps = gps
        onAdd(photo)
        setCapturing(false)
      }
      img.onerror = () => setCapturing(false)
      img.src = ev.target.result
    }
    reader.onerror = () => setCapturing(false)
    reader.readAsDataURL(file)
    e.target.value = ''
  }, [onAdd])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(photos || []).map((p, i) => {
          const src = typeof p === 'string' ? p : p.src
          const ts = typeof p === 'object' ? p.ts : null
          const gps = typeof p === 'object' ? p.gps : null
          const gpsLabel = gps ? formatGpsCoord(gps.lat, gps.lng, gps.accuracy) : null
          return (
            <div key={i} style={{ position: 'relative', width: thumbSize, height: thumbSize, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', transition: 'transform 0.2s ease' }}
              onMouseEnter={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { if (isDesktop) e.currentTarget.style.transform = 'scale(1)' }}>
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {ts && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000A', padding: '1px 3px', fontSize: 7, color: '#C8D0DC', textAlign: 'center' }}>
                  {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              {gpsLabel && (
                <div
                  title={gpsLabel}
                  aria-label={`Geotagged: ${gpsLabel}`}
                  style={{ position: 'absolute', top: 2, left: 2, width: 14, height: 14, borderRadius: '50%', background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
              )}
              <button onClick={() => onRemove(i)} aria-label="Remove photo" style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', background: 'var(--danger)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer' }}>x</button>
            </div>
          )
        })}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={capturing}
          aria-label={capturing ? 'Capturing photo' : 'Add photo'}
          style={{ width: thumbSize, height: thumbSize, borderRadius: 8, border: '1.5px dashed #2A3040', background: 'transparent', color: 'var(--dim)', fontSize: 20, cursor: capturing ? 'wait' : 'pointer', transition: 'all 0.2s', opacity: capturing ? 0.5 : 1 }}
          onMouseEnter={e => { if (isDesktop && !capturing) { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--accent)' } }}
          onMouseLeave={e => { if (isDesktop && !capturing) { e.target.style.borderColor = '#2A3040'; e.target.style.color = 'var(--dim)' } }}>
          {capturing ? '…' : '📷'}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}
