/**
 * Jasper's reading survives the panel that asked for it.
 *
 * It rides the `sensorData` envelope beside `monitoringReport`, for the same
 * reason and by the same path: the envelope already carries this class of
 * state and already persists to the draft, the report record and the cloud.
 * No new storage key, no new sync path. `normalizeSensorData` is the
 * round-trip everything passes through, so if it drops the field the reading
 * is gone on the next open and nothing else would notice.
 *
 * Mirrors tests/lib/monitoring-report-persistence.test.ts case for case.
 */
import { describe, it, expect } from 'vitest'
import { normalizeSensorData, SENSOR_DATA_VERSION } from '../../src/utils/sensorParser.js'
import { forensicInputHash, forensicFreshness } from '../../src/utils/forensicBundle.js'

const RECORD = {
  version: 1,
  forensicSchemaVersion: 1,
  fingerprint: '0123456789abcdef',
  generatedAt: '2026-09-14T04:00:00.000Z',
  model: { provider: 'anthropic', name: 'm', version: null },
  interpretations: [{ pattern_id: 'pat-recurring_cycle-abc', title: 'Repeating daily swing', importance: 'worth_review' }],
  validation: { status: 'validated', accepted: 1, rejected: 0, reasons: [] },
}

const envelope = (over: any = {}) => ({
  version: SENSOR_DATA_VERSION,
  datasets: [{ id: 'primary', role: 'indoor', label: 'Indoor', params: ['co2'], points: [], units: { co2: 'ppm' } }],
  occupancyWindows: [],
  thresholds: { co2: true },
  graphs: {},
  ...over,
})

describe('the reading round-trips through storage', () => {
  it('survives normalization with every field intact', () => {
    const out: any = normalizeSensorData(envelope({ forensicInterpretation: RECORD }))
    expect(out.forensicInterpretation).toEqual(RECORD)
  })

  it('is idempotent — normalizing twice does not lose it', () => {
    const once: any = normalizeSensorData(envelope({ forensicInterpretation: RECORD }))
    expect(normalizeSensorData(once).forensicInterpretation).toEqual(RECORD)
  })

  it('is null on an envelope that was never read', () => {
    expect((normalizeSensorData(envelope()) as any).forensicInterpretation).toBeNull()
  })

  it('a legacy v1 envelope upgrades with a null reading, never a fabricated one', () => {
    const out: any = normalizeSensorData({ params: ['co2'], points: [], units: { co2: 'ppm' }, thresholds: { co2: true } })
    expect(out.version).toBe(SENSOR_DATA_VERSION)
    expect(out.forensicInterpretation).toBeNull()
  })

  it('a v1 envelope never folds the field into the dataset', () => {
    const out: any = normalizeSensorData({ params: ['co2'], points: [], forensicInterpretation: RECORD })
    expect(out.datasets[0].forensicInterpretation).toBeUndefined()
    expect(out.forensicInterpretation).toEqual(RECORD)
  })

  it('sits beside the monitoring report without disturbing it', () => {
    const report = { session: {}, opts: {}, fileName: 'x.docx', generatedAt: 't' }
    const out: any = normalizeSensorData(envelope({ monitoringReport: report, forensicInterpretation: RECORD, tempDisplay: '°C' }))
    expect(out.monitoringReport).toEqual(report)
    expect(out.forensicInterpretation).toEqual(RECORD)
    expect(out.tempDisplay).toBe('°C')
  })

  it('storing the reading does not change the fingerprint it is compared against', () => {
    // The fingerprint digests INPUTS. If persisting the reading moved it, every
    // reading would be stale the moment it was saved.
    const bare = envelope()
    const withReading = envelope({ forensicInterpretation: RECORD })
    expect(forensicInputHash({ sensorData: withReading })).toBe(forensicInputHash({ sensorData: bare }))
    const current = { fingerprint: forensicInputHash({ sensorData: bare }) }
    expect(forensicFreshness({ ...RECORD, fingerprint: current.fingerprint }, current).fresh).toBe(true)
  })
})
