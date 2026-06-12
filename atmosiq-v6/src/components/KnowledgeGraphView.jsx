/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * KnowledgeGraphView — node-link visualization of the derived knowledge graph
 * (KG §14, Network view). Renders the actual nodes and edges the deterministic
 * builder produces for one assessment as a layered SVG graph: structural spine
 * (assessment → building → zone) on top, then evidence, findings, and the
 * inferential layer (pathways / standards / recommendations).
 *
 * Pure presentation over the derived projection — no engine access, no graph
 * library (inline SVG only). Tap a node to focus its immediate relationships.
 */
import { useMemo, useState } from 'react'
import { buildKnowledgeGraphFromAssessment } from '../services/knowledgeGraphBuilder'
import { ENGINE_VERSION } from '../version.js'

// Vertical tiers (top → bottom). Lower number renders higher.
const TIER = {
  assessment: 0, building: 0,
  zone: 1,
  parameter: 2, measurement: 2, observation: 2, complaint: 2,
  finding: 3,
  causal_pathway: 4, standard_reference: 4, recommendation: 4, missing_data: 4, review_flag: 4,
}

// Node colour by type. CSS vars flip with theme; the two literals are brand
// accents with no themable equivalent (flagged for the reviewer).
const NODE_TONE = {
  assessment: 'var(--text)', building: 'var(--sub)', zone: 'var(--accent)',
  measurement: 'var(--accent)', parameter: 'var(--dim)',
  observation: '#34D399', complaint: 'var(--warn)',
  finding: 'var(--accent-fill, var(--accent))',
  causal_pathway: '#A78BFA', standard_reference: 'var(--success)',
  recommendation: 'var(--success)', missing_data: 'var(--dim)', review_flag: 'var(--warn)',
}
const TYPE_LABEL = {
  assessment: 'Assessment', building: 'Building', zone: 'Zone', parameter: 'Parameter',
  measurement: 'Measurement', observation: 'Observation', complaint: 'Occupant report',
  finding: 'Finding', causal_pathway: 'Pathway', standard_reference: 'Standard',
  recommendation: 'Recommendation', missing_data: 'Missing data', review_flag: 'IH review',
}

const edgeTone = (rel) =>
  rel === 'CONTRADICTS_FINDING' ? 'var(--danger)'
    : rel === 'SUPPORTS_FINDING' || rel === 'ASSOCIATED_WITH' || rel === 'SUGGESTS_PATHWAY' ? 'var(--accent)'
      : rel === 'LINKED_TO_STANDARD' || rel === 'GENERATES_RECOMMENDATION' ? 'var(--success)'
        : 'var(--border)'

const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '')

const SLOT_W = 150
const GAP = 18
const ROW_GAP = 116
const TOP = 46
const CHIP_H = 38

export default function KnowledgeGraphView({ zones, zoneScores, causalChains, recs, assessmentId }) {
  const [focus, setFocus] = useState(null)

  const { nodes, edges, width, height, posByKey } = useMemo(() => {
    try {
    const graph = buildKnowledgeGraphFromAssessment({
      assessmentId: assessmentId || 'preview',
      assessment: { zones: Array.isArray(zones) ? zones : [] },
      engineResults: {
        zoneScores: Array.isArray(zoneScores) ? zoneScores : [],
        causalChains: Array.isArray(causalChains) ? causalChains : [],
        recommendations: recs,
      },
      engineVersion: ENGINE_VERSION, rulesetVersion: ENGINE_VERSION,
    })
    // Bucket nodes by tier (already sorted by entity_key → stable layout).
    const tiers = {}
    for (const n of graph.nodes) {
      const t = TIER[n.node_type] ?? 2
      ;(tiers[t] ||= []).push(n)
    }
    const maxCount = Math.max(1, ...Object.values(tiers).map((a) => a.length))
    const w = Math.max(320, maxCount * (SLOT_W + GAP) + GAP)
    const maxTier = Math.max(...Object.keys(TIER).map((k) => TIER[k]))
    const h = TOP + maxTier * ROW_GAP + CHIP_H + TOP
    const pos = new Map()
    for (const [t, list] of Object.entries(tiers)) {
      const y = TOP + Number(t) * ROW_GAP
      const rowW = list.length * (SLOT_W + GAP) + GAP
      const startX = (w - rowW) / 2 + GAP
      list.forEach((n, i) => {
        pos.set(n.entity_key, { x: startX + i * (SLOT_W + GAP) + SLOT_W / 2, y, node: n })
      })
    }
    return { nodes: graph.nodes, edges: graph.edges, width: w, height: h, posByKey: pos }
    } catch {
      // Graph is a non-essential projection — never let a bad input shape
      // crash the surrounding report view.
      return { nodes: [], edges: [], width: 320, height: 120, posByKey: new Map() }
    }
  }, [zones, zoneScores, causalChains, recs, assessmentId])

  // The builder always emits structural assessment/zone nodes; only show the
  // graph once there are scored findings to connect (matches the other KG
  // surfaces, which key off findings).
  if (!nodes.some((n) => n.node_type === 'finding')) {
    return (
      <div style={{ padding: 28, textAlign: 'center', background: 'var(--card)', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--dim)', fontSize: 12 }}>
        No graph yet — it appears once the assessment has scored findings.
      </div>
    )
  }

  // Neighbour set for focus highlighting.
  const neighbours = new Set()
  if (focus) {
    neighbours.add(focus)
    for (const e of edges) {
      if (e.source_entity_key === focus) neighbours.add(e.target_entity_key)
      if (e.target_entity_key === focus) neighbours.add(e.source_entity_key)
    }
  }
  const nodeDim = (k) => (focus && !neighbours.has(k) ? 0.2 : 1)
  const edgeOn = (e) => !focus || e.source_entity_key === focus || e.target_entity_key === focus

  const usedTypes = [...new Set(nodes.map((n) => n.node_type))]

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ overflow: 'auto', maxHeight: '70vh', WebkitOverflowScrolling: 'touch' }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Knowledge graph" style={{ display: 'block' }}>
          {/* edges */}
          {edges.map((e, i) => {
            const s = posByKey.get(e.source_entity_key)
            const t = posByKey.get(e.target_entity_key)
            if (!s || !t) return null
            const sy = s.y + (t.y >= s.y ? CHIP_H / 2 : -CHIP_H / 2)
            const ty = t.y + (t.y >= s.y ? -CHIP_H / 2 : CHIP_H / 2)
            const my = (sy + ty) / 2
            return (
              <path key={i} d={`M ${s.x} ${sy} C ${s.x} ${my}, ${t.x} ${my}, ${t.x} ${ty}`}
                fill="none" stroke={edgeTone(e.relationship_type)}
                strokeWidth={e.relationship_type === 'CONTRADICTS_FINDING' ? 1.8 : 1.2}
                strokeDasharray={e.relationship_type === 'CONTRADICTS_FINDING' ? '4 3' : undefined}
                opacity={edgeOn(e) ? 0.55 : 0.08} />
            )
          })}
          {/* nodes */}
          {nodes.map((n) => {
            const pt = posByKey.get(n.entity_key)
            if (!pt) return null
            const tone = NODE_TONE[n.node_type] || 'var(--sub)'
            const w = Math.min(SLOT_W, Math.max(96, (n.label || '').length * 6.0 + 22))
            return (
              <g key={n.entity_key} transform={`translate(${pt.x - w / 2}, ${pt.y - CHIP_H / 2})`}
                opacity={nodeDim(n.entity_key)} style={{ cursor: 'pointer' }}
                onClick={() => setFocus((f) => (f === n.entity_key ? null : n.entity_key))}>
                <title>{`${TYPE_LABEL[n.node_type] || n.node_type}: ${n.label}`}</title>
                <rect width={w} height={CHIP_H} rx={9} fill={`color-mix(in srgb, ${tone} 16%, transparent)`} stroke={tone} strokeWidth={1.2} />
                <text x={w / 2} y={14} textAnchor="middle" fontSize={8} fontWeight={700} fill={tone} style={{ textTransform: 'uppercase', letterSpacing: '0.4px' }}>{TYPE_LABEL[n.node_type] || n.node_type}</text>
                <text x={w / 2} y={28} textAnchor="middle" fontSize={10} fill="var(--text)">{truncate(n.label, 20)}</text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
        {usedTypes.map((t) => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--sub)' }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: NODE_TONE[t] || 'var(--sub)' }} />
            {TYPE_LABEL[t] || t}
          </span>
        ))}
        <span style={{ fontSize: 10, color: 'var(--dim)', marginLeft: 'auto' }}>Tap a node to focus its links · dashed red = conflicting</span>
      </div>
    </div>
  )
}
