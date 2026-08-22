/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * primaryDriver — which category, if any, is driving an assessment result.
 *
 * Pure and deterministic; extracted from MobileApp's render so the severity
 * gate below is testable. It reads scoring OUTPUT only and computes nothing
 * the engine computes.
 *
 * The bug this exists to prevent: the driver category is the RELATIVELY
 * lowest-scoring one, and one always exists — even when every category
 * passes. Mapping it straight to a deficiency phrase labelled a passing
 * Ventilation category "Ventilation inadequacy" on a card whose own body
 * read "Conditions within acceptable range".
 *
 * Contact: tsidi@prudenceehs.com
 */

export const DRIVER_LABELS = {
  Ventilation: 'Ventilation inadequacy',
  Contaminants: 'Elevated contaminant exposure',
  HVAC: 'HVAC system deficiency',
  Environment: 'Environmental condition exceedance',
}

export const DRIVER_CAUSES = {
  Ventilation: 'Insufficient outdoor air delivery or poor air distribution',
  Contaminants: 'Proximity to emission sources with inadequate dilution ventilation',
  HVAC: 'Deferred maintenance or mechanical system degradation',
  Environment: 'Thermal or moisture conditions outside recognized comfort standards',
}

/**
 * Severities strong enough to justify the language in DRIVER_LABELS.
 *
 * Deliberately medium+ rather than the engine's "not pass/info": these
 * phrases are strong ("inadequacy", "deficiency", "exceedance") and a
 * low-severity observation does not support them. Retune here.
 */
const ATTENTION_SEVERITIES = ['critical', 'high', 'medium']

export function warrantsAttention(category) {
  return !!category?.r?.some(r => ATTENTION_SEVERITIES.includes(r.sev))
}

const SEV_RANK = { critical: 4, high: 3, medium: 2, low: 1 }

/**
 * The non-complaints category carrying the worst finding, or null.
 *
 * This was the lowest score RATIO (`c.s / c.mx`). The two answers differ:
 * a category can lose most of its points to several medium findings while
 * another holds one critical, and the ratio picks the first. The driver
 * is meant to name what is actually driving the assessment.
 */
export function selectDriverCategory(cats) {
  if (!Array.isArray(cats) || cats.length === 0) return null
  const worstSev = (c) => (c?.r || []).reduce((w, r) => Math.max(w, SEV_RANK[r.sev] || 0), 0)
  const nonComplaint = cats.filter(c => c.l !== 'Complaints')
  if (nonComplaint.length === 0) return null
  return nonComplaint.reduce((a, b) => (worstSev(a) >= worstSev(b) ? a : b))
}

/**
 * Resolve the driver for a zone's categories.
 *
 * @returns {{ category: object|null, label: string|null, cause: string|null, scored: boolean }}
 *   `label` and `cause` are null when nothing warrants attention — the caller
 *   should then say so plainly rather than naming the weakest category.
 *   `scored` distinguishes "assessed and clean" from "nothing assessed", so a
 *   data gap never renders as reassurance.
 */
export function resolvePrimaryDriver(cats) {
  const category = selectDriverCategory(cats)
  if (!category) return { category: null, label: null, cause: null, scored: false }
  if (!warrantsAttention(category)) return { category, label: null, cause: null, scored: true }
  return {
    category,
    label: DRIVER_LABELS[category.l] || `${category.l} deficiency`,
    cause: DRIVER_CAUSES[category.l] || 'Contributing factors require further investigation',
    scored: true,
  }
}
