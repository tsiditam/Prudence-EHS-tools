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

## Where an on-site finding can already surface

Three hosts exist. A new integrity finding needs none of its own.

- **The Zone-complete sheet.** `src/engines/zone-gaps.js` builds the
  "before you leave" list, and `interruptsZoneCompletion(gaps)` already
  decides whether it blocks. This is the natural host for a finding whose
  actionability is on-site: the assessor is still in the room.
- **`JasperWatchPanel`.** Live advisories during the walkthrough, from
  `src/engines/liveAdvisor.js` (`evaluateLive`). **It contains no AI** —
  worth knowing, because it carries the assistant's name, so an assessor
  may reasonably believe the agent is speaking. Do not add a second
  panel beside it.
- **The assistant, on request.** `propose_action` with
  `action_type: 'ask_zone_question'` opens an unanswered walkthrough
  question as an Accept or Reject card. This is a pull path: the assessor
  has to be in the chat. Use the Zone-complete sheet for anything that
  must be seen without asking.

## Do not build a Field Consistency Agent

Or a Gap Agent, or a Forensics Agent, or anything else that speaks to the
assessor in its own voice while the walkthrough assistant is speaking.

The count that makes this concrete: a September 2026 sweep found roughly
**twenty-five distinct advisory surfaces** already reachable by a user,
of which the Report tab alone carries nine or ten. Agent clutter is not a
hypothetical risk here; it is the current state one layer below agents. A
new integrity capability composes into a surface that exists, or it does
not ship.

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

## One consistency agent was already built — its fate is now decided

*Decision recorded 2026-09. This section used to end by demanding one and
must not be read as still asking for it.*

`api/pre-review-semantic.js` plus `src/utils/preReviewValidator.js` were a
complete two-layer pre-review agent that no component imported and no
client fetched: deterministic checks in layer one, a semantic pass in
layer two, rate-limited, covered by tests, reachable by nobody. Its prompt
had been copied into the assistant's `review_attached_document` tool,
which is the path that ships, so the standalone agent became the dead
half — the `aiProvenanceBanner` shape again, where a module's tests are
its only consumer and it is embalmed rather than covered.

The two halves were given different answers, because they are different
questions.

**Layer one was FOLDED IN, and that is the Report Consistency layer.**
`src/engines/integrity/report-consistency.js` is one deterministic list in
the shared integrity contract, under the `report_package` source layer this
document's finding shape declared and left unbuilt. It composes rather than
competes:

- `checkRenderModel`'s twenty rules keep their logic, their messages and
  their ownership. The detector receives their output and projects it into
  the contract; it never re-runs them, because a second run is a second
  opinion about one document.
- The surviving `preReviewValidator` checks are ported behind the same
  contract. `checkPlaceholderText` was deliberately not: `validation.js`
  already raises the assessor placeholder, and two surfaces answering one
  question about the assessor's own name is worse than one.
- Three structural rules are new — a severe finding whose room carries no
  immediate action, material stale content, and evidence addressed to a
  zone that no longer exists.

`preReviewValidator.js` is retained for exactly one commit, because the
port is a reimplementation and the parity test compares the two over the
same input. Do not add a rule to it. It is retired once that parity has
stood, and `tests/engine/no-molhave.test.ts` must be repointed at the
detector's `ANTI_PATTERNS` before it goes.

**Layer two stays disconnected, deliberately, and is Phase 2.** It is the
half a structural layer cannot do: whether a cited standard actually
supports the claim beside it, whether two differently worded sections
genuinely contradict each other, whether a recommendation conflicts with a
finding, whether a conclusion overstates what the evidence supports. No
amount of joining reaches a comparison of meaning.

One thing must exist before it is wired: **quote-resolution validation.**
Every issue the model returns must quote the report verbatim, and a
deterministic validator must resolve that quotation against the text it
claims to cite, dropping any issue whose quote is not found. That is the
discipline `forensicValidate.js` already applies to every id the forensic
interpreter returns — resolved against `bundleEvidence()` rather than
trusted — and it is what stops a semantic reviewer inventing a defect in a
report that does not contain one. Three further conditions, none optional:
it runs last, over what the deterministic rules could not resolve, and may
never suppress a deterministic finding; its own prose passes
`scanProseForBannedLanguage` before display, because a reviewer checking a
document for over-claiming may not over-claim; and nothing it returns may
enter the render model, since it produces issues ABOUT text and never text.

**Report QA warns; it never blocks.** Stated as the product rule it is
under *Report QA never gates the deliverable* in `CLAUDE.md`, and it binds
this phase and every phase after it.

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
