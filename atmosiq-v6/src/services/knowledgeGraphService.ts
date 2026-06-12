/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Knowledge-graph service (KG foundation, staged PR 1).
 *
 * Thin data layer over Supabase for the derived graph. Reads run under the
 * caller's client (RLS-constrained, owner-only). The single mutation path is
 * `rebuildAssessmentGraph`, which calls the transactional, advisory-locked
 * `kg_rebuild` RPC and is intended to run server-side under the service role
 * (the only writer — spec invariants 2.1/2.2). The client is dependency-
 * injected so this is testable without a live database and works in both the
 * SPA (reads) and a server endpoint (rebuild).
 */

import type { KGGraph, KGGraphInsert, KGNode } from '../types/knowledgeGraph'
import { buildKnowledgeGraphFromAssessment } from './knowledgeGraphBuilder'

// Minimal structural shape of the supabase-js client we rely on. Keeping it
// local avoids a hard import and lets tests inject a fake.
export interface KGQuery {
  select: (cols?: string) => KGQuery
  eq: (col: string, val: unknown) => KGQuery
  delete: () => KGQuery
  then?: unknown
}
export interface KGClient {
  from: (table: string) => any
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>
}

const asGraph = (nodes: any[], edges: any[]): KGGraph => ({
  nodes: (nodes || []) as KGNode[],
  edges: (edges || []) as KGGraph['edges'],
})

/** Read the full graph for one assessment (RLS-scoped to the owner). */
export async function getAssessmentGraph(client: KGClient, assessmentId: string): Promise<KGGraph> {
  const [nodesRes, edgesRes] = await Promise.all([
    client.from('kg_nodes').select('*').eq('assessment_id', assessmentId),
    client.from('kg_edges').select('*').eq('assessment_id', assessmentId),
  ])
  if (nodesRes.error) throw nodesRes.error
  if (edgesRes.error) throw edgesRes.error
  return asGraph(nodesRes.data, edgesRes.data)
}

/**
 * Subgraph for a single zone: every node tagged with the zone plus the zone
 * node itself, and the edges that connect them. Filtering happens in memory
 * off the assessment graph (project-scoped graphs are small).
 */
export async function getZoneGraph(client: KGClient, assessmentId: string, zoneId: string): Promise<KGGraph> {
  const g = await getAssessmentGraph(client, assessmentId)
  const zoneEK = `zone:${zoneId}`
  const inZone = (n: KGNode) =>
    n.entity_key === zoneEK || (n.metadata && (n.metadata as any).zone_id === zoneId)
  const nodes = g.nodes.filter(inZone)
  const ids = new Set(nodes.map((n) => n.id))
  const edges = g.edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id))
  return { nodes, edges }
}

/**
 * Evidence upstream of a finding, walked via the recursive `kg_finding_evidence`
 * SQL function (avoids N+1). Returns the finding plus its supporting/conflicting
 * evidence nodes; pair with getAssessmentGraph edges for the relationships.
 */
export async function getFindingEvidence(
  client: KGClient, findingNodeId: string, maxDepth = 3,
): Promise<KGNode[]> {
  const { data, error } = await client.rpc('kg_finding_evidence', {
    p_node_id: findingNodeId, p_max_depth: maxDepth,
  })
  if (error) throw error
  return (data || []) as KGNode[]
}

/**
 * Rebuild the graph for one assessment from its data + engine results, inside
 * one transaction with a per-assessment advisory lock (via `kg_rebuild`). Run
 * this with a SERVICE-ROLE client; it is the only mutation path.
 */
export async function rebuildAssessmentGraph(serviceClient: KGClient, args: {
  assessmentId: string
  assessment: unknown
  engineResults: unknown
  engineVersion: string
  rulesetVersion: string
}): Promise<KGGraphInsert> {
  const graph = buildKnowledgeGraphFromAssessment({
    assessmentId: args.assessmentId,
    assessment: args.assessment as any,
    engineResults: args.engineResults as any,
    engineVersion: args.engineVersion,
    rulesetVersion: args.rulesetVersion,
  })
  const { error } = await serviceClient.rpc('kg_rebuild', {
    p_assessment_id: graph.assessment_id,
    p_nodes: graph.nodes,
    p_edges: graph.edges,
  })
  if (error) throw error
  return graph
}

/** Delete an assessment's graph (service-role). The builder can rebuild it. */
export async function deleteAssessmentGraph(serviceClient: KGClient, assessmentId: string): Promise<void> {
  const e1 = await serviceClient.from('kg_edges').delete().eq('assessment_id', assessmentId)
  if (e1?.error) throw e1.error
  const e2 = await serviceClient.from('kg_nodes').delete().eq('assessment_id', assessmentId)
  if (e2?.error) throw e2.error
}
