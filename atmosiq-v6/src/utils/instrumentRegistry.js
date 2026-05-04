/**
 * AtmosFlow Instrument Registry
 * Persistent instrument library linked to user profile.
 * Tracks make/model, serial, calibration, and sensor type.
 */

const STORAGE_KEY = 'atmosflow:instruments'

// ── Calibration thresholds (methodology config) ──────────────────────────
//
// CAL_VALIDITY_DAYS — how long a calibration is considered current.
// Calibrations older than this are treated as expired and block
// finalization (see MobileApp.finishAssessment guard). Per-device-class
// override is on the roadmap; today the value is uniform across sensor
// types. Keep aligned with isOutOfCal() below.
//
// CAL_WARN_DAYS — how many days before expiry the dashboard surfaces a
// pre-expiry warning banner. Banner renders when daysToExpiry is in
// (-∞, CAL_WARN_DAYS]: amber while still positive, red once negative.
//
// Provenance: AtmosFlow defensibility hardening spec (calibration
// warnings); resilience-engineering principle (Hollnagel) — surface
// only what diverges from expected state. CLAUDE.md describes the
// gate as 270-day; live code has been at 365 since the original
// instrument-registry implementation. The 365 value is preserved here
// to keep finalization-gate behavior unchanged; reconciling the
// CLAUDE.md figure with live code is a separate methodology workstream.
export const CAL_VALIDITY_DAYS = 365
export const CAL_WARN_DAYS = 30

export const SENSOR_TYPES = [
  { id: 'multi_gas', label: 'Multi-Gas / IAQ Meter', measures: ['co2', 'tf', 'rh', 'co'] },
  { id: 'particle_counter', label: 'Particle Counter', measures: ['pm'] },
  { id: 'pid', label: 'Photoionization Detector (PID)', measures: ['tv'] },
  { id: 'hcho_meter', label: 'Formaldehyde Meter', measures: ['hc'] },
  { id: 'iso_particle', label: 'ISO-Certified Laser Particle Counter', measures: ['iso_class'], iso14644: true },
  { id: 'corrosion_coupon', label: 'Corrosion Coupon / Reactivity Monitor', measures: ['gaseous_corrosion'] },
  { id: 'thermal_camera', label: 'Thermal Imaging Camera', measures: [] },
  { id: 'moisture_meter', label: 'Moisture Meter', measures: [] },
  { id: 'anemometer', label: 'Anemometer / Airflow Meter', measures: ['cfm_person', 'ach'] },
  { id: 'other', label: 'Other', measures: [] },
]

export function loadInstruments() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}

export function saveInstruments(instruments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(instruments))
}

export function addInstrument(inst) {
  const instruments = loadInstruments()
  const entry = {
    id: 'inst-' + Date.now().toString(36),
    nickname: inst.nickname || '',
    make: inst.make || '',
    serial: inst.serial || '',
    sensorType: inst.sensorType || 'other',
    lastCalDate: inst.lastCalDate || null,
    calStatus: inst.calStatus || 'unknown',
    createdAt: new Date().toISOString(),
  }
  instruments.push(entry)
  saveInstruments(instruments)
  return entry
}

export function removeInstrument(id) {
  const instruments = loadInstruments().filter(i => i.id !== id)
  saveInstruments(instruments)
}

export function isOutOfCal(instrument) {
  if (!instrument?.lastCalDate) return true
  const calDate = new Date(instrument.lastCalDate)
  const daysSinceCal = (Date.now() - calDate.getTime()) / 86400000
  return daysSinceCal > CAL_VALIDITY_DAYS
}

/**
 * Pure helper for the dashboard exception banner. Returns null when
 * the instrument's calibration is current (banner renders nothing —
 * the absence is itself the signal). Returns a state object only when
 * the assessor needs to act before starting an assessment.
 *
 * @param {string} meter         human-readable meter label (e.g. "Graywolf IQ-610")
 * @param {string|null} calDate  ISO date string of the last calibration; null/undefined means not recorded
 * @param {Date} [now]           injectable clock for testing; defaults to Date.now()
 * @returns {null | { tone: 'warn'|'danger', kind: 'unrecorded'|'expiring'|'expired', daysToExpiry: number|null, message: string }}
 */
export function getCalibrationBannerState(meter, calDate, now = new Date()) {
  if (!meter) return null
  if (!calDate) {
    return {
      tone: 'warn',
      kind: 'unrecorded',
      daysToExpiry: null,
      message: `${meter} calibration date not recorded`,
    }
  }
  const daysSince = Math.floor((now.getTime() - new Date(calDate).getTime()) / 86400000)
  const daysToExpiry = CAL_VALIDITY_DAYS - daysSince
  if (daysToExpiry < 0) {
    return {
      tone: 'danger',
      kind: 'expired',
      daysToExpiry,
      message: `${meter} calibration expired ${Math.abs(daysToExpiry)} days ago`,
    }
  }
  if (daysToExpiry <= CAL_WARN_DAYS) {
    return {
      tone: 'warn',
      kind: 'expiring',
      daysToExpiry,
      message: `${meter} calibration expires in ${daysToExpiry} days`,
    }
  }
  return null
}

export function getCalWarning(instrument) {
  if (!instrument) return null
  if (!instrument.lastCalDate) return 'Calibration date not recorded'
  if (isOutOfCal(instrument)) {
    const days = Math.round((Date.now() - new Date(instrument.lastCalDate).getTime()) / 86400000)
    return `Non-Defensible: Out of calibration (${days} days since last cal)`
  }
  return null
}

export function isISO14644Certified(instrument) {
  if (!instrument) return false
  const stype = SENSOR_TYPES.find(s => s.id === instrument.sensorType)
  return stype?.iso14644 === true
}

export function getInstrumentsForMeasurement(measurementId) {
  const instruments = loadInstruments()
  return instruments.filter(inst => {
    const stype = SENSOR_TYPES.find(s => s.id === inst.sensorType)
    return stype?.measures?.includes(measurementId)
  })
}

export function buildCalibrationLog(usedInstrumentIds) {
  const instruments = loadInstruments()
  return (usedInstrumentIds || []).map(id => {
    const inst = instruments.find(i => i.id === id)
    if (!inst) return null
    return {
      nickname: inst.nickname || inst.make,
      make: inst.make,
      serial: inst.serial,
      sensorType: SENSOR_TYPES.find(s => s.id === inst.sensorType)?.label || inst.sensorType,
      lastCalDate: inst.lastCalDate,
      calStatus: inst.calStatus,
      outOfCal: isOutOfCal(inst),
      warning: getCalWarning(inst),
    }
  }).filter(Boolean)
}
