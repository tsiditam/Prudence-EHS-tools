/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Defensibility primitives — screening-only / qualitative-only propagation
 * and the draft-for-review watermark interface. These flags ride every
 * rendered output so the deliverable consistently reads as a screening
 * product pending professional review.
 */

import type { Finding } from '../types/engine'

/** Standing screening-only positioning, reused in UI + report copy. */
export const SCREENING_NOTICE =
  'HydroScan provides screening-level evaluation against published drinking-water standards. ' +
  'It identifies risk indicators and recommends sampling, but does not make a regulatory compliance ' +
  'determination and is not a substitute for review by a qualified water professional.'

export interface WatermarkConfig {
  enabled: boolean
  text: string
}

/** Default draft watermark applied until a professional signs off. */
export const DRAFT_WATERMARK: WatermarkConfig = {
  enabled: true,
  text: 'DRAFT — For Professional Review',
}

/** Ensure every finding carries the screening-only flag. */
export function markScreeningOnly(findings: Finding[]): Finding[] {
  return (findings || []).map((f) => (f.screening_only ? f : { ...f, screening_only: true }))
}

/**
 * Flag findings whose values were read from a field meter (not an accredited
 * lab) as qualitative-only, so the report can caveat them. `fieldParamIds`
 * defaults to the in-situ parameters HydroScan reads in the field.
 */
export function markQualitativeOnly(
  findings: Finding[],
  fieldParamIds: string[] = ['ph', 'cl2', 'turb'],
): Finding[] {
  const set = new Set(fieldParamIds)
  return (findings || []).map((f) =>
    set.has(f.param?.id) ? { ...f, qualitative_only: true } : f,
  )
}
