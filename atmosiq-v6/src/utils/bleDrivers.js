/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * BLE instrument drivers. Each driver knows how to:
 *   1. Match a Bluetooth device (namePrefix and/or service UUID)
 *   2. Subscribe / read the device's current-values GATT characteristic
 *   3. Parse the raw bytes into a normalized IAQ reading shape
 *
 * The registry is intentionally additive — new device families (TSI
 * Q-Trak, Dylos, IAQ Sense XL, Aranet Radon, etc.) drop in as new
 * driver entries without touching the hook or UI layer. The reading
 * shape is canonical:
 *
 *   {
 *     timestamp_iso,            // when the read happened (client clock)
 *     co2_ppm?,                  // CO2, parts per million
 *     temperature_c?,            // dry-bulb, °C
 *     temperature_f?,            // computed from _c for display
 *     humidity_rh?,              // relative humidity, %
 *     pressure_hpa?,             // barometric pressure, hPa
 *     battery_pct?,              // device battery, %
 *     status?,                   // device-defined status code
 *   }
 *
 * Only the metrics the device actually emits will be present —
 * consumers use Object.prototype.hasOwnProperty to gate downstream
 * field-fill logic.
 *
 * --- Aranet4 protocol references ---
 * Service / characteristic UUIDs and byte layout are derived from
 * the publicly-documented protocol used by SAF's open-source
 * Aranet4-Python and Aranet4-ESP32 projects. The 13-byte current-
 * values payload layout:
 *
 *   bytes  0-1   CO2 ppm                  (uint16 LE)
 *   bytes  2-3   Temperature × 20 (°C)    (uint16 LE)
 *   bytes  4-5   Pressure × 10 (hPa)      (uint16 LE)
 *   byte   6     Humidity %RH             (uint8)
 *   byte   7     Battery %                (uint8)
 *   byte   8     Status (1=green, 2=yel, 3=red)
 *   bytes  9-10  Interval seconds         (uint16 LE)
 *   bytes 11-12  Ago seconds              (uint16 LE)
 */

const ARANET4_SERVICE_UUID = 'f0cd1400-95da-4f4b-9ac8-aa55d312af0c'
const ARANET4_CURRENT_VALUES_UUID = 'f0cd1503-95da-4f4b-9ac8-aa55d312af0c'

/**
 * Parse the 13-byte Aranet4 current-values payload into a canonical
 * reading. Tolerates shorter buffers by leaving the missing metrics
 * out — defensive against firmware variants that emit a truncated
 * payload.
 *
 * @param {DataView} dv
 * @returns {Object} canonical reading (only present metrics populated)
 */
export function parseAranet4(dv) {
  if (!dv || typeof dv.byteLength !== 'number' || dv.byteLength < 8) {
    return { _parseError: 'short_payload', byteLength: dv ? dv.byteLength : 0 }
  }
  const out = { timestamp_iso: new Date().toISOString() }
  // CO2 — bytes 0-1 LE. Treat 0 / 0xFFFF as "no measurement yet" so
  // brand-new units don't emit a 0 ppm reading that looks like a real
  // measurement.
  const co2 = dv.getUint16(0, true)
  if (co2 > 0 && co2 < 0xFFFF) out.co2_ppm = co2
  // Temperature — uint16 LE, value / 20 = °C. Defensive bounds: real
  // IAQ readings are between -20°C and +60°C; anything outside is
  // probably bit-flip garbage and gets dropped.
  if (dv.byteLength >= 4) {
    const tRaw = dv.getUint16(2, true)
    const tc = tRaw / 20
    if (tc > -50 && tc < 80) {
      out.temperature_c = Math.round(tc * 10) / 10
      out.temperature_f = Math.round((tc * 9 / 5 + 32) * 10) / 10
    }
  }
  // Pressure — uint16 LE, value / 10 = hPa. Sea-level normal is
  // ~1013 hPa; extreme weather might dip to 900 or spike to 1080.
  // Anything outside 700-1100 is bit-flip garbage.
  if (dv.byteLength >= 6) {
    const pRaw = dv.getUint16(4, true)
    const phpa = pRaw / 10
    if (phpa > 700 && phpa < 1100) {
      out.pressure_hpa = Math.round(phpa * 10) / 10
    }
  }
  // Humidity — uint8 byte 6. 0-100 valid.
  if (dv.byteLength >= 7) {
    const rh = dv.getUint8(6)
    if (rh <= 100) out.humidity_rh = rh
  }
  // Battery — uint8 byte 7.
  if (dv.byteLength >= 8) {
    const b = dv.getUint8(7)
    if (b <= 100) out.battery_pct = b
  }
  // Status — uint8 byte 8. 1=green (good), 2=yellow (warning),
  // 3=red (poor). Surface the device's own judgment to the UI so we
  // can color-code without re-deriving thresholds.
  if (dv.byteLength >= 9) {
    const s = dv.getUint8(8)
    if (s >= 1 && s <= 3) {
      out.status = s === 1 ? 'good' : s === 2 ? 'warning' : 'poor'
    }
  }
  return out
}

/**
 * Aranet4 driver entry. The `pair` and `read` methods are the
 * Web Bluetooth surface — kept on the driver (not the hook) so a
 * future TSI / Dylos driver with a different protocol can drop in
 * unchanged. Hook orchestrates lifecycle; drivers do I/O.
 */
export const ARANET4_DRIVER = {
  id: 'aranet4',
  name: 'Aranet4',
  vendor: 'SAF Tehnika',
  // Metrics this device emits. Drives BleSensorButton's filter — a
  // CO2 input only shows drivers whose metrics include 'co2_ppm'.
  metrics: ['co2_ppm', 'temperature_c', 'humidity_rh', 'pressure_hpa', 'battery_pct'],
  // Web Bluetooth requestDevice filter.
  filter: { services: [ARANET4_SERVICE_UUID] },
  serviceUuid: ARANET4_SERVICE_UUID,
  characteristicUuid: ARANET4_CURRENT_VALUES_UUID,
  parse: parseAranet4,
}

/**
 * Driver registry. Order matters only for the "Add sensor" picker —
 * most common at the top.
 */
export const BLE_DRIVERS = [
  ARANET4_DRIVER,
]

/**
 * Look up drivers that can produce a given canonical metric. Used by
 * BleSensorButton to filter the picker when wired to a specific
 * input field.
 *
 * @param {string} metric — e.g. 'co2_ppm'
 * @returns {Array<typeof ARANET4_DRIVER>}
 */
export function driversForMetric(metric) {
  if (!metric) return BLE_DRIVERS.slice()
  return BLE_DRIVERS.filter((d) => d.metrics.includes(metric))
}

/**
 * Imperative feature-detect: is the browser shipping the Web
 * Bluetooth API? false on iOS Safari (where most IHs work), true
 * on Chrome/Edge desktop, Android Chrome, and the Bluefy browser
 * for iOS.
 */
export function isBleSupported() {
  return typeof navigator !== 'undefined'
    && typeof navigator.bluetooth !== 'undefined'
    && typeof navigator.bluetooth.requestDevice === 'function'
}
