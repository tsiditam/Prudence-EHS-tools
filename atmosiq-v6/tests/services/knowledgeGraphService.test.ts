/**
 * Knowledge-graph service — data layer over an injected Supabase client.
 *
 * Verifies the only mutation path is the transactional kg_rebuild RPC (no
 * client-side insert/update), that reads are scoped by assessment_id, and that
 * the recursive evidence walk is delegated to the SQL function.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  getAssessmentGraph, getFindingEvidence, rebuildAssessmentGraph, deleteAssessmentGraph,
} from '../../src/services/knowledgeGraphService'

// Minimal chainable fake of the bits of supabase-js the service touches.
function makeClient(opts: { nodes?: any[]; edges?: any[]; evidence?: any[] } = {}) {
  const calls = { rpc: [] as any[], insert: 0, update: 0, select: [] as any[], delete: 0 }
  const client = {
    from(table: string) {
      return {
        select(_cols?: string) {
          return {
            eq(col: string, val: unknown) {
              calls.select.push({ table, col, val })
              const data = table === 'kg_nodes' ? (opts.nodes || []) : (opts.edges || [])
              return Promise.resolve({ data, error: null })
            },
          }
        },
        insert() { calls.insert++; return { error: { message: 'insert not allowed via client' } } },
        update() { calls.update++; return { error: { message: 'update not allowed via client' } } },
        delete() {
          return { eq(_c: string, _v: unknown) { calls.delete++; return Promise.resolve({ error: null }) } }
        },
      }
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.rpc.push({ fn, args })
      if (fn === 'kg_finding_evidence') return Promise.resolve({ data: opts.evidence || [], error: null })
      return Promise.resolve({ data: null, error: null })
    },
  }
  return { client, calls }
}

const buildArgs = {
  assessmentId: 'rpt-1', engineVersion: '2.6.0', rulesetVersion: '2.6.0',
  assessment: { building: { fn: 'Acme' }, zones: [{ id: 'z1', zn: 'A' }] },
  engineResults: {
    zoneScores: [{ zoneName: 'A', cats: [{ l: 'Ventilation', r: [{ t: 'CO2 high', std: 'ASHRAE 62.1-2025', sev: 'high' }] }] }],
    causalChains: [{ zone: 'A', type: 'Ventilation Deficiency', evidence: [], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
    recommendations: ['Verify OA'],
  },
}

describe('rebuildAssessmentGraph', () => {
  it('writes only through the kg_rebuild RPC with the built node/edge payload', async () => {
    const { client, calls } = makeClient()
    const graph = await rebuildAssessmentGraph(client as any, buildArgs)
    expect(calls.rpc).toHaveLength(1)
    expect(calls.rpc[0].fn).toBe('kg_rebuild')
    expect(calls.rpc[0].args.p_assessment_id).toBe('rpt-1')
    expect(calls.rpc[0].args.p_nodes).toEqual(graph.nodes)
    expect(calls.rpc[0].args.p_edges).toEqual(graph.edges)
    // The service never inserts/updates rows directly — the RPC is the only writer.
    expect(calls.insert).toBe(0)
    expect(calls.update).toBe(0)
    expect(graph.nodes.some((n) => n.node_type === 'finding')).toBe(true)
  })

  it('is idempotent: repeated rebuilds produce an identical payload', async () => {
    const a = makeClient(); const b = makeClient()
    const g1 = await rebuildAssessmentGraph(a.client as any, buildArgs)
    const g2 = await rebuildAssessmentGraph(b.client as any, buildArgs)
    expect(JSON.stringify(g1)).toEqual(JSON.stringify(g2))
  })

  it('throws when the RPC reports an error', async () => {
    const client = { from() { return {} as any }, rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) }
    await expect(rebuildAssessmentGraph(client as any, buildArgs)).rejects.toBeTruthy()
  })
})

describe('getAssessmentGraph', () => {
  it('reads nodes and edges scoped by assessment_id', async () => {
    const { client, calls } = makeClient({ nodes: [{ id: 'n1' }], edges: [{ id: 'e1' }] })
    const g = await getAssessmentGraph(client as any, 'rpt-1')
    expect(g.nodes).toHaveLength(1)
    expect(g.edges).toHaveLength(1)
    expect(calls.select.every((s) => s.col === 'assessment_id' && s.val === 'rpt-1')).toBe(true)
  })
})

describe('getFindingEvidence', () => {
  it('delegates to the recursive kg_finding_evidence SQL function', async () => {
    const { client, calls } = makeClient({ evidence: [{ id: 'f1' }, { id: 'm1' }] })
    const ev = await getFindingEvidence(client as any, 'f1', 2)
    expect(ev).toHaveLength(2)
    expect(calls.rpc[0]).toEqual({ fn: 'kg_finding_evidence', args: { p_node_id: 'f1', p_max_depth: 2 } })
  })
})

describe('deleteAssessmentGraph', () => {
  it('deletes edges then nodes for the assessment', async () => {
    const { client, calls } = makeClient()
    await deleteAssessmentGraph(client as any, 'rpt-1')
    expect(calls.delete).toBe(2)
  })
})
