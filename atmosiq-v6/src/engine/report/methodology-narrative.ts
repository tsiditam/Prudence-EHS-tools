/**
 * AtmosFlow Engine v2.5 §7 — Sampling Methodology Narrative
 *
 * Auto-generates the per-instrument paragraphs and overall methodology
 * paragraph for the "Sampling Methodology" section of the client
 * report. Drives off AssessmentMeta.instrumentsUsed (an array of
 * InstrumentRef) plus the existing INSTRUMENT_ACCURACY map from
 * src/engine/instruments/accuracy.ts.
 *
 * v2.5 §7 changes:
 *   1. Instruments with zero readings tied to them are silently
 *      filtered from the methodology and Appendix B output. A console
 *      warning is logged for the upstream data integrity issue.
 *   2. Unknown-instrument language is rewritten to explicitly tie the
 *      missing accuracy spec to the qualitative_only consequence per
 *      v2.1 evidence-basis logic.
 */

import type { InstrumentRef } from '../types/reading'
import type { SamplingMethodologySection } from './types'
import { INSTRUMENT_ACCURACY } from '../instruments/accuracy'

const PARAMETER_LABEL: Record<string, string> = {
  co2: 'Carbon dioxide (CO₂)',
  co: 'Carbon monoxide (CO)',
  hcho: 'Formaldehyde (HCHO)',
  pm: 'Airborne particulate matter (PM2.5/PM10)',
  temperature: 'Temperature',
  rh: 'Relative humidity',
}

const PARAMETER_UNIT: Record<string, string> = {
  co2: 'ppm',
  co: 'ppm',
  hcho: 'ppm',
  pm: 'mg/m³',
  temperature: '°F',
  rh: '%',
}

export interface InstrumentMethodologyOptions {
  /**
   * v2.5 §7 — readings actually tied to each instrument. Keyed by
   * instrument model (case-insensitive contains-match against the
   * InstrumentRef.model). When a model maps to 0 readings, it is
   * filtered from the output.
   */
  readonly readingsByInstrument?: Readonly<Record<string, number>>
  readonly outdoorReferenceLocation?: string
  /**
   * Optional sink for filter-warning side effects (defaults to
   * console.warn). Tests inject a buffer to assert behavior.
   */
  readonly warn?: (msg: string) => void
}

/**
 * Builds the Sampling Methodology section content. Instruments with
 * zero recorded readings are filtered out (with a console warning);
 * instruments not in the accuracy database render the qualitative-
 * only disclosure paragraph.
 */
export function buildSamplingMethodology(
  instrumentsUsed: ReadonlyArray<InstrumentRef> | undefined,
  options: InstrumentMethodologyOptions = {},
): SamplingMethodologySection {
  const instruments = instrumentsUsed ?? []
  const readings = options.readingsByInstrument ?? {}
  const warn = options.warn ?? defaultWarn
  const instrumentParagraphs: string[] = []

  for (const ref of instruments) {
    const result = renderInstrumentMethodologyParagraph(ref, readings, INSTRUMENT_ACCURACY)
    if (result.warning) warn(result.warning)
    if (result.paragraph) instrumentParagraphs.push(result.paragraph)
  }

  if (instruments.length === 0 || instrumentParagraphs.length === 0) {
    instrumentParagraphs.push(
      'Instrument specifications were not captured for this assessment. Per-parameter measurement methodology should be confirmed against operator notes before relying on quantitative findings.',
    )
  }

  const outdoorClause = options.outdoorReferenceLocation
    ? `Outdoor air was sampled at ${options.outdoorReferenceLocation} for comparison purposes.`
    : 'Outdoor air was sampled at a representative exterior location for comparison purposes when conditions allowed.'

  const overallParagraph =
    `Sample locations within each zone were selected to be representative of the occupied space. ${outdoorClause} Sampling durations and methodology are summarized in Appendix B.`

  return {
    instrumentParagraphs,
    overallParagraph,
  }
}

/**
 * v2.5 §7 — Resolve which instruments survive the zero-readings
 * filter. Returns the kept InstrumentRefs; pure function so the
 * Appendix B builder can stay aligned with Sampling Methodology.
 */
export function filterInstrumentsWithReadings(
  instrumentsUsed: ReadonlyArray<InstrumentRef> | undefined,
  readingsByInstrument: Readonly<Record<string, number>> | undefined,
): ReadonlyArray<InstrumentRef> {
  const instruments = instrumentsUsed ?? []
  const readings = readingsByInstrument ?? {}
  if (Object.keys(readings).length === 0) {
    // No readings map provided — assume all instruments contributed
    // data (back-compat with callers that don't supply readings).
    return instruments
  }
  return instruments.filter(ref => readingCountFor(ref, readings) > 0)
}

export interface InstrumentParagraphResult {
  readonly paragraph: string
  readonly warning?: string
}

/**
 * Build a single instrument paragraph (or empty paragraph + warning
 * for zero-reading instruments). Exposed for direct testing.
 */
export function renderInstrumentMethodologyParagraph(
  ref: InstrumentRef,
  readingsByInstrument: Readonly<Record<string, number>>,
  accuracyDb: ReadonlyArray<{ model: string; parameters: Readonly<Record<string, { absolute?: number; percentOfReading?: number }>> }> = INSTRUMENT_ACCURACY,
): InstrumentParagraphResult {
  const readingsCount = readingCountFor(ref, readingsByInstrument)
  const calStatus = ref.calibrationStatus ? ` (${ref.calibrationStatus})` : ''
  const calClause = ref.lastCalibration ? `Last calibrated ${ref.lastCalibration}.` : 'Calibration date not recorded.'

  // Zero-readings filter — when a readings map is provided and this
  // instrument has 0 readings tied to it, filter the instrument out
  // of the output and surface a warning for the upstream caller.
  if (Object.keys(readingsByInstrument).length > 0 && readingsCount === 0) {
    return {
      paragraph: '',
      warning: `[v2.5 §7] Instrument '${ref.model}' was listed in instrumentsUsed but no readings were tied to it. Filtering from rendered Sampling Methodology and Appendix B.`,
    }
  }

  const spec = accuracyDb.find(s =>
    ref.model.toLowerCase().includes(s.model.toLowerCase()) ||
    s.model.toLowerCase().includes(ref.model.toLowerCase()),
  )

  if (!spec) {
    return {
      paragraph:
        `${ref.model} was used as a direct-reading instrument during the survey${calStatus}. ` +
        `Manufacturer accuracy specifications for this model are not in the AtmosFlow accuracy database; ` +
        `findings derived from this instrument are presented as qualitative only and should be confirmed ` +
        `with calibrated reference instrumentation if quantitative determination is required. ${calClause}`,
    }
  }

  const params = Object.keys(spec.parameters)
  const parameterClauses: string[] = []
  for (const param of params) {
    const band = spec.parameters[param]
    const label = PARAMETER_LABEL[param] || param
    const unit = PARAMETER_UNIT[param] || ''
    const accuracyParts: string[] = []
    if (band.absolute !== undefined) accuracyParts.push(`±${band.absolute} ${unit}`.trim())
    if (band.percentOfReading !== undefined) accuracyParts.push(`±${(band.percentOfReading * 100).toFixed(1)}% of reading`)
    const accuracySpec = accuracyParts.length > 0 ? accuracyParts.join(' or ') : 'manufacturer-stated accuracy'
    parameterClauses.push(`${label} (accuracy ${accuracySpec})`)
  }

  const intro = `${ref.model} direct-reading instrument was used to measure ${parameterClauses.join('; ')}.`
  return { paragraph: `${intro} ${calClause}` }
}

/**
 * Backwards-compatible single-paragraph builder. Calls the new
 * renderer with an empty readings map (so it never filters) and
 * returns the paragraph string only (or null if filtered, which
 * cannot happen in this back-compat path).
 */
export function buildInstrumentParagraph(ref: InstrumentRef): string | null {
  const result = renderInstrumentMethodologyParagraph(ref, {})
  return result.paragraph || null
}

function readingCountFor(
  ref: InstrumentRef,
  readingsByInstrument: Readonly<Record<string, number>>,
): number {
  const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const target = norm(ref.model)
  let total = 0
  for (const key of Object.keys(readingsByInstrument)) {
    const k = norm(key)
    if (k === target || k.includes(target) || target.includes(k)) {
      total += readingsByInstrument[key] || 0
    }
  }
  return total
}

function defaultWarn(msg: string): void {
  if (typeof console !== 'undefined' && console.warn) console.warn(msg)
}
