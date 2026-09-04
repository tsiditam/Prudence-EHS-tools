/**
 * AtmosFlow — Live Advisor
 *
 * Pure deterministic real-time advisor for the field walkthrough.
 * Reads the zone's currently-entered sensor readings + building +
 * presurvey context, returns a ranked array of advisories ("CO at
 * 30 ppm is half the OSHA PEL; consider continuous monitoring",
 * etc.) the JasperWatchPanel renders inline beside the sensor
 * inputs as the assessor types.
 *
 * No AI cost. No engine touch. Reads thresholds from STD (the
 * bibliographic + scoring constants) but never writes to them.
 * The Play 3b extension (AI-judgment layer with structured
 * accept/edit/dismiss) wraps THIS engine — the deterministic
 * checks here become the high-precision baseline the AI augments.
 *
 * Each advisory has:
 *   id           — stable key for React lists + dismissal tracking
 *   severity     — 'critical' | 'warn' | 'info'
 *   parameter    — sensor field id this advisory is about (co2, co, etc.)
 *   observation  — what the data shows
 *   suggestion   — short next-step the IH might consider
 *   reference    — standard citation (so the advisor isn't a black box)
 *
 * Advisories are advisory-only; they never gate finalization, never
 * modify scoring, never substitute for the deterministic engine's
 * findings. The engine's full scoring still runs after the
 * walkthrough — these checks just surface friction earlier.
 */

import { STD } from '../constants/standards'
import { evaluateCriteria } from '../constants/criteria'
import { readNumber } from './scoring'

const PARAM = {
  co2: 'co2',
  co: 'co',
  hcho: 'hc',
  pm25: 'pm',
  tvoc: 'tv',
  temp: 'tf',
  rh: 'rh',
}

// The engine's one numeric parser (audit H1): '1,180' reads, 'abc' is null.
const num = readNumber

// ── CO / formaldehyde through the criterion registry (audit H2) ──
//
// The two checks used to compare the reading against bare STD numbers with
// `>=` and say "at or above OSHA PEL" of a grab reading — the averaging-period
// category error the registry exists to prevent — and called the formaldehyde
// NIOSH REL (0.016 ppm, a 10-hour TWA) a "ceiling" (the NIOSH ceiling is
// 0.1 ppm). Both now take the criterion, the sentence, the citation and the
// comparison (strictly `>`, as the registry defines it — audit M7) from
// `evaluateCriteria`. Advisory ids keep their historical names where one
// existed so the JasperWatchPanel's dismissal keys survive.
const ADVISORY_ID = {
  co_niosh_ceiling: 'co-ceiling', co_osha_pel: 'co-pel', co_niosh_rel: 'co-niosh',
  co_who_1h: 'co-who-1h', co_epa_naaqs_8h: 'co-naaqs-8h', co_who_24h: 'co-who-24h',
  hcho_osha_stel: 'hcho-stel', hcho_osha_pel: 'hcho-pel', hcho_osha_al: 'hcho-action',
  hcho_who_30min: 'hcho-who-30min', hcho_niosh_rel: 'hcho-niosh',
}
const ADVISORY_SEVERITY = { critical: 'critical', high: 'warn', medium: 'info', low: 'info' }
const SUGGESTION = {
  co_niosh_ceiling: 'Evacuate or ventilate immediately. Locate combustion source (vehicle, generator, furnace, water heater). Continuous monitoring while remediation proceeds.',
  co_osha_pel: 'Evacuate or ventilate immediately. Locate combustion source (vehicle, generator, furnace, water heater). Continuous monitoring while remediation proceeds.',
  co_niosh_rel: 'Identify the source. Consider continuous CO logging over a representative occupancy period.',
  co_who_1h: 'Identify the source. Consider continuous CO logging over a representative occupancy period.',
  co_epa_naaqs_8h: 'Worth noting — indoor CO above the 8-hour NAAQS indicates a combustion source or an infiltration pathway. If the reading is rising over the walkthrough, consider continuous monitoring.',
  co_who_24h: 'Note the likely source (fuel-fired appliance, attached garage, loading dock, flue) and re-check under normal operation.',
  hcho_osha_stel: 'Identify the source (new finishes, mobile homes, combustion). Remove occupants from the affected area pending confirmation.',
  hcho_osha_pel: 'Identify the source (new finishes, mobile homes, combustion). Evacuate sensitive occupants pending source isolation.',
  hcho_osha_al: 'Consider sorbent-tube confirmation (NIOSH 2016 DNPH) and source survey.',
  hcho_who_30min: 'Identify the emitting material; confirm with NIOSH 2016 sampling.',
  hcho_niosh_rel: 'The NIOSH REL is a health-protective 10-hour TWA; a single spot reading above it does not establish exposure, but a sorbent-tube TWA is the defensible confirmation.',
}

function criterionAdvisory(parameter, field, label, value) {
  const hit = evaluateCriteria(parameter, value, 'screening_grab')
  if (!hit) return null
  const id = hit.criterion.id
  return {
    id: ADVISORY_ID[id] || `${field}-${id}`,
    severity: ADVISORY_SEVERITY[hit.severity] || 'info',
    parameter: field,
    observation: `${label} ${hit.statement}`,
    suggestion: SUGGESTION[id] || 'Identify the source and confirm with an integrated method.',
    reference: hit.criterion.source,
    criterionId: id,
    determinative: hit.determinative,
  }
}

/**
 * CO2 vs occupancy heuristic. ASHRAE 62.1 doesn't set a CO2 limit
 * directly (Persily 2022 — CO2 is a ventilation indicator, not a
 * contaminant), but elevated CO2 in an occupied space is a strong
 * signal that the outdoor-air rate is below the design value for
 * the space type. We surface that as a warn-level advisory whenever
 * CO2 crosses STD.v.co2.con (1000 ppm) and the zone is occupied.
 */
function checkCo2Ventilation(data) {
  const co2 = num(data.co2)
  const co2o = num(data.co2o)
  if (co2 === null) return null
  if (co2 >= STD.v.co2.act) {
    const delta = co2o !== null ? Math.round(co2 - co2o) : null
    return {
      id: 'co2-action',
      severity: 'critical',
      parameter: PARAM.co2,
      observation: `CO₂ at ${co2} ppm${delta !== null ? ` (Δ${delta} ppm above outdoor)` : ''} — exceeds 1,500 ppm action threshold.`,
      suggestion: 'Verify outdoor-air damper position and AHU set-points. Consider immediate ventilation increase pending fix; document occupancy + HVAC mode.',
      reference: 'ASHRAE 62.1-2025 (Persily 2022 — CO₂ as ventilation indicator)',
    }
  }
  if (co2 >= STD.v.co2.con) {
    const delta = co2o !== null ? Math.round(co2 - co2o) : null
    return {
      id: 'co2-concern',
      severity: 'warn',
      parameter: PARAM.co2,
      observation: `CO₂ at ${co2} ppm${delta !== null ? ` (Δ${delta} ppm above outdoor)` : ''} — likely under-ventilated for current occupancy.`,
      suggestion: 'Consider outdoor-air measurement (CFM/person) and compare with ASHRAE 62.1 design rate for the space type.',
      reference: 'ASHRAE 62.1-2025',
    }
  }
  return null
}

/**
 * Reminder when the assessor enters CO2 but no outdoor baseline.
 * Per CLAUDE.md the report's defensibility-gaps layer already
 * flags this post-hoc; the live advisor catches it during entry
 * so the assessor can still grab the outdoor reading on-site.
 */
function checkOutdoorBaseline(data) {
  const co2 = num(data.co2)
  const co2o = num(data.co2o)
  if (co2 !== null && co2o === null) {
    return {
      id: 'co2-no-outdoor',
      severity: 'info',
      parameter: PARAM.co2,
      observation: 'Indoor CO₂ entered without outdoor baseline.',
      suggestion: 'Capture an outdoor CO₂ reading (~400-450 ppm typical). The Δ is the defensible signal — a single indoor value alone is hard to interpret.',
      reference: 'ASHRAE 62.1-2025 §7.2.2',
    }
  }
  return null
}

function checkCO(data) {
  const co = num(data.co)
  if (co === null) return null
  return criterionAdvisory('co', PARAM.co, 'CO', co)
}

function checkHCHO(data) {
  const hc = num(data.hc)
  if (hc === null) return null
  return criterionAdvisory('hcho', PARAM.hcho, 'Formaldehyde', hc)
}

function checkPM25(data) {
  const pm = num(data.pm)
  const pmo = num(data.pmo)
  if (pm === null) return null
  const advisories = []
  if (pm > STD.c.pm25.epa) {
    advisories.push({
      id: 'pm25-epa-24hr',
      severity: 'warn',
      parameter: PARAM.pm25,
      observation: `Indoor PM2.5 at ${pm} µg/m³ — above EPA 24-hr NAAQS (${STD.c.pm25.epa} µg/m³).`,
      suggestion: 'Identify source (wildfire smoke, infiltration, cooking, construction). Confirm HVAC filtration MERV rating.',
      reference: 'EPA NAAQS PM2.5 (24-hr standard)',
    })
  } else if (pm > STD.c.pm25.who) {
    advisories.push({
      id: 'pm25-who',
      severity: 'info',
      parameter: PARAM.pm25,
      observation: `Indoor PM2.5 at ${pm} µg/m³ — above WHO 2021 guideline (${STD.c.pm25.who} µg/m³).`,
      suggestion: 'Note the WHO guideline is more health-protective than the EPA NAAQS. Consider source survey + filter upgrade.',
      reference: 'WHO Air Quality Guidelines 2021',
    })
  }
  if (pmo !== null && pm !== null && pm > pmo * 2 && pm > 5) {
    advisories.push({
      id: 'pm25-io-ratio',
      severity: 'warn',
      parameter: PARAM.pm25,
      observation: `Indoor:outdoor PM2.5 ratio is ${(pm / pmo).toFixed(1)}× (indoor ${pm}, outdoor ${pmo}) — indoor source likely.`,
      suggestion: 'High I/O ratio indicates indoor PM generation. Survey for cooking, candles, printers, deteriorated dampers, building materials.',
      reference: 'Chen & Zhao 2011 — I/O ratio interpretation',
    })
  }
  return advisories
}


function checkTempRh(data) {
  const tf = num(data.tf)
  const rh = num(data.rh)
  const out = []
  if (tf !== null) {
    // Use a season-agnostic acceptable range (the engine's seasonal
    // logic is calendar-dependent and harder to surface in real-time
    // without bringing date-fragility into the advisor). Outside the
    // 67-82°F range at all is worth flagging.
    if (tf < 67 || tf > 82) {
      out.push({
        id: 'temp-comfort',
        severity: 'info',
        parameter: PARAM.temp,
        observation: `Temperature at ${tf}°F — outside ASHRAE 55 comfort range (67-82°F).`,
        suggestion: 'Confirm thermostat set-point and recent HVAC service. The full seasonal range applies in scoring — this is a heads-up only.',
        reference: 'ASHRAE 55-2023',
      })
    }
  }
  if (rh !== null) {
    if (rh < STD.t.rh.min || rh > STD.t.rh.max) {
      out.push({
        id: 'rh-comfort',
        severity: rh > 70 ? 'warn' : 'info',
        parameter: PARAM.rh,
        observation: `Relative humidity at ${rh}% — outside the ${STD.t.rh.min}-${STD.t.rh.max}% moisture-control range.`,
        suggestion: rh > 70
          ? 'High RH (>70%) sustained for >48h supports mold growth on porous surfaces. Check dehumidification, building envelope, and HVAC drain pan.'
          : 'Low RH can drive respiratory discomfort and increased respiratory-virus transmission. Check humidifier operation if present.',
        // Was 'ASHRAE 55-2023 (RH 30-60%)'. ASHRAE 55 sets no lower humidity
        // limit at all and its upper limit is a humidity ratio, not 60% RH.
        reference: `${STD.t.rh.ref} (RH ${STD.t.rh.min}-${STD.t.rh.max}%)`,
      })
    }
  }
  return out
}

const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 }

/**
 * Top-level entry. Pass the current zone's data + (optional)
 * building + presurvey context. Returns advisories sorted by
 * severity (critical first), then by parameter (stable order).
 *
 * @param {object} data         current zone reading object
 * @param {object} [context]    { building, presurvey } — reserved
 *                              for future heuristics that depend on
 *                              building type / trigger reason
 * @returns {Array<Advisory>}
 */
export function evaluateLive(data, context = {}) {
  void context
  if (!data || typeof data !== 'object') return []
  const out = []
  const checks = [
    checkCo2Ventilation,
    checkOutdoorBaseline,
    checkCO,
    checkHCHO,
    // No TVOC check, deliberately (2026-08). `checkTVOC` compared the reading
    // against Mølhave's concern (500 µg/m³) and action (3,000 µg/m³) tiers and
    // told the assessor, in the field, that the value was "at or above" one of
    // them — a judgement against a limit that does not exist. Mølhave 1991 is
    // a research dose-response framework, not a threshold, and TVOC is a
    // non-specific sum with no consensus health-based limit. The advice it
    // carried (speciate via EPA TO-15/TO-17, because a PID cannot identify
    // compounds) is still offered where a recorded SOURCE warrants it; what
    // went is the concentration trigger.
    checkTempRh,
    checkPM25,
  ]
  for (const fn of checks) {
    const r = fn(data)
    if (!r) continue
    if (Array.isArray(r)) out.push(...r)
    else out.push(r)
  }
  out.sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99
    const sb = SEVERITY_ORDER[b.severity] ?? 99
    if (sa !== sb) return sa - sb
    return a.id.localeCompare(b.id)
  })
  return out
}

export const __test = {
  PARAM,
  SEVERITY_ORDER,
  num,
}
