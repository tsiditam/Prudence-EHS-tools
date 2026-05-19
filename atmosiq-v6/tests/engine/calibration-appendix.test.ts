/**
 * Calibration Appendix Mapper — coverage for the report-rendering
 * augmentation that populates ClientReport appendices B + E from
 * presurvey data.
 *
 * Today the TypeScript engine (src/engine/report/client.ts) declares
 * appendixB / appendixE as optional readonly fields on
 * ClientReportAppendix but never builds them, so the DOCX renderer
 * silently omits both appendices and the calibration data captured in
 * presurvey never lands in the client deliverable. This test guards
 * the mapper that closes that gap.
 *
 * CLAUDE.md: "Preserve calibration gating ... competitive moat and a
 * litigation defense." The mapper does not change the gate — it only
 * surfaces the gate's input to the reader. Status strings mirror the
 * in-app banner (getCalibrationBannerState) so the report and the
 * dashboard agree on what "expiring" means.
 */
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — calibration-appendix is a .js module without type declarations
import { buildCalibrationAppendix, renderCalibrationStatus } from '../../src/components/docx/calibration-appendix'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — instrumentRegistry is a .js module without type declarations
import { CAL_VALIDITY_DAYS } from '../../src/utils/instrumentRegistry'

const NOW = new Date('2026-05-19T12:00:00Z')

function daysAgo(n: number): string {
  const d = new Date(NOW.getTime() - n * 86400000)
  return d.toISOString().slice(0, 10)
}

describe('buildCalibrationAppendix', () => {
  it('returns nulls when no instruments are configured', () => {
    const { appendixB, appendixE } = buildCalibrationAppendix({}, { now: NOW })
    expect(appendixB).toBeNull()
    expect(appendixE).toBeNull()
  })

  it('builds Appendix B + E from an IAQ meter alone', () => {
    const presurvey = {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_serial: 'QT-44021',
      ps_inst_iaq_cal: daysAgo(60),
      ps_inst_iaq_cal_status: 'Factory',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB).not.toBeNull()
    expect(appendixE).not.toBeNull()
    expect(appendixB!.instrumentRows).toHaveLength(1)
    expect(appendixB!.instrumentRows[0].model).toBe('TSI Q-Trak 7575')
    expect(appendixB!.instrumentRows[0].serial).toBe('QT-44021')
    expect(appendixB!.instrumentRows[0].parametersMeasured).toContain('CO₂')
    expect(appendixB!.instrumentRows[0].calibrationStatus).toMatch(/^Current/)
    expect(appendixE!.calibrationRecords).toHaveLength(1)
    expect(appendixE!.calibrationRecords[0].instrumentModel).toBe('TSI Q-Trak 7575')
    expect(appendixE!.qaNotes.length).toBeGreaterThan(0)
  })

  it('builds rows for both IAQ + PID meters when both are configured', () => {
    const presurvey = {
      ps_inst_iaq: 'TSI Q-Trak 7575',
      ps_inst_iaq_serial: 'QT-44021',
      ps_inst_iaq_cal: daysAgo(60),
      ps_inst_iaq_cal_status: 'Factory',
      ps_inst_pid: 'RAE MiniRAE 3000',
      ps_inst_pid_serial: 'MR-31889',
      ps_inst_pid_cal: daysAgo(45),
      ps_inst_pid_cal_status: 'Field',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB!.instrumentRows).toHaveLength(2)
    expect(appendixE!.calibrationRecords).toHaveLength(2)
    const pidRow = appendixB!.instrumentRows.find((r: { model: string }) => r.model.includes('MiniRAE'))
    expect(pidRow.parametersMeasured).toContain('TVOC')
  })

  it('flags EXPIRED calibration and adds a QA note', () => {
    const presurvey = {
      ps_inst_iaq: 'Aeroqual S500',
      ps_inst_iaq_serial: 'AQ-7',
      ps_inst_iaq_cal: daysAgo(CAL_VALIDITY_DAYS + 31),
      ps_inst_iaq_cal_status: 'Factory',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB!.instrumentRows[0].calibrationStatus).toMatch(/^EXPIRED/)
    expect(appendixB!.instrumentRows[0].calibrationStatus).toContain('31 days overdue')
    expect(appendixE!.calibrationRecords[0].status).toMatch(/^EXPIRED/)
    expect(appendixE!.qaNotes.some((n: string) => n.includes('PAST calibration validity'))).toBe(true)
  })

  it('flags EXPIRING calibration within the warning window', () => {
    const presurvey = {
      ps_inst_iaq: 'Graywolf IQ-610',
      ps_inst_iaq_serial: 'GW-1100',
      ps_inst_iaq_cal: daysAgo(CAL_VALIDITY_DAYS - 15),
      ps_inst_iaq_cal_status: 'Field',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB!.instrumentRows[0].calibrationStatus).toMatch(/^EXPIRING/)
    expect(appendixB!.instrumentRows[0].calibrationStatus).toContain('15 days remaining')
    expect(appendixE!.qaNotes.some((n: string) => n.includes('warning window'))).toBe(true)
  })

  it('handles a meter with no recorded calibration date', () => {
    const presurvey = {
      ps_inst_iaq: 'Testo 405i',
      ps_inst_iaq_serial: 'T-405-A',
      ps_inst_iaq_cal: null,
      ps_inst_iaq_cal_status: 'Unknown',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB!.instrumentRows[0].calibrationStatus).toBe('Date not recorded')
    expect(appendixE!.qaNotes.some((n: string) => n.includes('no recorded calibration date'))).toBe(true)
  })

  it('omits a meter row when make/model is missing but serial is present', () => {
    const presurvey = {
      ps_inst_iaq: '',
      ps_inst_iaq_serial: 'SOMETHING',
      ps_inst_iaq_cal: daysAgo(30),
      ps_inst_iaq_cal_status: 'Factory',
    }
    const { appendixB, appendixE } = buildCalibrationAppendix(presurvey, { now: NOW })
    expect(appendixB).toBeNull()
    expect(appendixE).toBeNull()
  })
})

describe('renderCalibrationStatus', () => {
  it('renders Current with remaining days', () => {
    const status = renderCalibrationStatus(daysAgo(100), 'Factory', NOW)
    expect(status).toMatch(/^Current — \d+ days remaining$/)
  })

  it('renders EXPIRED with overdue days', () => {
    const status = renderCalibrationStatus(daysAgo(CAL_VALIDITY_DAYS + 5), 'Factory', NOW)
    expect(status).toMatch(/^EXPIRED — 5 days overdue$/)
  })

  it('renders EXPIRING within the warn window', () => {
    const status = renderCalibrationStatus(daysAgo(CAL_VALIDITY_DAYS - 10), 'Factory', NOW)
    expect(status).toMatch(/^EXPIRING — 10 days remaining$/)
  })

  it('falls back to "Date not recorded" when no date but status known', () => {
    const status = renderCalibrationStatus(null, 'Factory', NOW)
    expect(status).toBe('Factory — date not recorded')
  })
})
