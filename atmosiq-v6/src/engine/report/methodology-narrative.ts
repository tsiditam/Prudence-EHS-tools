/**
 * AtmosFlow Engine v2.2 §7 — Sampling Methodology Narrative
 *
 * Auto-generates the per-instrument paragraphs and overall methodology
 * paragraph for the "Sampling Methodology" section of the client
 * report. Drives off AssessmentMeta.instrumentsUsed (an array of
 * InstrumentRef) plus the existing INSTRUMENT_ACCURACY map from
 * src/engine/instruments/accuracy.ts.
 *
 * The output text follows the CTSI format:
 *   "[Parameter] was measured on site with [Make] [Model] direct-
 *    reading instrument, NIST-traceable. [Sensor type] sensor, range
 *    [low]–[high] [unit], accuracy [accuracy spec]. Last calibrated
 *    [date]."
 *
 * Plus an overall paragraph stating sample-location selection,
 * outdoor-air comparison, and a reference to Appendix B.
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

/**
 * Builds the Sampling Methodology section content for a given list of
 * InstrumentRefs. If no instruments were recorded the section is still
 * generated, but with a single paragraph noting that instrument
 * specifications were not captured.
 */
export function buildSamplingMethodology(
  instrumentsUsed: ReadonlyArray<InstrumentRef> | undefined,
  options: { outdoorReferenceLocation?: string } = {},
): SamplingMethodologySection {
  const instruments = instrumentsUsed ?? []
  const instrumentParagraphs: string[] = []

  for (const ref of instruments) {
    const para = buildInstrumentParagraph(ref)
    if (para) instrumentParagraphs.push(para)
  }

  if (instruments.length === 0) {
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
 * Build the per-instrument paragraph from an InstrumentRef. Looks up
 * accuracy specs in INSTRUMENT_ACCURACY; if the model is not in the
 * database the paragraph notes that accuracy specs cannot be cited.
 */
export function buildInstrumentParagraph(ref: InstrumentRef): string | null {
  const spec = INSTRUMENT_ACCURACY.find(s =>
    ref.model.toLowerCase().includes(s.model.toLowerCase()) ||
    s.model.toLowerCase().includes(ref.model.toLowerCase()),
  )

  const make = ref.model.split(' ')[0] || 'Unknown'
  const calClause = ref.lastCalibration ? `Last calibrated ${ref.lastCalibration}.` : 'Calibration date not recorded.'
  const calStatus = ref.calibrationStatus ? ` (${ref.calibrationStatus})` : ''

  if (!spec) {
    return `${ref.model} was used as a direct-reading instrument during the survey${calStatus}. Manufacturer accuracy specifications could not be cited because the model is not in the AtmosFlow accuracy database. ${calClause}`
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
  return `${intro} ${calClause}`
}
