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
 */

import { STD } from '../constants/standards'
import { paramReference, tvocToUnit, hchoToUnit } from './sensorThresholds'

const isNum = (v) => v != null && Number.isFinite(v)
const round = (v, dp = 0) => (isNum(v) ? Number(v.toFixed(dp)) : null)
const norm = (u) => String(u || '').toLowerCase()
const isPpm = (u) => norm(u).includes('ppm')
const isMg = (u) => /mg/.test(norm(u))

// An annual-mean guideline (WHO annual, EPA annual PM2.5) is, by construction,
// an average over a year. A monitoring session of hours or days cannot evaluate
// it — the comparison is a screening reference against the guideline LEVEL, not
// a determination against the guideline as written.
const PM_ANNUAL_NOTE =
  'This is an annual-mean air quality guideline; a short monitoring session cannot evaluate an annual average, so comparison here is a screening reference against the guideline level only, not an application of the standard.'
// WHO Global Air Quality Guidelines are health-based recommendations, not US
// regulatory standards — worth stating so a WHO comparison is not read as a
// compliance test.
const WHO_NOTE =
  'WHO Global Air Quality Guidelines (2021) are health-based recommendations, not US regulatory standards; comparison here is a screening reference.'
// WELL v2 thresholds are green-building certification performance targets, not
// health-based regulatory limits, and WELL is revised by periodic addenda — so
// the value should be confirmed against the current WELL v2 documentation
// before it is asserted to a client.
const WELL_NOTE =
  'WELL Building Standard v2 (feature A01) thresholds are green-building certification performance targets, not health-based regulatory limits; confirm against the current WELL v2 documentation before relying on them.'

/**
 * The catalogue. Each profile declares how to resolve its value in the logged
 * unit; the resolver returns `{ limit }` or `{ band }` (never both).
 *
 * `requires: 'outdoorBaseline'` marks a profile the report can only compute
 * when an outdoor dataset was captured — it is offered but not selectable
 * without one.
 */
const PROFILES = {
  co2: [
    {
      id: 'ashrae-advisory',
      label: 'Screening advisory (1,000 ppm)',
      source: 'NIOSH screening tier / ASHRAE 62.1 ventilation context',
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
    { id: 'epa', label: 'EPA 24-hour', source: 'US EPA NAAQS', resolve: () => ({ limit: STD.c.pm25.epa }) },
    { id: 'who', label: 'WHO 24-hour (2021)', source: 'WHO Global Air Quality Guidelines 2021', note: WHO_NOTE, resolve: () => ({ limit: STD.c.pm25.who }) },
    { id: 'epa-annual', label: 'EPA annual (2024)', source: 'US EPA NAAQS (2024 revision; 89 FR 16202)', note: PM_ANNUAL_NOTE, resolve: () => ({ limit: STD.c.pm25.epaAnnual }) },
    { id: 'who-annual', label: 'WHO annual (2021)', source: 'WHO Global Air Quality Guidelines 2021', note: `${WHO_NOTE} ${PM_ANNUAL_NOTE}`, resolve: () => ({ limit: STD.c.pm25.whoAnnual }) },
    { id: 'well', label: 'WELL v2 performance', source: 'WELL Building Standard v2 (A01)', note: WELL_NOTE, resolve: () => ({ limit: STD.c.pm25.well }) },
  ],

  pm10: [
    { id: 'epa', label: 'EPA 24-hour', source: 'US EPA NAAQS', resolve: () => ({ limit: STD.c.pm10.epa }) },
    { id: 'who', label: 'WHO 24-hour (2021)', source: 'WHO Global Air Quality Guidelines 2021', note: WHO_NOTE, resolve: () => ({ limit: STD.c.pm10.who }) },
    { id: 'who-annual', label: 'WHO annual (2021)', source: 'WHO Global Air Quality Guidelines 2021', note: `${WHO_NOTE} ${PM_ANNUAL_NOTE}`, resolve: () => ({ limit: STD.c.pm10.whoAnnual }) },
    { id: 'well', label: 'WELL v2 performance', source: 'WELL Building Standard v2 (A01)', note: WELL_NOTE, resolve: () => ({ limit: STD.c.pm10.well }) },
  ],

  co: [
    { id: 'epa-naaqs', label: 'EPA NAAQS 8-hour', source: 'US EPA NAAQS', resolve: () => ({ limit: STD.c.co.epa }) },
    { id: 'niosh-rel', label: 'NIOSH REL', source: 'NIOSH Pocket Guide', resolve: () => ({ limit: STD.c.co.niosh }) },
    { id: 'osha-pel', label: 'OSHA PEL', source: '29 CFR 1910.1000', resolve: () => ({ limit: STD.c.co.osha }) },
    { id: 'well', label: 'WELL v2 performance', source: 'WELL Building Standard v2 (A01)', note: WELL_NOTE, resolve: () => ({ limit: STD.c.co.well }) },
  ],

  tvoc: [
    {
      id: 'molhave',
      label: 'Mølhave advisory (500 µg/m³)',
      source: 'Mølhave 1991',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.con, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 2 : 0) }),
    },
    {
      id: 'molhave-action',
      label: 'Mølhave action tier (3,000 µg/m³)',
      source: 'Mølhave 1991',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.act, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 2 : 0) }),
    },
    {
      id: 'well',
      label: 'WELL v2 performance (500 µg/m³)',
      source: 'WELL Building Standard v2 (A01)',
      // Must still carry the "no consensus health limit" TVOC disclaimer (the
      // standing anti-pattern) — WELL's 500 µg/m³ is a certification target, not
      // a health limit.
      note: 'TVOC has no consensus health limit; the WELL Building Standard v2 (A01) 500 µg/m³ figure is a green-building certification performance target, not a health-based limit — confirm against the current WELL v2 documentation.',
      resolve: (ctx) => ({ limit: round(tvocToUnit(STD.c.tvoc.well, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 2 : 0) }),
    },
    // Offered deliberately: with no consensus health limit, an assessor may
    // reasonably choose to chart TVOC without any reference line rather than
    // imply one exists.
    { id: 'none', label: 'No reference line', source: null, resolve: () => ({}) },
  ],

  hcho: [
    { id: 'niosh-rel', label: 'NIOSH REL', source: 'NIOSH Pocket Guide', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.niosh, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'epa-rfc', label: 'EPA IRIS RfC (chronic)', source: 'US EPA IRIS', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.epaRfc, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'who-30min', label: 'WHO 30-minute', source: 'WHO indoor air quality guidelines', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.who, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
    { id: 'osha-pel', label: 'OSHA PEL', source: '29 CFR 1910.1048', resolve: (ctx) => ({ limit: round(hchoToUnit(STD.c.hcho.osha, ctx && ctx.unit), isPpm(ctx && ctx.unit) ? 3 : (isMg(ctx && ctx.unit) ? 3 : 1)) }) },
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
    { id: 'ashrae-comfort', label: 'ASHRAE comfort range (30–60%)', source: STD.t.ref, resolve: () => ({ band: [STD.t.rh.min, STD.t.rh.max] }) },
    { id: 'custom', label: 'Custom range', source: 'Assessor-defined', custom: 'band', resolve: (ctx) => customBand(ctx) },
  ],
}

function customBand(ctx) {
  const c = ctx && ctx.custom
  return Array.isArray(c) && isNum(c[0]) && isNum(c[1]) ? { band: [c[0], c[1]] } : {}
}

/** Profiles offered for a parameter (empty when it has no published value). */
export function profilesFor(param) {
  return (PROFILES[param] || []).map(({ id, label, source, note, requires, custom }) => ({
    id, label, source, note: note || null, requires: requires || null, custom: custom || null,
  }))
}

/** The profile selected when the assessor expresses no preference. */
export function defaultProfileId(param) {
  const list = PROFILES[param]
  return list && list.length ? list[0].id : null
}

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
 * @param {number[]} [ctx.custom] [lo, hi] for a custom band
 * @returns {{param, profileId, label, source, note, limit, band, unit,
 *   unavailable}|null} null when the parameter offers no profiles.
 *   `unavailable` is set when the chosen profile needs data that is absent
 *   (e.g. an outdoor differential with no outdoor baseline) — the report then
 *   omits the comparison rather than inventing a reference.
 */
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

  return {
    param,
    profileId: profile.id,
    label: profile.label,
    source: profile.source || null,
    note: profile.note || null,
    limit,
    band,
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
