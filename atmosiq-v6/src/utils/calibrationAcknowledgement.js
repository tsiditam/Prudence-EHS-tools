/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * calibrationAcknowledgement — the record an assessor leaves when they
 * finalize an assessment past the instrument-calibration interrupt.
 *
 * ── The gap this closes ────────────────────────────────────────────────
 *
 * `MobileApp.finishAssessment` interrupts finalization when instrument
 * metadata is missing or calibration is older than `CAL_VALIDITY_DAYS`.
 * The assessor could then proceed in a single click, and NOTHING was
 * written down: not what was flagged, not who dismissed it, not why.
 *
 * That is the weakest possible version of a control CLAUDE.md calls a
 * litigation defense. An interrupt nobody records is indistinguishable,
 * after the fact, from an interrupt that never fired — which is exactly
 * the question a reviewer or opposing expert asks.
 *
 * ── What this is NOT ───────────────────────────────────────────────────
 *
 * It is not the old IH score-override (`consultantReportOverride.js`,
 * deleted). That mutated the engine's score so refusal triggers stopped
 * firing. Since engine v2.9 the engine no longer refuses — it issues
 * with data-gap warnings — so suppressing a trigger would now DELETE a
 * real disclosure from the report instead of explaining it.
 *
 * The distinction is the whole point: this ADDS an audit artifact, it
 * never REMOVES a warning. An acknowledged calibration gap still fires
 * the engine's data-gap trigger, still appears under "Limitations on
 * Reliance", and still prints in the calibration appendix. The
 * acknowledgement sits alongside those disclosures and says who accepted
 * them and on what reasoning.
 *
 * Pure data + pure functions: no React, no storage, no network.
 */

/** Schema version, so a stored acknowledgement can be migrated later. */
export const CAL_ACK_VERSION = 1

/** Minimum justification length. Short enough not to be a wall, long
 *  enough that "ok" or "." does not qualify as professional reasoning. */
export const MIN_JUSTIFICATION_LEN = 20

/** Cap, mirroring the peer-review notes cap. */
export const MAX_JUSTIFICATION_LEN = 2000

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/**
 * Is this justification acceptable?
 *
 * Returned as a reason rather than a boolean so the UI can say WHY the
 * proceed button is disabled instead of leaving the assessor guessing.
 *
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
export function validateJustification(text) {
  const t = str(text)
  if (!t) return { ok: false, reason: 'A brief justification is required to proceed.' }
  if (t.length < MIN_JUSTIFICATION_LEN) {
    return {
      ok: false,
      reason: `Please give a little more detail (at least ${MIN_JUSTIFICATION_LEN} characters) — this is recorded on the report.`,
    }
  }
  if (t.length > MAX_JUSTIFICATION_LEN) {
    return { ok: false, reason: `Keep it under ${MAX_JUSTIFICATION_LEN} characters.` }
  }
  return { ok: true }
}

/**
 * Build the acknowledgement record.
 *
 * `items` is the exact list the interrupt showed the assessor — stored
 * verbatim rather than re-derived at read time, because the record has
 * to reflect what they were actually looking at when they decided. A
 * later data edit must not rewrite the history of that decision.
 *
 * @param {object} input
 * @param {string[]} input.items         what the interrupt flagged
 * @param {string} input.justification   the assessor's reasoning
 * @param {object} [input.assessor]      { name, credentials }
 * @param {string} [input.at]            ISO timestamp; defaults to now
 * @returns {object|null} null when the justification is unacceptable
 */
export function buildCalibrationAcknowledgement({ items, justification, assessor, at } = {}) {
  if (!validateJustification(justification).ok) return null
  const list = Array.isArray(items) ? items.map(str).filter(Boolean) : []
  const who = assessor || {}
  return {
    version: CAL_ACK_VERSION,
    items: list,
    justification: str(justification).slice(0, MAX_JUSTIFICATION_LEN),
    assessorName: str(who.name) || null,
    assessorCredentials: Array.isArray(who.credentials)
      ? who.credentials.filter(Boolean).join(', ')
      : str(who.credentials) || null,
    acknowledgedAt: str(at) || new Date().toISOString(),
  }
}

/** Whether a stored value is a usable acknowledgement. */
export function hasAcknowledgement(ack) {
  return !!(ack && typeof ack === 'object' && str(ack.justification))
}

/** Normalize whatever a stored record carries. Tolerates older shapes. */
export function normalizeAcknowledgement(raw) {
  if (!hasAcknowledgement(raw)) return null
  return {
    version: Number.isFinite(raw.version) ? raw.version : CAL_ACK_VERSION,
    items: Array.isArray(raw.items) ? raw.items.map(str).filter(Boolean) : [],
    justification: str(raw.justification),
    assessorName: str(raw.assessorName) || null,
    assessorCredentials: str(raw.assessorCredentials) || null,
    acknowledgedAt: str(raw.acknowledgedAt) || null,
  }
}

/** Short label for the in-app record, e.g. a history row. */
export function acknowledgementSummary(ack) {
  const a = normalizeAcknowledgement(ack)
  if (!a) return null
  const n = a.items.length
  const who = a.assessorName
    ? `${a.assessorName}${a.assessorCredentials ? `, ${a.assessorCredentials}` : ''}`
    : 'the assessor'
  return `${n} instrument item${n === 1 ? '' : 's'} acknowledged by ${who}`
}

/**
 * The date a client reads, from the timestamp we store.
 *
 * The record keeps a full ISO instant because it is an audit artifact
 * and the time of day can matter. The report prints the date only —
 * "2026-08-02T13:55:00.000Z" in the middle of a sentence reads as a
 * machine leaking into a professional document, and the rest of the
 * report already dates things as YYYY-MM-DD. Deliberately NOT
 * locale-formatted: the same report must read identically wherever it
 * is generated, and this string ends up in a client deliverable.
 */
function displayDate(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(str(iso))
  return m ? m[1] : str(iso)
}

/**
 * The sentences the calibration appendix prints.
 *
 * Returned as an array of paragraph strings so the DOCX builder can
 * style them without parsing prose. Deliberately states three things a
 * reader needs and could not previously get anywhere: WHAT was
 * outstanding, WHO accepted it, and WHY.
 *
 * Nothing here excuses the gap — the gap is still disclosed by its own
 * appendix row and, where applicable, by the report's data-gap warning.
 * This says a named professional saw it and proceeded on stated
 * reasoning, which is the difference between an undocumented dismissal
 * and a defensible judgement call.
 */
export function acknowledgementNotes(ack) {
  const a = normalizeAcknowledgement(ack)
  if (!a) return []
  const who = a.assessorName
    ? `${a.assessorName}${a.assessorCredentials ? `, ${a.assessorCredentials}` : ''}`
    : 'The assessor of record'
  const when = a.acknowledgedAt ? ` on ${displayDate(a.acknowledgedAt)}` : ''
  const out = [
    `Instrument-record exception acknowledged: ${who} reviewed the outstanding `
    + `instrument-record items below and elected to finalize this assessment${when}. `
    + 'The exception is recorded here; it does not resolve the underlying gap.',
  ]
  if (a.items.length) {
    out.push(`Items outstanding at finalization: ${a.items.join('; ')}.`)
  }
  out.push(`Stated basis: "${a.justification}"`)
  return out
}
