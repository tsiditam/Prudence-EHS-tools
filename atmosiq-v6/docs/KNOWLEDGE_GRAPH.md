# Knowledge Graph

The Knowledge Graph turns the deterministic engine's output for one assessment
into an explicit, queryable graph of **findings ← evidence**, **findings →
standards / pathways / recommendations**, and the data gaps and IH-review
requirements around them. It powers an on-screen **Evidence Map**, a node-link
**graph view**, a scoped **Jasper context**, and a **report traceability
matrix** — all reading the *same* projection, so the screen, the AI, and the
deliverable can never disagree.

> **Status:** live behind a feature flag, **desktop only**. The master kill
> switch is **lifted**, so the staged rollout is active: ON for preview /
> localhost builds and available on `atmosflow.net` via `?kg=1` / the beta
> cohort. Every surface additionally requires a **desktop-width viewport**
> (≥ 1024 px) — the KG does not render on phones. See
> [Feature flag](#feature-flag).

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

All KG surfaces gate on two orthogonal predicates in
`src/utils/featureFlags.js`:

1. **`isKnowledgeGraphEnabled()`** — the *rollout* gate (kill switch + host /
   URL / cohort resolution, below).
2. **`isDesktopViewport()`** — the *viewport* gate. The KG is a wide node-link +
   evidence-map experience, so it ships to **desktop only** (viewport
   ≥ `KG_DESKTOP_MIN_WIDTH`, 1024 px — the same breakpoint `useMediaQuery`
   calls `isDesktop`). A surface renders only when **both** pass.

`main.jsx` ANDs the two statically for the `/dev/evidence-map` route and the KG
Preview button; `MobileApp.jsx` ANDs the module-level rollout flag with the
**reactive** `isDesktop` from `useMediaQuery`, so the in-app Evidence tab
appears/disappears live as the window crosses 1024 px and never shows on a
phone.

### Master kill switch

`KG_KILL_SWITCH` (top of `featureFlags.js`) is the single, unambiguous off
control. While **`true`**, every KG surface is OFF **everywhere** — production
*and* preview/localhost, desktop *and* mobile — regardless of host, `?kg=`,
viewport, or localStorage. It overrides all other resolution. Set it to
**`false`** to resume the staged rollout below. Nothing else needs to change to
disable or re-enable the feature.

> **Current state: `KG_KILL_SWITCH = false` (lifted — staged rollout active,
> desktop only).** Flip to `true` to take the feature fully dark again on every
> device.

### Staged resolution (when the kill switch is lifted)

`resolveKgFlag()` decides, first decisive rule wins:

1. URL **`?kg=1`** / **`?kg=0`** → persisted to `localStorage`, then applied
2. `localStorage['af.kgEvidence']` = `'1'` | `'0'` — the user's explicit choice
3. `localStorage['af.kgCohort']` = `'1'` — the server-driven beta cohort
4. default: **ON** for non-production hosts, **OFF** for `atmosflow.net`

So preview / localhost builds get it automatically; production hides it by
default; the owner can flip it on for a live demo with `?kg=1` (sticky) and off
again with `?kg=0` — no redeploy. The flag controls the in-app Evidence tab,
the `/dev/evidence-map` preview, and the floating **KG Preview** button.

### Beta-cohort rollout (Phase 0)

`applyKgCohort(enabled)` lets the app boot enable the KG for a **beta cohort**
of production users without a redeploy and without them typing `?kg=1`. When a
user's profile opts them into the KG beta, boot calls `applyKgCohort(true)`,
which writes `localStorage['af.kgCohort']='1'`; on the next load `resolveKgFlag`
turns the KG **on** for that user (production included).

Precedence is deliberate: the cohort marker is **enable-only** and sits *below*
the user's own choice — a prior `?kg=0` / `af.kgEvidence='0'` still wins, and a
non-cohort user simply falls through to the host default (prod off). The
`KG_KILL_SWITCH` still overrides everything, so cohort rollout only takes effect
once the switch is lifted.

**Membership source of truth:** the `profiles.kg_beta` boolean (migration
`025_profile_kg_beta.sql`). At boot `AuthContext` reads the server profile and
calls `applyKgCohort(profile.kg_beta === true)`, so the client marker is always
re-derived from the server flag (self-healing). `kg_beta` is **operator-set via
the service role only** — `saveProfile()` never writes it, and RLS blocks a user
from editing their own row's `kg_beta`, so no one can self-enroll.

To enable on production for a demo: visit `https://atmosflow.net/?kg=1` once.
To turn it back off: `https://atmosflow.net/?kg=0`.

### Enrolling beta users — operator runbook (SQL)

Run these in the **Supabase SQL editor** (service role — it bypasses RLS; the
app's anon/user role cannot write `kg_beta`). Prerequisite: migration `025`
applied.

```sql
-- Enroll a user by email
update public.profiles p
   set kg_beta = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('assessor@example.com');

-- Enroll by profile id (== auth user id)
update public.profiles set kg_beta = true
 where id = '00000000-0000-0000-0000-000000000000';

-- Who is currently in the cohort?
select p.id, u.email, p.kg_beta
  from public.profiles p
  join auth.users u on u.id = p.id
 where p.kg_beta = true
 order by u.email;

-- Count enrolled
select count(*) from public.profiles where kg_beta = true;

-- Un-enroll one user by email
update public.profiles p
   set kg_beta = false
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('assessor@example.com');

-- Roll the whole cohort back (kill-switch of last resort for enrollment)
update public.profiles set kg_beta = false where kg_beta = true;
```

**After enrolling**, the change is *sticky, next-load*: the user picks it up the
next time the app boots (`AuthContext` writes `af.kgCohort` from their profile),
exactly like `?kg=1`. Ask them to reload / reopen the app. Nothing appears until
`KG_KILL_SWITCH` is lifted **and** the user is enrolled.

**Verify** an enrolled user got it: in their browser DevTools →
Application → Local Storage, `af.kgCohort === '1'` after a reload; once the kill
switch is off they'll see the **Evidence** result tab and the KG surfaces.

**Note:** a user who explicitly opted out (`?kg=0`, persisted as
`af.kgEvidence='0'`) still wins over enrollment by design; to override, have them
visit `?kg=1` or clear that key.

> An admin-UI toggle for `kg_beta` is a possible follow-up; for a small Phase-0
> cohort this SQL runbook is the intended path (no new write endpoint / admin
> auth surface to review).

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
