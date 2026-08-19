/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow — Additional criteria considered.
 *
 * Published criteria a reader could reasonably expect to see applied to
 * this data, which were NOT the basis of any finding — each paired with
 * the reason. A report that compares particulate against the EPA 24-hour
 * NAAQS invites the question "EPA lowered PM2.5 to 9 — why 35?"; this is
 * where that question is answered, in the report, rather than left to the
 * reader to raise.
 *
 * ── What belongs here, and what does not ───────────────────────────────
 * `src/constants/criteria.js` is the registry of criteria that ARE
 * applied: every entry there carries a threshold, an averaging period, a
 * class and a citation, and can produce a finding. This file is its
 * complement — criteria deliberately left out, and why. The two are
 * mutually exclusive by construction, and
 * `tests/engine/contextual-standards.test.ts` enforces that: an entry
 * here may not claim "not applied" for a criterion the registry applies.
 * That guard exists because this file previously asserted the annual
 * PM2.5 NAAQS was absent from scoring, and stayed on that claim after
 * the criterion registry added it.
 *
 * ── Voice ──────────────────────────────────────────────────────────────
 * This renders into the client deliverable, so it is written for the
 * reader, not about the software. It states which criterion was used,
 * which was not, and what would make the omitted one worth evaluating.
 * It does not describe AtmosFlow's internals — an earlier revision did
 * ("standards manifest", "deterministic scoring path") and was pulled
 * from the report for exactly that reason. See docs/REPORTING_VOICE.md.
 *
 * Engine layering: this file lives in `src/engines/` (plural,
 * orchestration), reads no threshold from `STD`, and produces no score.
 * Under CLAUDE.md's two-layer rule it is editorial — it changes how a
 * criterion choice is communicated, never what the engine concludes.
 *
 * Contact: tsidi@prudenceehs.com
 */

/**
 * Zone measurement fields that indicate a topic was actually assessed.
 * Keys match the intake ids in `src/constants/questions.js`.
 */
const PARAM = {
  co2: 'co2',
  pm25: 'pm',
  co: 'co',
  hcho: 'hc',
  tvoc: 'tv',
}

/**
 * The criteria-selection notes. Each entry has:
 *
 *   id           — stable key (also the STANDARDS_MANIFEST key)
 *   citation     — formal cite, rendered verbatim
 *   summary      — section sub-heading
 *   rationale    — what was used instead, and when this one would matter
 *   appliesWhen  — (parameters: Set<string>) => boolean. An entry renders
 *                  only when the report actually engages its subject; a
 *                  note about particulate criteria in a report with no
 *                  particulate data is filler, and filler is what makes
 *                  a back-of-report section get skipped.
 *
 * Citations verified against primary sources:
 *   - ANSI/ASHRAE Standard 241-2023, "Control of Infectious Aerosols",
 *     published July 2023.
 *   - EPA PM2.5 annual NAAQS revision: 89 FR 16202, March 6 2024;
 *     effective May 6 2024; primary annual standard lowered from 12 to
 *     9 µg/m³. The 24-hour standard is unchanged at 35 µg/m³.
 *   - ACGIH, "2025 TLVs and BEIs", Cincinnati OH, 2025.
 *
 * Note on the ASHRAE 241 entry: its first draft opened "Ventilation in this
 * assessment was evaluated against ASHRAE 62.1-2025 outdoor-air rates". A CIH
 * review of a live report caught that as an over-claim — the report contained
 * no Rp/Ra calculation, no breathing-zone or system outdoor airflow, and no
 * measured outdoor-air fraction, and the engine reaches its ventilation view
 * through a CO2 indicator whenever airflow was not captured. An entry here
 * explains why a criterion was NOT applied; it must not assert what the
 * assessment did.
 */
export const CONTEXTUAL_STANDARDS = Object.freeze([
  Object.freeze({
    id: 'ashrae-241-2023',
    citation: 'ANSI/ASHRAE Standard 241-2023, Control of Infectious Aerosols.',
    summary: 'Infectious-aerosol control (ASHRAE 241)',
    rationale:
      'ASHRAE 241-2023 sets Equivalent Clean Airflow per occupant (ECAi), a ventilation, filtration and air-cleaning target sized for infectious-aerosol control while a building is operating in an infection-risk management mode. That mode was not the basis of this assessment, so ECAi targets were not applied. ECAi is generally more demanding than the outdoor-air rates in ASHRAE 62.1, and meeting those rates does not imply meeting it. Where occupant density, a vulnerable population, or an active infection-control program makes it relevant — healthcare, congregate care, schools — ECAi should be evaluated on its own terms, which requires measured outdoor-air delivery rather than an indicator such as carbon dioxide.',
    appliesWhen: (params) => params.has(PARAM.co2),
  }),
  Object.freeze({
    id: 'epa-pm25-annual-naaqs-2024',
    citation:
      'U.S. EPA, Reconsideration of the National Ambient Air Quality Standards for Particulate Matter, 89 Fed. Reg. 16202 (March 6, 2024); effective May 6, 2024.',
    summary: 'Annual PM2.5 standards (EPA 9 µg/m³, WHO 5 µg/m³)',
    rationale:
      'Particulate findings in this report rest on the 24-hour criteria — the EPA 24-hour NAAQS of 35 µg/m³ and the WHO 24-hour guideline of 15 µg/m³ — because those are the shortest averaging periods the measurements taken here can speak to. Effective May 6, 2024, EPA lowered the primary annual PM2.5 standard from 12 to 9 µg/m³; the WHO annual guideline is 5 µg/m³. Both are annual means. A single visit cannot establish an annual mean, so neither value is the basis of a finding here. They are the right comparison for continuous or repeated monitoring, and a reading near or above them is a reason to start that monitoring rather than a conclusion on its own.',
    appliesWhen: (params) => params.has(PARAM.pm25),
  }),
  Object.freeze({
    id: 'acgih-tlv-2025',
    citation:
      'American Conference of Governmental Industrial Hygienists, 2025 TLVs and BEIs, ACGIH, Cincinnati, OH (2025).',
    summary: 'ACGIH Threshold Limit Values',
    rationale:
      'Gas-phase results here are compared against OSHA Permissible Exposure Limits (29 CFR 1910.1000) and NIOSH Recommended Exposure Limits. ACGIH Threshold Limit Values are a separate consensus series, revised annually, and are frequently lower than the corresponding PEL — many PELs have not been revised since 1971. TLVs were not applied as the basis of any finding in this report. Where an occupational exposure question is live, comparing the same measurements against the current TLV is a reasonable next step, and is the comparison an occupational health reviewer is most likely to ask for.',
    appliesWhen: (params) => params.has(PARAM.co) || params.has(PARAM.hcho) || params.has(PARAM.tvoc),
  }),
])

/**
 * Collect the measured-parameter keys from an assessment's zones.
 * A parameter counts as measured when at least one zone carries a
 * non-empty value for it — the same "did we look at this" test the
 * report's own results table uses.
 *
 * @param {Array<object>} zones  raw zone intake records
 * @returns {Set<string>} intake ids present (e.g. 'co2', 'pm', 'co')
 */
export function measuredParameters(zones) {
  const out = new Set()
  for (const z of Array.isArray(zones) ? zones : []) {
    if (!z || typeof z !== 'object') continue
    for (const key of Object.values(PARAM)) {
      const v = z[key]
      if (v !== undefined && v !== null && String(v).trim() !== '') out.add(key)
    }
  }
  return out
}

/**
 * The criteria-selection notes applicable to one assessment.
 *
 * Scoping rule. "No context was supplied" and "context was supplied and
 * nothing matched" are DIFFERENT answers, and the distinction is the
 * whole behaviour of this function:
 *
 *   • `ctx` absent, or carrying no `parameters` collection — the caller
 *     cannot say what was measured, so nothing can be ruled out and every
 *     entry is returned. This is the general reference-list case.
 *   • `parameters` supplied — each entry's `appliesWhen` decides, INCLUDING
 *     when the collection is empty. An empty set means "we know what was
 *     measured, and it was none of these", which returns nothing. Treating
 *     empty as unknown would print all three notes onto a comfort-only
 *     walkthrough that measured neither particulate nor any gas.
 *
 * @param {{parameters?: Set<string>|Array<string>}} [ctx]
 * @returns {Array<{id,citation,summary,rationale}>} entries to render,
 *   in declaration order. Empty when the assessment engages none of them.
 */
export function getContextualStandards(ctx) {
  const raw = ctx ? ctx.parameters : undefined
  const params = raw instanceof Set ? raw : (Array.isArray(raw) ? new Set(raw) : null)
  if (!params) return CONTEXTUAL_STANDARDS.slice()
  return CONTEXTUAL_STANDARDS.filter((e) => e.appliesWhen(params))
}
