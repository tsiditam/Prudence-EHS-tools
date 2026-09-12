/**
 * AtmosFlow Spatial Layer — sampling locations on the floor plan.
 *
 * The assessor marks WHERE each set of readings was taken. Pins are numbered
 * in the order a reader meets them and are identical in appearance; the list
 * beneath the plan is the key. Nothing here states a conclusion.
 *
 * This screen used to colour each pin by the worst finding severity in the
 * zone and print the zone's finding count inside the marker, under the title
 * "Spatial Risk Map", with a "Top Risk Factors" panel on tap. That made the
 * site drawing a fourth restatement of a verdict the results hero, the
 * findings table and the pathway tab had already given, against this
 * project's rule that a verdict is stated once per surface. It also left the
 * pin number unable to be the key that resolves to the list, because it was
 * already a census. Retired 2026-09; the reasoning and the shared derivation
 * live in utils/samplePoints.js.
 *
 * 100% optional — the assessment is valid without mapping.
 */

import { useState, useRef } from 'react'
import { I } from './Icons'
import { mix } from '../utils/theme'
import { samplePoints, hasOutdoorBaseline, OUTDOOR_LABEL } from '../utils/samplePoints'

const CARD = 'var(--card)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'
const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)'

// One neutral marker for every location. Colour is not an encoding here, so
// identity rests on the number and the list, which also survives grayscale
// print and a colour-blind reader.
const PIN = ACCENT
const PIN_INK = 'var(--on-accent-fill)'

const zoneLabel = (z, i) => (z && z.zn) || `Zone ${i + 1}`

export default function SpatialMap({ zones = [], floorPlan, building = {}, onUpdateZone, onUpdateBuilding, onUploadFloorPlan, onClose }) {
  const [selected, setSelected] = useState(null) // pin number
  const [placing, setPlacing] = useState(null)   // {kind:'zone',index} | {kind:'outdoor'}
  const [lastTouch, setLastTouch] = useState(null)
  const mapRef = useRef(null)

  const points = samplePoints(zones, { building })
  const unplacedZones = zones.map((z, i) => ({ z, i })).filter(({ z }) => !z || z.mapX == null || z.mapY == null)
  const outdoorPlaceable = hasOutdoorBaseline(zones) && (building.outdoorMapX == null || building.outdoorMapY == null)
  const selectedPoint = points.find((p) => p.n === selected) || null

  const placingLabel = !placing ? '' : placing.kind === 'outdoor' ? OUTDOOR_LABEL : zoneLabel(zones[placing.index], placing.index)

  const commit = (x, y) => {
    if (!placing) return
    if (placing.kind === 'outdoor') onUpdateBuilding({ outdoorMapX: x, outdoorMapY: y })
    else onUpdateZone(placing.index, { mapX: x, mapY: y })
    setPlacing(null)
    setLastTouch(null)
  }

  const placeAt = (clientX, clientY) => {
    if (!placing || !mapRef.current) return
    const rect = mapRef.current.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    commit(Math.round(x * 10) / 10, Math.round(y * 10) / 10)
  }

  const handleMapTouchStart = (e) => {
    if (!placing) return
    const t = e.touches[0]
    if (t) setLastTouch({ x: t.clientX, y: t.clientY })
  }

  const handleMapTouchEnd = (e) => {
    if (!placing) return
    e.preventDefault()
    const t = e.changedTouches?.[0]
    if (t) { placeAt(t.clientX, t.clientY); return }
    if (lastTouch) placeAt(lastTouch.x, lastTouch.y)
  }

  const handleMapClick = (e) => {
    if (!placing) return
    if (e.type === 'click' && lastTouch) return // touch already handled it
    placeAt(e.clientX, e.clientY)
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => onUploadFloorPlan(ev.target.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const clearPlan = () => {
    onUploadFloorPlan(null)
    zones.forEach((z, i) => { if (z && z.mapX != null) onUpdateZone(i, { mapX: null, mapY: null }) })
    if (building.outdoorMapX != null) onUpdateBuilding({ outdoorMapX: null, outdoorMapY: null })
    setSelected(null)
    setPlacing(null)
  }

  const unpin = (p) => {
    if (p.kind === 'outdoor') onUpdateBuilding({ outdoorMapX: null, outdoorMapY: null })
    else onUpdateZone(p.zoneIndex, { mapX: null, mapY: null })
    setSelected(null)
  }

  const chip = (active) => ({
    padding: '10px 14px', minHeight: 44, borderRadius: 20,
    background: active ? mix('accent', 13) : CARD,
    border: `1px solid ${active ? ACCENT : BORDER}`,
    color: active ? ACCENT : TEXT,
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  })

  return (
    <div style={{ paddingTop: 20, paddingBottom: 100 }}>
      <div style={{ marginBottom: 16 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back to Results</button>
        <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Sampling locations</div>
        <div style={{ fontSize: 11, color: SUB }}>Optional: mark where each set of readings was taken</div>
      </div>

      {/* Floor plan upload */}
      {!floorPlan && (
        <div style={{ padding: 32, background: CARD, border: `2px dashed ${BORDER}`, borderRadius: 12, textAlign: 'center', marginBottom: 16 }}>
          <I n="bldg" s={32} c={DIM} w={1.4} />
          <div style={{ fontSize: 14, fontWeight: 600, color: SUB, marginTop: 12 }}>Upload floor plan</div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 4, marginBottom: 16 }}>PNG or JPG of the building layout</div>
          <label style={{ padding: '12px 24px', minHeight: 44, display: 'inline-flex', alignItems: 'center', background: 'var(--accent-fill)', border: 'none', borderRadius: 8, color: 'var(--on-accent-fill)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Choose file
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Map */}
      {floorPlan && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
            <label style={{ padding: '4px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: SUB, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>
              Replace
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button onClick={clearPlan} style={{ padding: '4px 12px', background: mix('danger', 6), border: `1px solid ${mix('danger', 15)}`, borderRadius: 6, color: 'var(--danger)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
          </div>
          <div
            ref={mapRef}
            onClick={handleMapClick}
            onTouchStart={handleMapTouchStart}
            onTouchEnd={handleMapTouchEnd}
            // While a location is being placed the plan is a target: expose it
            // as a button and let Enter drop the pin at the centre, which the
            // user can then reposition by pointer. Otherwise it is an image.
            role={placing ? 'button' : undefined}
            tabIndex={placing ? 0 : undefined}
            aria-label={placing ? `Place ${placingLabel} on the floor plan` : undefined}
            onKeyDown={(e) => { if (placing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); commit(50, 50) } }}
            style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: `2px solid ${placing ? ACCENT : BORDER}`, cursor: placing ? 'crosshair' : 'default', WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            <img src={floorPlan} alt="Floor plan of the assessed building" style={{ width: '100%', display: 'block' }} />

            {points.map((p) => (
              <button
                type="button"
                key={p.n}
                aria-label={`Location ${p.n}, ${p.label}`}
                aria-pressed={selected === p.n}
                onClick={(e) => { e.stopPropagation(); setSelected(selected === p.n ? null : p.n) }}
                style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -100%)', cursor: 'pointer', zIndex: 10, background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit' }}
              >
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: PIN, border: `2px solid ${selected === p.n ? TEXT : '#fff'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: PIN_INK, fontFamily: 'var(--font-mono)' }}>{p.n}</span>
                </div>
                <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${PIN}`, margin: '-1px auto 0' }} />
              </button>
            ))}
          </div>

          {placing && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: ACCENT, fontWeight: 600 }}>
              Tap the plan to place “{placingLabel}”
            </div>
          )}
        </div>
      )}

      {/* What was recorded at the selected location */}
      {selectedPoint && (
        <div style={{ padding: 14, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>{selectedPoint.label}</div>
            <span style={{ fontSize: 11, color: DIM, fontFamily: 'var(--font-mono)' }}>Pin {selectedPoint.n}</span>
          </div>
          {selectedPoint.use && <div style={{ fontSize: 11, color: SUB, marginBottom: 8 }}>{selectedPoint.use}</div>}
          <div style={{ fontSize: 10, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Recorded here</div>
          {selectedPoint.values.length === 0 && <div style={{ fontSize: 11, color: DIM, fontStyle: 'italic' }}>No instrument readings recorded at this location.</div>}
          {selectedPoint.values.map((v) => (
            <div key={v.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: SUB, padding: '4px 0', borderBottom: `1px solid ${BORDER}` }}>
              <span>{v.label}</span>
              <span style={{ color: TEXT, fontFamily: 'var(--font-mono)' }}>{v.value}{v.unit ? ` ${v.unit}` : ''}</span>
            </div>
          ))}
          {(selectedPoint.time || selectedPoint.duration) && (
            <div style={{ fontSize: 11, color: DIM, marginTop: 8 }}>
              {[selectedPoint.time, selectedPoint.duration].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
            <button onClick={() => unpin(selectedPoint)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Unpin &amp; reposition</button>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Close</button>
          </div>
        </div>
      )}

      {/* Still to place */}
      {floorPlan && (unplacedZones.length > 0 || outdoorPlaceable) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Not yet placed</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unplacedZones.map(({ z, i }) => {
              const active = !!placing && placing.kind === 'zone' && placing.index === i
              return (
                <button key={i} onClick={() => setPlacing(active ? null : { kind: 'zone', index: i })} style={chip(active)}>
                  {zoneLabel(z, i)}
                </button>
              )
            })}
            {outdoorPlaceable && (() => {
              const active = !!placing && placing.kind === 'outdoor'
              return (
                <button onClick={() => setPlacing(active ? null : { kind: 'outdoor' })} style={chip(active)}>
                  {OUTDOOR_LABEL}
                </button>
              )
            })()}
          </div>
          {outdoorPlaceable && (
            <div style={{ fontSize: 10, color: DIM, marginTop: 8, lineHeight: 1.5 }}>
              Place the outdoor reference where the baseline was taken. Its position relative to loading docks, exhaust and outdoor-air intakes is what makes the indoor-versus-outdoor comparison interpretable.
            </div>
          )}
        </div>
      )}

      {/* The key. Doubles as an accessible way to reach any pin, since a
          marker on the plan is smaller than a comfortable tap target. */}
      {points.length > 0 && (
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Locations on this plan</div>
          {points.map((p) => (
            <button
              key={p.n}
              onClick={() => setSelected(selected === p.n ? null : p.n)}
              aria-pressed={selected === p.n}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, textAlign: 'left', padding: '8px 0', background: 'transparent', border: 'none', borderTop: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: PIN, color: PIN_INK, fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.n}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: TEXT, fontWeight: 600 }}>{p.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: SUB }}>{p.readingText}</span>
              </span>
            </button>
          ))}
          <div style={{ fontSize: 10, color: DIM, marginTop: 8, lineHeight: 1.5 }}>
            The number on a pin identifies the location in this list. Marker colour carries no meaning; pins record where readings were taken, not what was found.
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: DIM }}>
        Mapping is optional. Your assessment is complete and valid without it.
      </div>
    </div>
  )
}
