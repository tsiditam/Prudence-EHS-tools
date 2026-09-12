/**
 * AtmosFlow Spatial Layer — sampling locations on the floor plans.
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
 * A site may have several plans — a ground floor and a mezzanine, two wings
 * drawn separately. The screen shows one at a time; the chips above switch,
 * a pin is placed on the plan that is showing, and the key lists every pin
 * on the site with the plan it is on. Numbers run across the site, so the
 * key is the same list the report prints. See utils/floorPlans.js.
 *
 * Rendered as the "Site plan" tab of the results screen (`embedded`), which
 * is where the rest of the assessment record lives. It used to be a
 * standalone route behind the header overflow menu, where a floor plan an
 * assessor had uploaded was two taps and a guess away from being found.
 *
 * 100% optional — the assessment is valid without mapping.
 */

import { useState, useRef } from 'react'
import { I } from './Icons'
import { mix } from '../utils/theme'
import { samplePoints, pointsOnPlan, hasOutdoorBaseline, OUTDOOR_LABEL } from '../utils/samplePoints'
import { planLabel, planImage, downscaleImageDataUrl } from '../utils/floorPlans'

const CARD = 'var(--card)', BORDER = 'var(--border)', ACCENT = 'var(--accent)'
const TEXT = 'var(--text)', SUB = 'var(--sub)', DIM = 'var(--dim)'

// One neutral marker for every location. Colour is not an encoding here, so
// identity rests on the number and the list, which also survives grayscale
// print and a colour-blind reader.
const PIN = ACCENT
const PIN_INK = 'var(--on-accent-fill)'

const zoneLabel = (z, i) => (z && z.zn) || `Zone ${i + 1}`

// Read a chosen file as a data URL, bounded in size (utils/floorPlans).
function readPlanFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (ev) => downscaleImageDataUrl(ev.target.result).then(resolve)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export default function SpatialMap({
  zones = [], plans = [], building = {},
  onUpdateZone, onUpdateBuilding,
  onAddPlan, onReplacePlan, onRenamePlan, onRemovePlan,
  onClose, embedded = false,
}) {
  const [selected, setSelected] = useState(null)   // pin number
  const [placing, setPlacing] = useState(null)     // {kind:'zone',index} | {kind:'outdoor'}
  const [activeId, setActiveId] = useState(null)   // plan id; null = first
  const [lastTouch, setLastTouch] = useState(null)
  const mapRef = useRef(null)

  const active = plans.find((p) => p.id === activeId) || plans[0] || null
  const activeIndex = active ? plans.indexOf(active) : -1
  const image = planImage(active)

  const points = samplePoints(zones, { building, plans })
  const onThisPlan = active ? pointsOnPlan(points, active.id) : []
  const placedZones = new Set(points.filter((p) => p.kind === 'zone').map((p) => p.zoneIndex))
  const unplacedZones = zones.map((z, i) => ({ z, i })).filter(({ i }) => !placedZones.has(i))
  const outdoorPlaceable = hasOutdoorBaseline(zones) && !points.some((p) => p.kind === 'outdoor')
  const selectedPoint = points.find((p) => p.n === selected) || null

  const placingLabel = !placing ? '' : placing.kind === 'outdoor' ? OUTDOOR_LABEL : zoneLabel(zones[placing.index], placing.index)
  const labelOf = (plan) => planLabel(plan, plans.indexOf(plan), plans.length)

  const commit = (x, y) => {
    if (!placing || !active) return
    if (placing.kind === 'outdoor') onUpdateBuilding({ outdoorMapX: x, outdoorMapY: y, outdoorMapPlan: active.id })
    else onUpdateZone(placing.index, { mapX: x, mapY: y, mapPlan: active.id })
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

  // Add a plan, and show it. The parent owns the list and mints the id.
  const handleAddFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const url = await readPlanFile(file)
    if (!url) return
    const id = await onAddPlan(url)
    if (id) setActiveId(id)
  }

  const handleReplaceFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !active) return
    const url = await readPlanFile(file)
    if (url) onReplacePlan(active.id, url)
  }

  // Removing a plan lifts its pins (the parent does both in one update).
  const removeActive = () => {
    if (!active) return
    onRemovePlan(active.id)
    setSelected(null)
    setPlacing(null)
    setActiveId(null)
  }

  const unpin = (p) => {
    if (p.kind === 'outdoor') onUpdateBuilding({ outdoorMapX: null, outdoorMapY: null, outdoorMapPlan: null })
    else onUpdateZone(p.zoneIndex, { mapX: null, mapY: null, mapPlan: null })
    setSelected(null)
  }

  // A pin dropped in the wrong place is moved in one gesture: lift it and
  // arm the plan for the same location, so the next tap on the plan is the
  // new position. Switching plans while armed moves it to the other plan.
  const move = (p) => {
    unpin(p)
    setPlacing(p.kind === 'outdoor' ? { kind: 'outdoor' } : { kind: 'zone', index: p.zoneIndex })
  }

  // Tapping a key row for a pin on another plan shows that plan.
  const reveal = (p) => {
    if (p.plan && active && p.plan !== active.id) setActiveId(p.plan)
    setSelected(selected === p.n ? null : p.n)
  }

  const chip = (isActive) => ({
    padding: '10px 14px', minHeight: 44, borderRadius: 20,
    background: isActive ? mix('accent', 13) : CARD,
    border: `1px solid ${isActive ? ACCENT : BORDER}`,
    color: isActive ? ACCENT : TEXT,
    fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  })
  const fileLabel = (primary) => ({
    padding: primary ? '12px 24px' : '4px 12px', minHeight: primary ? 44 : undefined,
    display: 'inline-flex', alignItems: 'center',
    background: primary ? 'var(--accent-fill)' : CARD,
    border: primary ? 'none' : `1px solid ${BORDER}`, borderRadius: primary ? 8 : 6,
    color: primary ? 'var(--on-accent-fill)' : SUB,
    fontSize: primary ? 13 : 10, fontWeight: primary ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit',
  })

  return (
    // Embedded in the results tab strip the tab itself names the screen, so
    // the heading and the way back would both be said twice.
    <div style={{ paddingTop: embedded ? 0 : 20, paddingBottom: embedded ? 16 : 100 }}>
      {embedded ? (
        <div style={{ fontSize: 11, color: SUB, marginBottom: 14 }}>Optional: mark where each set of readings was taken</div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>← Back to Results</button>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT, marginTop: 4 }}>Sampling locations</div>
          <div style={{ fontSize: 11, color: SUB }}>Optional: mark where each set of readings was taken</div>
        </div>
      )}

      {/* First plan */}
      {!plans.length && (
        <div style={{ padding: 32, background: CARD, border: `2px dashed ${BORDER}`, borderRadius: 12, textAlign: 'center', marginBottom: 16 }}>
          <I n="bldg" s={32} c={DIM} w={1.4} />
          <div style={{ fontSize: 14, fontWeight: 600, color: SUB, marginTop: 12 }}>Upload floor plan</div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 4, marginBottom: 16 }}>PNG or JPG of the building layout. Add more plans for other levels or wings.</div>
          <label style={fileLabel(true)}>
            Choose file
            <input type="file" accept="image/*" onChange={handleAddFile} style={{ display: 'none' }} />
          </label>
        </div>
      )}

      {/* Which plan is showing. Chips only once there is a choice; "Add" always. */}
      {plans.length > 0 && (
        <div role="group" aria-label="Floor plans" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {plans.length > 1 && plans.map((p) => (
            <button key={p.id} aria-pressed={p === active} onClick={() => { setActiveId(p.id); setSelected(null) }} style={chip(p === active)}>
              {labelOf(p)}
            </button>
          ))}
          <label style={{ ...chip(false), color: ACCENT }}>
            + Add plan
            <input type="file" accept="image/*" onChange={handleAddFile} style={{ display: 'none' }} aria-label="Add another floor plan" />
          </label>
        </div>
      )}

      {/* The plan */}
      {active && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              value={active.label || ''}
              onChange={(e) => onRenamePlan(active.id, e.target.value)}
              placeholder={plans.length > 1 ? `Plan ${activeIndex + 1} — name it (e.g. Level 2)` : 'Name this plan (e.g. Level 1)'}
              aria-label="Plan name"
              style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 16, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontFamily: 'inherit' }}
            />
            <label style={fileLabel(false)}>
              Replace
              <input type="file" accept="image/*" onChange={handleReplaceFile} style={{ display: 'none' }} />
            </label>
            <button onClick={removeActive} style={{ padding: '4px 12px', background: mix('danger', 6), border: `1px solid ${mix('danger', 15)}`, borderRadius: 6, color: 'var(--danger)', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
          </div>

          {!image && (
            <div style={{ padding: 20, background: CARD, border: `1px dashed ${BORDER}`, borderRadius: 10, fontSize: 12, color: SUB, textAlign: 'center' }}>
              {active._missingBlob
                ? 'This plan’s image is no longer stored on this device. Replace it to keep its pins, or remove it.'
                : 'Loading plan…'}
            </div>
          )}

          {image && (
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
              aria-label={placing ? `Place ${placingLabel} on ${labelOf(active)}` : undefined}
              onKeyDown={(e) => { if (placing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); commit(50, 50) } }}
              style={{ position: 'relative', width: '100%', borderRadius: 10, overflow: 'hidden', border: `2px solid ${placing ? ACCENT : BORDER}`, cursor: placing ? 'crosshair' : 'default', WebkitUserSelect: 'none', userSelect: 'none' }}
            >
              <img src={image} alt={`Floor plan: ${labelOf(active)}`} style={{ width: '100%', display: 'block' }} />

              {onThisPlan.map((p) => (
                <button
                  type="button"
                  key={p.n}
                  aria-label={`Location ${p.n}, ${p.label}`}
                  aria-pressed={selected === p.n}
                  onClick={(e) => { e.stopPropagation(); setSelected(selected === p.n ? null : p.n) }}
                  // The tip of the tail is the recorded point. Scaling about the
                  // bottom centre keeps it there while the marker grows.
                  style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%, -100%)${selected === p.n ? ' scale(1.2)' : ''}`, transformOrigin: '50% 100%', transition: 'transform 120ms ease', cursor: 'pointer', zIndex: selected === p.n ? 11 : 10, background: 'transparent', border: 'none', padding: 0, fontFamily: 'inherit' }}
                >
                  {/* The selected marker grows and takes a halo: accent, then a
                      white edge, so it reads against a light plan and a dark one.
                      It used to swap its white ring for the theme's text colour,
                      which in the dark theme is near-white — no visible change. */}
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: PIN, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'box-shadow 120ms ease',
                    boxShadow: selected === p.n ? `0 0 0 3px ${ACCENT}, 0 0 0 5px #fff, 0 3px 10px rgba(0,0,0,0.45)` : '0 2px 8px rgba(0,0,0,0.35)' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: PIN_INK, fontFamily: 'var(--font-mono)' }}>{p.n}</span>
                  </div>
                  <div style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${PIN}`, margin: '-1px auto 0' }} />
                </button>
              ))}
            </div>
          )}

          {placing && image && (
            <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: ACCENT, fontWeight: 600 }}>
              Tap the plan to place “{placingLabel}”{plans.length > 1 ? ` on ${labelOf(active)}` : ''}
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
          <div style={{ display: 'flex', gap: 18, marginTop: 10 }}>
            <button onClick={() => move(selectedPoint)} style={{ background: 'none', border: 'none', color: ACCENT, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 32 }}>Move pin</button>
            <button onClick={() => unpin(selectedPoint)} style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 32 }}>Remove pin</button>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: SUB, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: 32, marginLeft: 'auto' }}>Close</button>
          </div>
        </div>
      )}

      {/* Still to place */}
      {active && (unplacedZones.length > 0 || outdoorPlaceable) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Not yet placed</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {unplacedZones.map(({ z, i }) => {
              const isActive = !!placing && placing.kind === 'zone' && placing.index === i
              return (
                <button key={i} onClick={() => setPlacing(isActive ? null : { kind: 'zone', index: i })} style={chip(isActive)}>
                  {zoneLabel(z, i)}
                </button>
              )
            })}
            {outdoorPlaceable && (() => {
              const isActive = !!placing && placing.kind === 'outdoor'
              return (
                <button onClick={() => setPlacing(isActive ? null : { kind: 'outdoor' })} style={chip(isActive)}>
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

      {/* The key — every pin on the site, with its plan when there is more
          than one. Doubles as an accessible way to reach any pin, since a
          marker on the plan is smaller than a comfortable tap target. */}
      {points.length > 0 && (
        <div style={{ padding: 12, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: DIM, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Locations on {plans.length > 1 ? 'the plans' : 'this plan'}</div>
          {points.map((p) => {
            const plan = plans.find((x) => x.id === p.plan)
            const elsewhere = plans.length > 1 && plan && active && plan.id !== active.id
            return (
              <button
                key={p.n}
                onClick={() => reveal(p)}
                aria-pressed={selected === p.n}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, textAlign: 'left', padding: '8px 6px', background: selected === p.n ? mix('accent', 10) : 'transparent', border: 'none', borderTop: `1px solid ${BORDER}`, cursor: 'pointer', fontFamily: 'inherit', opacity: elsewhere ? 0.72 : 1 }}
              >
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: PIN, color: PIN_INK, fontSize: 10, fontWeight: 800, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.n}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, color: TEXT, fontWeight: 600 }}>{p.label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: SUB }}>{p.readingText}</span>
                </span>
                {plans.length > 1 && plan && (
                  <span style={{ flexShrink: 0, fontSize: 10, color: elsewhere ? ACCENT : DIM, maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelOf(plan)}</span>
                )}
              </button>
            )
          })}
          <div style={{ fontSize: 10, color: DIM, marginTop: 8, lineHeight: 1.5 }}>
            The number on a pin identifies the location in this list. Marker color carries no meaning; pins record where readings were taken, not what was found.
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 10, color: DIM }}>
        Mapping is optional. Your assessment is complete and valid without it.
      </div>
    </div>
  )
}
