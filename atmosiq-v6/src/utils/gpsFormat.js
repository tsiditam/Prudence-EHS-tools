/**
 * AtmosFlow — GPS Formatting
 *
 * Pure utilities for rendering geolocation coordinates in
 * human-readable form. Used by the photo metadata layer (sets the
 * shape on capture) and the DOCX renderer (formats the caption).
 *
 * Coordinate format: signed decimal degrees in, "DD.DDDD°N/S/E/W"
 * out. Truncated to 4 decimals (~11 m horizontal precision at the
 * equator). Accuracy displayed in meters as a "(±Nm)" suffix when
 * provided.
 *
 *   formatGpsCoord(38.9847, -77.1572, 12)
 *     → "38.9847°N, 77.1572°W (±12 m)"
 *
 *   formatGpsCoord(38.9847, -77.1572)
 *     → "38.9847°N, 77.1572°W"
 *
 *   formatGpsCoord(null, null)
 *     → null
 *
 * Used for defensibility documentation, not navigation — these
 * coordinates are an audit-trail signal of "this finding photo was
 * captured at this location at this time," not a precise survey
 * datum.
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Format a (lat, lng) pair plus optional accuracy as a human-readable
 * string. Returns null if either coordinate is missing or out of
 * range. Accuracy ≤ 0 is treated as missing.
 *
 * @param {number} lat       latitude in signed decimal degrees
 * @param {number} lng       longitude in signed decimal degrees
 * @param {number} [accuracy] reported accuracy in meters
 * @returns {string | null}
 */
export function formatGpsCoord(lat, lng, accuracy) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null
  // Reject degenerate or out-of-range inputs.
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  const latAbs = Math.abs(clamp(lat, -90, 90))
  const lngAbs = Math.abs(clamp(lng, -180, 180))
  const latH = lat >= 0 ? 'N' : 'S'
  const lngH = lng >= 0 ? 'E' : 'W'
  const base = `${latAbs.toFixed(4)}°${latH}, ${lngAbs.toFixed(4)}°${lngH}`
  if (isFiniteNumber(accuracy) && accuracy > 0) {
    return `${base} (±${Math.round(accuracy)} m)`
  }
  return base
}

/**
 * Capture a single geolocation reading, with sensible defaults for
 * field use (≤15s wait, high accuracy enabled, no cached older-than-
 * 60s readings). Resolves to either a position object or null if
 * geolocation is unavailable / denied / timed out. NEVER rejects —
 * callers don't need try/catch.
 *
 * The returned shape mirrors the GeolocationPosition.coords subset
 * we care about; using a flat object avoids dragging the
 * GeolocationPosition prototype into our serializable state.
 *
 * @returns {Promise<{ lat: number, lng: number, accuracy: number, capturedAt: string } | null>}
 */
export function captureGpsReading() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!pos || !pos.coords) { finish(null); return }
          const { latitude, longitude, accuracy } = pos.coords
          if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
            finish(null); return
          }
          finish({
            lat: latitude,
            lng: longitude,
            accuracy: isFiniteNumber(accuracy) ? accuracy : null,
            capturedAt: new Date().toISOString(),
          })
        },
        () => finish(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      )
    } catch {
      finish(null)
    }
  })
}
