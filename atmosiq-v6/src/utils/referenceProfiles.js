/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * referenceProfiles — the selectable screening reference behind every number
 * in the Indoor Environmental Monitoring Report.
 *
 * A monitoring engagement is not always judged against the same yardstick:
 * one client wants PM2.5 against the EPA NAAQS, another against the stricter
 * WHO 2021 guideline; a CO reading may be framed against the OSHA PEL, the
 * NIOSH REL, or the EPA NAAQS. Rather than hardcode one, the assessor picks a
 * PROFILE per parameter and that single choice drives everything downstream —
 * the chart reference line, the summary strip, % above, time above, the
 * generated statement, the reference table, and the methodology note.
 *
 * ── Where the numbers come from ────────────────────────────────────────
 * Every value resolves from the standards manifest (`STD`,
 * `src/constants/standards.js`). Nothing is hardcoded here: this module maps
 * a profile id to a manifest path, projects it into the unit the data was
 * logged in (reusing `sensorThresholds`' conversions, never a second copy of
 * that math), and carries the citation and any required framing note.
 *
 * A profile is therefore only ever as authoritative as the manifest entry
 * behind it — which is the point. Adding a new published value means adding
 * it to the manifest with its citation, not inventing it here.
 *
 * ── Framing notes ──────────────────────────────────────────────────────
 * Some references still carry a framing note (WHO guidelines, annual-mean
 * guidelines, WELL certification targets) that rides on the resolved profile
 * and reaches the report's reference table. The CO₂ ventilation-indicator,
 * TVOC-advisory, and NAAQS ambient-standard caveats were removed by product
 * decision (2026-08).
 *
 * ── Higher action tier (the figure's RED span) ─────────────────────────
 * A resolved reference MAY one day carry an `actionLimit` — the value above
 * which the figure draws its trace red rather than amber. It is deliberately
 * absent from every profile here, and adding one is not a cosmetic change:
 *
 *   A red tier is a SEPARATE, authoritative, higher-level criterion — not a
 *   multiple of the screening reference. `threshold + averaging period +
 *   source + applicability` must travel together; a concentration alone must
 *   never turn a reading red. Red means "a distinct higher criterion was
 *   reached", which is a stronger claim than the "Review Suggested" status.
 *
 * Per parameter, for the Client (IAQ screening) edition:
 *   • Temperature / RH — NO red. ASHRAE 55 is a thermal-comfort standard, not
 *     a health-action ladder; "farther outside the band" is not a severity.
 *   • CO₂ — NO red here. 1,000 ppm is a ventilation-per-occupant indicator;
 *     higher occupational CO₂ limits are a different exposure context and
 *     belong to an occupational-IH module, not this one.
 *   • TVOC — NO red. There is no defensible universal TVOC concentration
 *     ladder across buildings, mixtures and instruments.
 *   • PM2.5 — a legitimate candidate: EPA defines progressively higher 24-hour
 *     categories. But the logger records short-interval readings, so a tier
 *     may only be assigned from the correct AVERAGING WINDOW (a rolling 24-hour
 *     mean), never a single 60-minute reading — that averaging engine is not
 *     built yet, so no red tier ships.
 *   • HCHO — possible only if a SECOND authoritative criterion with the right
 *     averaging period is explicitly selected; never automatic from the NIOSH
 *     REL line.
 */

import { STD } from '../constants/standards'
import { CRITERIA } from '../constants/criteria'
import { paramReference, tvocToUnit, hchoToUnit } from './sensorThresholds'
import { tvocEquivalenceNote, parseCalibrationGas, TVOC_REFERENCES } from './vocConversion'

const isNum = (v) => v != null && Number.isFinite(v)
const round = (v, dp = 0) => (isNum(v) ? Number(v.toFixed(dp)) : null)
const norm = (u) => String(u || '').toLowerCase()
const isPpm = (u) => norm(u).includes('ppm')
const isMg = (u) => /mg/.test(norm(u))
/** True for the mass units a mass-basis tier converts into safely (scale only). */
const isMassUnit = (u) => /g\/m/.test(norm(u))

/**
 * The compound a TVOC tier is restated through, read off the survey's own
 * calibration record (`ctx.calibrationGas`, the free-text PID span gas).
 * Undefined when nothing usable was recorded, which lets `convertTvoc` apply
 * its isobutylene default — the note then says the default was applied.
 */
const calGasKey = (ctx) => parseCalibrationGas(ctx && ctx.calibrationGas).key || undefined

// An annual-mean guideline (WHO annual, EPA annual PM2.5) is, by construction,
// an average over a year. A monitoring session of hours or days cannot evaluate
// it — the comparison is a screening reference against the guideline LEVEL, not
// a determination against the guideline as written.
const PM_ANNUAL_NOTE =
  'This is an annual-mean air quality guideline; a short monitoring session cannot evaluate an annual average, so comparison here is a reference against the guideline level only, not an application of the standard.'
// WHO Global Air Quality Guidelines are health-based recommendations, not US
// regulatory standards — worth stating so a WHO comparison is not read as a
// compliance test.
const WHO_NOTE =
  'WHO Global Air Quality Guidelines (2021) are health-based recommendations, not US regulatory standards; comparison here is a reference.'
// WELL v2 thresholds are green-building certification performance targets, not
// health-based regulatory limits, and WELL is revised by periodic addenda — so
// the value should be confirmed against the current WELL v2 documentation
// before it is asserted to a client.
const WELL_NOTE =
  'WELL Building Standard v2 (feature A01) thresholds are green-building certification performance targets, not health-based regulatory limits; confirm against the current WELL v2 documentation before relying on them.'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

// A higher ("red") ACTION tier a profile may carry — a SEPARATE authoritative
// criterion with its own averaging window, evaluated on a rolling mean (never a
// single reading) and drawn only where it sits above the selected screening
// reference. See the header note for why only CO and PM2.5 get one, and why
// Temp/RH/CO₂/TVOC do not. `windowMs` is the criterion's averaging period.
const CO_ACTION = {
  limit: STD.c.co.who1h, // WHO 2010 1-hour CO guideline (35 mg/m³ ≈ 30 ppm)
  windowMs: HOUR_MS,
  source: 'WHO 2010 IAQ Guidelines — 1-hour CO',
  label: 'WHO 1-hour acute',
}
const PM25_ACTION = {
  limit: STD.c.pm25.epaUnhealthy, // EPA AQI 24-hour "Unhealthy" lower bound
  windowMs: DAY_MS,
  source: 'US EPA AQI — 24-hour "Unhealthy" category',
  label: 'EPA Unhealthy (24-hour)',
}

/**
 * The catalogue. Each profile declares how to resolve its value in the logged
 * unit; the resolver returns `{ limit }` or `{ band }` (never both).
 *
 * `requires: 'outdoorBaseline'` marks a profile the report can only compute
 * when an outdoor dataset was captured — it is offered but not selectable
 * without one.
 *
 * `action` marks a profile that also carries a defensible higher acute tier
 * (the figure's red span). It rides on the resolved reference; the figure
 * evaluates it on a rolling mean over `action.windowMs`.
 */
const PROFILES = {
  co2: [
    {
      // 1,000 ppm is a widely-used indoor-CO₂ ventilation-adequacy screening
      // indicator (NIOSH IEQ guidance), NOT an ASHRAE 62.1 value — current
      // 62.1 sets no CO₂ number, and CO₂ indexes ventilation per occupant, not
      // a health/contaminant limit (Persily 2021). The earlier "ASHRAE 62.1"
      // attribution here was flagged twice in peer review.
      id: 'ashrae-advisory',
      // "Screening advisory" until 2026-08 — the label reached the consultant
      // report through the Criteria Applied table and reintroduced a word
      // stripped platform-wide. "Ventilation advisory" is also the more
      // accurate name: 1,000 ppm indexes outdoor-air delivery per occupant.
      label: 'Ventilation advisory (1,000 ppm)',
      source: 'NIOSH indoor-ventilation indicator (~1,000 ppm)',
      resolve: () => ({ limit: STD.v.co2.con }),
    },
    {
      id: 'action-tier',
      label: 'Action tier (1,500 ppm)',
      source: 'NIOSH screening action tier',
      resolve: () => ({ limit: STD.v.co2.act }),
    },
    {
      id: 'outdoor-differential',
      label: 'Outdoor differential (+700 ppm)',
      source: `${STD.v.ref} / Persily 2021 ventilation surrogate`,
      requires: 'outdoorBaseline',
      // Referenced against the measured outdoor baseline, not a fixed number:
      // the whole point of the differential is that it follows outdoor air.
      resolve: (ctx) =>
        isNum(ctx && ctx.outdoorBaseline)
          ? { limit: ctx.outdoorBaseline + STD.v.co2.diff }
          : { limit: null },
    },
  ],

  pm25: [
    { id: 'epa', label: 'EPA 24-hour', criterionId: 'pm25_epa_24h', action: PM25_ACTION, resolve: () => ({ limit: STD.c.pm25.epa }) },
    { id: 'who', label: 'WHO 24-hour (2021)', criterionId: 'pm25_who_24h', note: WHO_NOTE, action: PM25_ACTION, resolve: () => ({ limit: STD.c.pm25.who }) },
    { id: 'epa-annual', label: 'EPA annual (2024)', criterionId: 'pm25_epa_annual', note: PM_ANNUAL_NOTE, resolve: () => ({ limit: STD.c.pm25.epaAnnual }) },
    { id: 'who-annual', label: 'WHO annual (2021)', criterionId: 'pm25_who_annual', note: `${WHO_NOTE} ${PM_ANNUAL_NOTE}`, resolve: () => ({ limit: STD.c.pm25.whoAnnual }) },
    { id: 'well', label: 'WELL v2 performance', criterionId: 'pm25_well', note: WELL_NOTE, resolve: () => ({ limit: STD.c.pm25.well }) },
  ],

  pm10: [
    { id: 'epa', label: 'EPA 24-hour', criterionId: 'pm10_epa_24h', resolve: () => ({ limit: STD.c.pm10.epa }) },
    { id: 'who', label: 'WHO 24-hour (2021)', criterionId: 'pm10_who_24h', note: WHO_NOTE, resolve: () => ({ limit: STD.c.pm10.who }) },
    { id: 'who-annual', label: 'WHO annual (2021)', criterionId: 'pm10_who_annual', note: `${WHO_NOTE} ${PM_ANNUAL_NOTE}`, resolve: () => ({ limit: STD.c.pm10.whoAnnual }) },
    { id: 'well', label: 'WELL v2 performance', criterionId: 'pm10_well', note: WELL_NOTE, resolve: () => ({ limit: STD.c.pm10.well }) },
  ],

  co: [
    // The 9-ppm ambient/green-building references sit below the WHO 1-hour
    // acute guideline, so the red tier is a genuinely higher criterion for
    // them. The occupational 8-hour references (NIOSH 35 / OSHA 50) already sit
    // at or above it, so they carry no red tier — a higher acute span would
    // invert the hierarchy.
    { id: 'epa-naaqs', label: 'EPA NAAQS 8-hour', criterionId: 'co_epa_naaqs_8h', action: CO_ACTION, resolve: () => ({ limit: STD.c.co.epa }) },
    { id: 'niosh-rel', label: 'NIOSH REL', criterionId: 'co_niosh_rel', resolve: () => ({ limit: STD.c.co.niosh }) },
    { id: 'osha-pel', label: 'OSHA PEL', criterionId: 'co_osha_pel', resolve: () => ({ limit: STD.c.co.osha }) },
    { id: 'well', label: 'WELL v2 performance', criterionId: 'co_well', note: WELL_NOTE, action: CO_ACTION, resolve: () => ({ limit: STD.c.co.well }) },
  ],

  tvoc: [
    {
      id: 'molhave',
      equivalenceBasis: 'isobutylene',
      label: 'Mølhave advisory (500 µg/m³)',
      criterionId: 'tvoc_molhave_concern',
      source: 'Mølhave 1991',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.con, ctx && ctx.unit, { reference: calGasKey(ctx) }), isMg(ctx && ctx.unit) ? 3 : 0) }),
    },
    {
      id: 'molhave-action',
      equivalenceBasis: 'isobutylene',
      label: 'Mølhave action tier (3,000 µg/m³)',
      criterionId: 'tvoc_molhave_action',
      source: 'Mølhave 1991',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.act, ctx && ctx.unit, { reference: calGasKey(ctx) }), isMg(ctx && ctx.unit) ? 3 : 0) }),
    },
    {
      id: 'well',
      equivalenceBasis: 'isobutylene',
      label: 'WELL v2 performance (500 µg/m³)',
      source: 'WELL Building Standard v2 (A01)',
      // Must still carry the "no consensus health limit" TVOC disclaimer (the
      // standing anti-pattern) — WELL's 500 µg/m³ is a certification target, not
      // a health limit.
      note: 'TVOC has no consensus health limit; the WELL Building Standard v2 (A01) 500 µg/m³ figure is a green-building certification performance target, not a health-based limit — confirm against the current WELL v2 documentation.',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.well, ctx && ctx.unit, { reference: calGasKey(ctx) }), isMg(ctx && ctx.unit) ? 3 : 0) }),
    },
    // Offered deliberately: with no consensus health limit, an assessor may
    // reasonably choose to chart TVOC without any reference line rather than
    // imply one exists.
    { id: 'none', label: 'No reference line', source: null, resolve: () => ({}) },
  ],

  hcho: [
    { id: 'niosh-rel', label: 'NIOSH REL', criterionId: 'hcho_niosh_rel', source: 'NIOSH Pocket Guide', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.niosh, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'epa-rfc', label: 'EPA IRIS RfC (chronic)', criterionId: 'hcho_epa_rfc', source: 'US EPA IRIS', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.epaRfc, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'who-30min', label: 'WHO 30-minute', criterionId: 'hcho_who_30min', source: 'WHO indoor air quality guidelines', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.who, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'osha-pel', label: 'OSHA PEL', criterionId: 'hcho_osha_pel', source: '29 CFR 1910.1048', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.osha, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
  ],

  temp: [
    {
      id: 'ashrae-comfort',
      label: 'ASHRAE 55 comfort range',
      source: STD.t.ref,
      // Delegated: the comfort band is season-dependent AND unit-affine
      // (°F↔°C), and `paramReference` already owns both rules.
      resolve: (ctx) => {
        const r = paramReference('temp', { unit: ctx && ctx.unit, ts: ctx && ctx.ts })
        return r.band ? { band: [r.band.min, r.band.max] } : {}
      },
    },
    { id: 'custom', label: 'Custom range', source: 'Assessor-defined', custom: 'band', resolve: (ctx) => customBand(ctx) },
  ],

  rh: [
    // Kept its profile id so a saved report's stored selection still resolves;
    // the LABEL and SOURCE were the wrong part, not the identifier.
    {
      id: 'ashrae-comfort',
      label: `Moisture-control range (${STD.t.rh.min}–${STD.t.rh.max}%)`,
      source: STD.t.rh.ref,
      note: 'A moisture-control and comfort practice range, not a thermal comfort criterion: above 60% RH condensation and microbial amplification risk rise, below 30% dryness and irritation complaints increase. ASHRAE 55 sets only an upper humidity limit and no lower one, so it is not the source for this band.',
      resolve: () => ({ band: [STD.t.rh.min, STD.t.rh.max] }),
    },
    { id: 'custom', label: 'Custom range', source: 'Assessor-defined', custom: 'band', resolve: (ctx) => customBand(ctx) },
  ],
}

function customBand(ctx) {
  const c = ctx && ctx.custom
  return Array.isArray(c) && isNum(c[0]) && isNum(c[1]) ? { band: [c[0], c[1]] } : {}
}

/** Profiles offered for a parameter (empty when it has no published value). */
export function profilesFor(param) {
  // Citation resolves the same way here as in resolveReference — the selector
  // list shows the source too, and reading profile.source directly left it
  // undefined for every profile linked to a criterion.
  return (PROFILES[param] || []).map((profile) => ({
    id: profile.id,
    label: profile.label,
    source: citationFor(param, profile),
    note: profile.note || null,
    requires: profile.requires || null,
    custom: profile.custom || null,
  }))
}


/** The profile selected when the assessor expresses no preference. */
export function defaultProfileId(param) {
  const list = PROFILES[param]
  return list && list.length ? list[0].id : null
}

/**
 * The raw catalogue, for tests that verify the criterion links resolve.
 * Not part of the public surface — consumers use profilesFor/resolveReference.
 */
export const __PROFILES_FOR_TEST = PROFILES

/** Every parameter that offers a selectable reference. */
export function parametersWithProfiles() {
  return Object.keys(PROFILES)
}

/**
 * Resolve a parameter's selected profile into the reference the rest of the
 * report consumes.
 *
 * @param {string} param
 * @param {string} [profileId] falls back to the parameter's default
 * @param {object} [ctx]
 * @param {string} [ctx.unit] the unit the data was logged in
 * @param {number} [ctx.ts] a timestamp in the period (temperature is seasonal)
 * @param {number} [ctx.outdoorBaseline] mean outdoor value, for differentials
 * @param {string} [ctx.calibrationGas] the survey's free-text PID span gas.
 *   Decides the molecular weight a TVOC tier is restated through when the
 *   logged unit is volumetric, and is named in `note` either way.
 * @param {number[]} [ctx.custom] [lo, hi] for a custom band
 * @returns {{param, profileId, criterionId, label, source, note, limit, band,
 *   action, unit, unavailable}|null} null when the parameter offers no profiles.
 *   `unavailable` is set when the chosen profile needs data that is absent
 *   (e.g. an outdoor differential with no outdoor baseline) — the report then
 *   omits the comparison rather than inventing a reference.
 *   `action` is the higher acute tier when the profile carries one AND it sits
 *   above the selected reference; null otherwise. It was added after this
 *   annotation was first written and omitted here, and because TypeScript
 *   honours JSDoc over the inferred literal, every `.action` read in
 *   tests/lib/referenceProfiles.test.ts was a type error — the whole of the
 *   BUILD-01 typecheck failure. Keep this list in step with the return.
 */
/**
 * The citation for a profile, from its linked criterion.
 *
 * A profile owns SELECTION and unit projection; the criterion owns what the
 * threshold means, including its source. Profiles used to restate the citation
 * locally, which was two places to update and two places to drift — they had
 * not drifted (both were verified against the same primary sources) but the
 * registry is the single place now.
 *
 * Profiles with no published threshold behind them — a custom band, "no
 * reference line", the ASHRAE comfort bands — legitimately declare their own
 * and are returned unchanged.
 */
function citationFor(param, profile) {
  if (!profile.criterionId) return profile.source || null
  const c = criterionFor(param, profile)
  return (c && c.source) || profile.source || null
}

/** The registry entry a profile points at, when it points at one. */
function criterionFor(param, profile) {
  if (!profile.criterionId) return null
  return (CRITERIA[param] || []).find((x) => x.id === profile.criterionId) || null
}

export function resolveReference(param, profileId, ctx = {}) {
  const list = PROFILES[param]
  if (!list || !list.length) return null

  const profile = list.find((p) => p.id === profileId) || list[0]
  const resolved = profile.resolve(ctx) || {}
  const limit = isNum(resolved.limit) ? resolved.limit : null
  const band =
    Array.isArray(resolved.band) && isNum(resolved.band[0]) && isNum(resolved.band[1])
      ? [resolved.band[0], resolved.band[1]]
      : null

  // A profile that resolved to nothing while REQUIRING something is a missing
  // input, not a missing standard — the distinction the report needs in order
  // to explain itself.
  const unavailable = !limit && !band && !!profile.requires ? profile.requires : null

  // A TVOC tier published in µg/m³ (Mølhave, WELL) meeting data logged in
  // ppb is the third case, and it is neither of the two above: the reference
  // exists, the data exists, and the comparison is available — but only
  // against a named reference compound, because TVOC is a mixture with no
  // single molecular weight. Isobutylene is that compound by convention; it
  // is what the PID was calibrated against and what its own µg/m³ display
  // already uses internally.
  //
  // So the tier resolves in ppb, and the assumption travels with it on
  // `note` — which renders — rather than the number being withheld. A
  // withheld reference leaves a ppb-logging PID with no tier at all while
  // the same instrument set to µg/m³ keeps one, which is a property of the
  // display setting, not of the air. See `utils/vocConversion.js`.
  //
  // Which compound is not a constant either. `equivalenceBasis` names the
  // DEFAULT — the span gas a PID carries unless told otherwise — and the
  // survey's own calibration record overrides it when one was captured. The
  // note says which of the two happened, so a converted number is never
  // grounded in a compound the assessor did not use.
  const equivalenceBasis =
    (criterionFor(param, profile) || {}).equivalenceBasis || profile.equivalenceBasis || null
  let note = profile.note || null
  if (equivalenceBasis && isNum(limit) && !!(ctx && ctx.unit) && !isMassUnit(ctx.unit)) {
    const calGas = parseCalibrationGas(ctx && ctx.calibrationGas)
    const used = TVOC_REFERENCES[calGas.key || equivalenceBasis]
    const disclosure = `${profile.label} is published as a mass concentration; stated here in ${ctx.unit}. `
      + tvocEquivalenceNote(used, calGas)
    note = note ? `${note} ${disclosure}` : disclosure
  }

  // The higher acute ("red") tier rides on the resolved reference, but ONLY
  // when it sits genuinely above the selected screening reference. That guard
  // is what keeps a WHO 1-hour CO tier from appearing under an occupational
  // 8-hour PEL, where it would invert the hierarchy rather than escalate it.
  const action =
    profile.action && isNum(profile.action.limit) && isNum(limit) && profile.action.limit > limit
      ? {
          limit: profile.action.limit,
          windowMs: profile.action.windowMs,
          source: profile.action.source || null,
          label: profile.action.label || null,
        }
      : null

  return {
    param,
    profileId: profile.id,
    // The criterion registry entry behind this profile, when it has one.
    // Consumers that need the criterion's CLASS (and therefore how much
    // weight it carries — enforceable limit vs guideline vs indicator) can
    // resolve it without string-matching the citation. Null for the bands
    // and custom ranges that have no registry entry.
    criterionId: profile.criterionId || null,
    label: profile.label,
    source: citationFor(param, profile),
    note,
    limit,
    band,
    action,
    unit: (ctx && ctx.unit) || '',
    unavailable,
  }
}

/**
 * Resolve every parameter at once — the shape the report's reference table
 * and per-parameter sections both read from.
 *
 * @param {string[]} params parameters present in the dataset
 * @param {Record<string,string>} selections profile id per parameter
 * @param {object} ctx as `resolveReference`, plus `units` keyed by parameter
 * @returns {Record<string, object>} resolved reference per parameter
 */
export function resolveReferences(params, selections = {}, ctx = {}) {
  const out = {}
  ;(params || []).forEach((param) => {
    const resolved = resolveReference(param, selections[param], {
      ...ctx,
      unit: (ctx.units && ctx.units[param]) || ctx.unit,
      custom: ctx.custom && ctx.custom[param],
    })
    if (resolved) out[param] = resolved
  })
  return out
}

/**
 * Rows for the report's consolidated "Screening reference values" table —
 * one place the reader can check every yardstick, so each figure caption can
 * simply point back here.
 *
 * @returns {{param, profile, value, source, note}[]}
 */
export function referenceTableRows(resolvedByParam) {
  return Object.values(resolvedByParam || {})
    .filter((r) => r && (isNum(r.limit) || r.band))
    .map((r) => ({
      param: r.param,
      profile: r.label,
      value: referenceValueLabel(r),
      source: r.source,
      note: r.note,
    }))
}

/**
 * A resolved reference as it is printed — "1,000 ppm", "30–60 %".
 *
 * Thousands separators, but never added precision: a reference is a CITED
 * value, so 35 stays "35" and is not dressed up as "35.0" to match the
 * precision readings are reported at.
 */
export function referenceValueLabel(resolved) {
  const r = resolved || {}
  const n = (v) =>
    isNum(v)
      ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
      : String(v)
  if (r.band) return `${n(r.band[0])}–${n(r.band[1])} ${r.unit || ''}`.trim()
  if (isNum(r.limit)) return `${n(r.limit)} ${r.unit || ''}`.trim()
  return ''
}
