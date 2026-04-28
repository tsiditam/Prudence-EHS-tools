import { describe, it, expect } from 'vitest'
import {
  TRANSMITTAL_PARAGRAPH,
  SCOPE_PARAGRAPH,
  LIMITATIONS_PARAGRAPH,
  DATA_CENTER_CONTEXT_PARAGRAPH,
  ASSESSMENT_INDEX_DISCLAIMER,
  CIH_REQUIRED_LIMITATION,
  PRE_ASSESSMENT_MEMO_NOTICE,
  DRAFT_WATERMARK,
  DRAFT_COVER_NOTICE,
  COVER_METHODOLOGY_LINE,
} from '../../src/engine/report/templates'

describe('Verbatim Paragraphs — exact content', () => {
  it('transmittal matches spec §11', () => {
    expect(TRANSMITTAL_PARAGRAPH).toBe(
      'This evaluation was conducted using a combination of visual inspection, screening-level measurements, and HVAC system review. Where direct measurement or laboratory analysis was not performed, findings are considered preliminary and intended to guide further investigation.'
    )
  })

  it('scope matches spec §11', () => {
    expect(SCOPE_PARAGRAPH).toBe(
      'This evaluation utilized screening-level instruments and observational methods. These methods are appropriate for identifying potential IAQ concerns but are not a substitute for comprehensive industrial hygiene sampling where required.'
    )
  })

  it('limitations matches spec §11', () => {
    expect(LIMITATIONS_PARAGRAPH).toBe(
      'This report is based on conditions observed during a single site visit and may not reflect temporal, seasonal, or operational variability. Screening-level measurements are not a substitute for full industrial hygiene exposure assessment. Where conclusions are based on observation or limited data, they are presented as professional judgment rather than definitive determinations.'
    )
  })

  it('data center context matches spec §11', () => {
    expect(DATA_CENTER_CONTEXT_PARAGRAPH).toBe(
      'Data center environments may operate outside typical office comfort ranges due to equipment cooling and reliability requirements. Observations should be interpreted within this operational context per ASHRAE TC 9.9 Thermal Guidelines.'
    )
  })

  it('assessment index disclaimer matches spec §12', () => {
    expect(ASSESSMENT_INDEX_DISCLAIMER).toBe(
      'This index is a proprietary prioritization tool used to guide evaluation and recommendations. It is not a measure of exposure risk, health risk, or regulatory compliance.'
    )
  })

  it('all verbatim paragraphs are non-empty strings', () => {
    const paragraphs = [
      TRANSMITTAL_PARAGRAPH, SCOPE_PARAGRAPH, LIMITATIONS_PARAGRAPH,
      DATA_CENTER_CONTEXT_PARAGRAPH, ASSESSMENT_INDEX_DISCLAIMER,
      CIH_REQUIRED_LIMITATION, PRE_ASSESSMENT_MEMO_NOTICE,
      DRAFT_WATERMARK, DRAFT_COVER_NOTICE, COVER_METHODOLOGY_LINE,
    ]
    paragraphs.forEach(p => {
      expect(typeof p).toBe('string')
      expect(p.length).toBeGreaterThan(5)
    })
  })
})
