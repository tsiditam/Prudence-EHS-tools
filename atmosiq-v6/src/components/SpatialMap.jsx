/**
 * AtmosFlow Spatial Intelligence Layer — Floor Plan Mapping
 * Non-blocking, retrospective zone mapping with AIHA color-coded pins.
 * 100% optional — assessment is valid without mapping.
 */

import { useState, useRef } from 'react'
import { I } from './Icons'

const CARD = '#111318', BORDER = '#1C1E26', ACCENT = '#22D3EE'
const TEXT = '#ECEEF2', SUB = '#8B93A5', DIM = '#6B7380', BG = '#07080C'

const PIN_COLORS = { critical: '#EF4444', high: '#FB923C', moderate: '#FBBF24', low: '#22C55E' }
function pinColor(score) {
  if (score === null || score === undefined) return DIM
  if (score < 50) return PIN_COLORS.critical
  if (score < 80) return PIN_COLORS.moderate
  return PIN_COLORS.low
}

export default function SpatialMap({ zones, zoneScores, floorPlan, onUpdateZone, onUploadFloorPlan, onClose }) {
  const [selectedPin, setSelectedPin] = useState(null)
  const [dragging, setDragging] = useState(null)
  const mapRef = useRef(null)

  const mapped = zones.filter(z => z.mapX != null && z.mapY != null)
  const unmapped = zones.filter(z => z.mapX == null || z.mapY == null)

  const handleMapClick = (e) => {
    if (dragging === null) return
    e.preventDefault()
    e.stopPropagation()
    const rect = mapRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : (e.changedTouches ? e.changedTouches[0].clientX : e.clientX)
    const clientY = e.touches ? e.touches[0].clientY : (e.changedTouches ? e.changedTouches[0].clientY : e.clientY)
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    onUpdateZone(dragging, { mapX: Math.round(x * 10) / 10, mapY: Math.round(y * 10) / 10 })
    setDragging(null)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUploadFloorPlan(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const getTopFindings = (zi) => {
    const zs = zoneScores?.[zi]
    if (!zs) return []
    return zs.cats.flatMap(c => c.r.filter(r => r.sev !== 'pass' && r.sev !== 'info'))
      .sort((a, b) => { const o = { critical: 0, high: 1, medium: 2, low: 3 }; return (o[a.sev] ?? 9) - (o[b.sev] ?? 9) })
      .slice(0, 3)
  }

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back to Results</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Spatial Risk Map</div>
          <div style={{ fontSize: 11, color: SUB }}>Optional — drag zones onto the floor plan</div>
        </div>
      </div>

      {/* Floor Plan Upload */}
      {!floorPlan && (
        <div style={{ padding: 32, background: CARD, border: `2px dashed ${BORDER}`, borderRadius: 12, textAlign: 'center', marginBottom: 16 }}>
          <I n="bldg" s={32} c={DIM} w={1.4} />
          <div style={{ fontSize: 14, fontWeight: 600, color: SUB, marginTop: 12 }}>Upload Floor Plan</div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 4, marginBottom: 16 }}>PNG, JPG, or PDF of the building layout</div>
          <label style={{ padding: '10px 24px', background: ACCENT, border: 'none', borderRadius: 8, color: '#000', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Choose File
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Map Area */}
      {floorPlan && (
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div
            ref={mapRef}
            onClick={handleMapClick}
            onTouchEnd={handleMapClick}
            style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}`, cursor: dragging !== null ? 'crosshair' : 'default', touchAction: 'none' }}
          >
            <img src={floorPlan} alt="Floor plan" style={{ width: '100%', display: 'block', opacity: 0.85 }} />

            {/* Pins */}
            {zones.map((z, zi) => {
              if (z.mapX == null || z.mapY == null) return null
              const score = zoneScores?.[zi]?.tot
              const color = pinColor(score)
              return (
                <div
                  key={zi}
                  onClick={(e) => { e.stopPropagation(); setSelectedPin(selectedPin === zi ? null : zi) }}
                  style={{ position: 'absolute', left: `${z.mapX}%`, top: `${z.mapY}%`, transform: 'translate(-50%, -100%)', cursor: 'pointer', zIndex: 10 }}
                >
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: `0 2px 8px ${color}80`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', fontFamily: "'DM Mono'" }}>{score ?? '?'}</span>
                  </div>
                  <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${color}`, margin: '-1px auto 0' }} />
                </div>
              )
            })}
          </div>

          {/* Dragging indicator */}
          {dragging !== null && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: ACCENT, fontWeight: 600 }}>
              Tap the map to place "{zones[dragging]?.zn || `Zone ${dragging + 1}`}"
            </div>
          )}
        </div>
      )}

      {/* Pin Detail Modal */}
      {selectedPin !== null && zoneScores?.[selectedPin] && (
        <div style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{zones[selectedPin]?.zn}</div>
            <span style={{ fontSize: 18, fontWeight: 800, color: pinColor(zoneScores[selectedPin].tot), fontFamily: "'DM Mono'" }}>{zoneScores[selectedPin].tot}/100</span>
          </div>
          <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>Top Risk Factors</div>
          {getTopFindings(selectedPin).map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: SUB, marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${pinColor(f.sev === 'critical' ? 0 : f.sev === 'high' ? 50 : 80)}` }}>{f.t}</div>
          ))}
          {getTopFindings(selectedPin).length === 0 && <div style={{ fontSize: 11, color: DIM, fontStyle: 'italic' }}>No significant findings</div>}
          <button onClick={() => setSelectedPin(null)} style={{ marginTop: 8, background: 'none', border: 'none', color: ACCENT, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Close</button>
        </div>
      )}

      {/* Unmapped Zones */}
      {floorPlan && unmapped.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Unmapped Zones</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unmapped.map((z, i) => {
              const zi = zones.indexOf(z)
              const score = zoneScores?.[zi]?.tot
              return (
                <button key={zi} onClick={() => setDragging(zi)} style={{ padding: '6px 14px', borderRadius: 20, background: dragging === zi ? `${ACCENT}20` : CARD, border: `1px solid ${dragging === zi ? ACCENT : BORDER}`, color: dragging === zi ? ACCENT : TEXT, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: pinColor(score) }} />
                  {z.zn || `Zone ${zi + 1}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>AIHA Risk Thresholds</div>
        <div style={{ display: 'flex', gap: 16, fontSize: 10, color: SUB }}>
          {[{ c: PIN_COLORS.low, l: 'Low Risk (80–100)' }, { c: PIN_COLORS.moderate, l: 'Moderate (50–79)' }, { c: PIN_COLORS.critical, l: 'Critical (<50)' }].map(item => (
            <div key={item.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.c }} />
              {item.l}
            </div>
          ))}
        </div>
      </div>

      {/* Skip notice */}
      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: DIM }}>
        Mapping is optional. Your assessment is complete and valid without it.
      </div>
    </div>
  )
}

export { pinColor }
