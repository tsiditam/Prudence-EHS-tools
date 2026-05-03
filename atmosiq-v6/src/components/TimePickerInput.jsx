/**
 * TimePickerInput — iOS-style 3-column wheel time picker.
 *
 * Three scroll-snapped columns (hours, minutes, AM/PM) with a
 * translucent capsule highlighting the selected row. Items above and
 * below the center fade out by distance. 24-hour locales hide the
 * AM/PM column.
 *
 * Replaces the prior MUI clock-dial picker. Value contract preserved:
 * stores a locale-formatted string ("2:15 PM" / "14:15") so the
 * storage / DOCX / report layers do not change.
 */

import { useState, useMemo, useRef, useEffect } from 'react'

const BG = '#07080C'
const SURFACE = '#0D0E14'
const CARD = '#111318'
const BORDER = '#1C1E26'
const ACCENT = '#22D3EE'
const TEXT = '#ECEEF2'
const SUB = '#8B93A5'
const DIM = '#6B7380'

// Wheel geometry. ITEM_H is the height of one row; VISIBLE is the
// number of rows shown at once (must be odd so a row sits on the
// center). PAD_ROWS is the empty padding above and below the items
// so the first and last items can scroll into the center position.
const ITEM_H = 38
const VISIBLE = 7
const PAD_ROWS = (VISIBLE - 1) / 2

function localePrefers12h() {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' })
    const opts = fmt.resolvedOptions()
    if (typeof opts.hour12 === 'boolean') return opts.hour12
    return /am|pm/i.test(fmt.format(new Date(2020, 0, 1, 13, 0)))
  } catch {
    return true
  }
}

const pad2 = n => String(n).padStart(2, '0')
const HOURS_24 = Array.from({ length: 24 }, (_, i) => pad2(i))
const HOURS_12 = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i))
const PERIODS = ['AM', 'PM']

function parseStored(value, ampm) {
  // Default to 12:00 AM (12h) / 00:00 (24h) when nothing is stored yet.
  const def = ampm
    ? { hour: '12', minute: '00', period: 'AM' }
    : { hour: '00', minute: '00', period: 'AM' }
  if (!value) return def
  const s = String(value).trim()
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (m12) {
    const h = parseInt(m12[1], 10)
    const mm = pad2(parseInt(m12[2], 10))
    const period = /pm/i.test(m12[3]) ? 'PM' : 'AM'
    if (ampm) return { hour: String(h), minute: mm, period }
    let h24 = h
    if (period === 'AM' && h === 12) h24 = 0
    else if (period === 'PM' && h !== 12) h24 = h + 12
    return { hour: pad2(h24), minute: mm, period: 'AM' }
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) {
    const h = parseInt(m24[1], 10)
    const mm = pad2(parseInt(m24[2], 10))
    if (!ampm) return { hour: pad2(h), minute: mm, period: 'AM' }
    const period = h >= 12 ? 'PM' : 'AM'
    let h12 = h % 12
    if (h12 === 0) h12 = 12
    return { hour: String(h12), minute: mm, period }
  }
  return def
}

function formatValue(hour, minute, period, ampm) {
  return ampm ? `${hour}:${minute} ${period}` : `${hour}:${minute}`
}

function WheelColumn({ items, value, onChange, width }) {
  const ref = useRef(null)
  const rafRef = useRef(null)
  const valueIdx = Math.max(0, items.indexOf(value))

  // Position the wheel so the current value sits at center on mount.
  // Re-runs when the column is remounted (each sheet open creates a
  // fresh tree because the parent only renders this when `open` is
  // true), so the picker always opens at the stored value.
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = valueIdx * ITEM_H
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Snap-aware scroll handler. requestAnimationFrame coalesces rapid
  // scroll events; rounding scrollTop / ITEM_H gives the index whose
  // row is centered in the visible window.
  const onScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (!ref.current) return
      const idx = Math.round(ref.current.scrollTop / ITEM_H)
      const clamped = Math.max(0, Math.min(items.length - 1, idx))
      if (items[clamped] !== value) onChange(items[clamped])
    })
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="atmosflow-wheel-col"
      style={{
        height: VISIBLE * ITEM_H,
        width,
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
      <div style={{ height: PAD_ROWS * ITEM_H }} />
      {items.map((item, i) => {
        const dist = Math.abs(i - valueIdx)
        const opacity = dist === 0 ? 1 : dist === 1 ? 0.45 : dist === 2 ? 0.22 : 0.08
        return (
          <div
            key={item}
            style={{
              height: ITEM_H,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: dist === 0 ? 22 : 20,
              fontWeight: dist === 0 ? 700 : 500,
              color: TEXT,
              opacity,
              scrollSnapAlign: 'center',
              transition: 'opacity 0.15s, font-size 0.15s, font-weight 0.15s',
              userSelect: 'none',
              fontFamily: 'inherit',
              fontVariantNumeric: 'tabular-nums',
            }}>
            {item}
          </div>
        )
      })}
      <div style={{ height: PAD_ROWS * ITEM_H }} />
    </div>
  )
}

export default function TimePickerInput({ value, onChange, placeholder = 'Select time…' }) {
  const ampm = useMemo(localePrefers12h, [])
  const [open, setOpen] = useState(false)
  const [hour, setHour] = useState('')
  const [minute, setMinute] = useState('')
  const [period, setPeriod] = useState('')

  const openSheet = () => {
    const cur = parseStored(value, ampm)
    setHour(cur.hour); setMinute(cur.minute); setPeriod(cur.period)
    setOpen(true)
  }

  const confirm = () => {
    onChange(formatValue(hour, minute, period, ampm))
    setOpen(false)
  }

  const display = value || ''
  const hourItems = ampm ? HOURS_12 : HOURS_24

  return (
    <>
      <button
        onClick={openSheet}
        style={{
          width: '100%',
          padding: '14px 16px',
          background: CARD,
          border: `1.5px solid ${BORDER}`,
          borderRadius: 14,
          color: display ? TEXT : SUB,
          fontSize: 17,
          fontFamily: 'inherit',
          fontWeight: 500,
          textAlign: 'left',
          cursor: 'pointer',
          minHeight: 52,
          transition: 'border-color 0.15s',
        }}>
        {display || placeholder}
      </button>

      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              background: 'rgba(0,0,0,0.6)',
              animation: 'atmosflowFadeIn 0.15s ease',
            }} />
          <div
            role="dialog"
            aria-label="Select time"
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
              background: CARD,
              borderTop: `1px solid ${BORDER}`,
              borderRadius: '20px 20px 0 0',
              padding: '12px 16px',
              paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
              animation: 'atmosflowSheetUp 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
            }}>
            <style>{`
              .atmosflow-wheel-col::-webkit-scrollbar { display: none; }
              @keyframes atmosflowFadeIn { from { opacity: 0 } to { opacity: 1 } }
              @keyframes atmosflowSheetUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
            `}</style>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 4px 8px', marginBottom: 4,
            }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', color: SUB,
                  fontSize: 15, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'inherit', minHeight: 36, padding: '4px 8px',
                }}>
                Cancel
              </button>
              <div style={{
                fontSize: 11, fontWeight: 600, color: DIM, fontFamily: 'inherit',
                textTransform: 'uppercase', letterSpacing: '0.8px',
              }}>
                Time
              </div>
              <button
                onClick={confirm}
                style={{
                  background: 'none', border: 'none', color: ACCENT,
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', minHeight: 36, padding: '4px 8px',
                }}>
                Done
              </button>
            </div>
            <div style={{
              position: 'relative',
              display: 'flex', justifyContent: 'center', alignItems: 'stretch',
            }}>
              {/* Capsule highlighting the selected row, spanning all columns. */}
              <div style={{
                position: 'absolute',
                left: 8, right: 8,
                top: PAD_ROWS * ITEM_H,
                height: ITEM_H,
                background: SURFACE,
                borderRadius: ITEM_H / 2,
                pointerEvents: 'none',
                zIndex: 0,
              }} />
              {/* Top + bottom fade gradients reinforce the wheel feel. */}
              <div style={{
                position: 'absolute', left: 0, right: 0, top: 0,
                height: (PAD_ROWS - 0.5) * ITEM_H,
                background: `linear-gradient(to bottom, ${CARD} 0%, rgba(17,19,24,0) 100%)`,
                pointerEvents: 'none', zIndex: 2,
              }} />
              <div style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                height: (PAD_ROWS - 0.5) * ITEM_H,
                background: `linear-gradient(to top, ${CARD} 0%, rgba(17,19,24,0) 100%)`,
                pointerEvents: 'none', zIndex: 2,
              }} />
              <div style={{ display: 'flex', position: 'relative', zIndex: 1 }}>
                <WheelColumn items={hourItems} value={hour} onChange={setHour} width={84} />
                <WheelColumn items={MINUTES} value={minute} onChange={setMinute} width={84} />
                {ampm && <WheelColumn items={PERIODS} value={period} onChange={setPeriod} width={84} />}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
