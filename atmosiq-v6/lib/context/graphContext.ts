/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * buildGraphContext — scoped knowledge-graph projection for the Jasper
 * context block (KG stage 2, spec §16).
 *
 * Pure and deterministic. Builds the derived graph for the current
 * assessment (via the same deterministic builder the rebuild path uses),
 * then resolves it into a compact, relationship-nested summary the AI can
 * reason over: each finding with its supporting/conflicting evidence,
 * linked standards (carrying framing flags), pathways, recommendations, and
 * missing data. It originates no facts and writes nothing back.
 *
 * Engine-sacred boundary: read-only. Never throws — a partial draft yields
 * null so the Jasper context stays clean before the engine has run.
 */

import { buildKnowledgeGraphFromAssessment } from '../../src/services/knowledgeGraphBuilder'
import { ENGINE_VERSION } from '../../src/version.js'
import type {
  KGContext, KGContextEvidence, KGContextFinding, KGContextStandard,
  KGConfidence, KGGraphInsert, KGNodeInsert,
} from '../../src/types/knowledgeGraph'

// Grounding rules the model must honor when reading the graph. These restate
// the platform's non-negotiables in the AI's own context so it can never
// misuse the relationships (CO2 as a limit, numeric confidence, suppressed
// conflicts, AI findings without IH review).
const GRAPH_GUIDANCE: string[] = [
  'This knowledge graph is a derived projection of the deterministic engine. Treat its findings, standards, confidence, and relationships as authoritative; do not invent relationships not present here.',
  'Confidence is categorical (validated, provisional, qualitative). Never convert it to a number or overstate it.',
  'Standards with is_health_limit=false are screening references, not health or compliance limits. ASHRAE 62.1 / CO2 is a ventilation-adequacy indicator, never a contaminant or exposure limit.',
  'contradicted_by evidence means the engine flagged a conflicting signal. Surface it; never suppress it.',
  'Every finding requires industrial-hygienist review. End any interpretation with the "IH Review Required" label.',
]

/** Resolve an insert-shaped graph into the compact, finding-nested summary. */
export function summarizeGraph(graph: KGGraphInsert): KGContext {
  const byKey = new Map<string, KGNodeInsert>()
  for (const n of graph.nodes) byKey.set(n.entity_key, n)

  const findingNodes = graph.nodes.filter((n) => n.node_type === 'finding')

  const findings: KGContextFinding[] = findingNodes.map((f) => {
    const supported_by: KGContextEvidence[] = []
    const contradicted_by: KGContextEvidence[] = []
    const standards: KGContextStandard[] = []
    const pathways: Array<{ pathway: string; confidence: KGConfidence }> = []
    const recommendations: string[] = []
    const missing_data: string[] = []

    for (const e of graph.edges) {
      // Evidence and pathways point AT the finding.
      if (e.target_entity_key === f.entity_key) {
        const src = byKey.get(e.source_entity_key)
        if (!src) continue
        if (e.relationship_type === 'SUPPORTS_FINDING' || e.relationship_type === 'ASSOCIATED_WITH') {
          if (src.node_type === 'causal_pathway') {
            pathways.push({ pathway: src.label, confidence: src.confidence })
          } else {
            supported_by.push({ kind: src.node_type, label: src.label, confidence: e.confidence })
          }
        } else if (e.relationship_type === 'CONTRADICTS_FINDING') {
          contradicted_by.push({ kind: src.node_type, label: src.label, confidence: e.confidence })
        }
      }
      // Standards, recommendations, missing-data point AWAY from the finding.
      if (e.source_entity_key === f.entity_key) {
        const tgt = byKey.get(e.target_entity_key)
        if (!tgt) continue
        if (e.relationship_type === 'LINKED_TO_STANDARD') {
          const m = tgt.metadata as { is_health_limit?: boolean; framing?: string }
          standards.push({
            label: tgt.label,
            is_health_limit: m?.is_health_limit ?? false,
            framing: m?.framing ?? 'Screening reference, not a health limit.',
          })
        } else if (e.relationship_type === 'GENERATES_RECOMMENDATION') {
          recommendations.push(tgt.label)
        } else if (e.relationship_type === 'HAS_MISSING_DATA') {
          missing_data.push(tgt.label)
        }
      }
    }

    const md = f.metadata as { finding_type?: string; severity?: string; ih_review_required?: boolean }
    return {
      finding: f.label,
      type: md?.finding_type ?? null,
      severity: md?.severity ?? null,
      confidence: f.confidence,
      ih_review_required: md?.ih_review_required ?? true,
      supported_by: sortEvidence(supported_by),
      contradicted_by: sortEvidence(contradicted_by),
      standards: standards.sort((a, b) => cmp(a.label, b.label)),
      pathways: pathways.sort((a, b) => cmp(a.pathway, b.pathway)),
      recommendations: [...new Set(recommendations)].sort(cmp),
      missing_data: [...new Set(missing_data)].sort(cmp),
    }
  })

  return {
    engine_version: graph.nodes[0]?.engine_version ?? ENGINE_VERSION,
    ruleset_version: graph.nodes[0]?.ruleset_version ?? ENGINE_VERSION,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    findings: findings.sort((a, b) => cmp(a.finding, b.finding)),
    guidance: GRAPH_GUIDANCE,
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sortEvidence = (e: KGContextEvidence[]) =>
  e.sort((a, b) => cmp(a.kind + a.label, b.kind + b.label))

interface AnyRec { [k: string]: unknown }

/**
 * Build the scoped graph context for one assessment from raw app state.
 * Returns null when the engine has not produced zone scores yet (clean
 * pre-engine drafts), or if anything goes wrong (defensive — never throws).
 */
export function buildGraphContext(state: AnyRec): KGContext | null {
  try {
    const zoneScores = state.zoneScores
    if (!Array.isArray(zoneScores) || zoneScores.length === 0) return null
    const graph = buildKnowledgeGraphFromAssessment({
      assessmentId: typeof state.id === 'string' ? state.id : 'current-assessment',
      assessment: { building: state.bldg, zones: Array.isArray(state.zones) ? state.zones : [] },
      engineResults: {
        zoneScores,
        causalChains: Array.isArray(state.causalChains) ? state.causalChains : [],
        recommendations: Array.isArray(state.recs) ? state.recs : [],
      },
      engineVersion: ENGINE_VERSION,
      rulesetVersion: ENGINE_VERSION,
    })
    if (graph.nodes.filter((n) => n.node_type === 'finding').length === 0) return null
    return summarizeGraph(graph)
  } catch {
    return null
  }
}
