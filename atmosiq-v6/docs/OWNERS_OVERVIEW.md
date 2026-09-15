# AtmosFlow (atmosiq-v6) — Owner's Overview

*Written for the business owner or non-technical team member who needs to
understand what the application does, how it works, and how to confidently
make or request common changes — without needing to write code.*

> Scope: this document covers **`atmosiq-v6`** only (the canonical AtmosFlow
> codebase). It does not cover the other apps in the monorepo.

---

## 1. What AtmosFlow is, in one paragraph

AtmosFlow is a web/mobile application that helps **industrial hygienists and
EHS professionals run Indoor Air Quality (IAQ) investigations**. A user walks
through a guided assessment, imports data-logger files and field
observations, and AtmosFlow turns that into **scored findings, causal
pathways, sampling plans, and a draft professional report**. It is positioned
as **screening-only**: it flags risk indicators and drafts documentation, but
a credentialed professional always reviews and signs off. It is sold as a
**subscription** (Solo / Pro / Practice tiers) and ships both as a website and
as an installable phone app (PWA).

---

## 2. The technology stack at a glance

| Layer | Technology | Where it lives |
|---|---|---|
| **Front end (what users see)** | React 18 + Vite 5 (single-page app), shipped as a PWA | `src/` (entry: `src/main.jsx` → `src/App.jsx`) |
| **UI building blocks** | Mostly hand-written components with inline styles; MUI date pickers; Recharts (charts); Lucide + custom icons; Sonner (toasts) | `src/components/`, `src/styles/` |
| **Back end (server logic)** | Vercel **Serverless Functions** (Node.js). A parallel **Express** server exists for container hosting | `api/` (serverless), `server/index.js` (Express), `Dockerfile` |
| **Database** | **Supabase** (hosted PostgreSQL) | Schema in `supabase/migrations/`; client in `src/utils/supabaseClient.js` |
| **Sign-in / accounts** | **Supabase Auth** (email/password, sessions) | `src/components/AuthScreen.jsx`, `src/contexts/AuthContext.jsx` |
| **Data storage / sync** | Browser storage first (localStorage + IndexedDB for photos), synced to Supabase | `src/utils/storage.js`, `cloudStorage.js`, `supabaseStorage.js`, `photoBlobStore.js` |
| **Payments / subscriptions** | **Stripe** (Checkout + Customer Portal + credits ledger) | `api/checkout.js`, `api/webhook.js`, `api/customer-portal.ts`, `src/components/pricing/` |
| **Email** | **Resend** (onboarding + reminder/digest emails, queued) | `lib/email-sequences.ts`, `lib/email-triggers.ts`, `api/cron-email-queue-processor.ts` |
| **AI assistant ("AtmosFlow AI" / Jasper)** | **Anthropic Claude** (Sonnet + Haiku models) | `api/field-assistant.ts`, `api/narrative.js`, prompts in `src/constants/field-assistant-*.js` |
| **Reports** | Word (`docx` / `docxtemplater`), PDF (`pdfkit` / `jspdf`), print-HTML | `src/components/DocxReport.js`, `src/components/docx/`, `lib/report-templates/`, `api/report-pdf.js` |
| **Scoring "engine"** | In-house rules engines (JavaScript + TypeScript) | `src/engines/` (core), `src/engine/` (newer TS layer) |
| **Error monitoring** | **Sentry** | `lib/sentry.ts`, `lib/sentry-client.ts` |
| **Hosting / deploy** | **Vercel** (production), GitHub-connected | `vercel.json` |

**Plain-language summary:** the app runs in the browser (React). When it needs
to do something private or heavy — charge a card, send email, call the AI,
read the database — it calls small server functions in `api/`. Those talk to
Supabase (the database + login), Stripe (payments), Resend (email), and
Anthropic (AI). Everything is hosted on Vercel.

---

## 3. Folder-by-folder map

### Front end — `src/`
The whole user-facing app. Entry flow: `src/main.jsx` boots the app and picks
what to render; `src/App.jsx` decides whether to show the marketing page or the
app shell; `src/components/MobileApp.jsx` is the **main application shell**
(dashboard, navigation dock, screens).

| Folder | What's in it |
|---|---|
| `src/components/` | All the screens and UI (58+ files). Highlights: `MobileApp.jsx` (the app shell + bottom dock), `AuthScreen.jsx` (sign in/up), `LandingPage.jsx` (in-app marketing page), `SettingsScreen.jsx`, `AccountScreen.jsx`, `AdminDashboard.jsx`, `FieldAssistant.jsx` (the AI chat), `SensorScreen.jsx` (Logger Studio), `IncidentLog.jsx`, `DocxReport.js` (Word report builder). Subfolders: `ui/` (reusable glass UI like the floating dock), `docx/` + `print/` (report rendering), `projects/`, `forms/` (chain-of-custody PDFs), `pricing/`, `sensor/`, `settings/`, `desktop/`. |
| `src/contexts/` | App-wide state: `AuthContext.jsx` (who's logged in), `AssessmentContext.jsx` (the current investigation), `StorageContext.jsx` (save/sync). |
| `src/hooks/` | Reusable behaviors (e.g. `useFieldAssistant`, `useNetworkStatus`, `useVoiceTranscription`, Bluetooth sensor hooks). |
| `src/engines/` | **The scoring brain (JavaScript).** `scoring.js` scores conditions against standards; plus `sampling.js`, `causalChains.js`, `narrative.js`, `validation.js` (readiness checks), `escalation.js`, `riskBands.js`. |
| `src/engine/` | A **newer TypeScript engine layer**: report rendering (`report/`), defensibility/CIH validation, hypotheses, causal chains, instrument accuracy. |
| `src/constants/` | The "knobs": `standards.js` (IAQ thresholds + reference manifest), `questions.js` / `fm-questions.js` (assessment questions), `faq.js`, `terminology.js`, `field-assistant-*.js` (AI prompts + knowledge corpus), `demoData*.js` (sample data). |
| `src/utils/` | Plumbing: `supabaseClient.js` (DB/login connection), `storage.js` + `cloudStorage.js` + `supabaseStorage.js` (save locally, sync to cloud), `photoBlobStore.js` (photos in the browser), `sensorParser.js` / `sensorAnalytics.js` (logger files), `featureFlags.js`, `subscriptionState.js`, `theme.js`. |
| `src/services/` | Knowledge-graph + report-traceability features. |
| `src/report/` | Report data model + narrative library. |
| `src/styles/` | Design tokens (`tokens.js`, `soft-glass.js`, `jasper-tokens.js`) — colors, spacing, motion. |

### Back end — `api/` (Vercel serverless functions)
Each file is its own mini-endpoint the front end calls.

| File(s) | Purpose |
|---|---|
| `checkout.js`, `webhook.js`, `customer-portal.ts`, `credits.js`, `reset-credits.js` | **Stripe**: start a subscription, receive payment events, open the billing portal, manage credits. |
| `field-assistant.ts`, `field-assistant-history.ts`, `field-assistant-feedback.ts`, `inline-ai.js`, `inline-complete.js`, `photo-analyze.js`, `narrative.js` | **AI (Claude)**: the assistant chat, inline AI writing help, photo analysis, report narrative generation. |
| `report-pdf.js`, `report-templates.ts`, `report-templates-render.ts` | Generate/download reports and manage Word templates. |
| `early-access.js` | The "Request Beta Access" form (saves to DB + emails you). |
| `peer-review.ts`, `peer-review-respond.ts` | Send a report to a colleague for review without an account. |
| `sites.ts`, `events.ts`, `audit.js`, `admin.js`, `delete-account.js`, `profile/mark-onboarded.ts` | Saved buildings/sites, analytics events, audit log, admin tools, account deletion, onboarding flag. |
| `cron-*.ts` | Scheduled jobs (run automatically): reset free-tier usage, grant monthly credits, send queued emails, flag stale calibration, send portfolio digests. |

### Shared logic — `lib/`
Reusable server-side TypeScript: `email-sequences.ts` / `email-triggers.ts`
(what emails go out and when), `stripe-prices.ts` (price IDs ↔ tiers),
`context/` (assembles the data the AI and reports read from),
`report-templates/` (Word template engine), `sentry.ts` (monitoring),
`free-tier.ts` (usage limits).

### Database — `supabase/migrations/`
Numbered SQL files that define every table (run in order). Notable ones:
`002_billing_credits` (subscriptions/credits), `005_early_access_signups`
(beta requests), `010_onboarding`, `011_email_queue`, `013_field_assistant_tables`
(AI history), `014_assessments_table` (saved investigations), `017_sites`,
`021_peer_reviews`, `023_knowledge_graph`.

### Other top-level items
- `components/` (root, **outside** `src/`) — `onboarding/FirstAssessmentTour.tsx` and `account/AccountSettings.tsx` (kept here because automated checks expect these paths).
- `pages/index.tsx` — a standalone marketing landing page (not the live root yet).
- `server/index.js` + `Dockerfile` — run the app as a self-hosted container (used for portability/GovCloud); production uses Vercel.
- `scripts/` — maintenance + quality gates (DB migration runner, acceptance checks, sample generators).
- `tests/` — the automated test suite (Vitest); `public/` — static assets (logos, icons, sample report, the marketing HTML page).
- `docs/` — operational runbooks (this file lives here).

---

## 4. How it all ties together

```
                     ┌─────────────────────────────────────────────┐
   Customer's        │  BROWSER  (React app, src/)                  │
   phone / laptop ──►│  - screens, guided assessment, Logger Studio │
                     │  - scoring engine runs HERE (src/engines)    │
                     │  - saves locally first (localStorage/IndexedDB)│
                     └───────────────┬─────────────────────────────┘
                                     │ calls /api/* when it needs
                                     │ something private or heavy
                                     ▼
                     ┌─────────────────────────────────────────────┐
                     │  SERVER  (Vercel functions, api/ + lib/)     │
                     └───┬───────────┬───────────┬─────────────┬────┘
                         ▼           ▼           ▼             ▼
                   Supabase      Stripe       Resend        Anthropic
                   (database     (payments)   (email)       (Claude AI)
                    + login)
```

Key idea: **the scoring/analysis runs in the browser** (fast, works offline);
the server is only for things that must be private (database, API keys) or
collaborative (payments, email, AI, sharing). Data is saved on the device
immediately and **synced** to Supabase so it follows the user across devices.

---

## 5. The customer workflow (what happens when someone uses AtmosFlow)

1. **Arrival.** A new visitor goes to `atmosflow.net`. The app sends
   first-time browser visitors to the **marketing landing page**
   (`/atmosflow-landing.html`) to learn about the product and request beta
   access. Returning users and people who **installed the app** (Add to Home
   Screen) go straight into the app.
2. **Sign in.** Inside the app, `AuthScreen` handles sign-up / log-in through
   Supabase. A logged-in session is remembered.
3. **Home / dashboard.** `MobileApp` shows their projects, recent reports, and
   the bottom navigation dock (Projects · Logger Studio · Reports · Account),
   with the **AtmosFlow AI** assistant floating on the right.
4. **Create a project & run the guided assessment.** The user answers the
   structured questions (building details, HVAC, occupant concerns), captures
   **photos**, and imports **data-logger files** (Logger Studio).
5. **Analysis.** The **engine** scores each zone against published standards
   (`src/constants/standards.js`), producing **findings**, **causal
   pathways**, **recommendations**, and a **sampling plan**. A **Readiness
   panel** flags anything missing (advisory, never blocking).
6. **AI assistance.** "AtmosFlow AI" (Claude) helps summarize findings, draft
   narrative, and answer questions — always labeled for professional review.
7. **Generate the deliverable.** From the report picker the user creates a
   **Consultant Report (Word)** or the **AtmosFlow Report (PDF)**. Drafts
   carry an "IH Review Required" watermark until a qualified professional
   finalizes them. Reports can be sent to a colleague via **peer review**.
8. **Billing throughout.** Access is governed by their **Stripe**
   subscription (Solo/Pro/Practice) and a **credits** balance for certain AI
   actions; the Stripe webhook keeps entitlements in sync, and the Customer
   Portal lets them manage their plan.
9. **Email touchpoints.** Onboarding and reminder/digest emails go out via
   **Resend** (queued and sent by a scheduled job).
10. **Data safety.** Everything saves on the device first and syncs to
    Supabase; errors are reported to Sentry.

---

## 6. How to make or request common changes (owner's cheat-sheet)

| You want to change… | Where it's controlled | Notes |
|---|---|---|
| Marketing page wording/logo | `public/atmosflow-landing.html` (and the repo-root copy) | Self-contained page; the in-app React landing is `src/components/LandingPage.jsx`. |
| Pricing / plan names | `src/components/pricing/tiers.js`, `lib/stripe-prices.ts`, **+ the Stripe dashboard** | Price IDs are set as environment variables (`STRIPE_PRICE_*`). Changing money always involves Stripe too. |
| IAQ thresholds / cited standards | `src/constants/standards.js` | Safe to update the data here; do **not** edit the scoring code. |
| Assessment questions | `src/constants/questions.js` / `fm-questions.js` | Adds/edits what users are asked. |
| Emails (content/timing) | `lib/email-sequences.ts`, `lib/email-triggers.ts` **+ Resend dashboard** | |
| FAQ / terminology | `src/constants/faq.js`, `terminology.js` | |
| Report templates / sections | `lib/report-templates/`, `src/components/docx/` | |
| Turn features on/off | `src/utils/featureFlags.js` | |
| Keys & secrets (Supabase, Stripe, Resend, Anthropic, Sentry) | **Vercel project → Environment Variables** | Not stored in code. See list below. |

**Configuration lives in environment variables (set in Vercel), not in code:**
`SUPABASE_URL` / `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_{SOLO,PRO,PRACTICE}_{MONTHLY,ANNUAL}`, `ANTHROPIC_API_KEY`,
`RESEND_API_KEY` / `RESEND_FROM_ADDRESS`, `SENTRY_DSN`, `CRON_SECRET`,
`ADMIN_SECRET`.

### Off-limits without expert sign-off (these are the legal/credibility moat)
- The **scoring engine** (`src/engine/`, `src/engines/scoring.js`) and
  threshold logic — changing how scores are computed can undermine
  defensibility.
- The **calibration gate** (blocks reports when instrument calibration is
  stale) — a litigation defense.
- The **screening-only positioning** — copy/reports must never claim
  compliance certification or definitive causation.

---

## 7. Mini-glossary

- **PWA** — the installable app version (Add to Home Screen); runs offline.
- **Serverless function** — a small piece of server code (in `api/`) that runs
  on demand; no server to maintain.
- **Supabase** — the hosted database + login service.
- **Stripe** — the payment processor (subscriptions + billing portal).
- **Resend** — the email-sending service.
- **Anthropic / Claude** — the AI provider behind "AtmosFlow AI."
- **Engine** — AtmosFlow's in-house scoring/analysis rules.
- **Migration** — a numbered SQL file that creates/updates a database table.
- **Vercel** — where the app is hosted and auto-deploys from GitHub.

---

*Source of truth for engineers: `ARCHITECTURE.md` and `CLAUDE.md` at the repo
root, and the per-area `docs/` runbooks. This overview is intentionally
high-level; when in doubt, ask engineering to confirm specifics before a
change that touches money, scoring, or data.*
