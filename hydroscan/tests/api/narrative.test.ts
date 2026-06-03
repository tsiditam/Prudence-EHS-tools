// @vitest-environment node
/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Narrative layer tests — the pure pieces: the language guard, the four-section
 * parser, the payload builder, and the report-model injection. (The streaming
 * endpoint itself calls Anthropic and isn't unit-tested here.)
 */

import { describe, it, expect } from 'vitest'
import { scanNarrative } from '../../src/constants/narrative-language-guard.js'
import { buildNarrativePayload, parseNarrativeSections } from '../../src/constants/narrative-prompt.js'
import { buildReportModel } from '../../src/report/report-model'

describe('scanNarrative — language guard', () => {
  it('blocks causation / safe-unsafe / compliance phrasing', () => {
    expect(scanNarrative('Lead was caused by the service line.').level).toBe('block')
    expect(scanNarrative('The water is safe to drink.').level).toBe('block')
    expect(scanNarrative('The system is compliant with the MCL.').level).toBe('block')
  })
  it('warns on softer risk phrasing', () => {
    const r = scanNarrative('This presents a health risk to occupants.')
    expect(r.level).toBe('warn')
    expect(r.flags.some((f) => f.term === 'health risk')).toBe(true)
  })
  it('passes clean screening prose', () => {
    expect(scanNarrative('Lead at 18 ug/L is an indicator that warrants sampling to evaluate.').level).toBe('pass')
  })
})

describe('parseNarrativeSections', () => {
  it('splits the four fixed headers and strips the closing line', () => {
    const md = [
      '## Executive Summary', 'A well screening of one source.', '',
      '## Key Findings', '- Nitrate is an indicator.', '',
      '## Causal Analysis', 'Consistent with a fertilizer pathway.', '',
      '## Recommended Actions', '- Resample nitrate.', '',
      'Water Professional Review Required — screening output; not a compliance determination or causation finding.',
    ].join('\n')
    const s = parseNarrativeSections(md)
    expect(s.executiveSummary).toContain('well screening')
    expect(s.keyFindings).toContain('Nitrate')
    expect(s.causal).toContain('fertilizer')
    expect(s.recommended).toContain('Resample')
    expect(s.recommended).not.toMatch(/review required/i)
  })
})

describe('buildNarrativePayload', () => {
  it('carries tier + findings with their manifest references (no invented values)', () => {
    const evaluation = {
      tier: 'immediate',
      findings: [
        { param: { name: 'Lead (Pb)', unit: 'µg/L' }, value: 18, violations: [{ std: 'EPA Action Level', threshold: '15 µg/L', desc: 'exceeds AL', severity: 'high' }], advisories: [] },
      ],
    }
    const payload = buildNarrativePayload({ evaluation, source: { src_type: 'Private well' }, building: {}, chains: [], recs: null, samplingPlan: [], selState: 'PA' })
    expect(payload.tier).toBe('immediate')
    expect(payload.counts.violations).toBe(1)
    expect(payload.findings[0].references[0].threshold).toBe('15 µg/L')
    expect(payload.state).toBe('PA')
  })
})

describe('buildReportModel — narrative injection', () => {
  const base = { evaluation: { tier: 'compliant' as const, findings: [] as any[] } }
  it('includes narrative sections when provided', () => {
    const m = buildReportModel({ ...base, narrative: { executiveSummary: 'Exec.', keyFindings: 'KF.' } })
    expect(m.narrative?.executiveSummary).toBe('Exec.')
  })
  it('is null when no narrative is passed (report unchanged)', () => {
    expect(buildReportModel(base).narrative).toBeNull()
  })
})
