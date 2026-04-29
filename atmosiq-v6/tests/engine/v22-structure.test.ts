/**
 * v2.2 acceptance — top-level ClientReport structure.
 *
 * Validates:
 *   1. Engine version is 2.2.0.
 *   2. ClientReport.transmittalLetter is structured (not a single string).
 *   3. ClientReport.cover carries projectNumber via meta.
 *   4. ClientReport.executiveSummary.metadataTable carries all 8 fields.
 *   5. ClientReport.samplingMethodology is populated.
 *   6. ClientReport.buildingAndSystemConditions section is present.
 *   7. ClientReport.methodologyDisclosure carries the screening
 *      disclosure paragraph.
 */

import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from '../../src/engine/types/citation'
import { renderClientReport } from '../../src/engine/report/client'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { scoreZone, compositeScore } from '../../src/engines/scoring'
import { TRANSMITTAL_PARAGRAPH } from '../../src/engine/report/templates'
import type { AssessmentMeta } from '../../src/engine/types/domain'

const META: AssessmentMeta = {
  siteName: 'Meridian Commerce Tower',
  siteAddress: '450 Commerce Blvd, Suite 300, Hartford, CT 06103',
  assessmentDate: '2026-04-28',
  preparingAssessor: { fullName: 'Tsidi Tamakloe', credentials: ['CSP'] },
  reviewingProfessional: { fullName: 'Kweku Blankson', credentials: ['CIH'] },
  reviewStatus: 'reviewed_by_qualified_professional',
  issuingFirm: { name: 'Prudence Safety & Environmental Consulting, LLC', contact: { email: 'support@prudenceehs.com', phone: '301-541-8362' } },
  projectNumber: 'PSEC-2026-0042',
  transmittalRecipient: {
    fullName: 'Roger Navins',
    title: 'Mr.',
    organization: 'Sage Realty',
    addressLine1: '777 Third Avenue',
    city: 'New York', state: 'NY', zip: '10017',
  },
  instrumentsUsed: [
    { model: 'TSI Q-Trak 7575', lastCalibration: '2026-01-15' },
  ],
}

function buildScore() {
  const zones = [
    { zn: '3rd Floor Open Office', su: 'office', co2: '1180', co2o: '420', tf: '74', rh: '52', pm: '12' },
    { zn: 'Conference Room B', su: 'conference', co2: '1100', tf: '76', rh: '58' },
  ]
  const bldg = { hm: 'Within 6 months', fc: 'Light dust' }
  const lzs = zones.map(z => scoreZone(z, bldg))
  const cs = compositeScore(lzs)
  // Presurvey carries calibration record so the defensibility check
  // doesn't trigger the refusal-to-issue memo path.
  const presurvey = {
    ps_assessor: 'Tsidi Tamakloe',
    ps_inst_iaq: 'TSI Q-Trak 7575',
    ps_inst_iaq_cal: '2026-01-15',
    ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec',
  }
  return legacyToAssessmentScore(lzs, cs, zones.map(z => ({ ...z, ...bldg })) as any, { meta: META, presurvey })
}

describe('v2.2 acceptance — structural assertions', () => {
  it('Engine version is atmosflow-engine-2.2.0', () => {
    expect(ENGINE_VERSION).toBe('atmosflow-engine-2.2.0')
  })

  it('ClientReport.transmittalLetter is structured', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const letter = result.report.transmittalLetter
    expect(letter).toBeDefined()
    expect(typeof letter).toBe('object')
    expect(typeof letter.date).toBe('string')
    expect(typeof letter.subjectLine).toBe('string')
    expect(typeof letter.salutation).toBe('string')
    expect(letter.bodyParagraphs.length).toBeGreaterThanOrEqual(3)
    expect(letter.preparedBy.length).toBeGreaterThanOrEqual(1)
    expect(letter.recipient.fullName).toBe('Roger Navins')
    expect(letter.recipient.organization).toBe('Sage Realty')
  })

  it('Transmittal subject line is uppercase and references the site', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const subject = result.report.transmittalLetter.subjectLine
    expect(subject).toMatch(/^INDOOR AIR QUALITY EVALUATION PERFORMED AT:/)
    expect(subject).toContain('MERIDIAN COMMERCE TOWER')
  })

  it('Salutation uses Mr. honorific when title indicates Mr.', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.transmittalLetter.salutation).toBe('Dear Mr. Navins,')
  })

  it('ProjectNumber flows from meta to transmittalLetter and executiveSummary metadata', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.transmittalLetter.projectNumber).toBe('PSEC-2026-0042')
    expect(result.report.executiveSummary.metadataTable.projectNumber).toBe('PSEC-2026-0042')
  })

  it('ExecutiveSummary metadata table has all 8 fields populated', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const md = result.report.executiveSummary.metadataTable
    expect(md.clientName.length).toBeGreaterThan(0)
    expect(md.reportDate.length).toBeGreaterThan(0)
    expect(md.projectNumber.length).toBeGreaterThan(0)
    expect(md.surveyDate).toBe('2026-04-28')
    expect(md.projectAddress).toContain('Hartford')
    expect(md.surveyArea).toMatch(/3rd Floor|Conference Room B/)
    expect(md.requestedBy).toBe('Sage Realty')
    expect(md.siteContact).toBe('Roger Navins')
  })

  it('ExecutiveSummary scopeOfWork and resultsNarrative are present and non-trivial', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const summary = result.report.executiveSummary
    expect(summary.scopeOfWork.length).toBeGreaterThan(80)
    expect(summary.resultsNarrative.length).toBeGreaterThan(50)
  })

  it('ExecutiveSummary observations is at most 6 entries', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.executiveSummary.observations.length).toBeLessThanOrEqual(6)
  })

  it('ExecutiveSummary recommendations is at most 6 entries', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.executiveSummary.recommendations.length).toBeLessThanOrEqual(6)
  })

  it('ClientReport.samplingMethodology is populated when instrumentsUsed is set', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    const sm = result.report.samplingMethodology
    expect(sm).toBeDefined()
    expect(sm.instrumentParagraphs.length).toBeGreaterThan(0)
    expect(sm.overallParagraph).toMatch(/Sample locations/)
  })

  it('ClientReport.buildingAndSystemConditions section is present', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.buildingAndSystemConditions).toBeDefined()
    expect(Array.isArray(result.report.buildingAndSystemConditions.observedConditions)).toBe(true)
  })

  it('ClientReport.methodologyDisclosure carries the screening disclosure paragraph', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.methodologyDisclosure).toBe(TRANSMITTAL_PARAGRAPH)
  })

  it('Backward-compat: transmittal field still carries the v2.1 verbatim paragraph', () => {
    const result = renderClientReport(buildScore())
    if (result.kind !== 'report') throw new Error('Expected report')
    expect(result.report.transmittal).toBe(TRANSMITTAL_PARAGRAPH)
  })
})
