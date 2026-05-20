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

const PARAM = {
  co2: 'co2',
  co: 'co',
  hcho: 'hc',
  pm25: 'pm',
  tvoc: 'tv',
  temp: 'tf',
  rh: 'rh',
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
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
  if (co >= STD.c.co.osha) {
    return {
      id: 'co-pel',
      severity: 'critical',
      parameter: PARAM.co,
      observation: `CO at ${co} ppm — at or above OSHA PEL (${STD.c.co.osha} ppm).`,
      suggestion: 'Evacuate or ventilate immediately. Locate combustion source (vehicle, generator, furnace, water heater). Continuous monitoring while remediation proceeds.',
      reference: '29 CFR 1910.1000 (OSHA Z-1 PELs)',
    }
  }
  if (co >= STD.c.co.niosh) {
    return {
      id: 'co-niosh',
      severity: 'warn',
      parameter: PARAM.co,
      observation: `CO at ${co} ppm — at or above NIOSH REL (${STD.c.co.niosh} ppm).`,
      suggestion: 'Identify the source. Consider continuous CO logging over a representative occupancy period.',
      reference: 'NIOSH Pocket Guide to Chemical Hazards',
    }
  }
  if (co >= STD.c.co.niosh / 2) {
    return {
      id: 'co-rising',
      severity: 'info',
      parameter: PARAM.co,
      observation: `CO at ${co} ppm — half of NIOSH REL.`,
      suggestion: 'Worth noting. If reading is rising over the walkthrough, consider continuous monitoring.',
      reference: 'NIOSH Pocket Guide to Chemical Hazards',
    }
  }
  return null
}

function checkHCHO(data) {
  const hc = num(data.hc)
  if (hc === null) return null
  if (hc >= STD.c.hcho.osha) {
    return {
      id: 'hcho-pel',
      severity: 'critical',
      parameter: PARAM.hcho,
      observation: `Formaldehyde at ${hc} ppm — at or above OSHA PEL (${STD.c.hcho.osha} ppm).`,
      suggestion: 'Identify the source (new finishes, mobile homes, combustion). Evacuate sensitive occupants pending source isolation.',
      reference: '29 CFR 1910.1048 (Formaldehyde standard)',
    }
  }
  if (hc >= STD.c.hcho.al) {
    return {
      id: 'hcho-action',
      severity: 'warn',
      parameter: PARAM.hcho,
      observation: `Formaldehyde at ${hc} ppm — at or above OSHA Action Level (${STD.c.hcho.al} ppm).`,
      suggestion: 'Consider sorbent-tube confirmation (NIOSH 2016 DNPH) and source survey.',
      reference: '29 CFR 1910.1048 §IV (Action Level)',
    }
  }
  if (hc > STD.c.hcho.niosh) {
    return {
      id: 'hcho-niosh',
      severity: 'info',
      parameter: PARAM.hcho,
      observation: `Formaldehyde at ${hc} ppm — above NIOSH REL ceiling (${STD.c.hcho.niosh} ppm).`,
      suggestion: 'NIOSH REL is health-protective; a single spot reading above it does not establish exposure, but a sorbent-tube TWA is the defensible confirmation.',
      reference: 'NIOSH Pocket Guide — Formaldehyde',
    }
  }
  return null
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

function checkTVOC(data) {
  const tv = num(data.tv)
  if (tv === null) return null
  if (tv >= STD.c.tvoc.act) {
    return {
      id: 'tvoc-action',
      severity: 'warn',
      parameter: PARAM.tvoc,
      observation: `TVOC at ${tv} µg/m³ — at or above Mølhave action tier (${STD.c.tvoc.act} µg/m³).`,
      suggestion: 'TVOC is advisory only (Mølhave 1991). Confirm with speciated sampling: EPA TO-15 (Summa) or TO-17 (sorbent tube). Survey for solvents, finishes, cleaners.',
      reference: 'Mølhave 1991 — TVOC advisory tiers',
    }
  }
  if (tv >= STD.c.tvoc.con) {
    return {
      id: 'tvoc-concern',
      severity: 'info',
      parameter: PARAM.tvoc,
      observation: `TVOC at ${tv} µg/m³ — at or above Mølhave concern tier (${STD.c.tvoc.con} µg/m³).`,
      suggestion: 'Mølhave tiers are advisory; speciation tells you which compounds. Worth noting if multiple zones show similar elevation.',
      reference: 'Mølhave 1991 — TVOC advisory tiers',
    }
  }
  return null
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
        observation: `Relative humidity at ${rh}% — outside ASHRAE 55 range (${STD.t.rh.min}-${STD.t.rh.max}%).`,
        suggestion: rh > 70
          ? 'High RH (>70%) sustained for >48h supports mold growth on porous surfaces. Check dehumidification, building envelope, and HVAC drain pan.'
          : 'Low RH can drive respiratory discomfort and increased respiratory-virus transmission. Check humidifier operation if present.',
        reference: 'ASHRAE 55-2023 (RH 30-60%)',
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
    checkTVOC,
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
