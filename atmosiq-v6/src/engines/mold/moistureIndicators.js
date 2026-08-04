/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — moisture indicator evaluation.
 *
 * Compares a captured moisture reading to its material's building-science
 * SCREENING reference (MOISTURE_INDICATORS). "Elevated" means the reading
 * supports fungal growth potential and is worth investigating — never that mold
 * is present, and never a health limit. A material with no reference (or a null
 * reading) returns `elevated: false` with a reason, so the caller degrades
 * gracefully rather than fabricating a flag.
 */

import { MOISTURE_INDICATORS } from '../../constants/moldStandards.js'

/**
 * @param {{ material?: string, value?: number|null }} reading
 * @returns {{
 *   elevated: boolean,
 *   material: string,
 *   value: number|null,
 *   threshold: number|null,
 *   unit: string|null,
 *   note: string,
 *   source: string|null
 * }}
 */
export function evaluateMoisture(reading) {
  const material = String(reading?.material || 'other')
  const indicator = MOISTURE_INDICATORS[material]
  const value = Number.isFinite(reading?.value) ? Number(reading.value) : null

  if (!indicator) {
    return {
      elevated: false, material, value, threshold: null, unit: null,
      note: 'No screening reference for this material; record the reading and defer to professional judgment.',
      source: null,
    }
  }
  if (value == null) {
    return {
      elevated: false, material, value: null,
      threshold: indicator.elevatedAtOrAbovePct, unit: indicator.unit,
      note: 'No numeric reading captured; a qualitative "elevated/wet" meter flag is itself a screening indicator.',
      source: indicator.source,
    }
  }
  return {
    elevated: value >= indicator.elevatedAtOrAbovePct,
    material,
    value,
    threshold: indicator.elevatedAtOrAbovePct,
    unit: indicator.unit,
    note: indicator.note,
    source: indicator.source,
  }
}
