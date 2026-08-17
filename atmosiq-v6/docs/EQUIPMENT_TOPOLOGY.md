# Equipment Topology

HVAC equipment topology is the mapping between **mechanical units** (AHUs, RTUs,
DOAS…) and the **zones they serve**. It is what lets AtmosFlow reason about a
building mechanically rather than room by room: to say that three complaining
rooms share an air handler, that a fourth room on the same unit does *not*
complain, and that a drain-pan finding is one condition on one unit rather than
four independent zone findings.

> **Status:** the foundation is **live** — `HvacEquipment`, the bidirectional
> zone↔equipment mapping, a capture step in the walkthrough, and
> equipment-scoped recommendation dedup all shipped with **engine v2.8.0** and
> are covered by `tests/engine/hvac-equipment-dedup.test.ts`.
>
> Everything under [Proposed work](#proposed-work) is **NOT BUILT**. That
> section is a scope, not a description of the system. Read the status marker on
> each phase before relying on anything in it.

## First principle

Topology is **captured, never inferred**. The assessor states which units serve
which zones; nothing derives the mapping from floor plans, zone names, or
measurement similarity. An unmapped zone stays visibly unmapped and degrades to
a building-scoped fallback — it never silently guesses at a unit.

Consequences baked into the current design:

- **Unmapped is a first-class state.** An empty (or missing)
  `servingEquipmentIds` is the fallback trigger, not an error. Drafts predating
  equipment capture keep working.
- **Renames don't break the graph.** Equipment references zones by the stable
  `zid`, not by zone name.
- **Dedup is a rendering consequence, not a scoring change.** Topology collapses
  duplicate *recommendations*; it does not alter any score, threshold, or
  finding severity.

## What exists today

| Layer | File | Notes |
|---|---|---|
| Types | `src/types/assessment.ts` | `HvacEquipmentType` (8 members), `HvacEquipment`, `ZoneData.zid`, `ZoneData.servingEquipmentIds` |
| Capture | `src/components/MobileApp.jsx` | Dedicated `equipment` view; add/remove units, toggle zone→unit mapping. Removing a unit prunes it from every zone's `servingEquipmentIds` |
| Resolution | `src/engines/scoring-legacy.js` | `buildZoneEquipmentMap(zones, equipment)` — zone name → equipment ids, preferring the zone's inverse when present |
| Consumption | `src/engines/scoring-legacy.js` (`genRecs`) | Emits `RecommendationAction[]` with `scope` / `text` / `affectedZoneIds` |
| Rendering | `src/utils/recFormatting.js` | `groupActions` groups by equipment label and carries `affectedZoneNames` for the "Affects:" line; `HVAC_UNMAPPED_PREFIX` |
| Persistence | `src/utils/supabaseStorage.js` | Rides in the `payload` jsonb snapshot; `fromCloudRow` restores it losslessly |

### The shape

```ts
export type HvacEquipmentType =
  | 'AHU' | 'RTU' | 'FCU' | 'VRF_INDOOR' | 'ERV' | 'MAU' | 'DOAS' | 'OTHER'

export interface HvacEquipment {
  id: string
  label: string
  type: HvacEquipmentType
  servedZoneIds: string[]      // ← zone.zid, not zone name
  location?: string
  lastServiceDate?: string
  filterClass?: string
  notes?: string
}
```

The mapping is stored on **both** sides. `buildZoneEquipmentMap` prefers
`zone.servingEquipmentIds` (the in-walkthrough state) and falls back to
inverting `equipment.servedZoneIds` — so a zone edited mid-walkthrough resolves
correctly before the equipment record catches up.

### What it currently buys

Two zones on the same AHU with standing water in the condensate pan produce
**one** drain-pan action labeled to that AHU, listing both zones under
"Affects:". Two zones on different AHUs produce two actions, each labeled to its
own unit. A zone with no mapping produces a building-scoped action prefixed
`HVAC equipment not yet identified — `. Zone-intrinsic actions (water damage,
occupant relocation, clearance criteria) stay per-zone regardless of topology.

## What is missing

1. **The knowledge graph is blind to it.** `KGNodeType` has no equipment member,
   `KGModelZone` has no equipment field, and `knowledgeGraphBuilder.ts` contains
   no equipment handling. The layer built for relational reasoning cannot see
   the one relation that carries mechanical meaning.
2. **The topology is flat.** `servedZoneIds` is a single unit→zones hop. There
   is no AHU→VAV→zone chain and no outdoor-air intake, exhaust, or diffuser
   object, so a source→pathway→receptor chain (loading dock → intake → AHU-2 →
   floor 3 east) cannot be expressed.
3. **One consumer.** Recommendation dedup. Nothing correlates *complaints* or
   *findings* across a shared unit, which is the diagnostically interesting
   query.
4. **Stored but not addressable.** Equipment lives inside the opaque `payload`
   jsonb — no column, no index, no cross-assessment SQL path. Portfolio and
   building-memory surfaces cannot ask questions of it.

## Proposed work

**None of the following is built.** Phases are ordered by dependency; 1 and 2
are additive and cheap, 3 carries the real risk, 4 is demand-driven.

### Phase 1 — Knowledge-graph ingestion *(not built)*

Make the topology visible to the graph, the Evidence Map, and Jasper.

- `src/types/knowledgeGraph.ts` — add `hvac_equipment` to `KGNodeType`, add
  `SERVES_ZONE` to `KGRelationshipType`, add `KGModelEquipment` and
  `KGModel.equipment[]`.
- `src/services/knowledgeGraphBuilder.ts` — emit equipment nodes keyed
  `equipment:{id}`, emit `SERVES_ZONE` edges, and attach equipment-scoped HVAC
  findings to the equipment node instead of duplicating them onto each zone.
- `lib/context/graphContext.ts` — surface topology so Jasper reasons over the
  relation rather than re-deriving it from prose.

**No migration required.** In `023_knowledge_graph.sql`, `node_type` and
`relationship_type` are plain `text not null`; only `confidence` carries a CHECK
constraint. New members are a TypeScript union change. The determinism test
(entity-key node sets + `(source, rel, target)` tuples) and the sorted-output
guarantee must still hold.

Blast radius is small: the KG defaults **off** on `atmosflow.net` and is
desktop-only.

### Phase 2 — Correlation consumer *(not built)*

The diagnostically useful query, as a new pure module
(`src/utils/equipmentCorrelation.js`): given zones, equipment, and findings,
partition each unit's served zones into **affected** and **unaffected**.

That single function answers "rooms 410, 412 and 414 report symptoms and all
three are served by AHU-4 — but 408 is also on AHU-4 and reports nothing."
Candidate consumers: `src/engines/escalation.js` (a spatial-cluster trigger to
sit alongside the existing temporal/symptom cluster), the Evidence Map, and a
report section.

Additive, pure, and independently testable. This is where the visible payoff
lands.

### Phase 3 — Topology depth *(not built — highest risk)*

Extend `HvacEquipmentType` with `VAV`, `OA_INTAKE`, `EXHAUST`, `DIFFUSER`, and
add an upstream link (`feedsEquipmentIds`) so units form a chain rather than a
star. This is what turns source→pathway→receptor into a model instead of a
narrative rendering, and what enables VAV-level fault isolation.

**The risk is transitivity.** `buildZoneEquipmentMap` currently resolves one
hop. Introducing an intermediate VAV layer makes "which equipment serves this
zone" a graph walk, which can silently change how `genRecs` groups and dedups
actions — a zone previously mapped to AHU-4 becomes mapped to VAV-414, and the
drain-pan action regroups.

Constraints on the fix:

- `src/engines/scoring.js` is engine-sacred and re-exports `genRecs` from
  `scoring-legacy.js` (line 309). **`scoring-legacy.js` is where the logic
  actually lives, and CLAUDE.md's sacred rule names `scoring.js` but not
  `scoring-legacy.js`.** Resolve that ambiguity with the author before editing
  either — do not assume the rule stops at the filename it names.
- Prefer resolving the chain in a pure helper *outside* the scoring modules and
  passing the flattened result in, leaving `genRecs`'s input contract unchanged.
- `tests/engine/hvac-equipment-dedup.test.ts` is the regression guard; its eight
  criteria must stay green without modification.

### Phase 4 — Queryability *(not built — defer)*

Promote equipment out of the `payload` blob into a dedicated column or table so
cross-assessment questions become expressible ("which AHUs across the portfolio
carry repeat findings"). Follow the additive jsonb precedent of migration 028
(`assessments.calibration_acknowledgement`, never backfilled).

Only worth doing when a consumer demands it. Two that would:
`src/utils/assessmentSimilarity.js`, whose "HVAC topology" match currently keys
on `bldg.ht` (the system-type *string*) rather than actual topology, and
`src/report/portfolioModel.js`.

If `lib/context/buildAssessmentContext.ts` gains an equipment field, the drift
guard at `tests/lib/buildAssessmentContext.test.ts` pins the top-level and
`meta` key sets against a golden fixture — update the fixture deliberately, and
treat a failing snapshot as the consumer-breaking change it is.

## Open decisions

- **Sacred-rule boundary** — does the `scoring.js` prohibition extend to
  `scoring-legacy.js`? Phase 3 cannot start without an answer.
- **Flag posture** — Phases 1–2 deliver most of their value through KG surfaces,
  which are off in production and desktop-only. Reaching users is a flag
  decision, not a follow-up.
- **Capture burden** — Phase 3 adds equipment types an assessor must enter
  during a walkthrough. Worth confirming the added intake time is acceptable
  before extending the enum.

## Tests & acceptance

Today: `tests/engine/hvac-equipment-dedup.test.ts` (8 criteria — shared-AHU
dedup, split-AHU separation, unmapped fallback, mixed case, zone-scoped actions
preserved, building tail actions once, `RecommendationAction[]` shape, renderer
grouping).

Each proposed phase should extend that pattern rather than replace it: Phase 1
adds builder determinism cases, Phase 2 a correlation unit test with an
unaffected-zone fixture, Phase 3 must leave the existing eight untouched and
passing.

## Deferred / follow-ups

- **BAS/BMS import.** Damper position, economizer state, and supply airflow are
  currently manual dropdown intake (`od`, `sa` in `src/constants/questions.js`),
  not telemetry. Topology is the prerequisite for a BAS overlay to be
  meaningful — a trend is only diagnostic once you know what it serves.
- **Floor / property hierarchy.** Portfolio → Property → Building → Floor →
  Space is not modeled; `bldg` is a flat object.
- **Equipment-level history.** "This AHU has had three drain-pan findings in two
  years" needs Phase 4 plus a cross-assessment query surface.
