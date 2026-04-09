# Prudence EHS Intelligence Engine

A **reference-backed, deterministic EHS and IAQ reasoning platform** with citation-linked outputs. Built on OSHA, EPA, and ASHRAE standards with structured rule logic and controlled AI writing.

## What This Is

The Prudence EHS Intelligence Engine reviews EHS policies, procedures, programs, and guidance documents using:

- **Deterministic rule logic** — findings are produced by rule evaluation, not open-ended LLM guessing
- **Citation-linked outputs** — every finding traces back to an authoritative reference
- **Structured fact extraction** — document analysis produces normalized, auditable facts
- **Full traceability** — input → extracted facts → triggered rules → references → output

## What This Is NOT

This tool does **not**:

- Replace a CSP, CIH, or CHMM
- Guarantee compliance
- Give legal conclusions
- Certify a facility as compliant or noncompliant
- State that a facility is safe or unsafe

## Modules

### OSHA Program Reviewer
- Hazard Communication (29 CFR 1910.1200)
- Lockout/Tagout (29 CFR 1910.147)
- Emergency Action Plan (29 CFR 1910.38)
- Respiratory Protection (29 CFR 1910.134)

### IAQ / Ventilation Reviewer
- ASHRAE 62.1 — Nonresidential Ventilation / IAQ
- ASHRAE 62.2 — Residential Ventilation / IAQ
- ASHRAE 55 — Thermal Comfort
- ASHRAE 241 — Infectious Aerosol Control

### Output Engine
- Technical review
- Executive summary
- Worker-friendly explanation
- Supervisor-facing version
- Regulator-style formal version
- Redline / suggested language mode

### Expert Review Escalation Queue
- Flags uncertain cases, contradictory facts, high-risk findings, and engineering-heavy issues

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL via Prisma ORM
- **Document Parsing**: pdf-parse, mammoth (DOCX)
- **UI**: Radix UI primitives, Lucide icons

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Setup

```bash
# Navigate to the project
cd prudence-ehs-intelligence

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push

# Seed the database with references and rules
npm run db:seed

# Start development server
npm run dev
```

The app will be available at `http://localhost:3003`.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (for AI writing layer) |
| `NEXT_PUBLIC_APP_URL` | Application URL |

## Architecture

```
prudence-ehs-intelligence/
├── prisma/
│   ├── schema.prisma          # Database schema (15 models)
│   └── seed.ts                # Seed script for references and rules
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── page.tsx           # Dashboard
│   │   ├── reviews/           # Review workflow
│   │   ├── rules/             # Rule library
│   │   ├── references/        # Reference library
│   │   ├── escalations/       # Expert review queue
│   │   ├── settings/          # Administration
│   │   └── api/               # API routes
│   ├── components/
│   │   ├── ui/                # Reusable UI components
│   │   ├── layout/            # App shell, sidebar, top bar
│   │   └── findings/          # Finding cards, citation drawer
│   ├── lib/
│   │   ├── engine/            # Deterministic rule engine
│   │   │   ├── rule-engine.ts
│   │   │   ├── fact-extractor.ts
│   │   │   ├── finding-classifier.ts
│   │   │   ├── citation-linker.ts
│   │   │   └── reading-level.ts
│   │   ├── parsers/           # Document parsing (PDF, DOCX, TXT)
│   │   ├── types/             # TypeScript type definitions
│   │   └── db.ts              # Prisma client instance
│   └── data/
│       ├── references/        # Seed reference data
│       └── rules/             # Seed rule pack data
└── public/
```

## Finding Classifications

Every finding is classified as one of:

| Classification | Description |
|---|---|
| `regulatory_deficiency` | Required element missing per regulatory standard |
| `technical_benchmark_gap` | Gap relative to consensus standard benchmark |
| `best_practice_improvement` | Enhancement opportunity beyond minimum requirements |
| `unable_to_determine` | Insufficient evidence to classify |
| `expert_review_required` | Requires professional EHS judgment |

## Finding Severity

| Severity | Criteria |
|---|---|
| `critical` | Core control missing, serious hazard, high exposure potential |
| `high` | Required element absent, significant gap |
| `moderate` | Partial implementation, incomplete documentation |
| `low` | Minor gap, informational improvement |
| `informational` | Best practice suggestion, no immediate risk |

## Anti-Hallucination Guardrails

- No finding without evidence or a triggered rule
- No recommendation without at least one supporting reference
- No claim of compliance or legal noncompliance
- No invented citations or thresholds
- Missing evidence is stated explicitly
- Conflicting facts trigger expert escalation
- All outputs are traceable from input to finding

## License

Copyright (c) 2024 Prudence EHS. All rights reserved.
Contact: tsidi@prudenceehs.com
