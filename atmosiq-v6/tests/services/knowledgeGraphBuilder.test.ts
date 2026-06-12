/**
 * Knowledge-graph builder — pure projector + adapter.
 *
 * Covers the spec's section-19 tests that are expressible without a database:
 *   1 CO2 ventilation concern   2 Moisture/mold pathway   3 Missing data
 *   4 Duplicate prevention      5 Determinism             6 Contradiction
 *   7 Standard framing
 * Tenant isolation (test 8) is enforced by RLS in migration 023 and is not a
 * unit concern.
 */
import { describe, it, expect } from 'vitest'
import {
  projectGraph, assessmentToGraphModel, buildKnowledgeGraphFromAssessment,
  standardFor, pathwayConfidence, slug,
} from '../../src/services/knowledgeGraphBuilder'
import type { KGModel } from '../../src/types/knowledgeGraph'

const V = { engineVersion: '2.6.0', rulesetVersion: '2.6.0' }

const hasNode = (g: { nodes: any[] }, key: string) => g.nodes.find((n) => n.entity_key === key)
const hasEdge = (g: { edges: any[] }, s: string, rel: string, t: string) =>
  g.edges.some((e) => e.source_entity_key === s && e.relationship_type === rel && e.target_entity_key === t)

// ── Test 1 — CO2 ventilation concern ────────────────────────────────────────
describe('test 1: CO2 ventilation concern', () => {
  const model: KGModel = {
    assessmentId: 'rpt-1', ...V,
    building: { id: 'b1', name: 'Acme HQ', address: '1 Main St' },
    standards: [standardFor('ASHRAE 62.1-2022')],
    zones: [{
      id: 'confA', name: 'Conference Room A',
      findings: [{
        key: 'ventilation_concern', label: 'Potential ventilation concern',
        findingType: 'ventilation', severity: 'moderate', ihReviewRequired: true,
        standards: ['ashrae_62_1'],
      }],
      measurements: [{
        key: 'co2:max', label: 'CO2 max 1,800 ppm', parameter: 'co2',
        supportsFindings: ['ventilation_concern'], qa: { duration_minutes: 480 },
      }],
      observations: [{
        key: 'oa_damper_closed', label: 'OA damper mostly closed',
        supportsFindings: ['ventilation_concern'], suggestsPathways: ['reduced_outdoor_air'],
      }],
      complaints: [{ key: 'headache_afternoon', label: 'Afternoon headaches', associatedFindings: ['ventilation_concern'] }],
      pathways: [{ key: 'reduced_outdoor_air', label: 'Reduced outdoor air ventilation', supportsFindings: ['ventilation_concern'] }],
      recommendations: [{ key: 'verify_oa', label: 'Verify outdoor air delivery and HVAC operation', fromFindings: ['ventilation_concern'] }],
    }],
  }
  const g = projectGraph(model)

  it('creates the finding, measurement, observation, complaint and pathway', () => {
    expect(hasNode(g, 'finding:confA:ventilation_concern')).toBeTruthy()
    expect(hasNode(g, 'measurement:confA:co2:max')).toBeTruthy()
    expect(hasNode(g, 'observation:confA:oa_damper_closed')).toBeTruthy()
    expect(hasNode(g, 'complaint:confA:headache_afternoon')).toBeTruthy()
    expect(hasNode(g, 'pathway:confA:reduced_outdoor_air')).toBeTruthy()
  })
  it('wires evidence to the finding and links the standard', () => {
    expect(hasEdge(g, 'measurement:confA:co2:max', 'SUPPORTS_FINDING', 'finding:confA:ventilation_concern')).toBe(true)
    expect(hasEdge(g, 'observation:confA:oa_damper_closed', 'SUPPORTS_FINDING', 'finding:confA:ventilation_concern')).toBe(true)
    expect(hasEdge(g, 'complaint:confA:headache_afternoon', 'ASSOCIATED_WITH', 'finding:confA:ventilation_concern')).toBe(true)
    expect(hasEdge(g, 'finding:confA:ventilation_concern', 'LINKED_TO_STANDARD', 'standard:ashrae_62_1')).toBe(true)
  })
  it('the linked standard is not a health limit', () => {
    const std = hasNode(g, 'standard:ashrae_62_1')
    expect((std!.metadata as any).is_health_limit).toBe(false)
  })
  it('generates the recommendation and an IH review flag', () => {
    expect(hasEdge(g, 'finding:confA:ventilation_concern', 'GENERATES_RECOMMENDATION', 'recommendation:confA:verify_oa')).toBe(true)
    expect(hasEdge(g, 'finding:confA:ventilation_concern', 'REQUIRES_REVIEW', 'review:confA:ventilation_concern')).toBe(true)
  })
  it('qualitative confidence on observation/complaint support edges', () => {
    const oe = g.edges.find((e) => e.source_entity_key === 'observation:confA:oa_damper_closed' && e.relationship_type === 'SUPPORTS_FINDING')
    expect(oe!.confidence).toBe('qualitative')
  })
})

// ── Test 2 — Moisture / mold pathway ────────────────────────────────────────
describe('test 2: moisture and mold pathway', () => {
  const model: KGModel = {
    assessmentId: 'rpt-2', ...V,
    zones: [{
      id: 'z1', name: 'Storage',
      findings: [{ key: 'moisture_concern', label: 'Moisture concern', findingType: 'moisture', severity: 'moderate', ihReviewRequired: true }],
      observations: [
        { key: 'water_staining', label: 'Water staining', supportsFindings: ['moisture_concern'], suggestsPathways: ['moisture_accumulation'] },
        { key: 'musty_odor', label: 'Musty odor', supportsFindings: ['moisture_concern'] },
      ],
      measurements: [{ key: 'rh:max', label: 'RH 72%', parameter: 'rh', supportsFindings: ['moisture_concern'] }],
      pathways: [{ key: 'moisture_accumulation', label: 'Moisture accumulation', supportsFindings: ['moisture_concern'], confidence: 'provisional' }],
      recommendations: [{ key: 'moisture_invest', label: 'Investigate moisture source', fromFindings: ['moisture_concern'], fromPathways: ['moisture_accumulation'] }],
    }],
  }
  const g = projectGraph(model)
  it('links the pathway to the finding and the recommendation to both', () => {
    expect(hasEdge(g, 'pathway:z1:moisture_accumulation', 'SUPPORTS_FINDING', 'finding:z1:moisture_concern')).toBe(true)
    expect(hasEdge(g, 'finding:z1:moisture_concern', 'GENERATES_RECOMMENDATION', 'recommendation:z1:moisture_invest')).toBe(true)
    expect(hasEdge(g, 'pathway:z1:moisture_accumulation', 'GENERATES_RECOMMENDATION', 'recommendation:z1:moisture_invest')).toBe(true)
    expect(hasEdge(g, 'finding:z1:moisture_concern', 'REQUIRES_REVIEW', 'review:z1:moisture_concern')).toBe(true)
  })
})

// ── Test 3 — Missing data ───────────────────────────────────────────────────
describe('test 3: missing data holds confidence at provisional', () => {
  const model: KGModel = {
    assessmentId: 'rpt-3', ...V,
    zones: [{
      id: 'z1', name: 'Office',
      findings: [{ key: 'ventilation_concern', label: 'Ventilation concern', severity: 'low', confidence: 'provisional', ihReviewRequired: true, missingData: ['outdoor_co2_baseline', 'calibration_date'] }],
      measurements: [{ key: 'co2:max', label: 'CO2 present', parameter: 'co2', supportsFindings: ['ventilation_concern'] }],
      missingData: [
        { key: 'outdoor_co2_baseline', label: 'Outdoor CO2 baseline not documented', findings: ['ventilation_concern'] },
        { key: 'calibration_date', label: 'Calibration date missing', findings: ['ventilation_concern'] },
      ],
    }],
  }
  const g = projectGraph(model)
  it('creates missing-data nodes linked from finding and zone', () => {
    expect(hasNode(g, 'missing:z1:outdoor_co2_baseline')).toBeTruthy()
    expect(hasEdge(g, 'zone:z1', 'HAS_MISSING_DATA', 'missing:z1:outdoor_co2_baseline')).toBe(true)
    expect(hasEdge(g, 'finding:z1:ventilation_concern', 'HAS_MISSING_DATA', 'missing:z1:calibration_date')).toBe(true)
  })
  it('finding confidence stays provisional', () => {
    expect(hasNode(g, 'finding:z1:ventilation_concern')!.confidence).toBe('provisional')
  })
})

// ── Test 4 — Duplicate prevention ───────────────────────────────────────────
describe('test 4: duplicate prevention', () => {
  const model: KGModel = {
    assessmentId: 'rpt-4', ...V,
    zones: [
      { id: 'z1', name: 'A', findings: [{ key: 'f1', label: 'F1', ihReviewRequired: true }], measurements: [{ key: 'co2:max', label: 'CO2', parameter: 'co2', supportsFindings: ['f1'] }] },
      // duplicate zone id + duplicate measurement/finding keys
      { id: 'z1', name: 'A', findings: [{ key: 'f1', label: 'F1 again', ihReviewRequired: true }], measurements: [{ key: 'co2:max', label: 'CO2 again', parameter: 'co2', supportsFindings: ['f1'] }] },
    ],
  }
  it('dedupes nodes and edges by key on a single build', () => {
    const g = projectGraph(model)
    const keys = g.nodes.map((n) => n.entity_key)
    expect(new Set(keys).size).toBe(keys.length)
    const tuples = g.edges.map((e) => `${e.source_entity_key}|${e.relationship_type}|${e.target_entity_key}`)
    expect(new Set(tuples).size).toBe(tuples.length)
  })
})

// ── Test 5 — Determinism ────────────────────────────────────────────────────
describe('test 5: determinism', () => {
  const mk = (order: 'a' | 'b'): KGModel => ({
    assessmentId: 'rpt-5', ...V,
    zones: [{
      id: 'z1', name: 'Z',
      findings: order === 'a'
        ? [{ key: 'fa', label: 'A', ihReviewRequired: true }, { key: 'fb', label: 'B', ihReviewRequired: true }]
        : [{ key: 'fb', label: 'B', ihReviewRequired: true }, { key: 'fa', label: 'A', ihReviewRequired: true }],
      measurements: [{ key: 'co2:max', label: 'CO2', parameter: 'co2', supportsFindings: ['fa', 'fb'] }],
    }],
  })
  it('node sets and edge tuples are identical regardless of input order', () => {
    const g1 = projectGraph(mk('a'))
    const g2 = projectGraph(mk('b'))
    const nodeSet = (g: any) => g.nodes.map((n: any) => n.entity_key)
    const edgeSet = (g: any) => g.edges.map((e: any) => `${e.source_entity_key}|${e.relationship_type}|${e.target_entity_key}`)
    expect(nodeSet(g1)).toEqual(nodeSet(g2))
    expect(edgeSet(g1)).toEqual(edgeSet(g2))
  })
  it('two builds of the same inputs are byte-identical (ignoring UUIDs/timestamps)', () => {
    expect(JSON.stringify(projectGraph(mk('a')))).toEqual(JSON.stringify(projectGraph(mk('a'))))
  })
})

// ── Test 6 — Contradiction handling ─────────────────────────────────────────
describe('test 6: contradiction handling is deterministic-only', () => {
  const base = (withConflict: boolean): KGModel => ({
    assessmentId: 'rpt-6', ...V,
    zones: [{
      id: 'z1', name: 'Z',
      findings: [{ key: 'ventilation_concern', label: 'Ventilation concern', ihReviewRequired: true }],
      measurements: [{
        key: 'co2:max', label: 'CO2 1,500 with low occupancy', parameter: 'co2',
        supportsFindings: ['ventilation_concern'],
        ...(withConflict ? { contradictsFindings: ['ventilation_concern'] } : {}),
      }],
    }],
  })
  it('emits CONTRADICTS_FINDING only when the engine flags a conflict', () => {
    const withC = projectGraph(base(true))
    const noC = projectGraph(base(false))
    expect(hasEdge(withC, 'measurement:z1:co2:max', 'CONTRADICTS_FINDING', 'finding:z1:ventilation_concern')).toBe(true)
    expect(noC.edges.some((e) => e.relationship_type === 'CONTRADICTS_FINDING')).toBe(false)
  })
})

// ── Test 7 — Standard framing ───────────────────────────────────────────────
describe('test 7: standard framing', () => {
  it('ASHRAE 62.1 is framed as a ventilation indicator, never a limit', () => {
    const s = standardFor('ASHRAE 62.1-2025')
    expect(s.key).toBe('ashrae_62_1')
    expect(s.framing.is_health_limit).toBe(false)
    expect(s.framing.framing.toLowerCase()).toContain('not a contaminant or health limit')
  })
  it('unknown standards default to a non-limit screening reference', () => {
    const s = standardFor('Some Local Guideline 2020')
    expect(s.framing.is_health_limit).toBe(false)
  })
})

// ── Adapter — app/assessment shape -> model ─────────────────────────────────
describe('adapter: assessmentToGraphModel', () => {
  const assessment = {
    building: { fn: 'Acme HQ', address: '1 Main St' },
    zones: [{ id: 'z1', zn: 'Conference Room A' }],
  }
  const engineResults = {
    zoneScores: [{
      zoneName: 'Conference Room A',
      cats: [{ l: 'Ventilation', r: [
        { t: 'CO2 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
        { t: 'CO2 is a ventilation indicator', std: 'ASHRAE 62.1-2025', sev: 'info' }, // info -> not a finding
      ] }],
    }],
    causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', rootCause: 'Inadequate ventilation', evidence: ['CO2 at 1800 ppm'], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
    recommendations: ['Verify outdoor air delivery and HVAC operation'],
  }
  const g = buildKnowledgeGraphFromAssessment({ assessmentId: 'rpt-a', assessment, engineResults, ...V })

  it('maps non-pass/non-info category rows into findings only', () => {
    const findings = g.nodes.filter((n) => n.node_type === 'finding')
    expect(findings.length).toBe(1)
  })
  it('maps causal chains into pathways and frames ASHRAE 62.1 as non-limit', () => {
    expect(g.nodes.some((n) => n.node_type === 'causal_pathway')).toBe(true)
    const std = g.nodes.find((n) => n.entity_key === 'standard:ashrae_62_1')
    expect(std).toBeTruthy()
    expect((std!.metadata as any).is_health_limit).toBe(false)
  })
  it('stamps engine and ruleset version on every node and edge', () => {
    expect(g.nodes.every((n) => n.engine_version === '2.6.0' && n.ruleset_version === '2.6.0')).toBe(true)
    expect(g.edges.every((e) => e.engine_version === '2.6.0')).toBe(true)
  })
  it('the adapter is deterministic', () => {
    const g2 = buildKnowledgeGraphFromAssessment({ assessmentId: 'rpt-a', assessment, engineResults, ...V })
    expect(JSON.stringify(g)).toEqual(JSON.stringify(g2))
  })
})

// ── Adapter — evidence derivation from zone fields ──────────────────────────
describe('adapter: evidence derivation from zone fields', () => {
  const assessment = { building: { fn: 'Acme' }, zones: [{ id: 'z1', zn: 'Conf A', co2: '1800', od: 'Closed / minimum', sy: ['Headache', 'Eye irritation'] }] }
  const engineResults = {
    zoneScores: [{ zoneName: 'Conf A', cats: [{ l: 'Ventilation', r: [{ t: 'CO2 1800 ppm — inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' }] }] }],
    causalChains: [], recommendations: [],
  }
  const g = buildKnowledgeGraphFromAssessment({ assessmentId: 'rpt-ev', assessment, engineResults, ...V })

  it('emits measurement, observation and complaint nodes from zone fields', () => {
    expect(g.nodes.some((n) => n.node_type === 'measurement')).toBe(true)
    expect(g.nodes.some((n) => n.node_type === 'observation')).toBe(true)
    expect(g.nodes.some((n) => n.node_type === 'complaint')).toBe(true)
  })
  it('links the category-matched evidence to the ventilation finding', () => {
    const finding = g.nodes.find((n) => n.node_type === 'finding')!
    const supports = g.edges.filter((e) =>
      e.target_entity_key === finding.entity_key &&
      (e.relationship_type === 'SUPPORTS_FINDING' || e.relationship_type === 'ASSOCIATED_WITH'))
    // co2 measurement + OA-damper observation + occupant symptoms
    expect(supports.length).toBeGreaterThanOrEqual(3)
  })
})

// ── helpers ─────────────────────────────────────────────────────────────────
describe('helpers', () => {
  it('slug normalizes', () => {
    expect(slug('ASHRAE 62.1-2025')).toBe('ashrae_62_1_2025')
    expect(slug('  Hello/World  ')).toBe('hello_world')
  })
  it('pathwayConfidence maps hypotheses to qualitative', () => {
    expect(pathwayConfidence('Strong')).toBe('provisional')
    expect(pathwayConfidence('Possible')).toBe('qualitative')
    expect(pathwayConfidence('Low (screening-only data)')).toBe('qualitative')
    expect(pathwayConfidence(undefined)).toBe('provisional')
  })
})
