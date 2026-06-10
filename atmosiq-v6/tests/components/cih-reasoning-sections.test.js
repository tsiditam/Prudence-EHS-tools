/**
 * CIH-reasoning report-style sections (slice 2) — parameter explainers,
 * reported-concerns map, findings confidence register. Each builder returns
 * null when it has nothing to render, or a { title, children } descriptor.
 */

import { describe, it, expect } from 'vitest'
import { Table } from 'docx'
import {
  buildParameterExplainers,
  buildReportedConcernsSection,
  buildFindingsConfidenceRegister,
} from '../../src/components/docx/sections-cih-reasoning'

const ZONE_SCORE = {
  zoneName: 'Conference 8-D',
  confidence: 'Medium',
  cats: [
    { l: 'Ventilation', r: [{ t: 'CO2 readings exceeded the ASHRAE 62.1 advisory during occupancy.', std: 'ASHRAE 62.1-2025', sev: 'high' }] },
    { l: 'Thermal Comfort', r: [{ t: 'Within comfort envelope.', std: 'ASHRAE 55-2023', sev: 'pass' }] },
  ],
}

describe('buildParameterExplainers', () => {
  it('is null with no zones or no measured parameters', () => {
    expect(buildParameterExplainers(null)).toBeNull()
    expect(buildParameterExplainers([])).toBeNull()
    expect(buildParameterExplainers([{ zn: 'A' }])).toBeNull()
  })

  it('renders explainers only for parameters with data', () => {
    const section = buildParameterExplainers([{ co2: '900', tf: '72' }])
    expect(section.title).toBe('Understanding the Measurements')
    const text = JSON.stringify(section.children)
    expect(text).toContain('Carbon dioxide')
    expect(text).toContain('Temperature')
    expect(text).not.toContain('Carbon monoxide (CO)')
  })
})

describe('buildReportedConcernsSection', () => {
  it('is null when there are no concerns anywhere', () => {
    expect(buildReportedConcernsSection({}, [], [])).toBeNull()
    expect(buildReportedConcernsSection({ ps_reason: 'Routine / scheduled assessment' }, [{ cx: 'No' }], [])).toBeNull()
  })

  it('maps a zone complaint to its flagged screening categories', () => {
    const section = buildReportedConcernsSection(
      {},
      [{ cx: 'Yes — complaints reported', sy: ['Headache', 'Fatigue'], ac: '3-5' }],
      [ZONE_SCORE],
    )
    expect(section.title).toBe('Reported Concerns & Exposure Pathways')
    const text = JSON.stringify(section.children)
    expect(text).toContain('Headache, Fatigue')
    expect(text).toContain('Ventilation')        // flagged category
    expect(text).not.toContain('Thermal Comfort') // pass-severity, not flagged
  })

  it('records an unsupported concern as such (not dismissed)', () => {
    const section = buildReportedConcernsSection(
      {},
      [{ cx: 'Yes — complaints reported', sy: ['Eye irritation'] }],
      [{ zoneName: 'Zone A', cats: [{ l: 'Ventilation', r: [{ t: 'ok', sev: 'pass' }] }] }],
    )
    expect(JSON.stringify(section.children)).toContain('No corroborating screening flag')
  })

  it('includes the presurvey complaint trigger', () => {
    const section = buildReportedConcernsSection(
      { ps_reason: 'Occupant complaint(s)', ps_complaint_narrative: 'Stuffy afternoons on 8', ps_complaint_severity: 'Moderate — symptoms reported' },
      [],
      [ZONE_SCORE],
    )
    const text = JSON.stringify(section.children)
    expect(text).toContain('Stuffy afternoons on 8')
    expect(text).toContain('Moderate')
  })
})

describe('buildFindingsConfidenceRegister', () => {
  it('is null when no findings are flagged', () => {
    expect(buildFindingsConfidenceRegister(null)).toBeNull()
    expect(buildFindingsConfidenceRegister([{ zoneName: 'A', confidence: 'High', cats: [{ l: 'V', r: [{ t: 'ok', sev: 'pass' }] }] }])).toBeNull()
  })

  it('lists flagged findings with severity, reference, and engine zone confidence', () => {
    const section = buildFindingsConfidenceRegister([ZONE_SCORE])
    expect(section.title).toBe('Findings Confidence Register')
    expect(section.children.some(c => c instanceof Table)).toBe(true)
    const text = JSON.stringify(section.children)
    expect(text).toContain('Conference 8-D')
    expect(text).toContain('ASHRAE 62.1-2025')
    expect(text).toContain('Medium') // engine-computed zone confidence
    expect(text).not.toContain('Within comfort envelope') // pass finding excluded
  })
})
