/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Mold screening — IICRC S520 water-intrusion Category classifier.
 *
 * Maps a DESCRIBED water source to a Category (1 sanitary / 2 significantly
 * contaminated / 3 grossly contaminated). Pure keyword classification against
 * the S520 definitions — never inferred from a number, never a health verdict.
 * An unrecognized source returns `null` (unclassified → the reviewing
 * professional classifies it), which is the honest, defensible default rather
 * than guessing a category.
 */

import { WATER_CATEGORIES } from '../../constants/moldStandards.js'

// Ordered most-severe-first so a source mentioning both "sewage" and "leak"
// classifies as the more contaminated Category 3. Keyword sets encode the S520
// example sources; matching is substring, case-insensitive, word-ish.
const CATEGORY_KEYWORDS = [
  { id: 3, terms: ['sewage', 'sewer', 'feces', 'fecal', 'black water', 'blackwater', 'toilet overflow', 'ground water', 'groundwater', 'rising water', 'flood', 'river', 'stream', 'seawater', 'sea water', 'storm surge', 'standing water'] },
  { id: 2, terms: ['grey water', 'gray water', 'greywater', 'graywater', 'dishwasher', 'washing machine', 'washer', 'sump', 'urine', 'aquarium', 'discharge', 'condensate overflow', 'hydrostatic'] },
  { id: 1, terms: ['supply line', 'supply-line', 'clean water', 'potable', 'rain', 'roof leak', 'window leak', 'condensate', 'tub overflow', 'sink overflow', 'ice maker', 'water heater', 'pipe burst', 'burst pipe', 'plumbing leak'] },
]

/**
 * Classify a described water source to an S520 Category.
 *
 * @param {string} source  free-text description of the water source
 * @param {{ prolonged?: boolean }} [opts]
 * @returns {null | {
 *   categoryId: 1|2|3, label: string, definition: string,
 *   mayEscalate: boolean, escalationNote: string, source: string,
 *   escalationFlag: boolean
 * }} null when the source is unrecognized (professional to classify).
 */
export function classifyWaterCategory(source, opts = {}) {
  const text = String(source || '').toLowerCase().trim()
  if (!text) return null

  let matched = null
  for (const { id, terms } of CATEGORY_KEYWORDS) {
    if (terms.some((t) => text.includes(t))) { matched = id; break }
  }
  if (matched == null) return null

  const cat = WATER_CATEGORIES[matched]
  // A prolonged/standing Category 1 or 2 event is flagged as potentially
  // escalated per S520 — surfaced as a note, not silently reclassified.
  const escalationFlag = !!opts.prolonged && cat.mayEscalate

  return {
    categoryId: cat.id,
    label: cat.label,
    definition: cat.definition,
    mayEscalate: cat.mayEscalate,
    escalationNote: cat.escalationNote,
    source: cat.source,
    escalationFlag,
  }
}
