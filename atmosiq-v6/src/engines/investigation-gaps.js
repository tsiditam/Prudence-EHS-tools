/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Investigation gaps — the readiness question the category checklist
 * cannot ask.
 *
 * ── What was missing ───────────────────────────────────────────────────
 * `sufficiency.js` asks whether enough fields were filled in per
 * category: does Ventilation have a CO₂ reading, does Contaminants have
 * PM2.5 and CO. That is a completeness test, and an assessment can pass
 * it while leaving the actual question open.
 *
 * The question a reviewer asks is different, and sharper:
 *
 *     Did you gather what is needed to support the conclusions this
 *     report actually draws?
 *
 * A walkthrough can fill every required field, name inadequate
 * ventilation as the cause, and never have measured carbon monoxide in a
 * building where occupants reported headaches. Nothing in a per-category
 * count notices that, because the categories are all complete. What
 * notices it is knowing which explanations are live and which
 * measurement bears on each — and the investigation engine now knows
 * both.
 *
 * ── Gaps, not blockers ─────────────────────────────────────────────────
 * These do not stop finalization, deliberately. A screening walkthrough
 * legitimately ships with differentials it did not test — that is what a
 * screening assessment IS, and blocking on it would make the product
 * unusable for its main purpose. What the assessor is owed is that the
 * open differential is in front of them, named, with the measurement
 * that would close it, before they sign. That is a gap: it moves the
 * verdict to `gaps`, shows in the Readiness panel, and travels in the
 * assessment context.
 *
 * ── Derived, never re-decided ──────────────────────────────────────────
 * Every gap reads the investigation state and nothing else. No threshold
 * here, no second opinion about whether a reading is elevated, no
 * hypothesis this file invents. If the state says a differential is live
 * and its parameter untested, that is the gap; if it does not, there is
 * no gap to report.
 */

import { PARAMETER_LABEL } from '../engine/investigation'

/** Statuses that keep a differential in play. Mirrors the engine's own. */
const LIVE = new Set(['supported_by_measurement', 'mixed_measurement_support', 'untested'])

/**
 * A parameter's reader-facing name. Falls back to the key rather than
 * dropping it: an unlabelled parameter should read oddly, not vanish.
 */
const labelFor = (key) => PARAMETER_LABEL[key] || key

const list = (items) => {
  const clean = items.filter(Boolean)
  if (clean.length <= 1) return clean[0] || ''
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`
}

/**
 * Read the investigation state and report what a reviewer would ask
 * about. Returns [] for anything it cannot read — a partial draft, a
 * pre-engine assessment, a caller that did not supply the state — so
 * adding this inspector can never make a previously clean assessment
 * report a gap it cannot explain.
 *
 * @param {object|null} investigation — the state from
 *   `deriveInvestigation()`, as carried on AssessmentContext.investigation
 * @returns {Array<{kind, severity, zones, count, why}>} gaps in the same
 *   shape `detectDefensibilityGaps()` returns, so both streams render and
 *   serialize identically.
 */
export function detectInvestigationGaps(investigation) {
  if (!investigation || typeof investigation !== 'object') return []
  const hypotheses = Array.isArray(investigation.hypotheses) ? investigation.hypotheses : []
  if (hypotheses.length === 0) return []

  const gaps = []
  const live = hypotheses.filter((h) => h && LIVE.has(h.status))
  const tests = Array.isArray(investigation.discriminatingTests) ? investigation.discriminatingTests : []

  // ── Two explanations standing, and nothing measured separates them ──
  // The sharpest form of the problem: the report is about to name
  // conditions while a competing explanation remains untested, and the
  // engine can say exactly which measurement would settle it.
  const namedByTest = new Set()
  if (investigation.stage === 'differential' && tests.length > 0) {
    const test = tests[0]
    const between = Array.isArray(test.between) ? test.between : []
    for (const name of between) namedByTest.add(name)
    gaps.push({
      kind: 'differential_unresolved',
      severity: 'warn',
      zones: [],
      count: live.length,
      why: [
        `${live.length} explanation${live.length === 1 ? '' : 's'} remain open.`,
        between.length === 2
          ? `Nothing measured so far separates the leading two: ${between[0]}, and ${between[1]}.`
          : 'Nothing measured so far separates them.',
        test.parameter ? `Measuring ${test.parameter} would.` : '',
        'A report finalized now names conditions without ruling out the alternative, which is the '
        + 'first thing a reviewer will ask about.',
      ].filter(Boolean).join(' '),
    })
  }

  // ── A live explanation nobody measured against ──────────────────────
  // Reported once per differential rather than once per parameter: the
  // assessor decides whether to chase an explanation, not whether to
  // chase each of its readings.
  for (const h of live) {
    const untested = Array.isArray(h.untestedParameters) ? h.untestedParameters : []
    if (untested.length === 0) continue
    if (namedByTest.has(h.name)) continue
    gaps.push({
      kind: 'untested_differential',
      severity: h.leading ? 'warn' : 'info',
      zones: [],
      count: untested.length,
      why:
        `"${h.name}" is on the table${h.leading ? ' and currently leads the differential' : ''}, `
        + `and the measurement that bears on it — ${list(untested.map(labelFor))} — was not taken. `
        + 'It has not been ruled out; it has not been tested.',
    })
  }

  return gaps
}

export const __test = { LIVE, list, labelFor }
