/**
 * The issued report survives the sheet that built it.
 *
 * Everything about the monitoring report except the readings — the location,
 * the client, the instrument, and above all WHICH reference profile was chosen
 * for each parameter — is typed into `MonitoringReportSheet` and was thrown
 * away when it closed. The readings persisted; the report did not.
 *
 * So it now rides the `sensorData` envelope, which already carries exactly
 * this class of state (`tempDisplay`, `thresholds`, `occupancyWindows`) for
 * exactly this reason, and which already persists to the draft, the report
 * record and the cloud. No new storage key, no new sync path.
 *
 * `normalizeSensorData` is the round-trip everything passes through — it runs
 * on every read of a stored envelope. If it drops the field, the report is
 * gone on the next open and nothing else in the system would notice.
 */
import { describe, it, expect } from 'vitest'
import { normalizeSensorData, SENSOR_DATA_VERSION } from '../../src/utils/sensorParser.js'

const REPORT = {
  session: { location: { building: 'Meridian' }, referenceProfiles: { co2: 'ashrae-621' } },
  opts: { edition: 'client', datasetHash: 'a1b2c3d4' },
  fileName: 'Meridian_IEMR.docx',
  generatedAt: '2026-07-19T14:02:00.000Z',
}

const envelope = (over: any = {}) => ({
  version: SENSOR_DATA_VERSION,
  datasets: [{ id: 'primary', role: 'indoor', label: 'Indoor', params: ['co2'], points: [] }],
  occupancyWindows: [],
  thresholds: { co2: true },
  graphs: {},
  ...over,
})

describe('the issued report round-trips through storage', () => {
  it('survives normalization with every field intact', () => {
    const out: any = normalizeSensorData(envelope({ monitoringReport: REPORT }))
    expect(out.monitoringReport).toEqual(REPORT)
    // The reference profiles are the reason this is stored at all: without
    // them the report can only be re-derived under today's defaults, which
    // may be a yardstick the assessor never selected.
    expect(out.monitoringReport.session.referenceProfiles).toEqual({ co2: 'ashrae-621' })
  })

  it('is idempotent — normalizing twice does not lose it', () => {
    const once: any = normalizeSensorData(envelope({ monitoringReport: REPORT }))
    const twice: any = normalizeSensorData(once)
    expect(twice.monitoringReport).toEqual(REPORT)
  })

  it('is null on an envelope that never produced a report', () => {
    // Explicitly null rather than undefined: a consumer checking the field
    // gets the same answer whether the envelope predates this feature or
    // simply has no report yet.
    const out: any = normalizeSensorData(envelope())
    expect(out.monitoringReport).toBeNull()
  })

  it('a legacy v1 envelope upgrades with a null report, never a fabricated one', () => {
    // v1 predates the monitoring report entirely.
    const v1: any = { params: ['co2'], points: [], units: { co2: 'ppm' }, thresholds: { co2: true } }
    const out: any = normalizeSensorData(v1)
    expect(out.version).toBe(SENSOR_DATA_VERSION)
    expect(out.monitoringReport).toBeNull()
  })

  it('a v1 envelope never folds the field into the dataset', () => {
    // The v1 branch spreads unrecognised keys into the primary dataset. A
    // monitoringReport landing inside `datasets[0]` would be invisible to the
    // projection and would corrupt the dataset shape at the same time.
    const out: any = normalizeSensorData({ params: ['co2'], points: [], monitoringReport: REPORT })
    expect(out.datasets[0].monitoringReport).toBeUndefined()
  })

  it('does not disturb the envelope state that was already persisted', () => {
    const out: any = normalizeSensorData(
      envelope({ monitoringReport: REPORT, tempDisplay: '°C', thresholds: { co2: false, pm25: true } }),
    )
    expect(out.tempDisplay).toBe('°C')
    expect(out.thresholds).toEqual({ co2: false, pm25: true })
    expect(out.datasets).toHaveLength(1)
  })
})
