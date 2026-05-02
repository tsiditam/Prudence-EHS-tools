# AtmosFlow — Project Context for Claude Code

## What this is

AtmosFlow is an IAQ (indoor air quality) assessment SaaS platform built by
Prudence Safety & Environmental Consulting, LLC (PSEC). It produces
consultant-grade IAQ reports for industrial hygienists and EHS
professionals. The platform is positioned as **screening-only** — it
identifies risk indicators and produces sampling plans but never makes
definitive regulatory classifications or compliance determinations.
Maintain that positioning in any code, copy, or documentation you generate.

Live at atmosiq.prudenceehs.com. Engine version is currently **2.6** (post
v2.5 residual defect cleanup + v2.6 hypothesis and causal-chain restoration).

## Stack

- **Vite 5 + React 18 SPA** (not Next.js — atmosiq-v6/ is the canonical
  AtmosFlow codebase). PWA-shipped to iOS Safari, Chrome, Edge.
- **Inline styles, no Tailwind, no shadcn/ui.** A limited token surface
  exists at `src/styles/tokens.js` but the codebase predominantly uses
  inline `style={{...}}` per-component. UI primitives are not yet
  extracted; planned in a future "UI system pass."
- **Express harness** at `server/index.js` for container-mode deploys
  (FedRAMP/GovCloud portability). Vercel serverless is the production
  deploy path; Express container is parallel infrastructure.
- **Stripe Checkout** (subscription mode) with credits ledger and the
  webhook idempotency table (`stripe_webhook_events`, migration 006).
- **Supabase** for auth + Postgres; client-side persistence via
  `src/utils/storage.js` (localStorage wrapper) plus
  `src/utils/cloudStorage.js` (facade over `supabaseStorage`).
- **DOCX generation** via the `docx` package (Buffer/Blob output);
  rendering pipeline at `src/components/DocxReport.js` →
  `src/components/docx/sections-*.js`.
- **PDF generation** via `pdfkit` for marketing samples
  (`scripts/generate-sample-report-pdf.mjs`).
- **Sentry** for error monitoring with PII scrubbing (`lib/sentry.ts`).
- **Resend** for transactional + onboarding emails
  (`lib/email-sequences.ts`, `lib/email-triggers.ts`).
- Deployed on Vercel.

## Repository layout

Read these directories first when investigating any task:
- `src/components/` — UI components, mostly inline-styled JSX. Hot files:
  `MobileApp.jsx` (main app shell + dashboard + result tabs + bottom nav),
  `LandingPage.jsx`, `AuthScreen.jsx`, `SettingsScreen.jsx`,
  `AdminDashboard.jsx`, `DocxReport.js`.
- `src/components/docx/` — DOCX section builders
  (sections-core, sections-v21client, sections-recommendations, etc.).
- `src/components/pricing/` — Pricing UI: `PricingSheet.jsx`, `tiers.js`.
- `src/components/onboarding/` — first-assessment guided tour (the .tsx
  one lives at the repo root: `components/onboarding/FirstAssessmentTour.tsx`).
- `src/components/account/` — account settings (mirror at
  `components/account/AccountSettings.tsx`).
- `src/engine/` — TypeScript engine: scoring contracts, ClientReport
  rendering, CIH-validation layer, professional-opinion logic, citation
  templates, finding groups, watermark interface.
  - `src/engine/report/client.ts` — ClientReport renderer
  - `src/engine/report/cih-validation.ts` — defensibility checks
  - `src/engine/report/templates.ts` — TRANSMITTAL / SCOPE /
    LIMITATIONS / ASSESSMENT_INDEX_DISCLAIMER paragraphs
  - `src/engine/report/watermark.ts` — WatermarkConfig type
  - `src/engine/bridge/legacy.ts` — bridge from legacy scoring to
    AssessmentScore
- `src/engines/` (plural, distinct from src/engine/) — JS engines for
  scoring, sampling, narrative orchestration. **`scoring.js` is core
  scoring logic** (off-limits per the standing rule below).
- `src/constants/` — `standards.js` (manifest + thresholds),
  `questions.js`, `demoData.js` / `demoDataFM.js` / `demoDataDC.js`.
- `src/utils/` — `storage.js` (localStorage), `supabaseStorage.js`
  (Supabase sync), `cloudStorage.js` (facade), `supabaseClient.js`,
  `instrumentRegistry.js`, `profiles.js`, `backup.js`.
- `src/contexts/` — React contexts (AuthContext, AssessmentContext,
  StorageContext).
- `api/` — Vercel serverless functions (.js + a few .ts):
  `webhook.js`, `checkout.js`, `credits.js`, `delete-account.js`,
  `narrative.js`, `admin.js`, `audit.js`, `customer-portal.ts`,
  `early-access.js`, `reset-credits.js`, the cron handlers,
  `_audit.js` (the audit-log helper), `profile/mark-onboarded.ts`.
- `lib/` — TypeScript utilities at the repo root:
  `sentry.ts` / `sentry-client.ts`, `email-sequences.ts` /
  `email-triggers.ts`, `password-reset.ts`, `free-tier.ts`,
  `stripe-prices.ts`.
- `components/` (root, not under src/) — `onboarding/`, `account/`,
  `pricing/` — TSX components reachable from both the SPA and the
  acceptance gates.
- `pages/index.tsx` — public marketing landing page. Self-contained
  TSX; not yet wired into the SPA's actual route shell (the live root
  currently renders `src/components/LandingPage.jsx`).
- `supabase/migrations/` — 011 migrations covering analytics, billing,
  teams/orgs, enterprise phase 1, early-access, webhook-idempotency,
  deletion-audit, narrative-generations, pricing rollout, onboarding,
  email queue.
- `scripts/` — acceptance runner (`acceptance-check.mjs`), engine merge
  readiness diagnostic, smoke test, password-reset verification, Stripe
  setup, cron implementations, sample-report PDF generator.
- `scripts/acceptance/` — JSON acceptance configs:
  `prod-ready.json` (23 criteria), `pricing-rollout.json` (19),
  `go-live.json` (21), and the legacy v2.X engine configs.
- `tests/` — Vitest:
  - `tests/engine/` — engine logic + report rendering tests (.ts)
  - `tests/api/` — API handler tests (.ts)
  - `tests/components/` — React component tests (.tsx, jsdom env)
  - `tests/lib/` — lib utility tests (.ts)
  - `tests/pages/` — landing-page test (.tsx, jsdom env)
  - `tests/scripts/` — script tests
- `docs/` — operational runbooks: `PRODUCTION_READINESS.md`,
  `PRICING.md`, `GO_LIVE.md`, `SENTRY.md`, `CONTAINER.md`, plus
  `ARCHITECTURE.md` at the repo root.

## Directories to skip unless explicitly asked

- `dist/` — Vite build output.
- `node_modules/` — npm install tree.
- `.vercel/` — Vercel deploy artifacts.
- `coverage/` — test coverage output.
- `public/` — static assets shipped to the SPA. The sample
  report PDF (`public/sample-report.pdf`) is a tracked binary; if you
  need to inspect it use the source generator at
  `scripts/generate-sample-report-pdf.mjs` instead.
- Other tracked binaries (`sample-report.docx`, any `*.docx` / `*.pdf` /
  `*.xlsx`) — large and rarely relevant. Use prefix `CLAUDE-REVIEW-` if
  you want me to read a specific one.

## Working principles

- **Discover before editing.** Use `grep` and `glob` to locate relevant
  code before reading files. Do not read entire directories.
- **Surgical changes only.** No drive-by refactors. If you see code that
  should be improved but isn't related to the current task, leave a
  `// TODO(claude):` comment and continue.
- **No functional regressions.** This is a production SaaS. If a fix
  risks breaking adjacent functionality, stop and surface the concern
  before proceeding.
- **Respect the screening-only positioning.** Do not generate code,
  copy, or report content that claims compliance certification,
  professional opinion (without licensed-professional sign-off), or
  definitive causation. The MSA recital language depends on this.
- **Preserve calibration gating.** The instrument-calibration gate that
  blocks report generation when calibration is stale (270 days,
  configurable by device class) is a competitive moat and a litigation
  defense. Do not bypass or weaken it.
- **The engine is sacred.** Do not modify any file under `src/engine/`
  or `src/engines/scoring.js`. Do not change scoring logic, threshold
  constants, or scoring contracts. If you think the engine needs to
  change to complete a task, you have misunderstood the task — stop
  and report.

## Engine version conventions

Three concepts, kept distinct:
- **App version** — the Vite client build (e.g. 6.0.0)
- **Engine version** — the scoring/methodology engine (e.g. 2.6.0)
- **Standards manifest version** — the bibliography snapshot, dated

All three derive from a single source of truth. Do not hardcode version
strings outside that source.

## Defensibility primitives

When working on report generation, these patterns are non-negotiable:

- **Citation tracker.** Every body-text reference to a standard
  registers with the tracker. Appendix D includes only registered
  standards. No automated standards dump.
- **Qualitative-only propagation.** Findings derived from instruments
  not in the accuracy database inherit a `qualitative_only: true` flag
  that propagates to every rendered output of that finding.
- **Location on recommendations.** Every Immediate-priority
  recommendation must populate at least one of: `zone_id`, `system`,
  `surface_or_asset`, `free_text`.
- **Finalization gate.** Block report finalization on missing client
  name, missing site contact (name + role), missing occupant
  denominator for symptomatic zones, missing photos for Critical/High
  findings, or assessor name matching placeholder patterns.
- **Journal citations must be verified.** Title, journal, volume,
  issue, pages, year — all from primary sources. Flag unverified
  entries with TODO and exclude from generated reports.

## Acceptance gates

Three feature-level acceptance configs gate completion claims:

| Gate | Script | Criteria |
|---|---|---|
| Production readiness (Group A) | `npm run accept:prod-ready` | 23 |
| Pricing rollout (Group B) | `npm run accept:pricing-rollout` | 19 |
| Go-live experience (Group C) | `npm run accept:go-live` | 21 |

When you believe you are done with work that touches a feature, run the
relevant gate. Do not self-grade against prose; the runner exits 0 only
when every criterion passes. The runner itself lives at
`scripts/acceptance-check.mjs`.

## Out of scope unless explicitly requested

- Composite scoring math reconciliation (separate workstream)
- UI redesign (separate plan; result tabs / demo cards / bottom nav
  redesigned in commit `c1ed1c8`, broader UI system pass deferred)
- Mold module build-out (spec phase, not implementation)
- Marketing copy on prudenceehs.com or atmosflow positioning pages
- FedRAMP MFA enforcement, FIPS-140 crypto, SSP authoring (handled by
  separate FedRAMP workstream; see `docs/PRODUCTION_READINESS.md`)

## Test commands

- `npm run test` — Vitest unit + integration tests (default)
- `npm run typecheck` — TypeScript noEmit check
  (`tsc --noEmit -p tsconfig.check.json`, scoped to new infra paths;
  src/engine type errors are a separate engine-scope follow-up)
- `npm run lint` — ESLint flat config, scoped to new infra paths
- `npm run build` — Vite SPA production build

Run tests after any change to `src/engine/`, `src/engines/`, `src/components/docx/`,
`api/`, or `lib/`.

## Anti-patterns to avoid

- Hardcoded standards thresholds inside scoring logic (thresholds live
  in `src/constants/standards.js`, not in scoring code paths)
- AI-generated narrative without an "IH Review Required" label
- TVOC interpretation without Mølhave 1991 advisory tier disclaimer
- ASHRAE 62.1 cited as a CO₂ contaminant limit (it isn't — see Persily
  2021)
- Spore counts framed as health proof (they aren't — IOM 2004,
  ACMT 2025)
- Report generation without calibration verification

## When in doubt

Ask. The author of this codebase is **Tsidi Tamakloe** (CSP, BCSP
#38426, OSH Program Manager at FAA). His preferred work style is:
discovery first, surgical fixes, explicit acceptance criteria, no
drive-by changes. If a task is ambiguous, surface the ambiguity rather
than picking a direction.
