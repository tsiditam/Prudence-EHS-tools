/**
 * AtmosFlow Engine v2.1 — Reading & Instrument Types
 */

import type { Citation } from './citation'

export interface InstrumentRef {
  readonly model: string
  readonly serial?: string
  readonly lastCalibration?: string
  readonly calibrationStatus?: string
}

export interface SamplingContext {
  readonly sampleType: SampleType
  readonly samplingContext: SamplingContextEnum
  readonly spatialCoverage: SpatialCoverage
  readonly temporalCoverage: TemporalCoverage
}

export type SampleType =
  | 'grab'
  | 'continuous'
  | 'integrated'
  | 'laboratory'
  | 'visual_observation'
  | 'occupant_feedback'

export type SamplingContextEnum =
  | 'occupied'
  | 'unoccupied'
  | 'peak_occupancy'
  | 'typical_operation'
  | 'abnormal_operation'
  | 'unknown'

export type SpatialCoverage =
  | 'single_point'
  | 'multi_point'
  | 'representative'
  | 'limited'
  | 'unknown'

export type TemporalCoverage =
  | 'momentary'
  | 'short_duration'
  | 'full_shift'
  | 'multi_day'
  | 'unknown'

export interface MeasuredReading<U = number> {
  readonly kind: 'measured'
  readonly value: U
  readonly capturedAt: number
  readonly instrument: InstrumentRef
  readonly sampling: SamplingContext
  readonly note?: string
}

export interface ObservedReading {
  readonly kind: 'observed'
  readonly description: string
  readonly capturedAt: number
  readonly note?: string
}

export interface NotCollectedReading {
  readonly kind: 'not_collected'
  readonly reason?: string
}

export type Reading<U = number> = MeasuredReading<U> | ObservedReading | NotCollectedReading
