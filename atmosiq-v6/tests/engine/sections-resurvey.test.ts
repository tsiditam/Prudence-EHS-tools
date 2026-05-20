/**
 * Re-survey Schedule DOCX section — surface contract.
 *
 * Smoke-tests that buildResurveySchedule returns the expected
 * heading + rationale + table + footnote structure. Light coverage
 * on purpose: the schedule computation is exercised in detail in
 * resurvey-schedule.test.ts; this file pins the renderer wiring.
 */
import { describe, it, expect } from 'vitest'
import { Table, Paragraph } from 'docx'
import { buildResurveySchedule } from '../../src/components/docx/sections-resurvey.js'

function flatten(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  const anyNode = node as { root?: unknown[]; options?: Record<string, unknown> }
  let acc = ''
  if (anyNode.options && typeof anyNode.options.text === 'string') {
    acc += anyNode.options.text + ' '
  }
  if (Array.isArray(anyNode.root)) {
    for (const child of anyNode.root) acc += flatten(child)
  }
  return acc
}

describe('buildResurveySchedule', () => {
  it('emits heading + rationale + summary table + footnote', () => {
    const children = buildResurveySchedule({
      recommendationsRegister: { immediate: [{}], shortTerm: [], furtherEvaluation: [], longTermOptional: [] },
      assessmentDate: '2026-05-19',
    })
    const tables = children.filter((c: unknown) => c instanceof Table)
    const paragraphs = children.filter((c: unknown) => c instanceof Paragraph)
    expect(tables.length).toBe(1)
    // heading + rationale + footnote = 3 paragraphs (the table is its own block)
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/Re-survey Schedule/)
    expect(allText).toMatch(/30 days/)
    expect(allText).toMatch(/June 18, 2026/)
    expect(allText).toMatch(/qualified industrial hygienist/i)
  })

  it('renders "To be set on issuance" when assessment date is missing', () => {
    const children = buildResurveySchedule({
      recommendationsRegister: { immediate: [{}] },
      assessmentDate: undefined,
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/To be set on issuance/)
  })

  it('accepts the legacy ctx.recs shape via opts.recs', () => {
    const children = buildResurveySchedule({
      recs: { imm: [], eng: [{}], adm: [], mon: [] },
      assessmentDate: '2026-05-19',
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/90 days/)
    expect(allText).toMatch(/short-term recommendation/)
  })

  it('shows routine-cadence wording when no recommendations exist', () => {
    const children = buildResurveySchedule({
      recommendationsRegister: {},
      assessmentDate: '2026-05-19',
    })
    const allText = children.map(flatten).join(' ')
    expect(allText).toMatch(/12 months/)
    expect(allText).toMatch(/No active recommendations/)
  })
})
