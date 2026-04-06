# AtmosIQ v6 — Architecture & Build System Documentation

**Prudence Safety & Environmental Consulting, LLC**
Last updated: April 2026

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Architecture Patterns](#architecture-patterns)
4. [Dual-Experience Model](#dual-experience-model)
5. [Question System](#question-system)
6. [Scoring Engine](#scoring-engine)
7. [User Profiles & Auth](#user-profiles--auth)
8. [Offline-First Storage](#offline-first-storage)
9. [Supabase Integration](#supabase-integration)
10. [API Proxy Pattern](#api-proxy-pattern)
11. [PWA Configuration](#pwa-configuration)
12. [Design System](#design-system)
13. [Testing Strategy](#testing-strategy)
14. [Deployment](#deployment)
15. [Replication Guide](#replication-guide)

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Framework | React | 18.3 | UI rendering |
| Build | Vite | 5.4 | Dev server + production bundling |
| Language | JavaScript (JSX) | ES2022 | No TypeScript (beta decision) |
| Backend | Supabase | 2.x | Auth, Postgres DB, Storage |
| Hosting | Vercel | - | Static hosting + serverless functions |
| Tests | Vitest | 4.x | Unit tests for engines |
| AI | Anthropic Claude API | claude-sonnet-4 | Narrative generation (proxied) |

### Why These Choices

- **React + Vite**: Fast dev iteration, no framework lock-in, PWA-friendly
- **No TypeScript**: Speed of development for beta. Migrate later.
- **Supabase over Firebase**: Postgres (real SQL), Row Level Security, open source
- **Vercel**: Free tier, serverless functions for API proxy, auto-deploy from git
- **Vitest over Jest**: Native Vite integration, faster, same API

---

## Project Structure

```
atmosiq-v6/
├── api/                          # Vercel serverless functions
│   └── narrative.js              # Anthropic API proxy
├── public/
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service worker (offline caching)
│   └── icons/                    # PWA icons
├── supabase/
│   └── schema.sql                # Database schema (run in Supabase SQL Editor)
├── src/
│   ├── main.jsx                  # React entry point
│   ├── App.jsx                   # Desktop experience (scroll form + sidebar)
│   ├── components/
│   │   ├── MobileApp.jsx         # Mobile experience (one-question-at-a-time)
│   │   ├── AuthScreen.jsx        # Supabase email/password auth
│   │   ├── ProfileScreen.jsx     # Local profile management (fallback)
│   │   ├── DesktopSidebar.jsx    # Desktop navigation sidebar
│   │   ├── HistoryView.jsx       # Desktop report/draft history
│   │   ├── ReportView.jsx        # Desktop report display
│   │   ├── LandingPage.jsx       # Marketing landing page (desktop only)
│   │   ├── Loading.jsx           # Animated loading screen
│   │   ├── Particles.jsx         # Canvas particle background
│   │   ├── ScoreRing.jsx         # Animated circular score display
│   │   ├── PhotoCapture.jsx      # Camera capture + photo management
│   │   ├── SensorScreen.jsx      # Instrument readings input grid
│   │   └── Icons.jsx             # SVG icon system
│   ├── engines/                  # Business logic (pure functions, no UI)
│   │   ├── scoring.js            # 100-point zone scoring + OSHA eval
│   │   ├── sampling.js           # Hypothesis-driven sampling plan
│   │   ├── causalChains.js       # Root cause chain builder
│   │   └── narrative.js          # AI narrative via proxy
│   ├── constants/
│   │   ├── questions.js          # All question definitions (4 tiers)
│   │   ├── standards.js          # ASHRAE/OSHA/NIOSH/EPA thresholds
│   │   └── demoData.js           # Demo assessment data
│   ├── hooks/
│   │   ├── useMediaQuery.js      # Responsive + PWA standalone detection
│   │   ├── useCounter.js         # Animated number counter
│   │   └── useInView.js          # Intersection observer for scroll reveal
│   ├── styles/
│   │   └── tokens.js             # Desktop design tokens (colors, spacing)
│   ├── utils/
│   │   ├── storage.js            # localStorage wrapper (primary data store)
│   │   ├── profiles.js           # Local profile CRUD
│   │   ├── supabaseClient.js     # Supabase client singleton
│   │   └── supabaseStorage.js    # Offline-first Supabase sync layer
│   └── __tests__/
│       ├── scoring.test.js       # 29 tests for scoring engine
│       └── sampling.test.js      # 8 tests for sampling plan
├── .env.example                  # Environment variable template
├── vercel.json                   # Vercel deployment config
├── vite.config.js                # Vite build config
└── package.json
```

---

## Architecture Patterns

### 1. Engines Are Pure Functions

All business logic lives in `engines/`. These are pure functions with no UI dependencies:

```js
// Input: raw zone data + building data
// Output: deterministic score object
scoreZone(zoneData, buildingData) → { tot, risk, rc, cats, zoneName }
```

This means:
- Engines can be tested without React
- Same engine serves both mobile and desktop
- Scoring logic is auditable (critical for IH defensibility)

### 2. Constants Are Immutable

All regulatory thresholds, question definitions, and standards live in `constants/`. The AI never sets these. They change only when standards are updated (e.g., ASHRAE 62.1 revision).

### 3. Component Composition Over Inheritance

No class components. No HOCs. All components are functions with hooks.

### 4. State Lives at the View Level

MobileApp and App.jsx each manage their own state. They share engines and constants but not state. This prevents mobile/desktop coupling.

---

## Dual-Experience Model

The app detects the device and renders a completely different UI:

```
App.jsx (entry point)
  ├── isDesktop? → Desktop experience (App.jsx continues)
  │   ├── LandingPage → Sidebar + scroll form wizard → ReportView
  │   └── Uses: cardStyle(dk), btn(primary, dk), glassmorphism
  │
  └── !isDesktop? → <MobileApp />
      ├── AuthScreen/ProfileScreen → Dashboard → Quick Start → Zones → Results
      └── Uses: one-question-at-a-time, haptic, milestones, tabs
```

### Why Two Experiences?

An IH standing in a mechanical room with a flashlight needs a fundamentally different interface than an IH reviewing reports at their desk. Same data, same engines, different interaction patterns.

### Detection: useMediaQuery.js

```js
isDesktop: width >= 1024 AND NOT standalone mode
isStandalone: display-mode: standalone (PWA from home screen)
```

PWA always gets mobile experience regardless of screen width.

---

## Question System

### Four Question Tiers

| Tier | Export | Used By | Purpose |
|---|---|---|---|
| `Q_PRESURVEY` | Desktop only | App.jsx | Full 30+ pre-survey (desktop scroll form) |
| `Q_BUILDING` | Desktop only | App.jsx | Full building assessment |
| `Q_QUICKSTART` | Mobile | MobileApp | 5-10 questions to start fast |
| `Q_ZONE` | Both | Both | Zone walkthrough (unchanged) |
| `Q_DETAILS` | Mobile | MobileApp | Supplementary data (fill anytime) |

### Question Schema

```js
{
  id: 'co2',              // Unique field ID
  sec: 'Measurements',     // Section grouping
  q: 'CO2 indoor?',       // Question text
  t: 'num',               // Type: text|num|ta|ch|multi|combo|sensors|date
  ic: '📏',               // Emoji icon
  req: 1,                 // Required flag
  sk: 1,                  // Skippable flag
  opts: ['A', 'B'],       // Options for ch/multi/combo
  ph: 'placeholder',      // Placeholder text
  u: 'ppm',               // Unit label for num
  ref: 'ASHRAE 62.1',     // Reference standard
  cond: { f: 'cx', eq: 'Yes' },  // Conditional display
  photo: 1,               // Show photo capture
  ac: 'street-address',   // HTML autocomplete hint
}
```

### Conditional Logic

Questions appear/hide based on previous answers:

```js
// Show only if complaints reported
cond: { f: 'cx', eq: 'Yes — complaints reported' }

// Hide if no water damage
cond: { f: 'wd', ne: 'None' }
```

---

## Scoring Engine

### 100-Point Scale (5 Categories)

| Category | Max Points | What It Scores |
|---|---|---|
| Ventilation | 25 | CO2 levels, airflow, damper status |
| Contaminants | 25 | PM2.5, CO, HCHO, TVOCs, mold, odors |
| HVAC | 20 | Maintenance, filters, airflow, drain pan |
| Complaints | 15 | Affected count, symptom patterns, clustering |
| Environment | 15 | Temperature, humidity, water damage |

### Composite Score

```
Composite = (Average × 0.6) + (Worst Zone × 0.4)
```

Worst-zone weighting prevents one bad area from hiding behind good averages.

### Risk Classification

| Score | Risk Level | Color |
|---|---|---|
| 85+ | Low Risk | #22D3EE (cyan) |
| 70-84 | Moderate | #FBBF24 (amber) |
| 50-69 | High Risk | #FB923C (orange) |
| <50 | Critical | #EF4444 (red) |

### OSHA Defensibility

Separate evaluation that flags citation-relevant conditions with confidence levels (High/Medium/Limited) based on data completeness.

---

## User Profiles & Auth

### Two Auth Modes

1. **Supabase configured** (`VITE_SUPABASE_URL` set):
   - Email/password authentication
   - Cloud-synced profiles
   - AuthScreen.jsx → ProfileScreen.jsx (first time)

2. **No Supabase** (local only):
   - ProfileScreen.jsx with local profile selection
   - Multiple profiles per device
   - Data stays in localStorage

### Profile Data

```js
{
  name: 'T. Tamakloe, CSP',
  certs: ['CSP', 'OSHA 30-Hour'],
  experience: '10-20 years',
  iaq_meter: 'TSI Q-Trak 7575',
  iaq_serial: 'QT-75-20419',
  iaq_cal_date: '2026-02-15',
  iaq_cal_status: 'Calibrated within manufacturer spec',
  pid_meter: 'RAE Systems MiniRAE 3000',
  pid_cal_status: 'Bump-tested and calibrated',
  other_instruments: 'FLIR C5 thermal camera, Delmhorst BD-2100',
}
```

Auto-fills assessor + instrument fields on every new assessment.

---

## Offline-First Storage

### Architecture

```
┌──────────────┐     ┌──────────────┐
│ localStorage │ ←── │  App reads/  │
│  (PRIMARY)   │     │  writes here │
└──────┬───────┘     └──────────────┘
       │
       │ sync when online
       ▼
┌──────────────┐
│   Supabase   │
│  (SYNC LAYER)│
└──────────────┘
```

### Key Principle

**Every write goes to localStorage first.** Supabase sync happens in the background. If it fails, changes are queued and retried when the connection returns.

### Sync Queue

```js
// Offline change → queued
await STO.set(SYNC_QUEUE_KEY, [
  { type: 'assessment', data: {...}, queuedAt: '...' },
  { type: 'profile', data: {...}, queuedAt: '...' },
])

// Connection returns → auto-process
window.addEventListener('online', () => {
  SupaStorage.processSyncQueue()
})
```

### Storage Keys

| Key Pattern | Content |
|---|---|
| `atmosiq-idx` | Index of all reports and drafts (lightweight metadata) |
| `atmosiq-profile` | Active user profile |
| `atmosiq-cached-session` | Cached auth session for offline access |
| `atmosiq-sync-queue` | Pending offline changes to sync |
| `atmosiq-visited` | First-visit flag |
| `draft-{timestamp}` | Draft assessment data |
| `rpt-{timestamp}` | Completed report data |

---

## Supabase Integration

### Database Tables

| Table | RLS | Purpose |
|---|---|---|
| `profiles` | Per-user | Assessor credentials + instruments |
| `assessments` | Per-user | Full assessment data (JSONB) |
| `assessment-photos` | Per-user folder | Storage bucket for photos |

### Row Level Security

Every table has RLS enabled. Policies ensure `auth.uid() = user_id` on all operations. Users can never see or modify other users' data.

### Schema Location

`supabase/schema.sql` — run in Supabase SQL Editor on project setup.

---

## API Proxy Pattern

The Anthropic API key never reaches the browser.

```
Browser → /api/narrative (Vercel serverless) → api.anthropic.com
                ↑
        ANTHROPIC_API_KEY in env
        (server-side only)
```

### Vercel Serverless Function

`api/narrative.js` receives `{ system, payload }` from the client, calls Anthropic, returns `{ narrative }`.

### Vercel Config

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

---

## PWA Configuration

### manifest.json

```json
{
  "name": "AtmosIQ Beta — Indoor Air Quality Intelligence",
  "short_name": "AtmosIQ Beta",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#22D3EE",
  "background_color": "#050507"
}
```

### Standalone Detection

`useMediaQuery.js` checks `display-mode: standalone` and `navigator.standalone` (iOS). When detected:
- Always renders MobileApp (never desktop)
- Skips landing page
- Mobile layout regardless of screen width

### Service Worker

`public/sw.js` — network-first with cache fallback. Caches app shell for offline access.

---

## Design System

### Mobile (MobileApp.jsx)

| Token | Value | Usage |
|---|---|---|
| BG | `#060609` | Page background |
| SURFACE | `#0C0C14` | Elevated surfaces |
| CARD | `#101018` | Card backgrounds |
| BORDER | `#1E1E2E` | Borders and dividers |
| ACCENT | `#22D3EE` | Primary action color |
| TEXT | `#F0F2F5` | Primary text (15:1 contrast) |
| SUB | `#9BA4B5` | Secondary text (5.5:1 — AA) |
| DIM | `#6B7280` | Tertiary text (4.6:1 — AA) |

Font: `Outfit` (body), `DM Mono` (data/labels)

### Desktop (styles/tokens.js)

Font: `Inter` (body), `DM Mono` (data)
Uses glassmorphism, backdrop blur, hover effects, transitions.

### Touch Targets

All interactive elements: **44pt minimum** (Apple HIG compliance).

---

## Testing Strategy

### Unit Tests (Vitest)

```
src/__tests__/
├── scoring.test.js    # 29 tests — scoreZone, compositeScore, evalOSHA, calcVent, genRecs
└── sampling.test.js   # 8 tests — sampling plan generation
```

### What's Tested

- Every scoring category (ventilation, contaminants, HVAC, complaints, environment)
- Risk classification thresholds
- OSHA defensibility flags
- Composite score weighting
- Ventilation calculations per ASHRAE 62.1
- Recommendation generation and deduplication
- Sampling plan triggers (mold, formaldehyde, CO, VOCs, sewer gas)
- Outdoor baseline gap detection

### Run Tests

```bash
npm test          # Single run
npm run test:watch  # Watch mode
```

---

## Deployment

### Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | Vercel env (server) | Narrative generation proxy |
| `VITE_SUPABASE_URL` | Vercel env (client) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Vercel env (client) | Supabase anon key |

### Deploy Steps

1. Push to `main` branch
2. Vercel auto-deploys
3. Set environment variables in Vercel dashboard
4. Run `supabase/schema.sql` in Supabase SQL Editor

---

## Replication Guide

### To build a new Prudence EHS module using this architecture:

1. **Fork the structure**: Copy the directory layout (engines/, constants/, components/, utils/, hooks/)

2. **Define your questions**: Create question arrays in `constants/questions.js` following the schema:
   ```js
   { id, sec, q, t, ic, opts, req, sk, cond, ph, u, ref, photo, ac }
   ```

3. **Build your scoring engine**: Pure functions in `engines/`. Input: raw data. Output: deterministic scores traceable to standards.

4. **Define your standards**: Hardcode thresholds in `constants/standards.js`. AI never sets these.

5. **Create your views**: MobileApp (one-at-a-time) + App.jsx (desktop scroll).

6. **Connect Supabase**: Copy `supabaseClient.js` and `supabaseStorage.js`. Modify schema for your tables.

7. **Add tests**: Vitest tests for every scoring function and recommendation generator.

8. **Deploy**: Same Vercel + Supabase pattern.

### Module Ideas (from PLAT_MODULES)

| Module | Status |
|---|---|
| AtmosIQ (IAQ) | Built |
| IEQ Report Gen | Planned |
| Asbestos Inspection | Planned |
| OSHA Inspection | Planned |
| Noise Survey | Planned |
| HazCom Pro | Planned |

Each module follows the same pattern: questions → engines → scoring → reporting.

---

## Data Protection & Contingencies

### Contingency Matrix

| Risk | Protection | Implementation |
|---|---|---|
| App crash (white screen) | Error Boundary | `ErrorBoundary.jsx` wraps entire app. Shows recovery UI + emergency backup download. Data in localStorage is unaffected by render errors. |
| Accidental deletion | Soft delete (30-day trash) | `Backup.softDelete()` moves to trash with expiration. `Backup.recover()` restores. Trash auto-purges after 30 days. |
| Phone loss / device failure | Supabase cloud sync | All data syncs to Supabase when online. New device → login → full sync. |
| No internet (field work) | Offline-first localStorage | All writes go to localStorage first. Supabase is sync layer, not dependency. Sync queue processes when connection returns. |
| localStorage cleared | Manual backup export | Dashboard "Backup" button downloads full JSON. Error Boundary also offers emergency backup. |
| localStorage corruption | Health check | `Backup.checkHealth()` validates index integrity and flags orphaned entries. |
| Supabase outage | localStorage continues | App works identically without cloud. Sync resumes when service returns. |
| Storage limit (~5MB) | Health check + warning | `Backup.checkHealth()` warns at 3MB, critical at 4MB. Recommends exporting old reports. |
| Sync conflict | Last-write-wins + queue | Offline changes queued with timestamps. When online, queue processes in order. |

### Error Boundary (`ErrorBoundary.jsx`)

Wraps the entire app at `main.jsx` level. On React render crash:
1. Shows "Something went wrong" with reassurance that data is safe
2. Offers "Reload App" button
3. Offers "Download Emergency Backup" — exports all localStorage data as JSON
4. Shows error details for debugging

### Backup System (`utils/backup.js`)

```js
// Export everything
await Backup.downloadBackup()    // Downloads JSON file

// Import from backup
await Backup.importBackup(json)  // Restores reports, drafts, profile

// Soft delete (30-day recovery)
await Backup.softDelete(id, name, type)
await Backup.recover(id)
await Backup.permanentDelete(id)

// Storage health
const { healthy, issues } = await Backup.checkHealth()
```

### Sync Status Indicator

Dashboard shows real-time sync status:
- Green dot: "Synced to cloud"
- Yellow dot: "Offline — will sync when connected"
- Gray dot: "Local storage only" (no Supabase configured)

### Trash System

- Deleted items recoverable for 30 days
- Accessible from Dashboard → Trash
- Shows deletion date and expiration date
- Auto-purges expired items on list load
- Permanent delete option available

### Replication Checklist for New Modules

Every new Prudence EHS module MUST include:

1. **ErrorBoundary** wrapping the root component
2. **Backup.exportAll()** / **Backup.downloadBackup()** on dashboard
3. **Soft delete** instead of permanent delete for user-facing data
4. **Sync status indicator** if using Supabase
5. **Offline-first writes** — localStorage first, cloud sync second
6. **Health check** for storage integrity
7. **Auto-save** during active data entry (1-2 second debounce)
8. **Trash view** with recovery and permanent delete options
