# Agent architecture — capabilities first, personalities second

*Product direction, September 2026, written against the modules that exist.*

## The rule

**One user-facing agent per workflow. Specialized capabilities run behind
it and stay invisible.**

AtmosFlow presents a professional workflow, not a collection of competing
agent personalities. The assessor must never experience this:

> Walkthrough Agent says one thing; Consistency Agent says another; Gap
> Agent raises a third warning; Forensics Agent opens a fourth panel.

Three primary surfaces, one per workflow:

| Workflow | Primary surface | Everything else |
|---|---|---|
| Field assessment | the walkthrough assistant | background |
| Logger analysis | Logger Studio Forensics | background |
| Reporting | the report generation path | background |

A capability gets its own user-facing agent **only when it represents a
distinct user workflow**. Otherwise the intelligence goes behind the
primary experience. "It is intelligent" is not a reason to give something
a voice.

## What each capability is, and where it lives

The conceptual boundaries, mapped to the modules that implement them. Read
this before proposing a new engine — most of the boxes are already filled.

**Walkthrough assistant** — user-facing. Guides the field assessment,
controls prompts and interaction, records observations, complaints,
measurements, photos, occupancy, HVAC conditions and moisture indicators.
`api/field-assistant.ts`, `src/constants/field-assistant-prompt.js`, and
`src/constants/observable-fields.js` for what it may propose writing.

**Forensics Engine** — not a conversational agent. Analyzes logger
time series: events, patterns, occurrence windows, temporal provenance.
`src/utils/forensicEvents.js`, `forensicPatterns.js`, `forensicBundle.js`,
`forensicPresent.js`. The model reads its output and interprets; it never
produces a figure or a timestamp. `ForensicsPanel.jsx` is the surface.

**Investigation Integrity** — background. Cross-checks the record for
gaps, contradictions and unsupported conclusions. **This already exists
and is called `buildReadinessVerdict`** (`src/engines/readiness-verdict.js`),
which composes four pure inspectors into one JSON shape:

- `validation.js` — hard finalization blockers plus soft warnings
- `defensibility-gaps.js` — evidentiary-context gaps that weaken an
  interpretation under review
- `investigation-gaps.js` — explanations left live and never measured
  against, which a per-category completeness check cannot ask about
- `confidenceCounts()` — findings per confidence tier

Its verdict is consumed by the Readiness panel **and** by the assistant's
context block, so the assistant reasons about gaps without a separate
round trip. That is the architecture on this page, already shipped. Extend
it; do not build a second one beside it.

**Criteria Engine** — deterministic. Thresholds, standards, screening
criteria, parameter evaluation. `src/constants/criteria.js`,
`src/constants/standards.js`, `src/engines/scoring.js`. Authoritative
numeric evaluation is never delegated to a model when deterministic logic
exists. See the determinism-core rule in `CLAUDE.md`.

**Evidence layer** — connects findings, timestamps, measurements, photos,
observations, complaints, zones, instruments, annotations and report
statements. `src/report/evidencePackage.js`, `src/utils/forensicBundle.js`
(`bundleEvidence`), and the knowledge graph.

**Report generation** — user-facing within the reporting workflow only.
Produces narrative from the validated record. `src/report/aiSections.js`,
`src/engines/reportSections.js`. Must not alter deterministic findings or
fabricate evidence.

**Report QA** — final review. `src/report/narrativeAudit.js`,
`src/report/modelConsistency.js`, `src/engine/report/cih-validation.ts`.
Flags problems; never silently rewrites a technical conclusion.

## Do not build a Field Consistency Agent

Or a Gap Agent, or a Forensics Agent, or anything else that speaks to the
assessor in its own voice while the walkthrough assistant is speaking.

Integrity findings return **to the walkthrough assistant as structured
data**. The assistant decides whether a finding is actionable now, worth
surfacing later, informational, resolvable remotely, needs more field
work, or should simply be documented as a limitation. The integrity layer
does not interrupt the assessor and does not own UI.

Worked example. An occupant complaint reads "the room feels stuffy most
afternoons" and afternoon occupancy is undocumented. The integrity layer
emits a finding — `missing_context`, evidence: the complaint record,
missing field: afternoon occupancy, relevance: interpretation of a
time-linked complaint, actionability: `on_site_now`. The assessor sees one
line, from the assistant they were already talking to:

> Before leaving this area, afternoon occupancy has not been documented.
> Add it now or mark it unavailable.

## The seven categories an agent may not collapse

AtmosFlow supports professional judgment; it does not replace it. Keep
these distinct at every layer:

1. Known fact
2. Deterministic finding
3. Observed relationship
4. Potential hypothesis
5. Missing information
6. Unresolved inconsistency
7. Professional conclusion

A model that flattens 4 into 2, or 5 into 1, has invented evidence. When
information cannot be obtained the assessor documents it as a limitation —
the platform never infers the missing value to close the gap.

## Structured outputs between components

**Prose generated by one component is never the API another consumes.**
Evidence ids and deterministic provenance survive the whole workflow.

The target shape for an integrity finding:

```
issue_id  issue_type  severity  zone_id  evidence_ids[]  time_window
description  why_it_matters  actionability  suggested_action
resolution_status
```

Most of it exists. `OpenQuestion` in `src/engine/investigation.ts` already
carries `id`, `question`, `whyItMatters`, `blocks[]` and `fields[]`; the
gap streams carry `kind`, `severity`, `zones[]`, `count` and `why`.

Three pieces are genuinely missing, and they are the enabling work:

- **`evidence_ids[]`.** `InvestigationEvidence` carries `statement`, a
  sentence. A finding cannot cite what produced it.
- **`time_window`.** The investigation model has no temporal dimension at
  all, so a finding cannot point at a stretch of the record.
- **`actionability` / `resolution_status`.** Nothing distinguishes "fix
  this before you leave the building" from "disclose this as a
  limitation", which is the whole point of routing findings through the
  walkthrough assistant.

Two type changes unlock the first two: an id alongside
`InvestigationEvidence.statement`, and a logger member on
`EvidenceSource` (today `'measurement' | 'observation' | 'causal_chain'`).

## The Forensics arrow is not connected

`InvestigationInput` takes zones, building data, zone scores, the sampling
plan and causal chains. **It does not take sensor or logger data.** So the
Forensics Engine's patterns, occurrence windows and temporal provenance
reach the report and the Forensics panel, and reach the integrity layer
not at all. Integrity re-evaluation after logger analysis is a wire that
does not exist yet.

## The constraint any integrity work inherits

`CONTEXT_RULES` in `forensicPatterns.js` already learned this and it is
binding:

> The obvious way to report missing context is a session-level checklist,
> and it is wrong. Logger Studio has no HVAC-schedule field at all, so a
> checklist would complain about the HVAC schedule on every analysis ever
> run, and an assessor would learn to skip the whole section inside a week.

A gap is named **only where it would materially change the reading of one
specific finding**, and the entry has to say what cannot be distinguished
without it. An integrity engine that emits a completeness checklist has
failed, however correct each line is.

## The other constraint: what the assistant may write

`observable-fields.js` admits a field only if (a) it exists in
`questions.js` and (b) an engine actually reads it. Fields read only by
the **report** are excluded, which is why note-to-field proposals were
deferred in `WALKTHROUGH_CAPTURE.md`. Occupant count (`oc`) is excluded
deliberately — it feeds the ventilation calculation, so a mis-transcribed
value moves a number silently.

This bites on integrity findings about missing context: the layer can
raise a gap the assistant cannot offer to fill. Two honest resolutions,
and the choice is the product's:

1. The prompt **navigates to the field** and the assessor types it. No
   proposed value, so the allowlist does not apply. Cheapest, and it keeps
   the "a mis-transcribed count moves a number silently" guard intact.
2. Widen the allowlist to report-read fields, which reopens the question
   that rule was written to close.

Prefer 1 until something forces 2.

## Overall flow

```
ASSESSOR
   |
   v
WALKTHROUGH ASSISTANT ──> Criteria Engine
   |                 ──> Investigation Integrity
   |                 ──> Evidence layer
   v
Investigation record
   |
   v
Logger / sensor data ──> Forensics Engine ──> Integrity re-evaluation
   |
   v
Report generation ──> Report QA ──> professional review / signature
```
