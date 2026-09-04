# AtmosFlow Changelog

## Audit remediation (September 2026)

The engineering audit (`docs/AUDIT-2026-09.md`) found that nothing gated a
deploy, 85% of production code had no static analysis, the acceptance
gates were grep, the container path could not boot and the docs
described scripts that did not exist. This entry covers the process,
delivery and dependency changes; the other audit areas are recorded
below it.

**Security and API (audit §2–3)**

- `/api/credits` rejects non-integer or non-positive amounts and debits
  through the atomic `consume_credits` RPC (migration 033); a negative
  amount no longer grows a balance.
- Migration 033: column-level `REVOKE UPDATE` on the entitlement columns of
  `profiles` (plan, credits, Stripe and status fields), server-side defaults
  for the values the client used to write, widened `generation_type` CHECK
  so `inline_ai`, `inline_complete`, `pre_review_semantic` and
  `photo_analysis` ledger rows land (their rate limits had never fired), RLS
  on `schema_migrations`, non-recursive org policies via `is_org_admin`,
  `analytics_events` inserts require `auth.uid()`, user INSERT on
  `credits_ledger` dropped, `invitations.invited_by` `ON DELETE SET NULL`,
  and nine missing indexes.
- Peer review: both `assessments` updates are scoped to the report owner;
  the public respond endpoint throttles invalid-token attempts per IP.
- `/api/checkout` requires the Bearer JWT and allow-lists the return
  origin; the customer portal return URL is allow-listed the same way.
- `/api/narrative` owns its system prompt server-side and caps the payload
  at 60 KB; report PDF and template render return 402 without credits.
- Stripe webhook handles `invoice.paid` subscription cycles idempotently,
  maps price changes to plan and credits, writes a ledger row on
  cancellation, never overwrites an admin `suspended` status; all balance
  changes go through `grant_credits` / `consume_credits`, including the
  monthly cron and the reset endpoint.
- Every AI endpoint reserves its ledger row before the upstream call
  (`api/_rate-limit.js`) and reads `{ error }`; inline-AI rewrites pass
  through the banned-language scan; the field assistant scopes
  `conversation_id` to the caller and frames client context as data.
- Account deletion nulls PII in `audit_log`, purges marketing leads,
  analytics events and both storage prefixes.
- Internal error text no longer reaches clients; every handler is wrapped
  by `withSentry`, so server-side Sentry initialises on Vercel.

**Database and sync (audit §4)**

- The offline sync queue keeps items that fail to save (they were being
  discarded), is keyed by id, stores compacted copies, surfaces quota
  exhaustion, and no longer wedges on a persisted in-flight flag.
- Column-drop retry happens only on `42703`; a `23505` uid collision
  deletes the stale draft row instead of dropping `payload`.
- Migration 034: `base_updated_at` conflict detection (multi-device edits
  no longer silently overwrite), immutability trigger for reviewed/final
  reports, `finalized_at` as the report date; the v3 census is written to
  `payload.census`, not `composite`.
- `fullSync` selects explicit columns without photos and pages by 500.
- Migration 000 lets a fresh database be built by the runner; the runner
  enables RLS on its ledger, rejects duplicate versions and requires
  `--baseline-through`.

**Engine and standards (audit §5)**

- Non-numeric readings (`1,180`, `<5`, `abc`) produce a data-gap finding
  instead of a pass; the report table shares the engine's parser.
- The report table's own outcome ladder is gone; outcomes derive from
  engine findings, and `cross-layer-consistency.test.ts` renders a fixture
  matrix and checks table, findings and Appendix A agree with `scoreZone`.
- CO₂ is evaluated even when airflow was measured; the no-outdoor tier is
  reachable; meeting the 62.1 minimum exactly is a pass.
- No survey date means a comfort-band data gap, never today's season;
  report ids and stamps derive from the assessment date; `now` is injected.
- Grab readings are never stated to exceed an 8-hour PEL; the live advisor
  and `classify.ts` route on criterion class, not on the word "OSHA".
- Visible mold growth is IICRC S520 Condition 3 with EPA (2008) extent
  bands; the NYC "Level" ladder is no longer attributed to EPA.
- RH 30–60% is cited to EPA moisture-control guidance everywhere (nine
  building profiles, the DOCX narrative, the Logger card); NIOSH RELs are
  10-hour TWAs; ACGIH formaldehyde is the 2017 TWA/STEL; the OSHA action
  level is OSHA's; Δ700 ppm is attributed to the removed appendix;
  calibration validity reads 365 days.
- Unverified healthcare and laboratory ACH figures were withdrawn to the
  gap ledger rather than replaced by guesses; procedure rooms are 15 ACH
  per ASHRAE 170-2021 Table 7.1; isolation text depends on the recorded
  kind (AII negative, PE positive).
- Appendix A lists only references a finding or measurement cited, with
  the basis and usage for each.
- Portable HEPA is recommended only with a particulate finding; gypsum
  moisture is qualitative; one wood-moisture constant (16% MC, IICRC S500).

<!-- coordinator: append other areas here -->

**Process and delivery**

- **CI.** `.github/workflows/atmosflow-ci.yml` runs typecheck → lint →
  test → build, `accept:api-boot` + `bundle:api`, and `accept:prod-ready`
  on every pull request and push to `main` touching `atmosiq-v6/` (Node
  20, npm cache keyed on the lockfile). Require `test` and `api-boot` in
  branch protection.
- **`api_boot` acceptance check.** `scripts/api-boot-check.mjs` bundles
  every `api/**` entry with esbuild the way Vercel's runtime sees it,
  refuses extension-less relative ESM imports at resolve time, and
  imports the output under plain Node asserting a function default export
  — the exact runtime shape of the "every API function was returning
  500" incident below. Criterion `API-BOOT` in `prod-ready.json`,
  `go-live.json` and the new `api-boot.json`; `npm run accept:api-boot`.
- **`prod-ready.json` runs the test suite once.** Seven feature criteria
  each carried their own `npm_script_passes: test`; the suite ran eight
  times and the gate timed out. `BUILD-02` is the single run. 76 criteria.
- **Static analysis reaches `src/`.** `eslint.config.mjs` has real rules
  (`no-undef`, `no-dupe-keys`, `no-unreachable`, `no-debugger`,
  `no-unused-vars`, `eqeqeq`) plus `eslint-plugin-react-hooks` on
  `src/**` under a warning ratchet (`lint:src`, `--max-warnings=<N>`);
  errors fail outright. Infra paths keep `--max-warnings=0` with
  `@typescript-eslint/no-unused-vars`. `tsconfig.check.json` now covers
  `src/**/*.ts(x)` (clean).
- **Coverage.** `npm run test:coverage` (`@vitest/coverage-v8`) with
  thresholds just under the measured baseline (lines 65, branches 50,
  functions 55, statements 60).
- **Bundle.** `manualChunks` splits docx, jspdf, recharts, supabase,
  sentry, markdown and lucide into vendor chunks: main chunk 3,104 KB /
  930 KB gzip → 1,524 KB / 448 KB gzip; the vendor chunks survive deploys
  in the PWA cache.
- **Container path is real.** `scripts/bundle-api.mjs` bundles every
  `api/**` entry and `lib/sentry.ts` to `server/handlers/**/*.mjs`;
  `server/index.js` mounts every handler by walking that tree (nested
  routes included), forwards all methods, sets `trust proxy`, serves
  `GET /healthz` `{ ok, sha }`, initialises Sentry and logs missing env;
  the Dockerfile runs the bundling step and carries a `HEALTHCHECK`.
  `docs/CONTAINER.md` now describes what exists.
- **Environment.** `.env.example` lists every variable read by `api/`,
  `lib/`, `scripts/`, `server/` and `vite.config.js` (was 3 of 39),
  grouped and commented; `docs/ENVIRONMENT.md` maps each to its readers;
  `scripts/check-env.mjs` (`npm run check:env`) lists missing required
  server variables and runs at container boot.
- **Smoke test** probes every `api/**` route unauthenticated (GET and
  POST, non-5xx required) and also runs on every successful production
  `deployment_status`, not only at 06:00 UTC.
- **Docs drift.** README engine line reads from `src/version.js`
  (`atmosflow-engine-3.0.0`) and its test section matches
  `package.json`; `docs/ACCEPTANCE.md` describes the current configs and
  check types; `docs/REPORT_ARCHITECTURE.md` no longer points at
  `v2.3.json` / `accept:v2.6`; CLAUDE.md counts (35 migrations, 76
  criteria) and a CI paragraph. The runner's default config is
  `prod-ready.json`.
- **Dependencies.** Removed the six unused packages (`@mui/material`,
  `@mui/x-date-pickers`, `@emotion/react`, `@emotion/styled`, `vaul`,
  `@testing-library/jest-dom`); declared `html2canvas` and `esbuild`,
  which were imported but undeclared; `cheerio` → devDependencies;
  `@types/react` / `@types/react-dom` pinned to `^18` to match React 18.
  Security upgrades are listed in the dependency notes below.
- **Repo hygiene.** `.nvmrc` (20); `.gitignore` gains `coverage/`,
  `*.log`, `.DS_Store`, `server/handlers/`; `generate-icons.cjs` and
  `generate-whitepaper.cjs` moved into `scripts/`; the 13.6 MB demo video
  and 2.1 MB GIF removed from `public/` (host them on Supabase Storage or
  a CDN — the landing page carries the note); the stale root-level
  `atmosflow-landing.html` (still showed the removed 100-point score) and
  its `test_landing.py` deleted in favour of `public/atmosflow-landing.html`.

## Fix: mold mode could not be exited on a notched iPhone

**User-visible change**

The exit control on the mold screen is reachable again, and the screen no
longer renders underneath the iOS status bar.

**What happened**

Mold mode is early-returned by `MobileApp` OUTSIDE the IAQ shell — deliberately,
so the shell and its nav never mount there. The consequence nobody drew: it
inherits none of the shell's safe-area handling either. The shell pads its
fixed header with `env(safe-area-inset-top)` and reserves the space beneath it;
`MoldModeScreen` had a flat `paddingTop: 16` and no `env()` anywhere in the
file.

On an iPhone with a notch or Dynamic Island the top inset is roughly 47–59px,
so the header — including the 36px exit button — rendered under the status bar.
iOS routes taps in that strip to the system rather than the page, so the only
way out of mold mode could not be pressed. `userMode` persists in
localStorage, which a Safari cache clear does not touch, so every launch
returned to a screen with no reachable exit.

`?mold=0` still recovered it: the flag goes off and `MobileApp`'s "persisted
mold mode seen with the flag off falls back to IH" branch fires. That escape
hatch worked and was undiscoverable, which is why it did not help anyone.

**Why the existing test did not catch it**

`MoldModeScreen.test.tsx` already asserted that clicking the control fires
`onExit`, and it passed throughout. It proves the button is wired; it cannot
see that the button is not where a finger can reach. jsdom has no notion of a
status bar.

The new tests assert the property that was actually violated: every stage
reserves the top inset, the control meets the 44px iOS minimum, and the exit is
offered from all three stages rather than only from home — a stage rendering no
exit is the same trap by a different route.

**Fixed**

- One `STAGE` container style across home / intake / result, padding all four
  safe-area insets.
- Exit control 36px → 44px.


## Fix: every API function reached through an extension-less import was returning 500

**User-visible change**

Report template upload works. So do `/api/events` and five cron handlers,
including the email-queue processor.

**What was broken**

Vercel transpiles each `api/**` entry and traces its imports rather than
bundling them, so what runs is Node ESM — which requires an explicit file
extension on every relative specifier. Twenty-four imports in the API graph
had none, and every function reached through one crashed at cold start with
`ERR_MODULE_NOT_FOUND` before any handler code ran:

| Route | Impact |
|---|---|
| `/api/cron-email-queue-processor` | 96 failed runs in 7 days — every run |
| `/api/report-templates` | upload, list and delete all 500 |
| `/api/report-templates-render` | same import, same crash |
| `/api/events` | failing |
| 4 other cron handlers | failing on each schedule |

Four of the twenty-four were transitive, in `scripts/` and `lib/` — a grep
over `api/` alone would have missed them.

**The fix** is the pattern `api/field-assistant.ts` has always used:
`'../lib/sentry.js'`. TypeScript resolves `'./x.js'` to `x.ts` at compile
time; Node resolves it to the emitted `x.js` at runtime.

**Why nothing caught it**

Every local surface passes. Vitest resolves extension-less TS transparently,
the Vite build never touches the API graph, typecheck is satisfied by
TypeScript's own resolution, and `check-api-js-imports.mjs` — the guardrail
built for exactly this class after PR #297 — passed because it only inspected
`.js`/`.mjs` importers. Its `if (!JS_EXT_RE.test(f)) continue` encoded an
accident of the one crash it was written from as the rule, alongside a comment
asserting that "TS bundlers handle that fine".

It surfaced when somebody tried to upload a report template.

**The guardrail now states the rule from the runtime's constraint**: no
API-reachable file may use an extension-less relative import, whatever the
importer is written in. Type-only statements are exempt, because tsc erases
them. The narrow PR #297 check is kept — a specific diagnosis is worth more to
whoever reads the failure than a general one.

**A second defect in the guard itself**

Its `resolveSpec` returned null for a `.js` specifier pointing at a `.ts`
source — which is the *correct* TypeScript convention. So the moment the API
surface was fixed to use `.js` specifiers, the graph walk would have stopped
at every one of those edges and reported "clean" because it could no longer
see into `lib/` or `scripts/`. A guard that goes quiet when the code is fixed
is worse than no guard, because the silence reads as proof. Fixed, and the
walk now reaches 64 files (33 `.js`, 31 `.ts`) rather than stopping at the
API directory.


## Report templates: reachable, filled, and repeating

**User-visible change**

**Settings → Reports → Report Templates** now exists. Upload a `.docx` with
`{{tokens}}` in it, and Jasper's `generate_report` fills it from the
assessment.

Templates can now contain **repeating sections**. Wrap a table row in
`{{#findings}} … {{/findings}}` and it renders once per finding; the same works
for `zones`, `recommendations` and `sampling_plan`. Settings carries a
reference list of every field and section, generated from the registry.

**Two defects behind this, and they compounded**

*It was unreachable.* `SettingsScreen` never imported `ReportTemplatesPanel`.
The renderer, the token registry, the upload/list/delete API, the private
Storage bucket with its RLS, the Jasper tool and the panel itself were all
built and tested — and nothing in the app could upload a template, so
`generate_report` could only ever answer `no_templates_saved`. Its own failure
message points the assessor at "Settings → Report Templates", a place that did
not exist.

*It rendered blank.* The token resolvers were authored against the flat
`context = {...}` literal `MobileApp.jsx` used to hand Jasper — `findings`,
`recommendations` and `sampling_plan` at the top level. Jasper was migrated
onto `buildAssessmentContext`, where those live at `walkthrough_findings` and
under `engine_outputs`, and the render path inherited the new shape with the
resolvers unrepointed. **Thirteen of twenty-seven tokens went dead**, including
every finding, recommendation, sampling and report-identity token.

A missing token renders blank *by design* — that is the right behaviour for a
field the assessor left empty, and it is why this had no symptom. A rendered
report came out as letterhead with a client name and a zone list, and nothing
anywhere went red.

**What changed**

- Every resolver now reads the canonical `AssessmentContext` path **first**,
  with the legacy paths kept behind it as fallbacks (`buildJasperContext`
  aliases `presurvey` and `bldg` onto the payload, and older saved records
  still carry them).
- Recommendations are read from the `{imm, eng, adm, mon}` buckets `genRecs`
  actually returns. The old resolver filtered a flat array on
  `priority === 'immediate'`; the rows carry no `priority` field at all, so it
  needed reshaping as well as repointing.
- The sampling plan reads `{zone, type, method, standard}` — the fields
  `generateSamplingPlan` emits — not the `analyte` / `location` the old
  literal used.
- `report.date` resolves from `ps_survey_date`, the required "Date of survey"
  intake field. It was reading `meta.assessment_date`, which does not exist;
  `meta.generated_at` was the tempting substitute and is wrong, because it
  would silently re-date an old assessment to today on every re-render.
- `assessor.title` was **removed**. It read `profile.title`, and the app has no
  job-title field anywhere, so it could never fill. A registry entry that
  cannot resolve is worse than none — Settings advertised it and templates
  rendered it blank. Templates still using it now report it as an unknown
  token, which is the feedback that was missing.

**The qualitative-only marking now reaches a template**

CLAUDE.md's defensibility primitive says the `qualitative_only` flag
"propagates to every rendered output of that finding". The template path
carried it nowhere: `buildAssessmentContext` sets it on every finding and no
token surfaced it, so a user template rendered a qualitative-only finding
indistinguishable from an instrument-backed one. Finding rows now carry a
`{{qualitative_note}}` field, and the flat bullet block marks it too.

**Guard**

The regression that closes the class is a test that renders against a **real**
`buildJasperContext` — built from real app state, through the real engine.
The previous fixture was hand-shaped to match the resolvers, so it agreed with
them and with nothing else; that agreement is what let thirteen dead tokens
sit unnoticed. Reverting the repair fails eight tests in that file. Acceptance
criterion `REPORT-TEMPLATES` was eight `file_exists` checks and passed
throughout both defects; it now asserts the mount, the section registry, and
that the real-context test exists.

**Not in this change**

`ai_*` prose tokens. A user template has no `aiProvenanceBanner()` hook, so
model-written text would land under the assessor's letterhead and credentials
with nothing marking it as model-written. That needs deciding before it is
built.


## TVOC is no longer judged — the Mølhave advisory tiers are removed

**User-visible change**

A total-VOC reading is still captured, converted between units, charted,
tabulated and reported. It is no longer compared against anything.

Concretely: no TVOC finding, at any concentration. No reference line on the
TVOC chart and no reference row in the monitoring report. No "TVOC elevated"
chip in the field assistant, and no live advisory when a reading crosses 500
or 3,000 µg/m³. No TVOC-triggered speciation entry in the sampling plan, and
no TVOC term in the chemical causal chain. In the client DOCX the parameter's
Basis column reads "No applicable threshold — reported, not judged" and its
outcome is **Not evaluated** — a distinct token, deliberately not
*Acceptable*.

**Why**

TVOC is a non-specific sum. A photoionization detector aggregates whatever it
responds to into one mass-equivalent number and identifies none of it, and no
regulatory or consensus health-based limit exists for that quantity.

The platform's only basis for judging one was Mølhave (1991) — a chamber-study
dose-response framework describing how symptom likelihood varied across a
defined 22-compound mixture. It is not a limit and was never promulgated as
one, and applying it produced a severity, a citation, a client-facing finding,
a field advisory, a sampling recommendation and a causal-chain term as though
it were.

Every surface that carried a tier also carried a disclaimer saying it was
advisory rather than regulatory. That is the part worth recording: **the
disclaimer was the delivery mechanism, not the safeguard.** A figure printed
beside a measured value reads as a limit however it is captioned, so the
caveat let the tier travel while appearing to be careful about it. The
platform's own anti-pattern list had it backwards — it REQUIRED the Mølhave
disclaimer on any TVOC interpretation, which is a rule that mandates the
comparison it means to qualify.

**What went with them**

The WELL v2 TVOC target (500 µg/m³) too, rather than being kept as the
parameter's last selectable yardstick. Opt-in does not rescue a figure with no
health basis behind it, and leaving one reference in place would have made
"is this reading acceptable" answerable again by a different route.

Also removed: the `molhave-tvoc-framework` corpus entry and the Mølhave row in
the exposure-limit lookup table (both are what the assistant CITES from, so an
entry there is a citable threshold whatever the note beside it says), the
manifest entry, the parameter-prose citation, and the TVOC threshold from the
sample report shipped in `docs/`.

**What was inverted rather than deleted**

Two rules had to flip, not go. The pre-review linter flagged TVOC
interpretations that did NOT cite Mølhave; left in place it would have fired
on every honest sentence and told the assessor to add a reference the platform
had just deleted. It now flags TVOC described as above, below, within or
exceeding any limit — and reads "total VOCs" as well as the acronym, because
that is the label the report itself prints. The same inversion was applied to
the semantic pre-review prompt and to the CLAUDE.md anti-pattern.

**What deliberately stayed**

- `utils/vocConversion.js`, untouched. A logger reporting ppb feeding an
  engine field denominated in µg/m³ still has to cross bases correctly and
  disclose the compound it crossed against. That is a factual question about
  the air, and it stays one whether or not anything scores the result.
- The LEED / green-building 500 µg/m³ corpus entry, whose text now states
  outright that AtmosFlow applies no TVOC threshold. An assessor meets that
  figure in a specification and needs to know what it is.
- The renovation/off-gassing TO-17 sampling entry, which fires on a recorded
  SOURCE rather than a concentration and never needed a threshold to be
  defensible. Removing an over-reaching trigger must not leave a real one with
  nothing to say.
- The `equivalenceBasis` field and its projection, now with no caller. The
  contract is kept whole so it does not silently do nothing the next time a
  mixture threshold is added.

**Guard**

`tests/engine/no-molhave.test.ts`, acceptance criterion `NO-TVOC-THRESHOLD`.
It pins the class rather than the instances: behavioural assertions through
the real entry points at every tier boundary the removed criteria used, plus a
sweep of `src/`, `api/` and `lib/` for a TVOC threshold in a rendered position.
The sweep strips comments first — twenty-odd files now carry removal records
that name the tiers and quote their figures, and a guard that could not tell a
record from a shipped string would fail on its own documentation. It also pins
what must remain, because an absence-only guard is satisfied by deleting too
much.


## Engine v3.0.0 — the 100-point composite score is removed

**User-visible change**

An assessment no longer produces a score or a risk band. In their place
is a **census**: how many findings, at what severity, in which zone.
The results screen, the print report, the client DOCX and the practice
roll-up all lead with that count. Nothing rates a building.

A MAJOR bump because the same inputs no longer produce the same
conclusions — the reason for the rule that a version pins reproducible
output.

**Why**

The number could not be explained in a sentence. It was simultaneously
a weighted mean over five categories (25/25/20/15/15), a worst-zone
override, a normalization against whatever data happened to be
captured, and a severity cap. Downstream of that:

- **Six mutually inconsistent band ladders** existed across the
  codebase, in four different threshold sets — including one inside
  `riskBands.js`, the file whose own header claimed to be their single
  source of truth.
- **Two published composite formulas contradicted each other**: the
  report spec said `avg x 0.6 + worst x 0.4`, the white paper said an
  arithmetic mean with a worst-zone override, and `ARCHITECTURE.md`
  published a third set of band thresholds.
- The score had already been hidden from users by default since
  2026-08. What remained was an internal computation whose real output
  was always the findings tree.

**What changed, by layer**

| Layer | Change |
|---|---|
| `src/engines/scoring.js` | `scoreZone` keeps its name and its findings; the points, weights, normalization and caps are gone. `compositeScore` is replaced by `summarizeAssessment`, returning `{ count, findings, confidence, partialData }`. |
| `src/engines/riskBands.js` | `RISK_BANDS`, `getRiskBand`, `SEVERITY_TO_BAND`, `findingsToBand` and `deriveFMSummary` deleted. Confidence survives — it was never a band over a score. |
| `src/engines/sufficiency.js` | Point caps deleted; `_overall` is now an unweighted mean (see Behaviour changes). |
| `src/utils/assessmentVerdict.js` | The composite floor is gone; a verdict now rests on the worst finding and the escalation triggers. |
| `src/engine/bridge/legacy.ts`, `report/internal.ts` | `siteScore`, `siteTier`, `composite`, `tier`, `rawScore` / `cappedScore` / `maxScore` removed from the contract; prioritization ranks by severity. |
| `PrintReport.jsx`, `SpatialMap.jsx`, `docx/sections-*`, `report/portfolioModel.js` | Score badges, the score numeral, the composite-score explanation, band tints and the band histogram replaced by the census. |
| `featureFlags.js` | `isIaqScoreVisible` / `IAQ_SCORE_VISIBLE_DEFAULT` deleted along with the `?score=1` escape hatch. |
| Copy and docs | FAQ, terminology, feature tour, landing page, white paper, `ARCHITECTURE.md`, `REPORT_ARCHITECTURE.md`, `CLAUDE.md`. Two scoring-methodology documents deleted. |

**Behaviour changes worth reviewing**

1. **A verdict can move down.** With the composite floor gone, an
   assessment with only `low`-severity findings and no escalation
   trigger reads "Within Acceptable Range" where a composite under 70
   once made it "Moderate Concern". Verdicts only ever move down, and
   only for an assessment with nothing to point at.
2. **`sufficiency._overall` is unweighted.** It weighted each category
   by its point cap; with no caps it is a plain mean, which can shift a
   borderline assessment one confidence band.
3. **`evalOSHA`'s complaint rule needs an indicator.** It took the
   composite as a parameter and fired on `composite?.tot || 0`, so a
   missing composite scored 0 and the rule fired by default. It now
   requires a concurrent indicator.

**Legacy reports**

Stored scores are **not** deleted. The Supabase `score` / `composite` /
`zone_scores` columns and the localStorage report index keep their
data; nothing reads it. Dropping a column is irreversible and an issued
report's record is the only evidence of what it said. A pre-v3.0 record
opens, renders without a score or a band, and contributes "not
recorded" rather than a zero to the practice roll-up.
`runScoring()` already early-returned for finalized reports, so this
release cannot retroactively alter what an old report *says* — only
what is rendered from it.

**Guards**

`tests/engine/no-scoring.test.ts` asserts the absence at every layer,
against engine OUTPUT rather than by grepping for names, and includes a
positive control so a regex that stops matching cannot read as a clean
removal. Acceptance criterion `NO-COMPOSITE-SCORE` runs it.

The acceptance runner also had a hole worth naming: `grep_excludes`
returned "pass" when none of its paths existed, so deleting a file made
its own removal-guard silently succeed. An exclusion with nothing left
to read now fails.

**The drain-pan finding no longer escalates to Legionella / ASHRAE 188**

A condensate drain pan answered as "Standing water" or "Bio growth
observed" produced a critical finding ending *"Evaluate for Legionella
risk per ASHRAE Standard 188 if building lacks a Water Management
Program"*, cited to `ASHRAE 188`. That intake field was the entire
trigger — no water system, no aerosol-generating equipment, no water
temperature, no occupant symptom, no building type. ASHRAE 188 scopes
itself to building water systems with a recognised aerosol transmission
risk (cooling towers, evaporative condensers, domestic hot water,
fountains, misters); a low-temperature condensate pan is not one, and a
visual observation of one does not establish an exposure pathway.

The finding now states the condition and stops: *"Drain pan: standing
water — Critical Moisture/Hygiene Deficiency. Potential microbial
reservoir in the condensate pan."* It keeps its `critical` severity and
its `gate5` structural flag; only the escalation went. It cites nothing,
because the standards corpus documents no drain-pan threshold — and 43 of
the 57 findings this engine emits already carry no citation, including
both of this one's neighbours.

ASHRAE 188 appeared in no ledger — absent from `STANDARDS_MANIFEST`,
`criteria.js` and `standards-corpus.js` alike — so the double-entry
reconciliation could not see it.

*How it survived:* the editorial layer had already retired it.
`phrases/hvac.ts` removed the escalation deliberately and recorded why.
But that entry governs `renderClientReport` / PrintReport, while the
AtmosFlow DOCX — the only client deliverable — takes `text: r.t` verbatim
off the engine finding via `reportModel.collectFindings`. The retired
sentence went on shipping from `scoring.js` regardless. Same cross-layer
shape as the 67–82 °F comfort band.

**The recommendation went with it, and carried a worse defect**

`genRecs` fired a matching `legionella_188` action off any finding whose
text contained "Drain pan":

> Evaluate drain pan for Legionella risk per ASHRAE Standard 188. If
> building lacks a Water Management Program, consider Legionella sampling
> **given active occupant respiratory symptoms**.

The closing clause asserts active respiratory symptoms as established
fact, inside an `if (hasDrainPan)` block, with nothing anywhere checking
that a single symptom had been recorded. A recommendation may not state a
fact the assessment did not observe — and deleting only the standard name
would have left that clause standing, so it is pinned as its own property.

`drainpan_immediate` and `drainpan_clean` still fire, so the condition
keeps two actions: address it immediately, and clean the pan and verify
slope and condensate disposal.

**Two more retirements the engine had ignored**

Chasing the Legionella remnant turned up the same defect twice more. In
each case the phrase library had removed an over-reaching instruction,
written down why, and the engine kept shipping it:

- **The EPA-registered-biocide instruction** (`drainpan_clean`). Retired
  by `phrases/hvac.ts` on the reasoning that biocide selection is a
  maintenance decision, not a screening finding. The assessment observed
  a pan; it did not evaluate what may lawfully be applied to that
  equipment, where the condensate discharges, or what the manufacturer
  permits. The action now reads *"Clean the drain pan and associated
  components in accordance with manufacturer recommendations and
  applicable HVAC maintenance procedures; correct drainage and slope
  deficiencies contributing to standing water."*
- **The ATSDR occupant-risk-communication action.** Retired by
  `phrases/complaints.ts` as disproportionate to a routine commercial IAQ
  assessment with no hazardous release identified — ATSDR guidance
  addresses public-health responses to contaminated sites. The
  proportionate step is a structured symptom survey, and the critical and
  high complaint branches each already emit one as a NIOSH IEQ
  questionnaire action. Verified on both severity paths before removing
  it; HEPA filtration and the relocation evaluation are untouched.

**Guards**

`tests/engine/editorial-engine-parity.test.ts` closes the class instead
of the three instances. Its general property: **no engine finding may
contain a `bannedAlternative` of the condition type it classifies to**,
checked across a zone matrix wide enough to fire every branch in all five
categories, plus the union of every ban over every recommendation. That
is machine-checkable and survives without anyone maintaining a comment.
The three named retirements are pinned on top of it — at the engine, at
`collectFindings`, and in `genRecs`.

Both files also assert what must REMAIN. An absence-only guard is
satisfied by an engine that recommends nothing at all, which would be a
worse defect than any of the three removed. That counterweight earned its
place immediately: it failed on first run and exposed a fixture using
`ac: '12'`, which is not one of that field's options and fell through to
a severity where the block under test never ran.

Verified against each restored defect: 9 of 14 fail with the original
finding, 5 of 20 with the original recommendation, 3 of 15 with the
biocide and ATSDR text.

`tests/engine/drain-pan-no-legionella.test.ts` keeps the per-condition
detail. Acceptance criterion `EDITORIAL-ENGINE-PARITY` gates both. Its
`grep_excludes` is anchored to a single-quoted string literal rather than
the bare words: the runner does not strip comments, and the unanchored
form matched four of this change's own removal records — the same
false-positive class `NO-COMPOSITE-SCORE` was re-anchored to avoid.

The stale sample report at `docs/sample-iaq-consultant-report.html`
carried the Legionella claim in four places and was corrected with it.

**Jasper can explain the monitoring report it generated**

Logger Studio produces an Indoor Environmental Monitoring Report. Jasper
could discuss the *readings* — `logger_data_summary` has shipped in the
assessment context for a while — but knew nothing about the *deliverable*:
which reference the assessor chose per parameter, what status the report
reached, why something read "Not Established", or what its limitations
covered. Asked about the document a client was holding, it had nothing.

`read_monitoring_report` closes that. It returns the report as issued.

**It reads the model, not the DOCX.** PR #524 taught Jasper to review an
attached third-party report by quoting it and verifying every quotation,
because such a report is text and nothing else. This one is ours:
`buildMonitoringReportModel(session, opts)` is pure, so the session plus
its generation options reproduce the issued document exactly. Reading the
model beats extracting our own file on every axis — lossless where
extraction drops table structure, exact where a model would re-read a
rounded number off the page, and cheap where a 40-page parse is not. The
projection therefore **re-derives nothing**; every value is copied out of
the model the document was rendered from.

**The session now persists.** Everything on the report sheet except the
readings — location, client, instrument, and above all which reference
profile was chosen per parameter — was typed in and discarded when the
sheet closed. It now rides the `sensorData` envelope, which already
carries exactly this class of state (`tempDisplay`, `thresholds`,
`occupancyWindows`) and already persists to the draft, the report record
and the cloud. No new storage key, no new sync path. Written only after
generation succeeds: a session that produced no document is not a report.

**Scope is explain, not review.** Jasper says what the report states and
what its terms mean; it does not grade the deliverable or volunteer what
is missing. That constraint and the locked status vocabulary cannot be
enforced by a data shape, so both ship as `usage_rules` on the tool
result — the `assess_investigation` pattern — and are asserted in tests.

The load-bearing property: **a comparison the report withheld can never
reach Jasper as a verdict.** When calibration does not cover the
monitoring period, `statusFor` withdraws the status to "Not Established"
and the statistics print alone — so a reader skimming numbers assumes a
comparison was made. The projection carries the withdrawal, and the
`reason` sentence the document builds but renders nowhere, making Jasper
the only surface that can tell a reader why.

Guards: `monitoring-report-summary` (22), `read-monitoring-report` (17),
`monitoring-report-persistence` (6). Verified by inversion — forcing a
"Within Reference" over a withheld comparison fails 4, dropping the
envelope field fails 1. Gate: `IEMR-JASPER-READABLE` (prod-ready now 74).

**A report keeps one identity across every export**

Both renderers have always honoured `data.id` for the Report ID — and no
caller ever passed one. So both fell through to
`AIQ-${Date.now().toString(36)…}` on every export, and the **same report
regenerated after a typo fix came out bearing a different identity from the
copy the client already held.** Two documents, one assessment, disagreeing
about which one they are. The Report ID is what a client quotes back when
they ring about a document and what a reviewer writes on a finding.

`Date.now()` is a timestamp, not an identity: it changes on re-issue, which
is precisely when a stable id matters most. The three `reportData` builds —
export, share, peer-review email — now carry `id: viewRpt?.id || draftId`.
The fallback stays for a caller with no record behind it at all (the
marketing sample); what must not happen is a caller that HAS a record still
landing on it.

Deliberate contrast with `datasetHash`, which fingerprints the READINGS and
is invariant across re-issue for the opposite reason: it answers *"is this
the same data"*, where this answers *"is this the same report"*.

**An assessment now has a durable identity**

Record ids are not durable. `resolveFinalizeTarget` mints a fresh
`rpt-<timestamp>` the first time a `draft-<timestamp>` session finalizes, so
the id an assessment is known by changes exactly once — at the moment it
becomes a deliverable. Fine for storage, which is all it was asked to do.
Useless as a key for anything that must outlive that transition.

`src/billing/assessmentUid.js` adds one that survives draft → finalize →
re-open → re-finalize, riding alongside the record id rather than replacing
it. `finalizeTarget.js` is untouched: record ids are load-bearing across six
`supabaseStorage.js` call sites that split drafts from reports on the
id/status shape, and the duplicate-reports bug already lives there.

**`deriveLegacyUid` is pure, and that is the whole point.** Every existing
assessment has no uid. If opening one MINTS instead of DERIVES, the record's
identity changes on every open — and under per-report pricing, re-downloading
last month's report would charge for it again, silently, because from the
code's view it is simply a different assessment. So: existing uid, else
derive deterministically from the record id, and mint only when there is
neither. No clock, no randomness, no I/O. Finalize **carries** the uid across
the id change rather than re-deriving from the new `rpt-` id — one line, and
the reason the module exists.

Migration 032 adds `assessments.assessment_uid` with `UNIQUE (user_id,
assessment_uid)`. Nullable, no backfill — a SQL backfill would be a second
implementation of a function whose entire job is to agree with the first.
The column exists so the **server** can bind on it: a client-minted uid means
nothing until a row proves this user owns it. It also rides inside `payload`,
so the client round-trip works on a project that has not migrated yet — and
the upsert retry now drops `assessment_uid` alongside `payload` so an
unapplied migration cannot break all syncing.

Guards: `assessmentUid` (17) pins purity, RFC-4122 shape, collision behaviour
across consecutive `Date.now()` ids, and the crypto-less PWA fallback;
`assessmentUid-wiring` (11) pins that finalize carries rather than re-derives,
that both re-open paths backfill, and that a cloud row without a uid cannot
blank a local one. Verified by inversion — making `openReport` mint fails the
re-open guard. `report-id-stability` (8) covers the export identity, including
a source-level check that all three build sites pass the id.

Neither change is billing. Both are prerequisites for it, and both fix real
defects on their own.

## Engine v2.8.0 — HVAC equipment-scoped recommendations

**User-visible change**

HVAC actions are now grouped by equipment so a single AHU serving
multiple zones shows one action, not duplicates. Two zones served by
the same AHU produce one drain-pan / filter / OA-damper / comprehensive
HVAC inspection action labeled to the AHU with both zones listed under
"Affects:". Two zones served by different AHUs still produce two
separate actions, one per unit.

**Walkthrough**

A new "HVAC equipment" capture step lives between Quick Start and the
zone walkthrough. Each captured equipment unit (AHU, RTU, FCU, ERV,
MAU, DOAS, VRF indoor, Other) is selectable as "Served by" on each
zone. Zones with no equipment selected (or marked "Unknown") trigger a
single building-scoped fallback action prefixed
"HVAC equipment not yet identified —" instead of duplicating per zone.

**Scope inventory**

| Recommendation | Scope (v2.8.0) | Notes |
|---|---|---|
| Clean drain pan + EPA-registered biocide | Equipment | Was zone — now grouped per AHU/RTU |
| Address drain pan condition immediately | Equipment | Was zone |
| ASHRAE 188 Legionella drain-pan evaluation | Equipment | Was zone |
| Replace air filters (immediate / high) | Equipment | Was zone |
| OA delivery rate + damper position | Equipment | Was zone |
| Comprehensive HVAC inspection | Equipment | Was zone |
| Comprehensive HVAC system assessment (data gap) | Equipment | Was zone |
| Water intrusion / IICRC S500 | Zone | Unchanged — per zone |
| NIOSH IEQ symptom questionnaire | Zone | Unchanged |
| ATSDR occupant risk communication | Zone | Unchanged |
| Temporary relocation feasibility | Zone | Unchanged |
| Re-occupancy / clearance criteria | Zone | Unchanged |
| Portable HEPA in occupied area | Zone | Unchanged |
| Periodic reassessment | Building | Unchanged |
| Preventive HVAC maintenance schedule | Building | Unchanged |

**Backwards compatibility**

Reports finalized prior to v2.8.0 store recommendations as
`{ imm: string[], eng: ..., adm: ..., mon: ... }` (legacy "ZoneName:
text" prefix shape). The renderers (`MobileApp.jsx` Actions tab,
`sections-recommendations.js`, `sections-core.js`,
`generateLegacyPrintHTML`) normalize either shape via
`src/utils/recFormatting.js`, so historic reports continue to render
correctly without re-running the engine.

**Out of scope for this release**

- Cost estimation / pricing
- Equipment-maintenance scheduling / CMMS integration
- Sensor binding to equipment
- Post-finalization REVISED-badge / recipient-notification registry
  (referenced in the v2.8.0 PR spec §6 — confirmed not yet built;
  re-running the engine after adding equipment will simply re-emit
  the action list with equipment grouping but without a revision
  marker until that registry exists)
