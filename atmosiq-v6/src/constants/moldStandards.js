/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — standards, classifications and framing.
 *
 * This is the mold module's equivalent of standards.js `STD`: the single place
 * the classification vocabulary and the (few) numeric screening indicators
 * live, so the engine (src/engines/mold/*) never hardcodes them. Every entry is
 * SCREENING framing sourced to a published document. Two rules govern this file:
 *
 *   1. There is NO health-based numeric exposure limit for airborne mold spores
 *      (IOM 2004; ACMT 2025). Nothing here is a health limit, a pass/fail line,
 *      or a compliance threshold. Mold interpretation is CLASSIFICATION
 *      (IICRC S520) plus COMPARATIVE screening (indoor vs. a simultaneous
 *      outdoor reference) — never a verdict about occupant health.
 *   2. Every classification carries its published definition verbatim-in-spirit
 *      and an explicit note that the final determination is the reviewing
 *      professional's, not the software's (screening-only positioning).
 *
 * The numeric moisture indicators below are building-science screening figures
 * (moisture that can SUPPORT fungal growth), sourced and caveated, in the same
 * spirit as the advisory-only TVOC/CO₂ reference lines in standards.js — they
 * flag "worth investigating", never "unsafe".
 */

import { STANDARDS_MANIFEST_DATE } from '../version.js'

// Source labels — kept as constants so the engine and report cite identical
// strings (the citation-tracker discipline, mirrored for mold).
export const MOLD_SOURCES = {
  s520: 'IICRC S520-2024',
  aiha: 'AIHA — Recognition, Evaluation and Control of Indoor Mold (2020)',
  epaMold: 'EPA — Mold Remediation in Schools and Commercial Buildings (2008)',
  iom: 'IOM — Damp Indoor Spaces and Health (2004)',
  acmt: 'ACMT Position Statement — Mold (2025)',
  // Moisture references (audit M8). Neither figure below is stated in EPA
  // (2008), which was cited for all three materials until 2026-09.
  s500: 'IICRC S500-2021 — Standard for Professional Water Damage Restoration (drying goal / dry standard for wood-based materials)',
  astmF2170: 'ASTM F2170 — Standard Test Method for Determining Relative Humidity in Concrete Floor Slabs Using in situ Probes (75% RH flooring-installation reference)',
}

// The standing framing that must ride on EVERY mold output. Screening-only
// positioning depends on this text not drifting; the report and the engine both
// import it rather than re-authoring the sentence.
export const MOLD_SCREENING_DISCLAIMER =
  'Mold indicators identify conditions warranting further ' +
  'evaluation; they are not a determination of occupant health risk, ' +
  'contamination extent, or clearance. Classification and interpretation must ' +
  'be confirmed by a qualified professional.'

export const NO_HEALTH_LIMIT_NOTE =
  'No health-based numeric exposure limit exists for airborne mold spores ' +
  `(${MOLD_SOURCES.iom}; ${MOLD_SOURCES.acmt}). Spore data are interpreted ` +
  'comparatively (indoor vs. simultaneous outdoor reference), not against a ' +
  'health threshold.'

/**
 * IICRC S520 water-intrusion Categories. These describe the SANITARY quality of
 * the intruding water at its source; category can escalate with time and
 * contact (reflected by `mayEscalate`). Mapped from a described source, never
 * inferred from a number.
 */
export const WATER_CATEGORIES = {
  1: {
    id: 1,
    label: 'Category 1 — Sanitary ("clean water")',
    definition:
      'Originates from a sanitary water source and does not pose substantial ' +
      'risk from dermal, ingestion, or inhalation exposure at the point of ' +
      'origin (e.g. supply lines, tub/sink overflow with no contaminants).',
    mayEscalate: true,
    escalationNote:
      'Category 1 water may deteriorate to Category 2 or 3 with time, ' +
      'temperature, and contact with soils/materials.',
    source: MOLD_SOURCES.s520,
  },
  2: {
    id: 2,
    label: 'Category 2 — Significantly contaminated ("grey water")',
    definition:
      'Contains significant contamination and has the potential to cause ' +
      'discomfort or sickness if contacted or consumed (e.g. discharge from ' +
      'dishwashers/washing machines, toilet overflow with urine and no feces).',
    mayEscalate: true,
    escalationNote: 'Category 2 water may deteriorate to Category 3 over time.',
    source: MOLD_SOURCES.s520,
  },
  3: {
    id: 3,
    label: 'Category 3 — Grossly contaminated ("black water")',
    definition:
      'Grossly contaminated and may contain pathogenic, toxigenic, or other ' +
      'harmful agents (e.g. sewage, rising surface/ground water, seawater, ' +
      'toilet overflow with feces).',
    mayEscalate: false,
    escalationNote: '',
    source: MOLD_SOURCES.s520,
  },
}

/**
 * IICRC S520 Conditions of an indoor environment. Condition 1 is the reference
 * ("normal fungal ecology"); Conditions 2 and 3 describe settled-spore and
 * actual-growth contamination respectively.
 */
export const REMEDIATION_CONDITIONS = {
  1: {
    id: 1,
    label: 'Condition 1 — Normal fungal ecology',
    definition:
      'An indoor environment that may have settled spores, fungal fragments, ' +
      'or traces of actual growth whose identity, location, and quantity are ' +
      'reflective of a normal fungal ecology for a similar indoor environment.',
    source: MOLD_SOURCES.s520,
  },
  2: {
    id: 2,
    label: 'Condition 2 — Settled spores',
    definition:
      'An indoor environment primarily contaminated with settled spores ' +
      'dispersed directly or indirectly from a Condition 3 area, which may ' +
      'have traces of actual growth.',
    source: MOLD_SOURCES.s520,
  },
  3: {
    id: 3,
    label: 'Condition 3 — Actual mold growth',
    definition:
      'An indoor environment contaminated with the presence of actual mold ' +
      'growth and associated spores. Actual growth includes visible or hidden ' +
      'growth.',
    source: MOLD_SOURCES.s520,
  },
}

/**
 * Building-science moisture screening indicators. Moisture is the single
 * controllable factor for fungal growth (EPA 2008), so an elevated reading is a
 * SCREENING flag ("supports growth — investigate"), not a health limit and not
 * a statement that mold is present. Thresholds are widely-cited generic figures
 * and are explicitly caveated: species- and meter-specific criteria govern the
 * final call. `%MC` = percent moisture content (gravimetric-equivalent scale).
 */
export const MOISTURE_INDICATORS = {
  // Wood / wood-based materials. 16% MC is the IICRC S500 dry-standard
  // screening line — the ONE wood figure in this codebase (sampling.js reads
  // it from here; it used to carry its own 19%). 19% is the fibre-saturation
  // / decay rule of thumb, a different question from "can growth be
  // supported", and is deliberately not the screening line.
  wood: {
    material: 'wood / wood-based',
    elevatedAtOrAbovePct: 16,
    unit: '%MC',
    note:
      'IICRC S500 dry-standard screening figure; correct for species and ' +
      'meter. Elevated moisture indicates growth POTENTIAL, not the presence ' +
      'of mold.',
    source: MOLD_SOURCES.s500,
  },
  // Gypsum board / drywall — QUALITATIVE ONLY (audit H7). Pin/pinless meters
  // report gypsum on a relative 0–100 scale, not a %MC, and no published
  // document states a numeric threshold on that scale. The previous entry
  // flagged any reading ≥ 1, i.e. every reading. `elevatedAtOrAbovePct` is
  // null: evaluateMoisture records the reading and treats only the meter's
  // own "elevated/wet" flag as the screening indicator.
  drywall: {
    material: 'gypsum board / drywall',
    elevatedAtOrAbovePct: null,
    qualitativeOnly: true,
    unit: 'meter-relative',
    note:
      'No published numeric threshold; qualitative. Gypsum readings are ' +
      'meter-relative, not true %MC. A reading the meter itself flags as ' +
      '"elevated/wet" is a screening indicator; the paper facing supports ' +
      'growth at comparatively low moisture.',
    source: null,
  },
  // Concrete / masonry. 75% in-slab RH is the ASTM F2170 flooring-
  // installation reference, not an EPA (2008) figure; elevated moisture
  // supports growth on any organic dust/finish present.
  concrete: {
    material: 'concrete / masonry',
    elevatedAtOrAbovePct: 75, // in-slab %RH, ASTM F2170 reference
    unit: '%RH-in-slab',
    note:
      'In-slab RH screening reference (ASTM F2170 in situ probe method); ' +
      'masonry itself does not feed fungi, but elevated moisture supports ' +
      'growth on finishes, adhesives and dust.',
    source: MOLD_SOURCES.astmF2170,
  },
}

/**
 * Comparative spore-screening vocabulary. The ONLY defensible airborne-spore
 * interpretation is comparative and directional (AIHA 2020): indoor genera
 * concentrations vs. a simultaneous outdoor reference, plus the presence of
 * water-damage-associated genera indoors out of proportion to outdoor. These
 * are SCREENING indicators of possible amplification — never health proof.
 */
export const SPORE_SCREENING = {
  method: 'Comparative indoor vs. simultaneous outdoor spore-trap screening',
  source: MOLD_SOURCES.aiha,
  noHealthLimit: NO_HEALTH_LIMIT_NOTE,
  // Genera commonly associated with water-damaged building materials. Their
  // presence INDOORS out of proportion to outdoor is a screening indicator of
  // possible indoor amplification — not, by itself, a health or exposure claim.
  waterDamageIndicatorGenera: [
    'Stachybotrys',
    'Chaetomium',
    'Aspergillus/Penicillium-like',
    'Ulocladium',
    'Acremonium',
    'Fusarium',
    'Trichoderma',
    'Memnoniella',
  ],
  // Categorical screening outcomes (mirrors the KG's categorical confidence —
  // no fabricated numeric ratio "score").
  outcomes: {
    consistentWithNormalEcology: 'consistent-with-normal-ecology',
    possibleAmplificationIndicator: 'possible-amplification-indicator',
    insufficientData: 'insufficient-data',
  },
}

// Mold-standards snapshot marker, shares the manifest date so a report can
// state which bibliography snapshot the mold framing was drawn from.
export const MOLD_STANDARDS_UPDATED = STANDARDS_MANIFEST_DATE
