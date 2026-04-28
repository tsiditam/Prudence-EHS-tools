/**
 * AtmosFlow Engine v2.1 — Instrument Accuracy Specs
 * Every instrument has stated accuracy. Exceedances within the noise
 * floor cannot support definitive conclusions.
 */

import type { Citation } from '../types/citation'
import type { InstrumentAccuracyOutcome } from '../types/domain'

export interface AccuracyBand {
  readonly absolute?: number
  readonly percentOfReading?: number
}

export interface InstrumentAccuracySpec {
  readonly model: string
  readonly parameters: Readonly<Record<string, AccuracyBand>>
  readonly citation: Citation
}

export const INSTRUMENT_ACCURACY: ReadonlyArray<InstrumentAccuracySpec> = [
  {
    model: 'TSI Q-Trak 7575',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      co: { absolute: 3, percentOfReading: 0.03 },
      temperature: { absolute: 0.5 },
      rh: { absolute: 3 },
    },
    citation: { source: 'TSI Q-Trak 7575 Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'TSI Q-Trak 7515',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      temperature: { absolute: 0.5 },
      rh: { absolute: 3 },
    },
    citation: { source: 'TSI Q-Trak 7515 Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'TSI DustTrak DRX 8534',
    parameters: {
      pm: { absolute: 0.001, percentOfReading: 0.001 },
    },
    citation: { source: 'TSI DustTrak DRX 8534 Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'GrayWolf AdvancedSense Pro',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      hcho: { absolute: 0.02, percentOfReading: 0.10 },
      temperature: { absolute: 0.3 },
      rh: { absolute: 2 },
    },
    citation: { source: 'GrayWolf AdvancedSense Pro Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'GrayWolf IQ-610',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      temperature: { absolute: 0.3 },
      rh: { absolute: 2 },
    },
    citation: { source: 'GrayWolf IQ-610 Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'Testo 400',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      co: { absolute: 3, percentOfReading: 0.05 },
      temperature: { absolute: 0.3 },
      rh: { absolute: 1.8 },
    },
    citation: { source: 'Testo 400 Specifications', authority: 'manufacturer', edition: 'current' },
  },
  {
    model: 'Testo 440',
    parameters: {
      co2: { absolute: 50, percentOfReading: 0.03 },
      temperature: { absolute: 0.3 },
      rh: { absolute: 1.8 },
    },
    citation: { source: 'Testo 440 Specifications', authority: 'manufacturer', edition: 'current' },
  },
]

export function lookupAccuracy(model: string, parameter: string): AccuracyBand | null {
  const normalizedModel = model.toLowerCase()
  const spec = INSTRUMENT_ACCURACY.find(s => normalizedModel.includes(s.model.toLowerCase()))
  if (!spec) return null
  return spec.parameters[parameter] ?? null
}

export function isWithinNoiseFloor(observed: number, threshold: number, band: AccuracyBand): boolean {
  const tolerance = Math.max(band.absolute ?? 0, (band.percentOfReading ?? 0) * Math.abs(observed))
  return Math.abs(observed - threshold) <= tolerance
}

export function evaluateInstrumentAccuracy(
  observed: number,
  threshold: number,
  instrumentModel: string,
  parameter: string,
): InstrumentAccuracyOutcome {
  const band = lookupAccuracy(instrumentModel, parameter)
  if (!band) {
    return {
      checked: false,
      withinNoiseFloor: false,
      observedValue: observed,
      thresholdValue: threshold,
      note: `Instrument model '${instrumentModel}' not in accuracy database. Finding treated as qualitative.`,
    }
  }

  const tolerance = Math.max(band.absolute ?? 0, (band.percentOfReading ?? 0) * Math.abs(observed))
  const withinNoise = isWithinNoiseFloor(observed, threshold, band)

  return {
    checked: true,
    withinNoiseFloor: withinNoise,
    observedValue: observed,
    thresholdValue: threshold,
    tolerance,
    note: withinNoise
      ? `Observed ${parameter} (${observed}) is within instrument accuracy (±${tolerance.toFixed(1)}) of the ${threshold} reference; finding presented as qualitative.`
      : `Observed ${parameter} (${observed}) exceeds ${threshold} reference by ${(observed - threshold).toFixed(1)}, beyond instrument tolerance (±${tolerance.toFixed(1)}).`,
  }
}
