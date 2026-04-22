# AtmosFlow White Paper — Product Architecture

## Technology Stack

- **Frontend:** React 18 single-page application, Vite build system
- **Hosting:** Vercel (serverless deployment with API routes)
- **Database:** Supabase (PostgreSQL with row-level security)
- **Auth:** Supabase Auth (email/password)
- **Payments:** Stripe (checkout sessions + webhooks)
- **AI:** Anthropic Claude API (narrative generation only — scoring is deterministic)
- **Offline:** Progressive Web App (PWA) with service worker, localStorage primary storage

## Dual-Mode Architecture

AtmosFlow operates in two modes, selectable at first login:

### IH Mode (Industrial Hygienist)
- Full instrument discipline (make/model, serial, calibration date required)
- Professional question flow with ASHRAE, OSHA, NIOSH, EPA thresholds
- Ventilation hierarchy: cfm/person → ACH → CO₂
- TVOC gated behind PID instrument context (lamp energy, calibration gas)
- Consulting-grade 12-section report with scoring appendix
- Designed for CIHs, CSPs, and EHS professionals

### FM Mode (Facility Manager)
- Device tier selector (smartphone → consumer → prosumer → professional)
- Simplified question flow using plain language
- Complaint log with controlled symptom vocabulary
- Intervention tracker with pre/post measurement pairing
- Multi-property portfolio dashboard
- Dual-layer report: plain-language summary + technical appendix
- Escalation decision tree with 19 rules (7 qualitative, 5 construction, 7 measurement-based)

Both modes use the same scoring engine. Same inputs produce same outputs. Assessments created in one mode can be opened in the other without data loss.

## Assessment Workflow

### 1. Pre-Survey (building context)
Assessor identity, instrument registration, calibration status, assessment reason, complaint history, building characteristics, HVAC system type, moisture history.

### 2. Zone-by-Zone Walkthrough
One question at a time (Typeform-style flow). Each zone captures:
- Space use, area, occupancy
- Complaints, symptoms, clustering patterns
- Environmental observations (temperature, humidity, odor, water damage, mold)
- HVAC observations (airflow, filter condition, damper status)
- Instrument readings (CO₂, temperature, RH, PM2.5, CO, TVOCs, formaldehyde)
- Photo documentation with timestamps

### 3. Scoring
Deterministic engine evaluates all zone data against 5 categories:
- Ventilation (25 points)
- Contaminants (25 points)
- HVAC (20 points)
- Complaints (15 points)
- Environment (15 points)

### 4. Analysis
- Composite score with AIHA worst-zone override
- Causal pathway hypothesis generation
- Sampling plan recommendations
- Tiered action recommendations (immediate, engineering, administrative, monitoring)
- OSHA-relevant conditions review
- Measurement confidence assessment
- IICRC S520 mold condition classification (parallel to composite)

### 5. Report Generation
- PDF (HTML download) or DOCX (Microsoft Word)
- Photo selection modal before export
- 12-section consulting-grade report structure
- FM mode: dual-layer with plain-language summary + technical appendix

## Data Architecture

### Storage Model
- **Primary:** localStorage (offline-first)
- **Sync:** Supabase when online (row-level security per user)
- **Auto-save:** every field change triggers a debounced save
- **Draft/Report separation:** drafts are in-progress; reports are finalized assessments with scores

### Standards Manifest
Every assessment embeds a frozen snapshot of the standards versions applied at scoring time. Loading a legacy assessment displays its original manifest, not the current one. This ensures audit traceability when standards are updated.

```
STANDARDS_MANIFEST = {
  'ASHRAE 62.1': '2022',
  'ASHRAE 55': '2023',
  'OSHA Z-1 PELs': '29 CFR 1910.1000 (current)',
  'WHO Air Quality Guidelines': '2021',
  'IICRC S520': '2024',
  'NIOSH Pocket Guide RELs': 'current',
  'EPA NAAQS': '2024',
  engineVersion: '2.3'
}
```

## Credit System

- Solo: $149/month (50 credits)
- Pro: $349/month (200 credits)
- Team: $799/month (500 credits)
- Credits consumed on: completed assessments, AI narrative generation
- Free during beta: 5 credits on signup
- Unused credits roll over while subscription is active

## Security

- Supabase row-level security (users access only their own data)
- Service role key never exposed to frontend
- Stripe handles all payment processing (no card data stored)
- Assessment data encrypted at rest via Supabase
- ToS and Privacy Policy gate before first use
