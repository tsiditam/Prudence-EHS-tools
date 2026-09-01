/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * vocConversion — the one place a VOC quantity crosses between a
 * volumetric basis (ppb / ppm) and a mass basis (µg/m³ / mg/m³).
 *
 * Why this module exists at all
 * -----------------------------
 * Most field PIDs log TVOC in ppb; the engine's `tv` reading field is µg/m³.
 * So a conversion has to happen somewhere, and it had been happening in three
 * places under three different policies — the parse-to-reading path
 * converted (`sensorAveragesToFields`), the reference-projection path
 * refused to, and the criteria registry described a third rule. The same
 * ppb log therefore reached the assessment as a µg/m³ number scored against
 * an advisory tier, and reached the monitoring report as "no valid comparison
 * can be made". Both cannot be right.
 *
 * This module is unaffected by the 2026-08 removal of every TVOC THRESHOLD.
 * Nothing judges a TVOC reading any more, but readings still cross units —
 * a logger reporting ppb feeding an engine field in µg/m³, a card displaying
 * one while the series is stored in the other — and getting that wrong is a
 * factual error about the air regardless of whether anything scores it.
 *
 * The policy, stated once
 * -----------------------
 * WITHIN a basis (mg/m³ ↔ µg/m³, ppm ↔ ppb) the conversion is a decimal
 * prefix shift: exact, assumption-free, always allowed.
 *
 * ACROSS bases it needs a molecular weight, and TVOC is a mixture with no
 * single one. Mass concentration is therefore expressed RELATIVE TO A
 * REFERENCE COMPOUND — isobutylene by convention, because that is what PIDs
 * are calibrated against and what their own µg/m³ display already uses
 * internally. Crossing is allowed, on two conditions:
 *
 *   1. the reference compound is named on the result, never assumed
 *      silently, and
 *   2. every caller that renders a crossed value renders the disclosure
 *      with it (`tvocEquivalenceNote`).
 *
 * What the disclosure has to say, and why it is not a hedge: an
 * isobutylene-equivalent number is a real, reproducible measurement of the
 * air — it is what the instrument measured — but a PID's response varies by
 * compound, so it is not the speciated mass of whatever mixture is actually
 * present. The value is indicative. That limitation belongs to
 * the reading and exists in EVERY unit; it is not created by converting,
 * and withholding the conversion does not remove it.
 *
 * Contrast formaldehyde, which crosses freely: one compound, one molecular
 * weight (30.03), so µg/m³ ↔ ppb is physics rather than an assumption.
 */

// Molar volume of an ideal gas at 25 °C and 1 atm (L/mol).
export const MOLAR_VOLUME_25C = 24.45

// Formaldehyde (HCHO) molecular weight (g/mol). A single compound, so the
// ppb ↔ µg/m³ conversion is exact — no reference-compound assumption.
export const HCHO_MW = 30.03

/**
 * PID calibration compounds for the TVOC volumetric ↔ mass conversion.
 * `mw` is g/mol; `aliases` are the names an assessor may write in the
 * free-text calibration-gas field.
 *
 * Isobutylene is the default because it is the near-universal PID span gas.
 * The rest are here because they are the ones actually seen in the field on
 * the `pid_cal_gas` intake, and a converter that recognised only two names
 * would have made that captured field decorative. This is a list of
 * calibration gases, not of VOCs generally — do not add a compound because
 * it might be present in the air; add it because a meter is spanned to it.
 */
export const TVOC_REFERENCES = {
  isobutylene: { label: 'Isobutylene', mw: 56.11, aliases: ['isobutylene', 'isobutene', 'iso-butylene', '2-methylpropene', 'ibe'] },
  toluene:     { label: 'Toluene',     mw: 92.14, aliases: ['toluene', 'methylbenzene'] },
  benzene:     { label: 'Benzene',     mw: 78.11, aliases: ['benzene'] },
  hexane:      { label: 'n-Hexane',    mw: 86.18, aliases: ['hexane', 'n-hexane'] },
  isopropanol: { label: 'Isopropanol', mw: 60.10, aliases: ['isopropanol', 'isopropyl alcohol', '2-propanol', 'ipa'] },
}

export const DEFAULT_TVOC_REFERENCE = 'isobutylene'

/** Resolve a reference-compound key to its entry, falling back to the default. */
export function tvocReference(key) {
  return TVOC_REFERENCES[key] || TVOC_REFERENCES[DEFAULT_TVOC_REFERENCE]
}

/**
 * Read a compound out of the free-text calibration-gas field
 * (`pid_cal_gas`, "e.g. Isobutylene 100 ppm"; the monitoring session's
 * `calibration.gas`).
 *
 * Returns `{ key, reference, stated, recognised, recorded }`. Three states,
 * and every caller has to tell them apart because they license different
 * sentences:
 *
 *   recorded:false               nothing was captured. Isobutylene by
 *                                convention, and the note says it is a
 *                                convention rather than a record.
 *   recognised:true              the survey's own span gas. The conversion
 *                                is grounded in what the meter was set to.
 *   recorded:true/recognised:false
 *                                something was written that this module has
 *                                no molecular weight for. Isobutylene is
 *                                used so a reference still appears, and the
 *                                note names what was written so a reader can
 *                                see the mismatch instead of inheriting it.
 *
 * Matching is on whole words: "isobutane" is a different compound from
 * "isobutylene", and a substring test would happily confuse the two.
 */
export function parseCalibrationGas(text) {
  const stated = String(text == null ? '' : text).trim()
  if (!stated) {
    return { key: null, reference: null, stated: '', recognised: false, recorded: false }
  }
  const hay = stated.toLowerCase()
  for (const [key, ref] of Object.entries(TVOC_REFERENCES)) {
    const hit = ref.aliases.some((a) => new RegExp(`(^|[^a-z0-9-])${a}([^a-z0-9-]|$)`, 'i').test(hay))
    if (hit) return { key, reference: ref, stated, recognised: true, recorded: true }
  }
  return { key: null, reference: null, stated, recognised: false, recorded: true }
}

// Convert a volumetric mixing ratio (ppb) to mass concentration (µg/m³) for a
// reference compound of molecular weight `mw` (g/mol). µg/m³ = ppb · MW ÷ Vm.
export function ppbToUgm3(ppb, mw) {
  if (ppb == null || !Number.isFinite(ppb) || !Number.isFinite(mw)) return null
  return (ppb * mw) / MOLAR_VOLUME_25C
}

// Inverse of ppbToUgm3 — mass concentration (µg/m³) back to ppb.
export function ugm3ToPpb(ugm3, mw) {
  if (ugm3 == null || !Number.isFinite(ugm3) || !Number.isFinite(mw) || mw === 0) return null
  return (ugm3 * MOLAR_VOLUME_25C) / mw
}

const norm = (u) => String(u || '').toLowerCase()

/**
 * Which basis a unit belongs to: 'mass' (µg/m³, mg/m³), 'volume' (ppb, ppm),
 * or null for anything else — a bare air-quality index, a blank, a unit we
 * do not recognise. Null never converts; it passes through untouched rather
 * than being reinterpreted into a plausible-looking wrong number.
 */
export function tvocBasis(unit) {
  const u = norm(unit)
  if (/µg|ug|mg/.test(u)) return 'mass'
  if (u.includes('ppb') || u.includes('ppm')) return 'volume'
  return null
}

// Scale factor taking a unit to its basis's canonical unit (µg/m³ or ppb).
function toCanonicalScale(unit) {
  const u = norm(unit)
  if (/mg\/m/.test(u)) return 1000       // mg/m³ → µg/m³
  if (u.includes('ppm')) return 1000     // ppm   → ppb
  return 1                               // already canonical
}

/**
 * Convert a TVOC quantity between any two supported units.
 *
 * Returns `null` when either unit has no recognised basis — the caller must
 * handle that rather than receive a guess. Otherwise returns:
 *
 *   { value, crossedBasis, reference }
 *
 * `crossedBasis` is true when the conversion assumed a reference compound,
 * which is exactly when the caller owes the reader `tvocEquivalenceNote`.
 * `reference` is the compound entry used (null when no basis was crossed).
 *
 * Direction-agnostic on purpose: the same function projects a published
 * µg/m³ tier into a PID's ppb, and a ppb reading into µg/m³ for the engine's
 * `tv` field. One implementation, so the two directions cannot drift.
 */
export function convertTvoc(value, fromUnit, toUnit, opts = {}) {
  if (value == null || !Number.isFinite(value)) return null
  const from = tvocBasis(fromUnit)
  const to = tvocBasis(toUnit)
  if (!from || !to) return null

  // Everything goes via the basis's canonical unit, so a cross-basis
  // conversion is exactly one molecular-weight step regardless of the
  // prefixes on either end.
  const canonical = value * toCanonicalScale(fromUnit)

  if (from === to) {
    return { value: canonical / toCanonicalScale(toUnit), crossedBasis: false, reference: null }
  }

  const reference = tvocReference(opts.reference)
  const crossed = from === 'volume'
    ? ppbToUgm3(canonical, reference.mw)   // ppb → µg/m³
    : ugm3ToPpb(canonical, reference.mw)   // µg/m³ → ppb
  if (crossed == null) return null
  return { value: crossed / toCanonicalScale(toUnit), crossedBasis: true, reference }
}

/**
 * The disclosure that must accompany any value `convertTvoc` returned with
 * `crossedBasis: true`. Names the assumption, says where it came from, states
 * what it does and does not support, and gives the next step that would
 * settle it.
 *
 * @param {object} [reference] the compound entry actually used
 * @param {object} [provenance] a `parseCalibrationGas` result, when the
 *   caller has one. Its three states change the middle clause: a recorded and
 *   recognised gas is a fact about this survey; a recorded but unrecognised
 *   one is a mismatch the reader must see; nothing recorded is a convention.
 */
export function tvocEquivalenceNote(reference = tvocReference(), provenance = null) {
  const r = reference && reference.mw ? reference : tvocReference()
  const name = String(r.label).toLowerCase()
  const head = `Converted as ${name}-equivalent (MW ${r.mw}, 25 °C / 1 atm)`

  let ground
  if (provenance && provenance.recognised) {
    ground = ` — the calibration gas recorded for this survey (${provenance.stated}).`
  } else if (provenance && provenance.recorded) {
    // The assessor DID record a span gas and it is not one this conversion
    // has a weight for. Saying "the compound PIDs are calibrated against"
    // here would assert the opposite of the record.
    ground = ` — the default span gas. The calibration gas recorded for this survey (${provenance.stated}) `
      + 'is not one this conversion carries a molecular weight for, so the mass figures do not reflect '
      + 'it; confirm the instrument\'s calibration basis before relying on them.'
  } else {
    ground = ' — the compound photoionization detectors are conventionally calibrated against. '
      + 'The calibration gas for this survey was not recorded.'
  }

  return `${head}${ground} PID response varies by compound, so this is an indicative total, not the `
    + 'speciated mass of the mixture actually present; speciate per EPA Method TO-17 to identify '
    + 'individual compounds.'
}
