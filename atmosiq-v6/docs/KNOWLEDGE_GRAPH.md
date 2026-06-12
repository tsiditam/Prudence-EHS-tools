# Knowledge Graph

The Knowledge Graph turns the deterministic engine's output for one assessment
into an explicit, queryable graph of **findings ← evidence**, **findings →
standards / pathways / recommendations**, and the data gaps and IH-review
requirements around them. It powers an on-screen **Evidence Map**, a node-link
**graph view**, a scoped **Jasper context**, and a **report traceability
matrix** — all reading the *same* projection, so the screen, the AI, and the
deliverable can never disagree.

> **Status:** staged and **gated behind a feature flag**. ON for preview /
> localhost builds; **OFF on `atmosflow.net`** until the PR is reviewed and
> merged. See [Feature flag](#feature-flag).

## First principle

The graph is a **derived, disposable projection** of deterministic engine
outputs. It holds no original facts and can be rebuilt at any time from
`(assessment data + engine results)`. It never originates a finding, threshold,
standard, recommendation, or review requirement, and it never overrides one.
The engine remains the single source of truth; **no engine files were modified**
to build it.

Consequences baked into the design:

- **Confidence is categorical** — `validated | provisional | qualitative`.
  There is no numeric confidence field anywhere (an unsourced `0.5` is exactly
  the fabricated number to avoid).
- **Standards carry framing.** Every standard node records `is_health_limit`
  and a framing string. CO₂ / ASHRAE 62.1 is a **ventilation-adequacy
  indicator, never a health limit**; that framing rides into the UI badge, the
  Jasper guidance, and the report annotation.
- **Contradictions surface, never hide.** `CONTRADICTS_FINDING` edges are
  emitted only when the engine flags a conflict, and every surface shows them.
- **Every finding requires IH review** — propagated as a node, an edge, a UI
  badge, and a report note.

## Anchor decision

The original spec keys the graph on a server-side `projects` table. In this
codebase **projects are localStorage-only**, so the graph is instead anchored
on **`assessments`** (migration 014, `id TEXT`, `user_id`) — the only
server-side, RLS-owned entity that already persists the engine outputs
(`zone_scores`, `causal_chains`, `recommendations`). Tenant isolation is
therefore enforced by Postgres RLS on `assessments.user_id`, not in app code.

## Architecture

| Layer | File | Notes |
|---|---|---|
| Schema | `supabase/migrations/023_knowledge_graph.sql` | `kg_nodes` + `kg_edges` (`assessment_id TEXT` → `assessments`, cascade), indexes, per-assessment unique constraints, `updated_at` trigger, **owner-only RLS** (no client write policy), transactional **advisory-locked `kg_rebuild()`** RPC (`service_role` only), recursive `kg_finding_evidence()` |
| Types | `src/types/knowledgeGraph.ts` | Node/edge/model types + the LLM-facing `KGContext` |
| Builder | `src/services/knowledgeGraphBuilder.ts` | **Pure, deterministic** projector + adapter. Version-stamped, entity-key keyed, sorted output. Defensive: any non-array engine input degrades to empty, never throws |
| Service | `src/services/knowledgeGraphService.ts` | RLS-scoped reads + the single `service_role` rebuild path via `kg_rebuild` |
| Report rows | `src/services/reportTraceability.ts` | Pure `traceabilityRows()` shared by the DOCX section and the on-screen card |
| Jasper context | `lib/context/graphContext.ts` | `buildGraphContext()` summarizes the graph per finding; attached as `knowledge_graph` on the Jasper context (client-side; stays out of the `/api/field-assistant` bundle) |

### The builder is two layers

1. **`projectGraph(model)`** — a pure projector: normalized domain model →
   insert-shaped `{ nodes, edges }`, deterministically ordered. Edges reference
   nodes by **`entity_key`**; the `kg_rebuild` RPC mints UUIDs and resolves
   endpoints inside one transaction. This is also what makes determinism
   testable (compare entity-key node sets and `(source, rel, target)` tuples,
   ignoring UUIDs).
2. **`assessmentToGraphModel(...)`** — the adapter that maps the app/assessment
   shape (zones with reading fields, `zoneScores.cats[].r[]`, `causalChains`,
   `recs`) into that model. Evidence nodes (measurements / observations /
   occupant reports) are derived from the zone's captured fields and linked to
   findings by category family.

## Surfaces

| Spec | Surface | File |
|---|---|---|
| §13 | **Evidence Map** result tab — finding cards with supporting/conflicting evidence, framed standards, pathways, recommendations, missing data, IH-review flag | `src/components/EvidenceMap.jsx` |
| §14 | **Knowledge Graph view** — inline-SVG node-link graph (no graph lib), tiered top-down, edges colored by relationship, tap a node to focus its links | `src/components/KnowledgeGraphView.jsx` |
| §16 | **Scoped Jasper context** — compact, relationship-nested summary + grounding guidance | `lib/context/graphContext.ts` |
| §17 | **Report Evidence Traceability Matrix** — CIH-reasoning DOCX section (gated on `reportStyle === 'cih'`) + identical on-screen card | `src/components/docx/sections-traceability.js`, `src/components/dev/ReportTraceabilityCard.jsx` |

The Evidence Map tab renders the §14 graph at the top and the §13 cards below.

## Feature flag

All KG surfaces gate on **`isKnowledgeGraphEnabled()`**
(`src/utils/featureFlags.js`). Resolution order (first decisive rule wins):

1. URL **`?kg=1`** / **`?kg=0`** → persisted to `localStorage`, then applied
2. `localStorage['af.kgEvidence']` = `'1'` | `'0'`
3. default: **ON** for non-production hosts, **OFF** for `atmosflow.net`

So preview / localhost builds get it automatically; production hides it by
default; the owner can flip it on for a live demo with `?kg=1` (sticky) and off
again with `?kg=0` — no redeploy. The flag controls the in-app Evidence tab,
the `/dev/evidence-map` preview, and the floating **KG Preview** button.

To enable on production for a demo: visit `https://atmosflow.net/?kg=1` once.
To turn it back off: `https://atmosflow.net/?kg=0`.

## Eyeballing it (no auth)

On any preview build (or production with `?kg=1`), tap the floating **KG
Preview** button, or open **`/dev/evidence-map`**. The preview is driven by the
built-in **demo assessments** (Commercial IH / Facility FM / Data Center) run
through the real engine pipeline, and shows the graph, the Evidence Map cards,
and the traceability matrix together. The preview is lazy-loaded so it never
enters the production bundle.

A sample CIH-style DOCX (Conceptual Site Model + Findings Confidence Register +
Evidence Traceability Matrix) can be regenerated with `npm run render:kg-sample`
→ `/tmp/kg-cih-traceability-sample.docx`.

## Tests & acceptance

- `npm run test:kg` — builder (incl. determinism, dedup, contradiction,
  framing, evidence derivation, non-array tolerance), service, graph context,
  traceability rows, and the UI components.
- `npm run accept:kg` — executable acceptance gate
  (`scripts/acceptance/kg.json`).

## Deferred / follow-ups

- **Server-side rebuild trigger** — `rebuildAssessmentGraph` runs through a
  `service_role` client, but nothing calls it on finalize yet (kept
  zero-regression on the finalize flow). Until then the surfaces build the
  graph client-side from in-memory engine output.
- **Project-level graph route (§15)** and a force-directed / zoomable graph
  library, if the hand-rolled SVG layout proves limiting on dense assessments.
- **Live-LLM eval scenarios** for the graph grounding (the `jasper-eval`
  harness) — the grounding itself is pinned offline by golden fixtures.
