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
import { FIELD_ASSISTANT_ROLE_PROMPT as PROMPT } from '../../src/constants/field-assistant-prompt'

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

describe('the projection does not ride in the Jasper context', () => {
  // These two pinned the opposite: that buildJasperContext attaches
  // `knowledge_graph`. It did — unconditionally, while the KG SURFACE is
  // gated off on the production host, so the projection shipped in every
  // uncached context block for a feature no user could open. ~60% of the
  // per-turn payload. Re-pinned rather than deleted, because the attachment
  // returning is the regression to catch.
  it('carries no knowledge_graph key', () => {
    const jc = buildJasperContext(engineState as never) as unknown as Record<string, unknown>
    expect('knowledge_graph' in jc).toBe(false)
  })

  it('still carries the engine outputs the graph was derived FROM', () => {
    // The findings did not go anywhere — the third copy of them did.
    const jc = buildJasperContext(engineState as never) as unknown as Record<string, unknown>
    expect(jc.engine_outputs).toBeTruthy()
    expect(jc.walkthrough_findings).toBeTruthy()
  })

  it('the grounding rules survived the detachment, in the cached prompt', () => {
    // The projection carried five of them inline. Losing them silently was
    // the real risk in removing it: three restate over-claims the platform
    // works hardest to prevent. They are now in the cached system prefix,
    // which also means they are sent once per session instead of every turn.
    expect(PROMPT).toMatch(/Confidence is CATEGORICAL/)
    expect(PROMPT).toMatch(/never a contaminant limit, an exposure limit, or a health threshold/)
    expect(PROMPT).toMatch(/A conflicting signal is SURFACED, never suppressed/)
    expect(PROMPT).toMatch(/never invent a relationship the engine did not derive/)
  })
})

describe('the projection itself is intact for the surfaces that use it', () => {
  // Detached from Jasper, NOT deleted: the Evidence tab and the dev
  // traceability card still build it, and step 2 (populating
  // contradictsFindings) depends on all of this still working.
  it('still builds from engine state', () => {
    const ctx = buildGraphContext(engineState)
    expect(ctx).not.toBeNull()
    expect(ctx!.findings.length).toBe(1)
  })
})
