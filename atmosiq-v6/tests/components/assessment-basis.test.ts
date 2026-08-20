/**
 * Assessment basis — what the results header says the assessment rests on.
 *
 * It used to be a hardcoded chip: "Assessment type: Screening
 * (Non-compliance)". That is the label CLAUDE.md names specifically —
 * "screening" as a label, chip or repeated caveat — stripped platform-wide
 * in 2026-08, with the boundary moved into the limitation statement. And it
 * read identically whether the assessor took four spot readings or ran a
 * two-week logger deployment with imported laboratory results, so the one
 * useful fact for that corner of the screen was the one it withheld.
 */
import { describe, it, expect } from 'vitest'
import { describeAssessmentBasis } from '../../src/utils/assessmentBasis'

const graph = (include: boolean) => ({ g1: { include, imageDataUrl: 'data:image/png;base64,x' } })
const lab = (n: number) => ({ laboratory: 'Atlas', rows: Array.from({ length: n }, (_, i) => ({ sampleId: `S${i}` })) })

describe('describeAssessmentBasis', () => {
  it('names the walkthrough when that is all there is', () => {
    expect(describeAssessmentBasis()).toBe('Walkthrough measurements')
    expect(describeAssessmentBasis({})).toBe('Walkthrough measurements')
    expect(describeAssessmentBasis({ sensorData: null, labResults: null })).toBe('Walkthrough measurements')
  })

  it('adds continuous monitoring once a logger graph is included', () => {
    expect(describeAssessmentBasis({ sensorData: { graphs: graph(true) } }))
      .toBe('Walkthrough + continuous monitoring')
  })

  it('adds laboratory analysis once results are imported', () => {
    expect(describeAssessmentBasis({ labResults: lab(3) }))
      .toBe('Walkthrough + laboratory analysis')
  })

  it('names both when both are present, in evidence order', () => {
    expect(describeAssessmentBasis({ sensorData: { graphs: graph(true) }, labResults: lab(1) }))
      .toBe('Walkthrough + continuous monitoring + laboratory analysis')
  })

  it('ignores evidence the report would not render', () => {
    // Same tests the appendix builders apply: an un-included graph and a
    // lab blob with no rows produce no section, so they are not part of the
    // basis either. Claiming them here would overstate the evidence.
    expect(describeAssessmentBasis({ sensorData: { graphs: graph(false) } })).toBe('Walkthrough measurements')
    expect(describeAssessmentBasis({ labResults: lab(0) })).toBe('Walkthrough measurements')
    expect(describeAssessmentBasis({ labResults: { laboratory: 'Atlas' } })).toBe('Walkthrough measurements')
  })

  it('survives malformed input rather than throwing on a results screen', () => {
    for (const bad of [null, undefined, 0, '', [], 'nope']) {
      expect(() => describeAssessmentBasis(bad as never)).not.toThrow()
    }
    expect(describeAssessmentBasis({ sensorData: { graphs: null } } as never)).toBe('Walkthrough measurements')
    expect(describeAssessmentBasis({ labResults: { rows: 'nope' } } as never)).toBe('Walkthrough measurements')
  })

  it('never reintroduces the retired label', () => {
    const every = [
      describeAssessmentBasis(),
      describeAssessmentBasis({ sensorData: { graphs: graph(true) } }),
      describeAssessmentBasis({ labResults: lab(2) }),
      describeAssessmentBasis({ sensorData: { graphs: graph(true) }, labResults: lab(2) }),
    ].join(' | ').toLowerCase()
    expect(every).not.toContain('screening')
    expect(every).not.toContain('non-compliance')
  })
})
