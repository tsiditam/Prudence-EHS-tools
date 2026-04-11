# AtmosFlow Analytics Instrumentation Plan

**Version:** 1.0
**Date:** April 2026
**North Star Metric:** Monthly Report-Ready Assessments per Organization

---

## Event Taxonomy

### Acquisition & Activation

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `signup_started` | User begins registration | `method` | No |
| `signup_completed` | Registration succeeds | `method` | No |
| `login_completed` | Auth session established | — | No |
| `profile_created` | First profile saved | `has_certs`, `cert_count`, `has_experience`, `has_firm`, `has_iaq_meter`, `has_pid_meter` | No |
| `profile_updated` | Existing profile edited | Same as above | No |

### Assessment Lifecycle

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `assessment_mode_selected` | User picks new/demo | `mode` (new, demo) | No |
| `assessment_created` | New assessment initialized | — | No |
| `quickstart_completed` | Building info phase done | `facility` (name only), `building_type` | Low |
| `zone_added` | Additional zone created | `zone_index` | No |
| `details_completed` | Optional details finished | `facility` | Low |
| `score_generated` | Scoring engine runs | `composite`, `avg`, `worst`, `risk`, `osha_flag`, `confidence`, `data_gaps` | No |
| `assessment_completed` | Full assessment saved | `zones`, `score`, `facility`, `has_causal_chains`, `sampling_recommendations` | Low |

### Report & Export

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `report_viewed` | User opens saved report | `report_id`, `facility`, `score` | Low |
| `narrative_requested` | User requests AI narrative | `facility`, `score` | Low |
| `narrative_generated` | AI narrative returned | `word_count` | No |
| `report_exported` | PDF export triggered | `facility`, `score`, `zones`, `has_narrative` | Low |

### Draft Management

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `draft_saved` | Auto-save fires (1.2s debounce) | `draft_id`, `phase`, `zones` | No |
| `draft_resumed` | User resumes draft | `draft_id`, `facility` | Low |

### Calibration & Instruments

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `calibration_date_entered` | Cal data saved with profile | `instrument` (iaq/pid), `meter` (model name), `status` | No |

### Navigation

| Event | Trigger | Properties | Sensitive? |
|-------|---------|-----------|-----------|
| `page_view` | Bottom nav tab change | `tab` | No |

---

## User Properties (Future — when org accounts ship)

| Property | Type | Source | Example |
|----------|------|--------|---------|
| `role` | string | Profile | CIH, CSP, IH Consultant |
| `organization_id` | uuid | Org account | — |
| `plan_type` | string | Billing | free, pro, team, enterprise |
| `signup_source` | string | UTM/referral | organic, referral, conference |
| `industry` | string | Org profile | consulting, manufacturing, healthcare |
| `company_size` | string | Org profile | 1-10, 11-50, 51-200, 200+ |

## Organization Properties (Future)

| Property | Type | Source |
|----------|------|--------|
| `org_type` | string | consulting, enterprise, government |
| `seat_count` | int | Billing |
| `template_count` | int | Template library |
| `first_paid_date` | date | Billing |

---

## North Star Metric

**Monthly Report-Ready Assessments per Organization**

Definition: An assessment is "report-ready" when:
1. `assessment_completed` event fires
2. Score is generated (`score_generated`)
3. At least 1 zone with measurements exists

Query:
```sql
SELECT
  DATE_TRUNC('month', created_at) AS month,
  COUNT(DISTINCT id) AS report_ready_assessments
FROM analytics_events
WHERE event_type = 'assessment_completed'
  AND (event_data->>'score')::int IS NOT NULL
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Dashboard Definitions

### 1. Growth Dashboard
- Signups per week (`signup_completed`)
- Profile completions per week (`profile_created`)
- New assessments per week (`assessment_created`)
- Demo usage (`assessment_mode_selected` where mode=demo)

### 2. Activation Dashboard
- Signup → profile created rate
- Profile created → first assessment rate
- First assessment → first report export rate
- Time from signup to first report export

### 3. Retention Dashboard
- Weekly active assessors (users with `assessment_created` in trailing 7d)
- Monthly active assessors
- Assessments per user per month
- Return rate (users with 2+ assessments in 30 days)

### 4. Product Value Dashboard
- Assessments completed per week
- Average score distribution (histogram from `score_generated.composite`)
- OSHA flags per assessment (from `score_generated.osha_flag`)
- Data gaps per assessment (from `score_generated.data_gaps`)
- Report exports per assessment (report_exported / assessment_completed)
- Narrative generation rate (narrative_generated / assessment_completed)

### 5. Positioning Intelligence
- Instrument mix (most common IAQ meters from `calibration_date_entered.meter`)
- Certification distribution (from `profile_created.cert_count`)
- Building types assessed (from `quickstart_completed.building_type`)
- Assessment complexity (zones per assessment from `assessment_completed.zones`)

---

## Data Governance

### What we track
- Product behavior: which features are used, workflow completion rates
- Workflow state: phase transitions, draft/completion counts
- Scoring output: composite scores, risk levels, data gap counts
- Instrument metadata: meter model names, calibration status

### What we do NOT track
- Assessment content: no measurement values, no observation text, no complaint details
- Client information: no building addresses, no occupant names, no company details
- Document content: no narrative text content, no report body text
- Photos: no image data in analytics events
- PII: no email addresses, no phone numbers in event data

### Facility name handling
- `facility` property contains only the building name entered by the assessor
- This is used for draft/report identification only
- Considered "Low" sensitivity — acceptable for product analytics
- Can be hashed if stricter governance is needed

### Retention
- Analytics events stored indefinitely in anonymized form
- Session IDs reset on app close (sessionStorage)
- User can request deletion via info@prudencesafety.com

---

## Acceptance Tests

1. **Signup flow**: Create account → verify `signup_started` and `signup_completed` events in `analytics_events` table
2. **Profile setup**: Complete profile with instruments → verify `profile_created` and `calibration_date_entered` events
3. **Assessment lifecycle**: Start → quickstart → zone → complete → verify `assessment_created`, `quickstart_completed`, `score_generated`, `assessment_completed` in sequence
4. **Report export**: Export PDF → verify `report_exported` event with correct zone count
5. **Draft cycle**: Start assessment, leave mid-zone → verify `draft_saved` events; resume → verify `draft_resumed`
6. **Demo mode**: Run demo → verify `assessment_mode_selected` with mode=demo
7. **Navigation**: Tap each bottom nav tab → verify `page_view` events with correct tab IDs
8. **No sensitive data**: Query all events → confirm no measurement values, addresses, or complaint text in event_data
9. **Silent failure**: Disable Supabase → confirm app functions normally with no errors (analytics fails silently)
