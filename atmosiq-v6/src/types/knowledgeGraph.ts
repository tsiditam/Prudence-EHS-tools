/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Knowledge-graph types (KG foundation, staged PR 1).
 *
 * The graph is a DERIVED, DISPOSABLE PROJECTION of deterministic engine
 * outputs. It holds no original facts and can be rebuilt at any time from
 * (assessment data + engine results). See the spec, section 2.
 *
 * Anchor note: the spec is written around a server-side `projects` table,
 * but in this codebase projects are localStorage-only (src/utils/projectStore.js)
 * and the only server-side, RLS-owned entity that already persists the engine
 * outputs (causal_chains, recommendations, zone_scores) is `assessments`
 * (migration 014, keyed by user_id). The graph is therefore anchored on
 * `assessment_id` (TEXT, matching assessments.id) and isolated per tenant via
 * the assessment's owner. Everything else follows the spec.
 */

// Single categorical confidence scale shared by nodes and edges. There is no
// numeric confidence anywhere — an unsourced 0.5 is exactly the fabricated
// number the Jasper rewrite removed. Confidence is set only by deterministic
// logic (see knowledgeGraphBuilder).
export type KGConfidence = 'validated' | 'provisional' | 'qualitative'

export type KGNodeType =
  | 'assessment' | 'building' | 'zone' | 'measurement' | 'parameter'
  | 'observation' | 'complaint' | 'standard_reference' | 'finding'
  | 'causal_pathway' | 'recommendation' | 'missing_data'
  | 'review_flag' | 'report_section'

export type KGRelationshipType =
  | 'HAS_BUILDING' | 'HAS_ZONE' | 'HAS_MEASUREMENT' | 'MEASURES_PARAMETER'
  | 'OBSERVED_IN' | 'COMPLAINT_IN' | 'ASSOCIATED_WITH' | 'SUPPORTS_FINDING'
  | 'CONTRADICTS_FINDING' | 'LINKED_TO_STANDARD' | 'SUGGESTS_PATHWAY'
  | 'GENERATES_RECOMMENDATION' | 'REQUIRES_REVIEW' | 'HAS_MISSING_DATA'
  | 'INCLUDED_IN_REPORT'

// ── Read model (rows as persisted, returned to consumers) ──────────────────

export interface KGNode {
  id: string
  assessment_id: string
  node_type: KGNodeType
  label: string
  entity_key?: string
  source?: string
  confidence?: KGConfidence
  engine_version?: string
  ruleset_version?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface KGEdge {
  id: string
  assessment_id: string
  source_node_id: string
  relationship_type: KGRelationshipType
  target_node_id: string
  confidence?: KGConfidence
  source?: string
  engine_version?: string
  ruleset_version?: string
  metadata?: Record<string, unknown>
  created_at?: string
}

export interface KGGraph {
  nodes: KGNode[]
  edges: KGEdge[]
}

// ── Write model (what the builder emits and the rebuild RPC consumes) ──────
//
// The builder is database-agnostic: it never mints UUIDs. Nodes are emitted
// with a stable `entity_key`, and edges reference nodes BY entity_key. The
// transactional `kg_rebuild` SQL function (migration 023) generates the UUIDs
// and resolves edge endpoints by entity_key inside one transaction. This is
// also what makes the determinism test (spec section 19, test 5) expressible:
// two builds are compared on entity_key node sets and on
// (source_entity_key, relationship_type, target_entity_key) edge tuples,
// ignoring UUIDs and timestamps.

export interface KGNodeInsert {
  entity_key: string
  node_type: KGNodeType
  label: string
  source: string
  confidence: KGConfidence
  engine_version: string
  ruleset_version: string
  metadata: Record<string, unknown>
}

export interface KGEdgeInsert {
  source_entity_key: string
  relationship_type: KGRelationshipType
  target_entity_key: string
  confidence: KGConfidence
  source: string
  engine_version: string
  ruleset_version: string
  metadata: Record<string, unknown>
}

/** Builder output: an insert-shaped, deterministically ordered projection. */
export interface KGGraphInsert {
  assessment_id: string
  nodes: KGNodeInsert[]
  edges: KGEdgeInsert[]
}

// ── Normalized domain model (builder input contract) ───────────────────────
//
// The adapter (assessmentToGraphModel) maps the messy app/assessment shape
// into this explicit, key-linked model. The pure projector turns it into the
// insert-shaped graph above. Relationships are expressed by referencing the
// stable keys defined in section 11 of the spec (entity-key rules).

export interface KGStandardFraming {
  standard: string
  role?: string
  is_health_limit: boolean
  framing: string
}

export interface KGModelStandard {
  /** local key, e.g. 'ashrae_62_1' (becomes entity_key `standard:{key}`) */
  key: string
  label: string
  framing: KGStandardFraming
}

export interface KGModelMeasurement {
  key: string                 // e.g. 'co2:max'  -> measurement:{zoneId}:{key}
  label: string
  parameter: string           // e.g. 'co2' -> parameter:{parameter}
  parameterLabel?: string
  confidence?: KGConfidence
  qa?: Record<string, unknown>
  supportsFindings?: string[]
  contradictsFindings?: string[]
  suggestsPathways?: string[]
}

export interface KGModelObservation {
  key: string
  label: string
  supportsFindings?: string[]
  contradictsFindings?: string[]
  suggestsPathways?: string[]
}

export interface KGModelComplaint {
  key: string
  label: string
  associatedFindings?: string[]
  associatedPathways?: string[]
}

export interface KGModelFinding {
  key: string
  label: string
  findingType?: string
  severity?: string
  confidence?: KGConfidence
  ihReviewRequired?: boolean
  standards?: string[]         // standard keys
  recommendations?: string[]   // recommendation keys
  missingData?: string[]       // missing-data keys
}

export interface KGModelPathway {
  key: string
  label: string
  rootCause?: string
  evidence?: string[]
  confidence?: KGConfidence
  standard?: string            // standard key
  supportsFindings?: string[]
  generatesRecommendations?: string[]
}

export interface KGModelRecommendation {
  key: string
  label: string
  fromFindings?: string[]
  fromPathways?: string[]
}

export interface KGModelMissingData {
  key: string
  label: string
  findings?: string[]
}

export interface KGModelZone {
  id: string
  name?: string
  measurements?: KGModelMeasurement[]
  observations?: KGModelObservation[]
  complaints?: KGModelComplaint[]
  findings?: KGModelFinding[]
  pathways?: KGModelPathway[]
  recommendations?: KGModelRecommendation[]
  missingData?: KGModelMissingData[]
}

export interface KGModel {
  assessmentId: string
  engineVersion: string
  rulesetVersion: string
  building?: { id?: string; name?: string; address?: string } | null
  standards?: KGModelStandard[]
  zones: KGModelZone[]
}
