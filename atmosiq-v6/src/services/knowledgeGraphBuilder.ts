/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Knowledge-graph builder (KG foundation, staged PR 1).
 *
 * Pure, deterministic projection of deterministic engine outputs into graph
 * nodes and edges. No database, no UUIDs, no randomness, no clock. Two builds
 * of the same inputs produce byte-identical output (spec section 19, test 5).
 *
 * Three layers:
 *   1. projectGraph(model)          — pure projector: KGModel -> KGGraphInsert
 *   2. assessmentToGraphModel(...)  — adapter: app/assessment shape -> KGModel
 *   3. buildKnowledgeGraphFromAssessment(...) — public entry (adapter+projector)
 *
 * The graph never originates facts and never overrides a finding, threshold,
 * standard, recommendation, or review requirement. Confidence is categorical
 * and set only here, deterministically. There is no numeric confidence.
 */

import type {
  KGConfidence, KGEdgeInsert, KGGraphInsert, KGModel, KGModelStandard,
  KGNodeInsert, KGNodeType, KGRelationshipType, KGStandardFraming,
} from '../types/knowledgeGraph'

// ── Keying (spec section 11) ────────────────────────────────────────────────

const ek = {
  assessment: (id: string) => `assessment:${id}`,
  building: (id: string) => `building:${id}`,
  zone: (z: string) => `zone:${z}`,
  parameter: (p: string) => `parameter:${p}`,
  measurement: (z: string, k: string) => `measurement:${z}:${k}`,
  observation: (z: string, k: string) => `observation:${z}:${k}`,
  complaint: (z: string, k: string) => `complaint:${z}:${k}`,
  finding: (z: string, k: string) => `finding:${z}:${k}`,
  pathway: (z: string, k: string) => `pathway:${z}:${k}`,
  standard: (k: string) => `standard:${k}`,
  recommendation: (z: string, k: string) => `recommendation:${z}:${k}`,
  review: (z: string, k: string) => `review:${z}:${k}`,
  missing: (z: string, k: string) => `missing:${z}:${k}`,
}

/** lowercase, non-alphanumerics collapsed to a single underscore, trimmed. */
export function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x'
}

// Structural / recorded-fact nodes are 'validated' (they are observations of
// record or citations, not inferences). Only the inferential layer (finding,
// pathway, recommendation) carries non-validated confidence, set per the
// engine. 'validated' is never minted for the inferential layer here.
const FACT_NODE_CONFIDENCE: KGConfidence = 'validated'

// ── Pure projector ──────────────────────────────────────────────────────────

export function projectGraph(model: KGModel): KGGraphInsert {
  const ev = model.engineVersion
  const rv = model.rulesetVersion
  const nodes = new Map<string, KGNodeInsert>()
  const edges = new Map<string, KGEdgeInsert>()

  const addNode = (
    entity_key: string, node_type: KGNodeType, label: string,
    confidence: KGConfidence, metadata: Record<string, unknown> = {},
  ) => {
    if (nodes.has(entity_key)) return // first write wins; rebuilds stay idempotent
    nodes.set(entity_key, {
      entity_key, node_type, label, source: 'deterministic_engine',
      confidence, engine_version: ev, ruleset_version: rv, metadata,
    })
  }

  const addEdge = (
    source_entity_key: string, relationship_type: KGRelationshipType,
    target_entity_key: string, metadata: Record<string, unknown> = {},
  ) => {
    // Only wire edges whose endpoints exist, so a partial model never yields a
    // dangling edge (the rebuild RPC would drop it anyway via the inner join).
    if (!nodes.has(source_entity_key) || !nodes.has(target_entity_key)) return
    const key = `${source_entity_key}|${relationship_type}|${target_entity_key}`
    if (edges.has(key)) return
    const srcType = nodes.get(source_entity_key)!.node_type
    edges.set(key, {
      source_entity_key, relationship_type, target_entity_key,
      confidence: edgeConfidence(relationship_type, srcType),
      source: 'deterministic_engine', engine_version: ev, ruleset_version: rv, metadata,
    })
  }

  // Assessment anchor.
  const aKey = ek.assessment(model.assessmentId)
  addNode(aKey, 'assessment', 'Assessment', FACT_NODE_CONFIDENCE, { assessment_id: model.assessmentId })

  // Building (optional).
  let buildingKey: string | null = null
  if (model.building) {
    const bId = model.building.id || slug(model.building.name || 'building')
    buildingKey = ek.building(bId)
    addNode(buildingKey, 'building', model.building.name || 'Building', FACT_NODE_CONFIDENCE,
      { address: model.building.address ?? null })
    addEdge(aKey, 'HAS_BUILDING', buildingKey)
  }

  // Standards (global to the assessment). Framing metadata is mandatory so the
  // report generator and Jasper can never misuse a standard (spec 12.6).
  for (const std of model.standards || []) {
    addNode(ek.standard(std.key), 'standard_reference', std.label, FACT_NODE_CONFIDENCE,
      { ...std.framing })
  }

  for (const zone of model.zones) {
    const zKey = ek.zone(zone.id)
    addNode(zKey, 'zone', zone.name || zone.id, FACT_NODE_CONFIDENCE, { zone_id: zone.id })
    if (buildingKey) addEdge(buildingKey, 'HAS_ZONE', zKey)
    else addEdge(aKey, 'HAS_ZONE', zKey)

    // Findings first so other nodes can reference them.
    for (const f of zone.findings || []) {
      const fKey = ek.finding(zone.id, f.key)
      addNode(fKey, 'finding', f.label, f.confidence || 'provisional', {
        finding_type: f.findingType ?? null,
        severity: f.severity ?? null,
        confidence: f.confidence || 'provisional',
        ih_review_required: f.ihReviewRequired ?? true,
        source_engine: 'deterministic',
        zone_id: zone.id,
      })
      // Every finding connects to an IH review flag (spec 12.10 / guardrails).
      if (f.ihReviewRequired ?? true) {
        const rKey = ek.review(zone.id, f.key)
        addNode(rKey, 'review_flag', 'IH Review Required', FACT_NODE_CONFIDENCE, { zone_id: zone.id })
        addEdge(fKey, 'REQUIRES_REVIEW', rKey)
      }
      for (const sk of f.standards || []) addEdge(fKey, 'LINKED_TO_STANDARD', ek.standard(sk))
    }

    // Pathways.
    for (const p of zone.pathways || []) {
      const pKey = ek.pathway(zone.id, p.key)
      addNode(pKey, 'causal_pathway', p.label, p.confidence || 'provisional', {
        root_cause: p.rootCause ?? null,
        evidence: p.evidence ?? [],
        confidence: p.confidence || 'provisional',
        zone_id: zone.id,
        ...(p.standard ? { standard_key: p.standard } : {}),
      })
      for (const fk of p.supportsFindings || []) addEdge(pKey, 'SUPPORTS_FINDING', ek.finding(zone.id, fk))
      if (p.standard) addEdge(pKey, 'LINKED_TO_STANDARD', ek.standard(p.standard))
    }

    // Measurements + parameters.
    for (const m of zone.measurements || []) {
      const mKey = ek.measurement(zone.id, m.key)
      addNode(mKey, 'measurement', m.label, FACT_NODE_CONFIDENCE, {
        parameter: m.parameter, zone_id: zone.id, ...(m.qa ? { qa: m.qa } : {}),
      })
      addEdge(zKey, 'HAS_MEASUREMENT', mKey)
      const pKey = ek.parameter(m.parameter)
      addNode(pKey, 'parameter', m.parameterLabel || m.parameter, FACT_NODE_CONFIDENCE,
        { parameter: m.parameter })
      addEdge(mKey, 'MEASURES_PARAMETER', pKey)
      for (const fk of m.supportsFindings || []) addEdge(mKey, 'SUPPORTS_FINDING', ek.finding(zone.id, fk))
      for (const fk of m.contradictsFindings || []) addEdge(mKey, 'CONTRADICTS_FINDING', ek.finding(zone.id, fk))
      for (const pk of m.suggestsPathways || []) addEdge(mKey, 'SUGGESTS_PATHWAY', ek.pathway(zone.id, pk))
    }

    // Observations.
    for (const o of zone.observations || []) {
      const oKey = ek.observation(zone.id, o.key)
      addNode(oKey, 'observation', o.label, FACT_NODE_CONFIDENCE, { zone_id: zone.id })
      addEdge(oKey, 'OBSERVED_IN', zKey)
      for (const fk of o.supportsFindings || []) addEdge(oKey, 'SUPPORTS_FINDING', ek.finding(zone.id, fk))
      for (const fk of o.contradictsFindings || []) addEdge(oKey, 'CONTRADICTS_FINDING', ek.finding(zone.id, fk))
      for (const pk of o.suggestsPathways || []) addEdge(oKey, 'SUGGESTS_PATHWAY', ek.pathway(zone.id, pk))
    }

    // Complaints.
    for (const c of zone.complaints || []) {
      const cKey = ek.complaint(zone.id, c.key)
      addNode(cKey, 'complaint', c.label, FACT_NODE_CONFIDENCE, { zone_id: zone.id })
      addEdge(cKey, 'COMPLAINT_IN', zKey)
      for (const fk of c.associatedFindings || []) addEdge(cKey, 'ASSOCIATED_WITH', ek.finding(zone.id, fk))
      for (const pk of c.associatedPathways || []) addEdge(cKey, 'ASSOCIATED_WITH', ek.pathway(zone.id, pk))
    }

    // Recommendations.
    for (const r of zone.recommendations || []) {
      const rKey = ek.recommendation(zone.id, r.key)
      addNode(rKey, 'recommendation', r.label, 'provisional', { zone_id: zone.id })
      for (const fk of r.fromFindings || []) addEdge(ek.finding(zone.id, fk), 'GENERATES_RECOMMENDATION', rKey)
      for (const pk of r.fromPathways || []) addEdge(ek.pathway(zone.id, pk), 'GENERATES_RECOMMENDATION', rKey)
    }

    // Missing data — only for engine-flagged absences (spec 12.9).
    for (const md of zone.missingData || []) {
      const mdKey = ek.missing(zone.id, md.key)
      addNode(mdKey, 'missing_data', md.label, FACT_NODE_CONFIDENCE, { zone_id: zone.id })
      addEdge(zKey, 'HAS_MISSING_DATA', mdKey)
      for (const fk of md.findings || []) addEdge(ek.finding(zone.id, fk), 'HAS_MISSING_DATA', mdKey)
    }
  }

  // Deterministic ordering: nodes by entity_key; edges by their stable tuple.
  const outNodes = [...nodes.values()].sort((a, b) => cmp(a.entity_key, b.entity_key))
  const outEdges = [...edges.values()].sort((a, b) => cmp(edgeTuple(a), edgeTuple(b)))
  return { assessment_id: model.assessmentId, nodes: outNodes, edges: outEdges }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const edgeTuple = (e: KGEdgeInsert) => `${e.source_entity_key}|${e.relationship_type}|${e.target_entity_key}`

// Edges from observation/complaint evidence into the inferential layer are
// qualitative; structural edges are validated; everything else is provisional.
function edgeConfidence(rel: KGRelationshipType, srcType: KGNodeType): KGConfidence {
  const structural: KGRelationshipType[] = [
    'HAS_BUILDING', 'HAS_ZONE', 'HAS_MEASUREMENT', 'MEASURES_PARAMETER',
    'OBSERVED_IN', 'COMPLAINT_IN', 'LINKED_TO_STANDARD', 'REQUIRES_REVIEW',
    'HAS_MISSING_DATA', 'GENERATES_RECOMMENDATION', 'INCLUDED_IN_REPORT',
  ]
  if (structural.includes(rel)) return FACT_NODE_CONFIDENCE
  if ((rel === 'SUPPORTS_FINDING' || rel === 'SUGGESTS_PATHWAY' || rel === 'ASSOCIATED_WITH')
      && (srcType === 'observation' || srcType === 'complaint')) {
    return 'qualitative'
  }
  return 'provisional'
}

// ── Standard framing (spec 12.6) ────────────────────────────────────────────
//
// AtmosFlow is screening-only: no standard is presented as a health limit.
// ASHRAE 62.1 in particular is a ventilation-adequacy indicator, never a CO2
// limit (prior CIH peer-review finding). The map keys on the engine's `std`
// string; unknown standards get an advisory default.

const STANDARD_FRAMING: Array<{ match: RegExp; key: string; framing: KGStandardFraming }> = [
  {
    match: /ashrae\s*62\.1/i, key: 'ashrae_62_1',
    framing: {
      standard: 'ASHRAE 62.1', role: 'ventilation_adequacy_proxy', is_health_limit: false,
      framing: 'CO2 is used as a ventilation-adequacy indicator, not a contaminant or health limit. No CO2 limit is implied.',
    },
  },
  {
    match: /isa\s*71\.04/i, key: 'isa_71_04',
    framing: {
      standard: 'ANSI/ISA 71.04-2013', role: 'gaseous_corrosion_screening', is_health_limit: false,
      framing: 'Used as a screening reference for gaseous corrosion severity. Definitive G-class classification requires coupon deployment; no health limit is implied.',
    },
  },
  {
    match: /iso\s*14644/i, key: 'iso_14644_1',
    framing: {
      standard: 'ISO 14644-1:2015', role: 'particle_cleanliness_screening', is_health_limit: false,
      framing: 'Referenced as a particle-cleanliness screening benchmark. ISO Class cannot be determined from walkthrough data; no health limit is implied.',
    },
  },
  {
    match: /niosh/i, key: 'niosh_rel',
    framing: {
      standard: 'NIOSH REL', role: 'advisory_exposure_reference', is_health_limit: false,
      framing: 'Recommended exposure limit cited as an advisory reference for screening, not a compliance determination.',
    },
  },
]

/** Map an engine `std` string to a stable standard key + framing metadata. */
export function standardFor(std: string): KGModelStandard {
  const hit = STANDARD_FRAMING.find((s) => s.match.test(std))
  if (hit) return { key: hit.key, label: std, framing: { ...hit.framing } }
  return {
    key: slug(std), label: std,
    framing: {
      standard: std, role: 'screening_reference', is_health_limit: false,
      framing: 'Referenced as a screening benchmark, not a health or compliance limit.',
    },
  }
}

// Map the engine's textual pathway confidence ('Strong' / 'Moderate' /
// 'Possible' / 'Low (screening-only data)') onto the categorical scale.
// Hypothesis-only chains read as qualitative; never validated.
export function pathwayConfidence(text: string | undefined): KGConfidence {
  if (!text) return 'provisional'
  if (/possible|low|hypoth/i.test(text)) return 'qualitative'
  return 'provisional'
}

// ── Adapter: app/assessment shape -> KGModel ────────────────────────────────
//
// Reads the structured outputs already persisted on an assessment record
// (zones, zone_scores, causal_chains, recommendations) and normalizes them
// into the explicit, key-linked model. Defensive against partial data — every
// field is optional in practice.

interface AnyRec { [k: string]: any }

export function assessmentToGraphModel(args: {
  assessmentId: string
  assessment: AnyRec
  engineResults: AnyRec
  engineVersion: string
  rulesetVersion: string
}): KGModel {
  const { assessmentId, assessment, engineResults, engineVersion, rulesetVersion } = args
  const building = assessment.building || assessment.bldg || null
  const zonesIn: AnyRec[] = assessment.zones || []
  const zoneScores: AnyRec[] = engineResults.zoneScores || engineResults.zone_scores || []
  const causalChains: AnyRec[] = engineResults.causalChains || engineResults.causal_chains || []
  const recsIn: AnyRec[] = engineResults.recommendations || engineResults.recs || []

  const standards = new Map<string, KGModelStandard>()
  const noteStandard = (std?: string): string | undefined => {
    if (!std) return undefined
    const s = standardFor(std)
    if (!standards.has(s.key)) standards.set(s.key, s)
    return s.key
  }

  const zones = zonesIn.map((z, i) => {
    const zoneId = String(z.id ?? z.zid ?? `z${i + 1}`)
    const zs = zoneScores[i] || {}
    const zoneName = zs.zoneName || z.zn || z.name || `Zone ${i + 1}`

    // Findings: non-pass category rows from the deterministic scorer.
    const findings: KGModel['zones'][number]['findings'] = []
    const cats: AnyRec[] = zs.cats || []
    cats.forEach((cat) => {
      const rows: AnyRec[] = cat.r || []
      rows.forEach((r, ri) => {
        const sev = r.sev || 'info'
        if (sev === 'pass' || sev === 'info') return // not a finding
        const fkey = slug(`${cat.l || 'finding'}_${sev}_${ri}`)
        findings!.push({
          key: fkey,
          label: r.t || `${cat.l} concern`,
          findingType: slug(cat.l || 'general'),
          severity: sev,
          confidence: 'provisional',
          ihReviewRequired: true,
          standards: r.std ? [noteStandard(r.std)!].filter(Boolean) : [],
        })
      })
    })

    // Pathways from the causal-chain engine (already structured).
    const zoneChains = causalChains.filter((c) => (c.zone || '') === zoneName)
    const pathways = zoneChains.map((c) => {
      const stdKey = noteStandard(c.std)
      return {
        key: slug(c.type || 'pathway'),
        label: c.type || 'Causal pathway',
        rootCause: c.rootCause,
        evidence: c.evidence || [],
        confidence: pathwayConfidence(c.confidence),
        standard: stdKey,
        supportsFindings: findings!.map((f) => f.key), // chain explains this zone's findings
      }
    })

    // Recommendations for this zone (best-effort; recs may be strings/objects).
    const recommendations = recsIn
      .filter((r) => r == null || typeof r === 'string' || (r.zone == null || r.zone === zoneName))
      .map((r, ri) => {
        const label = typeof r === 'string' ? r : (r.text || r.t || r.title || 'Recommendation')
        return {
          key: slug(`rec_${ri}_${label.slice(0, 24)}`),
          label,
          fromFindings: findings!.map((f) => f.key),
        }
      })

    return { id: zoneId, name: zoneName, findings, pathways, recommendations }
  })

  return {
    assessmentId, engineVersion, rulesetVersion,
    building: building ? { name: building.fn || building.name, address: building.address || building.ba } : null,
    standards: [...standards.values()],
    zones,
  }
}

/**
 * Public entry: build the graph for one assessment from its data + engine
 * results. Returns the insert-shaped, deterministically ordered projection
 * ready for the rebuild RPC.
 */
export function buildKnowledgeGraphFromAssessment(args: {
  assessmentId: string
  assessment: AnyRec
  engineResults: AnyRec
  engineVersion: string
  rulesetVersion: string
}): KGGraphInsert {
  return projectGraph(assessmentToGraphModel(args))
}
