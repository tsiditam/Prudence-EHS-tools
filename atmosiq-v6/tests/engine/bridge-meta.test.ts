/**
 * bridge/meta.ts — AssessmentMeta derivation (audit 2026-09: H5 no default
 * to today, H6 project number keyed on the assessment year; first dedicated
 * coverage).
 */
import { describe, it, expect } from 'vitest'
import { deriveAssessmentMeta, ASSESSMENT_DATE_NOT_RECORDED } from '../../src/engine/bridge/meta'

describe('assessment date', () => {
  it('passes the survey date through', () => {
    expect(deriveAssessmentMeta({ assessmentDate: '2026-04-28' }).assessmentDate).toBe('2026-04-28')
  })
  it('never defaults to today — an undated record says so (audit H5)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const meta = deriveAssessmentMeta({})
    expect(meta.assessmentDate).toBe(ASSESSMENT_DATE_NOT_RECORDED)
    expect(meta.assessmentDate).not.toBe(today)
    expect(deriveAssessmentMeta({ assessmentDate: '' }).assessmentDate).toBe(ASSESSMENT_DATE_NOT_RECORDED)
  })
})

describe('project number', () => {
  it('caller override, then presurvey, then a default keyed on the ASSESSMENT year (audit H6)', () => {
    expect(deriveAssessmentMeta({ projectNumber: 'P-1', presurvey: { ps_project_number: 'P-2' }, assessmentDate: '2025-03-01' }).projectNumber).toBe('P-1')
    expect(deriveAssessmentMeta({ presurvey: { ps_project_number: 'P-2' }, assessmentDate: '2025-03-01' }).projectNumber).toBe('P-2')
    expect(deriveAssessmentMeta({ assessmentDate: '2025-03-01' }).projectNumber).toBe('PSEC-2025-0001')
  })
  it('does not read the clock when the record is undated', () => {
    const y = String(new Date().getFullYear())
    const meta = deriveAssessmentMeta({})
    expect(meta.projectNumber).toBe('PSEC-UNDATED-0001')
    expect(meta.projectNumber).not.toContain(y)
  })
  it('the same input yields the same meta on two calls', () => {
    const input = { profile: { name: 'A' }, presurvey: { ps_recipient_name: 'B', ps_inst_iaq: 'TSI 7575' }, building: { fn: 'F' }, assessmentDate: '2026-02-02' }
    expect(JSON.stringify(deriveAssessmentMeta(input))).toBe(JSON.stringify(deriveAssessmentMeta(input)))
  })
})

describe('assessor, firm, recipient, instruments', () => {
  it('prefers the profile, then presurvey, then a placeholder', () => {
    expect(deriveAssessmentMeta({ profile: { name: 'Pro' }, presurvey: { ps_assessor: 'Pre' } }).preparingAssessor.fullName).toBe('Pro')
    expect(deriveAssessmentMeta({ presurvey: { ps_assessor: 'Pre' } }).preparingAssessor.fullName).toBe('Pre')
    expect(deriveAssessmentMeta({}).preparingAssessor.fullName).toBe('Unnamed Assessor')
  })
  it('firm from the profile or the default', () => {
    expect(deriveAssessmentMeta({ profile: { firm: 'Acme IH' } }).issuingFirm.name).toBe('Acme IH')
    expect(deriveAssessmentMeta({}).issuingFirm.name).toMatch(/Prudence/)
  })
  it('recipient from presurvey, else an empty addressee with the site as organization', () => {
    expect(deriveAssessmentMeta({ presurvey: { ps_recipient_name: 'Jane', ps_recipient_organization: 'Org' } }).transmittalRecipient).toMatchObject({ fullName: 'Jane', organization: 'Org' })
    expect(deriveAssessmentMeta({ building: { fn: 'Site' } }).transmittalRecipient).toMatchObject({ fullName: '', organization: 'Site' })
  })
  it('instruments from presurvey; reviewing professional credentials are normalised', () => {
    const m = deriveAssessmentMeta({ presurvey: { ps_inst_iaq: 'TSI 7575', ps_inst_iaq_serial: 'S1', ps_inst_pid: 'ppbRAE', ps_reviewing_professional: 'R', ps_reviewing_professional_certs: ['cih', 'ABC'] } })
    expect(m.instrumentsUsed).toHaveLength(2)
    expect(m.reviewingProfessional?.credentials).toEqual(['CIH', 'Other'])
    expect(deriveAssessmentMeta({}).instrumentsUsed).toBeUndefined()
  })
})
