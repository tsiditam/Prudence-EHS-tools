/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * BleSensorButton — drop-in BLE-pairing affordance next to a
 * numeric input. Tap → bottom sheet with driver picker → tap a
 * driver → browser pairing dialog → live reading → Insert.
 *
 *   <BleSensorButton
 *     metric="co2_ppm"               // filter drivers by what they emit
 *     onInsert={(value, reading) => setField('co2', value)}
 *     size={36}
 *     ariaLabel="Pair sensor for CO₂"
 *   />
 *
 * UX:
 *   - Idle  → small button with a Bluetooth glyph next to the input.
 *   - Tap   → bottom sheet opens listing matching drivers.
 *   - Pick a driver → Web Bluetooth chooser opens.
 *   - Pick a device → connection + first reading streams in.
 *   - Live reading displayed with "Insert <value>" + Refresh + Disconnect.
 *   - Insert calls onInsert(value, reading) and dismisses the sheet.
 *
 * iOS Safari has no Web Bluetooth. Button still renders as a
 * dim/disabled affordance with a tooltip; tapping shows a sheet
 * that explains "Use Chrome on Android, or the free Bluefy browser
 * on iPhone." Removes the cliff edge where a user taps and nothing
 * happens.
 */

import { useState } from 'react'
import { useBleInstrument } from '../hooks/useBleInstrument'
import { useBleSession } from '../hooks/useBleSession'
import { BLE_DRIVERS, driversForMetric, isBleSupported } from '../utils/bleDrivers'

const METRIC_LABELS = {
  co2_ppm: { label: 'CO₂', unit: 'ppm', decimals: 0 },
  temperature_c: { label: 'Temperature', unit: '°C', decimals: 1 },
  temperature_f: { label: 'Temperature', unit: '°F', decimals: 1 },
  humidity_rh: { label: 'Humidity', unit: '%', decimals: 0 },
  pressure_hpa: { label: 'Pressure', unit: 'hPa', decimals: 1 },
  battery_pct: { label: 'Battery', unit: '%', decimals: 0 },
}

export default function BleSensorButton({
  metric,
  onInsert,
  size = 36,
  ariaLabel = 'Pair Bluetooth sensor',
  disabled = false,
}) {
  const [open, setOpen] = useState(false)
  const supported = isBleSupported()
  const interactive = !disabled
  const session = useBleSession()
  // Live session is "useful here" when a device is paired AND it emits
  // the metric this button is bound to. Drives the green dot and the
  // sheet-skips-picker behavior.
  const sessionUseful = session.active && session.emitsMetric(metric)

  const glyphColor = sessionUseful
    ? 'var(--success)'
    : supported
      ? 'var(--accent)'
      : 'var(--dim)'

  return (
    <>
      <button
        type="button"
        data-testid="ble-sensor-button"
        data-session-active={sessionUseful ? 'true' : 'false'}
        aria-label={
          sessionUseful
            ? `Insert latest reading from ${session.deviceName}`
            : ariaLabel
        }
        title={
          !supported
            ? 'Bluetooth not available in this browser'
            : sessionUseful
              ? `Connected: ${session.deviceName}. Tap to insert latest reading`
              : ariaLabel
        }
        disabled={!interactive}
        onClick={(e) => { e.preventDefault(); setOpen(true) }}
        style={{
          width: size, height: size, borderRadius: 8,
          background: sessionUseful
            ? 'color-mix(in srgb, var(--success) 10%, transparent)'
            : 'transparent',
          border: `1px solid ${sessionUseful ? 'var(--success)' : 'var(--border)'}`,
          cursor: interactive ? 'pointer' : 'not-allowed',
          color: glyphColor,
          opacity: interactive ? 1 : 0.55,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit', padding: 0, flexShrink: 0,
          position: 'relative',
          transition: 'background 0.15s, border-color 0.15s, color 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}>
        {/* Bluetooth glyph — universal affordance for pairing. */}
        <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
        </svg>
        {/* Live-session dot — pulses on the top-right when a paired
            device emits this metric. Tells the user the button will
            insert from the existing session rather than re-pair. */}
        {sessionUseful && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 3, right: 3,
              width: 8, height: 8, borderRadius: 4,
              background: 'var(--success)',
              boxShadow: '0 0 0 2px var(--card)',
              animation: 'blePulse 1.6s ease-in-out infinite',
            }}
          />
        )}
      </button>
      {open && (
        <BleSensorSheet
          metric={metric}
          onInsert={(value, reading) => { onInsert?.(value, reading); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * Bottom sheet with three states:
 *   1. Picker      — choose a driver (or see iOS-Safari fallback).
 *   2. Connecting  — driver picked, browser dialog open or GATT setup.
 *   3. Connected   — live reading + Insert / Refresh / Disconnect.
 */
function BleSensorSheet({ metric, onInsert, onClose }) {
  const matching = driversForMetric(metric)
  const session = useBleSession()
  // When a session is already paired AND emits this metric, skip the
  // picker entirely and show the active-session view. The user can
  // still tap "Pair a different device" to drop back into the picker.
  const sessionMatches = session.active && session.emitsMetric(metric)
  const [showPicker, setShowPicker] = useState(false)
  const [chosenDriver, setChosenDriver] = useState(
    sessionMatches ? null : (matching.length === 1 ? matching[0] : null),
  )
  const supported = isBleSupported()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Connect sensor"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 220,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        animation: 'bleFade 160ms ease-out',
      }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        background: 'var(--surface)',
        borderTopLeftRadius: 18,
        borderTopRightRadius: 18,
        border: '1px solid var(--border)',
        borderBottom: 'none',
        padding: '14px 16px calc(20px + env(safe-area-inset-bottom, 0px))',
        maxHeight: '82vh',
        overflowY: 'auto',
        boxShadow: '0 -12px 32px rgba(0,0,0,0.5)',
        animation: 'bleSlide 240ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--border)',
          margin: '0 auto 14px',
        }} />

        {/* iOS Safari fallback — Web Bluetooth not available. */}
        {!supported && (
          <UnsupportedView onClose={onClose} />
        )}

        {/* Active-session shortcut — paired device already emits this
            metric. One tap to insert the latest reading, refresh, or
            disconnect. "Pair a different device" drops to the picker. */}
        {supported && sessionMatches && !showPicker && !chosenDriver && (
          <ActiveSessionView
            metric={metric}
            session={session}
            onInsert={onInsert}
            onPairDifferent={() => setShowPicker(true)}
            onClose={onClose}
          />
        )}

        {/* Driver picker — when there's > 1 matching driver and none picked,
            or when the user explicitly opted to swap devices. */}
        {supported && !sessionMatches && !chosenDriver && (
          <DriverPicker
            metric={metric}
            drivers={matching}
            onPick={(d) => setChosenDriver(d)}
            onClose={onClose}
          />
        )}
        {supported && sessionMatches && showPicker && !chosenDriver && (
          <DriverPicker
            metric={metric}
            drivers={matching}
            onPick={(d) => setChosenDriver(d)}
            onClose={onClose}
          />
        )}

        {/* Pair + read flow — driver chosen, ready to connect. */}
        {supported && chosenDriver && (
          <DriverReadFlow
            driver={chosenDriver}
            metric={metric}
            onInsert={onInsert}
            onBack={matching.length > 1 ? () => setChosenDriver(null) : null}
            onClose={onClose}
          />
        )}
      </div>

      <style>{`
        @keyframes bleFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes bleSlide {
          from { transform: translateY(20px); opacity: 0 }
          to   { transform: translateY(0); opacity: 1 }
        }
        @keyframes bleSpin { to { transform: rotate(360deg) } }
        @keyframes blePulse {
          0%, 100% { opacity: 1; transform: scale(1) }
          50%      { opacity: 0.45; transform: scale(0.85) }
        }
        @media (prefers-reduced-motion: reduce) {
          [role="dialog"] { animation: none !important }
          [role="dialog"] > div { animation: none !important }
        }
      `}</style>
    </div>
  )
}

function UnsupportedView({ onClose }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
        Bluetooth pairing isn't available
      </div>
      <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.5, marginBottom: 14 }}>
        Your browser doesn't support Web Bluetooth. To pair Aranet4 and other IAQ sensors directly to AtmosFlow, use one of these:
      </div>
      <ul style={{ margin: '0 0 14px', padding: '0 0 0 18px', color: 'var(--sub)', fontSize: 13, lineHeight: 1.65 }}>
        <li><strong style={{ color: 'var(--text)' }}>Android phone or tablet</strong>: Chrome works out of the box.</li>
        <li><strong style={{ color: 'var(--text)' }}>iPhone or iPad</strong>: install the free <a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Bluefy browser</a> and open AtmosFlow inside it.</li>
        <li><strong style={{ color: 'var(--text)' }}>Mac / Windows / Linux desktop</strong>: Chrome or Edge.</li>
      </ul>
      <button
        type="button"
        onClick={onClose}
        style={{
          width: '100%', padding: '12px 16px',
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, color: 'var(--text)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'inherit', minHeight: 44,
        }}>
        Got it
      </button>
    </div>
  )
}

/**
 * Active-session view — shown when a previously-paired device is still
 * live AND emits the metric the caller is binding to. Renders the
 * latest reading with an Insert affordance, plus refresh and
 * disconnect actions. Eliminates the re-pair churn that motivated the
 * shared session in the first place.
 */
function ActiveSessionView({ metric, session, onInsert, onPairDifferent, onClose }) {
  const target = METRIC_LABELS[metric] || { label: metric, unit: '', decimals: 1 }
  const reading = session.reading
  const formatted = reading ? formatReading(metric, reading) : null
  const value = reading ? reading[metric] : null
  const [busy, setBusy] = useState(false)
  const lastReadSeconds = session.lastReadAt
    ? Math.max(0, Math.round((Date.now() - new Date(session.lastReadAt).getTime()) / 1000))
    : null

  const handleRefresh = async () => {
    setBusy(true)
    try { await session.refresh() } finally { setBusy(false) }
  }

  const handleInsert = () => {
    if (typeof value !== 'number') return
    onInsert?.(value, reading)
  }

  return (
    <div data-testid="ble-active-session">
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
            {session.deviceName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>
            Connected · {target.label}
            {lastReadSeconds !== null && (
              <span style={{ color: 'var(--dim)', marginLeft: 6 }}>· read {lastReadSeconds}s ago</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sub)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            padding: '6px 4px',
          }}>
          Close
        </button>
      </div>

      <div style={{
        padding: '20px 16px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        textAlign: 'center',
        marginBottom: 12,
      }}>
        {formatted ? (
          <>
            <div style={{
              fontSize: 38, fontWeight: 700, color: 'var(--text)',
              fontFamily: 'var(--font-mono)', letterSpacing: '-1px',
            }}>
              {formatted}
              <span style={{ fontSize: 16, color: 'var(--sub)', fontWeight: 600, marginLeft: 6 }}>{target.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
              Live from paired sensor
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>
            No reading yet. Tap Refresh.
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          data-testid="ble-session-insert"
          disabled={typeof value !== 'number'}
          onClick={handleInsert}
          style={{
            flex: 1, padding: '14px 16px',
            background: typeof value === 'number' ? 'var(--accent)' : 'var(--card)',
            border: typeof value === 'number' ? 'none' : '1px solid var(--border)',
            borderRadius: 12,
            color: typeof value === 'number' ? 'var(--on-accent)' : 'var(--dim)',
            fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
            cursor: typeof value === 'number' ? 'pointer' : 'not-allowed',
            minHeight: 48,
          }}>
          {formatted ? `Insert ${formatted} ${target.unit}` : 'Insert'}
        </button>
        <button
          type="button"
          data-testid="ble-session-refresh"
          disabled={busy}
          onClick={handleRefresh}
          style={{
            padding: '14px 16px',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, color: 'var(--text)', fontSize: 13, fontWeight: 600,
            cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', minHeight: 48,
          }}>
          {busy ? '…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onPairDifferent}
          style={{
            flex: 1, padding: '10px 14px',
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 10, color: 'var(--sub)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
          }}>
          Pair a different device
        </button>
        <button
          type="button"
          data-testid="ble-session-disconnect"
          onClick={() => { session.disconnect(); onClose() }}
          style={{
            flex: 1, padding: '10px 14px',
            background: 'transparent',
            border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
            borderRadius: 10, color: 'var(--danger)', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
          }}>
          Disconnect
        </button>
      </div>
    </div>
  )
}

function DriverPicker({ metric, drivers, onPick, onClose }) {
  const target = METRIC_LABELS[metric]
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
            Pair sensor{target ? ` · ${target.label}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>
            Pick a device to connect.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sub)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            padding: '6px 4px',
          }}>
          Close
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {drivers.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onPick(d)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'inherit',
              minHeight: 60,
              WebkitTapHighlightColor: 'transparent',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.background = 'color-mix(in srgb, var(--accent) 6%, transparent)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.background = 'var(--card)'
            }}>
            <span style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24"
                fill="none" stroke="var(--accent)" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
              </svg>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{d.name}</div>
              <div style={{ fontSize: 11, color: 'var(--sub)', marginTop: 2 }}>
                {d.vendor} · {d.metrics.map((m) => METRIC_LABELS[m]?.label || m).join(' · ')}
              </div>
            </div>
            <span style={{ color: 'var(--dim)', fontSize: 16 }}>›</span>
          </button>
        ))}
        {drivers.length === 0 && (
          <div style={{
            padding: '24px', textAlign: 'center',
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
            color: 'var(--sub)', fontSize: 13,
          }}>
            No drivers for this metric yet.
          </div>
        )}
      </div>
    </div>
  )
}

function formatReading(metric, reading) {
  const spec = METRIC_LABELS[metric] || { decimals: 1 }
  const value = reading[metric]
  if (typeof value !== 'number') return null
  const formatted = spec.decimals === 0
    ? Math.round(value).toString()
    : value.toFixed(spec.decimals)
  return formatted
}

function DriverReadFlow({ driver, metric, onInsert, onBack, onClose }) {
  const { state, deviceName, reading, error, pair, refresh, disconnect } = useBleInstrument(driver)
  const target = METRIC_LABELS[metric]
  const hasReading = state === 'connected' && reading && typeof reading[metric] === 'number'
  const isPairing = state === 'pairing' || state === 'reading'
  const isError = state === 'error' && error && error !== 'cancelled'

  const formattedValue = hasReading ? formatReading(metric, reading) : null

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 14,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.2px' }}>
            {driver.name}
          </div>
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }}>
            {state === 'idle'
              ? `Tap Pair to open the Bluetooth chooser.`
              : isPairing
                ? 'Connecting…'
                : isError
                  ? friendlyBleError(error)
                  : deviceName
                    ? `Connected: ${deviceName}`
                    : 'Connected.'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--sub)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            padding: '6px 4px',
          }}>
          Close
        </button>
      </div>

      {/* Live reading card */}
      <div style={{
        padding: '20px 18px',
        background: 'var(--card)',
        border: `1px solid ${hasReading ? 'color-mix(in srgb, var(--accent) 36%, transparent)' : 'var(--border)'}`,
        borderRadius: 14, marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: hasReading ? 'var(--accent-fill)' : 'color-mix(in srgb, var(--accent) 10%, transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {isPairing ? (
            <span style={{
              width: 22, height: 22, borderRadius: '50%',
              border: '2px solid color-mix(in srgb, var(--on-accent-fill) 30%, transparent)',
              borderTopColor: hasReading ? 'var(--on-accent-fill)' : 'var(--accent)',
              animation: 'bleSpin 0.9s linear infinite',
            }} />
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24"
              fill="none"
              stroke={hasReading ? 'var(--on-accent-fill)' : 'var(--accent)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6.5 6.5l11 11L12 23V1l5.5 5.5-11 11" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 10, color: 'var(--sub)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2,
          }}>
            {target ? target.label : (metric || 'Reading')}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            {hasReading ? (
              <>
                <span style={{
                  fontSize: 30, fontWeight: 700, color: 'var(--text)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '-0.5px',
                }}>{formattedValue}</span>
                <span style={{ fontSize: 13, color: 'var(--sub)' }}>{target?.unit || ''}</span>
              </>
            ) : (
              <span style={{ fontSize: 18, color: 'var(--sub)', fontStyle: 'italic' }}>
                {isPairing ? 'Reading…' : isError ? 'Error' : 'Awaiting pair…'}
              </span>
            )}
          </div>
          {hasReading && reading.battery_pct != null && (
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              Battery {reading.battery_pct}%{reading.status ? ` · ${reading.status}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 10 }}>
        {state === 'idle' ? (
          <>
            {onBack && (
              <button type="button" onClick={onBack} style={btnSecondary()}>Back</button>
            )}
            <button type="button" onClick={pair} style={btnPrimary()}>
              Pair {driver.name}
            </button>
          </>
        ) : hasReading ? (
          <>
            <button type="button" onClick={refresh} style={btnSecondary()} disabled={isPairing}>
              Refresh
            </button>
            <button type="button" onClick={disconnect} style={btnSecondary()}>
              Disconnect
            </button>
            <button
              type="button"
              onClick={() => onInsert(reading[metric], reading)}
              style={btnPrimary()}>
              Insert {formattedValue}
            </button>
          </>
        ) : isPairing ? (
          <button type="button" disabled style={{ ...btnPrimary(), opacity: 0.6, cursor: 'wait' }}>
            Connecting…
          </button>
        ) : (
          <button type="button" onClick={pair} style={btnPrimary()}>
            {isError ? 'Try again' : 'Pair'}
          </button>
        )}
      </div>
    </div>
  )
}

function btnPrimary() {
  return {
    flex: 2, padding: '12px 16px',
    background: 'var(--accent-fill)', border: 'none',
    borderRadius: 12, color: 'var(--on-accent-fill)',
    fontSize: 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', minHeight: 44, letterSpacing: '-0.1px',
    WebkitTapHighlightColor: 'transparent',
  }
}
function btnSecondary() {
  return {
    flex: 1, padding: '12px 16px',
    background: 'var(--card)', border: '1px solid var(--border)',
    borderRadius: 12, color: 'var(--text)',
    fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit', minHeight: 44,
    WebkitTapHighlightColor: 'transparent',
  }
}

function friendlyBleError(code) {
  switch (code) {
    case 'cancelled':           return 'Pairing cancelled.'
    case 'unsupported':         return 'Bluetooth not supported in this browser.'
    case 'NotFoundError':       return 'Device not found. Make sure it\'s on and nearby.'
    case 'SecurityError':       return 'Bluetooth blocked. Check site permissions.'
    case 'NetworkError':        return 'Bluetooth connection failed. Try again.'
    case 'NotSupportedError':   return 'This device isn\'t supported on this OS.'
    case 'short_payload':       return 'Received an incomplete reading. Try refreshing.'
    case 'read_failed':         return 'Failed to read the device. Try refreshing.'
    case 'not_connected':       return 'Not connected yet.'
    default:                    return code ? `Error: ${code}` : 'Something went wrong.'
  }
}
