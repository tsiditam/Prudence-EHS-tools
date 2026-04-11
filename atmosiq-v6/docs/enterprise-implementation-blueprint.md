# Enterprise Implementation Blueprint
## Prudence Safety & Environmental Consulting, LLC
## AtmosIQ · OSHAReady · HydroScan

**Version:** 1.0 | **Date:** April 11, 2026

---

## Executive Summary

This blueprint translates the MSA (Master Services Agreement) into actionable product features, admin workflows, and operational processes for the Prudence EHS SaaS platform. It covers 15 contract areas across three implementation phases.

**Current State:** 40% enterprise-ready. Strong billing/credit foundation, basic admin, and legal pages exist. Missing: account lifecycle enforcement, seat licensing, DPA, SLA, order forms, and termination workflows.

**Target State:** Full MSA alignment with enforceable platform controls, customer-facing contract workflows, and internal admin governance.

---

## 1. CONTRACT ACCEPTANCE

### Data Model
```
contract_acceptances {
  id uuid PK
  user_id uuid FK → auth.users
  org_id uuid FK → organizations (nullable)
  document_type text NOT NULL  -- 'msa', 'tos', 'privacy', 'dpa', 'order_form'
  document_version text NOT NULL  -- 'v1.0', 'v1.1'
  accepted_at timestamptz NOT NULL
  accepted_by_email text NOT NULL
  accepted_by_name text
  company_name text
  ip_address text
  user_agent text
  signer_role text  -- 'account_owner', 'billing_admin', 'authorized_signer'
}
```

### UX Flow
1. First login → "Review and accept our Terms of Service and Privacy Policy"
2. Enterprise customers → additional MSA + Order Form acceptance
3. Acceptance screen shows document with scroll-to-bottom, then checkbox + "I Accept"
4. Acceptance logged with timestamp, IP, user agent

### Microcopy
- Checkbox: "I have read and agree to the Terms of Service and Privacy Policy on behalf of my organization."
- Below: "Accepted by [name] on [date] at [time]. Acceptance ID: [uuid]."

---

## 2. ORDER FORM MANAGEMENT

### Data Model
```
order_forms {
  id uuid PK
  org_id uuid FK → organizations
  order_number text UNIQUE  -- 'OF-2026-001'
  customer_legal_name text NOT NULL
  customer_address text
  billing_contact_name text
  billing_contact_email text
  product text NOT NULL  -- 'atmosiq', 'oshaready', 'hydroscan'
  subscription_tier text NOT NULL  -- 'solo', 'pro', 'team', 'enterprise'
  authorized_users integer NOT NULL
  subscription_term_months integer NOT NULL DEFAULT 12
  start_date date NOT NULL
  end_date date NOT NULL
  monthly_fee_cents integer NOT NULL
  annual_fee_cents integer NOT NULL
  payment_terms text DEFAULT 'net-30'
  status text DEFAULT 'draft'  -- draft, sent, accepted, active, expired, terminated
  version text DEFAULT 'v1.0'
  created_at timestamptz DEFAULT now()
  accepted_at timestamptz
  accepted_by uuid FK → auth.users
}
```

### Phase: 2 (before 10+ enterprise customers)

---

## 3. SEAT MANAGEMENT

### Data Model Changes
```sql
ALTER TABLE organizations
  ADD COLUMN authorized_user_count integer NOT NULL DEFAULT 5,
  ADD COLUMN current_user_count integer NOT NULL DEFAULT 0;
```

### Backend Rules
- On member add: check `current_user_count < authorized_user_count`
- If at limit: return 402 "Seat limit reached. Contact billing to add seats."
- Admin dashboard: show "X/Y seats used" per org
- Overage: soft block (warning + prevent add), not hard lock

### RBAC Structure
| Role | Permissions |
|------|-------------|
| `owner` | Full org control, billing, member management, all features |
| `admin` | Member management, all features, no billing |
| `member` | Standard feature access, own data only |
| `billing_contact` | Invoice view, payment method, no feature access |
| `psec_admin` | Internal Prudence admin — full platform access |

### UI: Settings → Team → "5 of 10 seats used" + Add Member button

---

## 4. USE RESTRICTIONS

### In Legal Pages (not in-app controls):
- No sublicensing
- No service bureau use
- No reverse engineering
- No unlawful or privacy-violating use

### In-App Controls:
- **Rate limiting**: Max 100 API calls/minute per user, 1000/hour per org
- **Abuse monitoring**: Flag accounts with >10x normal usage
- **Session logging**: Track login times, IP addresses, feature usage
- **Account review triggers**: Unusual API volume, multiple failed logins, data scraping patterns

### Suspension Triggers:
1. Payment overdue >30 days
2. TOS violation detected
3. Abuse pattern flagged
4. Manual admin action

---

## 5. ACCOUNT LIFECYCLE

### Status Enum
```
account_status: 'trial' | 'active' | 'past_due' | 'suspended' | 'terminated' | 'non_renewing'
```

### State Transitions
```
trial → active (payment received)
trial → terminated (trial expired, no payment)
active → past_due (payment failed)
active → non_renewing (customer opted out of renewal)
past_due → suspended (30 days overdue)
past_due → active (payment received)
suspended → active (payment + reinstatement)
suspended → terminated (60 days, no resolution)
non_renewing → terminated (end of term)
terminated → [no return without new order form]
```

### Enforcement
- **active**: Full access
- **past_due**: Full access + amber banner "Payment overdue"
- **suspended**: Read-only access + red banner "Account suspended"
- **terminated**: No access + "Account terminated" screen with export link

### Suspension UI Copy
- Banner: "Your account has been suspended due to [reason]. Contact billing@prudenceehs.com to resolve."
- Export CTA: "Download your data before [date]"

---

## 6. BILLING & INVOICING

### Backend States
| State | Meaning | User Experience |
|-------|---------|----------------|
| `active` | Paid and current | Full access |
| `past_due` | Payment failed/overdue | Full access + warning |
| `suspended` | 30+ days overdue | Read-only |
| `canceled` | Customer canceled | Access until end of term |
| `terminated` | Account closed | No access, data export window |

### Invoice Table
```
invoices {
  id uuid PK
  org_id uuid FK
  invoice_number text UNIQUE
  amount_cents integer
  status text  -- 'draft', 'sent', 'paid', 'overdue', 'void'
  due_date date
  paid_date date
  stripe_invoice_id text
  pdf_url text
  created_at timestamptz
}
```

### Phase: 1 (MVP billing exists, needs invoice history UI)

---

## 7. AUTO-RENEWAL & NOTICES

### Renewal Schedule
| Days Before | Action | Channel |
|-------------|--------|---------|
| 90 | Internal CRM task: review account health | Internal |
| 75 | Email: "Your subscription renews in 75 days" | Email |
| 60 | Email: "Renewal reminder — update billing if needed" | Email |
| 30 | Email: "Final renewal notice — renews on [date]" | Email |
| 0 | Auto-renew (charge card) or suspend | System |

### Non-Renewal Flow
- Customer clicks "Cancel renewal" in Settings
- Status → `non_renewing`
- Confirmation email: "Your subscription will not renew on [date]. You retain access until then."
- 30 days before end: "Your access ends on [date]. Export your data."
- End of term: Status → `terminated`, 30-day data export window

### UI Copy (Settings)
- "Your subscription renews on [date]. To cancel, provide 30 days' notice."
- Button: "Manage Renewal" → options: "Continue" / "Cancel Renewal"

---

## 8. DATA OWNERSHIP

### Classification
| Data Type | Owner | Platform Rights |
|-----------|-------|----------------|
| Assessment data | Customer | Store, process, display, export |
| User profiles | Customer | Store, display |
| Scoring results | Platform IP applied to customer data | Customer can export results |
| Platform algorithms | Prudence EHS | Proprietary, not shared |
| Anonymized analytics | Prudence EHS | Aggregate insights, no PII |
| Customer feedback | Prudence EHS (license to use) | Product improvement |

### In-App Display (Settings → Data & Privacy)
- "Your assessment data belongs to you. Export it anytime."
- "atmosIQ's scoring methodology and algorithms are proprietary."
- "Anonymous usage analytics help us improve the platform."

---

## 9. DATA EXPORT & DELETION

### Export Formats
| Data Type | Formats |
|-----------|---------|
| Assessments | JSON, PDF (individual reports) |
| Profile | JSON |
| All data (bulk) | ZIP (JSON + PDFs) |
| Organization data | CSV (future) |

### Post-Termination Timeline
1. Day 0: Account terminated
2. Day 0-30: Data export available via "Download Your Data" link
3. Day 30: Warning email: "Data will be permanently deleted in 30 days"
4. Day 60: Data permanently deleted (cascade delete)
5. Exception: Legal hold — data retained if flagged

### Edge Cases
- **Unpaid account**: Export allowed, but new features blocked
- **Legal hold**: Admin flags account, deletion paused indefinitely
- **Partial export**: User can export individual assessments anytime
- **Reactivation**: If within 60-day window, data can be restored

---

## 10. SECURITY & PRIVACY

### Trust Page Content (website)
1. **Security Overview** — encryption, RLS, auth, infrastructure
2. **Privacy Policy** — data collection, usage, rights (exists)
3. **Data Processing Addendum** — GDPR/CCPA processor agreement (needed)
4. **Sub-processors** — Anthropic, Stripe, Supabase, Vercel
5. **Incident Response** — notification timeline, escalation
6. **Compliance** — SOC 2 Type II (future), GDPR, CCPA

### DPA Workflow
1. Enterprise customer requests DPA
2. Admin sends pre-signed DPA PDF
3. Customer countersigns and returns
4. Admin uploads to contract record
5. DPA version tracked in `contract_acceptances` table

---

## 11. SLA & STATUS

### SLA Tiers
| Tier | Uptime | Response Time | Service Credits |
|------|--------|--------------|-----------------|
| Standard | 99.5% | 24hr email | None |
| Pro | 99.9% | 8hr email | 5% per 0.1% below |
| Enterprise | 99.95% | 4hr email, 1hr critical | 10% per 0.1% below |

### Status Page (Phase 2)
- Public page at status.prudenceehs.com
- Components: AtmosIQ App, AtmosIQ API, Supabase, Anthropic
- Maintenance windows: announced 48hrs in advance

---

## 12. WARRANTY / DISCLAIMER

### Avoid These Phrases
| Bad | Better |
|-----|--------|
| "Guarantees compliance" | "Supports compliance documentation" |
| "OSHA-proof" | "Informed by recognized OSHA standards" |
| "Eliminates legal risk" | "Strengthens documentation defensibility" |
| "Certified assessment" | "Structured, standards-referenced assessment" |
| "AI-verified findings" | "AI-assisted narrative, professionally reviewed" |
| "100% accurate" | "Deterministic scoring against published thresholds" |

---

## 13. FEEDBACK COLLECTION

### In-App
- Settings → "Send Feedback" link
- Post-assessment: "How was this assessment?" (optional, 1-click)
- Beta features: "This feature is in preview. Your feedback helps improve it."

### Microcopy
- "Feedback you share may be used to improve atmosIQ. We never share your assessment data."

---

## 14. SUSPENSION / TERMINATION

### Operational States
| State | Can Login | Can View | Can Create | Can Export | Banner |
|-------|-----------|----------|------------|-----------|--------|
| Active | ✅ | ✅ | ✅ | ✅ | None |
| Past Due | ✅ | ✅ | ✅ | ✅ | Amber warning |
| Suspended | ✅ | ✅ | ❌ | ✅ | Red banner |
| Terminated | ❌ | ❌ | ❌ | 30-day link | Login blocked |

---

## 15. PHASED IMPLEMENTATION ROADMAP

### Phase 1: Must-Have (Before Enterprise Sales) — 2-3 weeks
- [ ] Account lifecycle enforcement (active/past_due/suspended/terminated)
- [ ] Seat count enforcement on org member add
- [ ] Suspension banner + read-only mode
- [ ] Data export on termination (30-day window)
- [ ] Contract acceptance tracking table
- [ ] DPA template (PDF, not in-app — send manually)
- [ ] Warranty/disclaimer audit of all marketing copy

### Phase 2: Should-Have (Before 10+ Enterprise Customers) — 4-6 weeks
- [ ] Order Form module (generate, send, track acceptance)
- [ ] Invoice history UI in Settings
- [ ] Auto-renewal notices (email sequence)
- [ ] Non-renewal / cancellation workflow
- [ ] Status page (status.prudenceehs.com)
- [ ] CSV/XLSX bulk data export
- [ ] SLA addendum template

### Phase 3: Enterprise Polish (Post-Launch) — ongoing
- [ ] E-sign integration for MSA/Order Forms (DocuSign/PandaDoc)
- [ ] SOC 2 Type II preparation
- [ ] Custom SLA tiers per customer
- [ ] Multi-product licensing (AtmosIQ + OSHAReady bundle)
- [ ] White-label report templates
- [ ] API access for enterprise integrations
- [ ] Audit log viewer for compliance officers

---

## Risks & Gaps

1. **No DPA exists** — enterprise customers (especially healthcare, government) will require one before signing
2. **No SLA commitment** — risky to promise uptime without monitoring infrastructure
3. **Suspension enforcement is soft** — `subscription_status` is just a string, not enforced in API middleware
4. **Single-product billing** — no cross-product bundling yet
5. **No e-sign** — contract acceptance is click-to-accept only, not legally robust for large deals

## Next Steps

1. Implement Phase 1 account lifecycle enforcement
2. Draft DPA template with counsel
3. Set up status page
4. Build seat enforcement
5. Create Order Form template
