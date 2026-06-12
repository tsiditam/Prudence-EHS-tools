/**
 * Scoped knowledge-graph context for Jasper (KG stage 2, §16).
 *
 * Verifies the graph is resolved into a compact, relationship-nested
 * summary with the platform's grounding intact: framed standards (CO2 /
 * ASHRAE 62.1 is never a health limit), categorical confidence, surfaced
 * contradictions, IH-review flags, and graceful degradation on pre-engine
 * drafts. Also pins that buildJasperContext attaches it.
 */
import { describe, it, expect } from 'vitest'
import { buildGraphContext, summarizeGraph } from '../../lib/context/graphContext'
import { buildJasperContext } from '../../lib/context/buildJasperContext'
import { projectGraph } from '../../src/services/knowledgeGraphBuilder'
import type { KGModel } from '../../src/types/knowledgeGraph'

// A realistic post-engine state slice: one zone with a non-pass ventilation
// finding (carrying an ASHRAE 62.1 std), a causal chain, and a recommendation.
const engineState = {
  id: 'rpt-ctx-1',
  bldg: { fn: 'Acme HQ' },
  zones: [{ id: 'z1', zn: 'Conference Room A' }],
  zoneScores: [{
    zoneName: 'Conference Room A',
    cats: [{ l: 'Ventilation', r: [
      { t: 'CO2 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
      { t: 'CO2 is a ventilation indicator', std: 'ASHRAE 62.1-2025', sev: 'info' },
    ] }],
  }],
  causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', rootCause: 'Inadequate ventilation', evidence: ['CO2 1800 ppm'], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
  recs: ['Verify outdoor air delivery and HVAC operation'],
}

describe('buildGraphContext', () => {
  const ctx = buildGraphContext(engineState)

  it('produces a summary with findings and grounding guidance', () => {
    expect(ctx).not.toBeNull()
    expect(ctx!.findings.length).toBe(1)
    expect(ctx!.node_count).toBeGreaterThan(0)
    expect(ctx!.guidance.some((g) => /ASHRAE 62\.1|ventilation-adequacy indicator/.test(g))).toBe(true)
  })

  it('nests the framed standard so CO2 is never a health limit', () => {
    const f = ctx!.findings[0]
    const std = f.standards.find((s) => /ASHRAE 62\.1/.test(s.label))
    expect(std).toBeTruthy()
    expect(std!.is_health_limit).toBe(false)
  })

  it('flags every finding for IH review and carries categorical confidence', () => {
    const f = ctx!.findings[0]
    expect(f.ih_review_required).toBe(true)
    expect(['validated', 'provisional', 'qualitative']).toContain(f.confidence)
  })

  it('attaches the pathway and recommendation to the finding', () => {
    const f = ctx!.findings[0]
    expect(f.pathways.some((p) => /Ventilation Deficiency/.test(p.pathway))).toBe(true)
    expect(f.recommendations.length).toBeGreaterThan(0)
  })

  it('returns null on a pre-engine draft (no zone scores)', () => {
    expect(buildGraphContext({ zones: [{ id: 'z1' }] })).toBeNull()
    expect(buildGraphContext({})).toBeNull()
  })

  it('is deterministic', () => {
    expect(JSON.stringify(buildGraphContext(engineState))).toEqual(JSON.stringify(ctx))
  })
})

describe('summarizeGraph surfaces engine-flagged contradictions', () => {
  const model: KGModel = {
    assessmentId: 'rpt-ctx-2', engineVersion: '2.6.0', rulesetVersion: '2.6.0',
    zones: [{
      id: 'z1', name: 'Z',
      findings: [{ key: 'ventilation_concern', label: 'Ventilation concern', ihReviewRequired: true }],
      measurements: [{
        key: 'co2:max', label: 'CO2 1,500 at low occupancy', parameter: 'co2',
        supportsFindings: ['ventilation_concern'], contradictsFindings: ['ventilation_concern'],
      }],
    }],
  }
  it('reports contradicted_by evidence on the finding', () => {
    const ctx = summarizeGraph(projectGraph(model))
    const f = ctx.findings[0]
    expect(f.contradicted_by.length).toBe(1)
    expect(f.contradicted_by[0].kind).toBe('measurement')
  })
})

describe('buildJasperContext integration', () => {
  it('attaches knowledge_graph when engine outputs are present', () => {
    const jc = buildJasperContext(engineState as never)
    expect(jc.knowledge_graph).not.toBeNull()
    expect(jc.knowledge_graph!.findings.length).toBe(1)
  })
  it('leaves knowledge_graph null on a bare draft', () => {
    expect(buildJasperContext({ zones: [{ zid: 'A1' }] } as never).knowledge_graph).toBeNull()
  })
})
