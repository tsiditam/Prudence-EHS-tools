/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 *
 * AtmosFlow FAQ — single source of truth, rendered on two surfaces:
 *   • public landing page (LandingPage.jsx)
 *   • in-app help view (MobileApp.jsx → SettingsScreen → "Help & FAQ")
 *
 * Scoring/risk-band/mold copy is verified against engine code (see
 * src/engines/scoring.js and src/engines/riskBands.js). When the engine
 * changes, this file must be re-verified — never invent capabilities or
 * thresholds the engine doesn't actually compute. The engine is sacred.
 */

export const FAQ_SECTIONS = [
  {
    title: 'General',
    items: [
      {
        q: 'What is AtmosFlow?',
        a: 'AtmosFlow is a structured indoor air quality (IAQ) assessment platform built for industrial hygienists, EHS professionals, and IAQ consultants. It captures field walkthrough data, scores findings against published standards, and produces a report-ready deliverable before you leave the building.',
      },
      {
        q: 'Is AtmosFlow only for Certified Industrial Hygienists?',
        a: 'No. AtmosFlow is designed for the broader EHS community — CIHs, IH consultants, CSPs, EHS managers, and IAQ investigators. It assumes professional context but does not gate features by credential.',
      },
      {
        q: 'Does AtmosFlow replace an industrial hygienist?',
        a: 'No. AtmosFlow is screening-only. It surfaces risk indicators, identifies data gaps, and produces sampling plans, but a qualified professional must interpret findings, sign reports, and make any compliance or causation determinations. AtmosFlow is positioned as a tool for professionals, not a substitute for them.',
      },
      {
        q: 'What does AtmosFlow cost?',
        a: 'AtmosFlow is currently free during the closed beta. Pricing tiers will be announced before the beta ends; existing beta users will receive advance notice and continuity options.',
      },
    ],
  },
  {
    title: 'Methodology and Standards',
    items: [
      {
        q: 'Which standards does AtmosFlow reference?',
        a: 'The methodology references ASHRAE 62.1 (ventilation), ASHRAE 55 (thermal comfort), OSHA PELs, NIOSH RELs, EPA NAAQS, WHO air quality guidelines, and AIHA guidance. For data center work, the engine also references ANSI/ISA 71.04, ISO 14644-1, ASHRAE TC 9.9, IEEE 1635, and NFPA 855.',
      },
      {
        q: 'Is AtmosFlow certified by ASHRAE, OSHA, or any standards body?',
        a: 'No. AtmosFlow is informed by these standards, not certified by them. The platform applies threshold values from published documents to deterministic scoring rules; it does not represent endorsement by any standards-development organization.',
      },
      {
        q: 'How often are the standards updated?',
        a: 'The standards manifest is versioned and dated. Updates ship with each app release. The current manifest version and engine version are visible in Settings → About.',
      },
      {
        q: 'Why does AtmosFlow flag CO₂ when ASHRAE 62.1 doesn\'t set a CO₂ limit?',
        a: 'ASHRAE 62.1 is a ventilation standard — it specifies outdoor air rates per occupant, not contaminant limits. AtmosFlow uses the indoor-outdoor CO₂ differential as a ventilation surrogate (per Persily 2021), which is the correct application of CO₂ data. The platform does not present CO₂ as a regulatory contaminant limit.',
      },
    ],
  },
  {
    title: 'Workflow',
    items: [
      {
        q: 'How long does an assessment take?',
        a: 'A typical single-zone walkthrough captures in 10–20 minutes of field time. Multi-zone assessments scale linearly. The structured workflow eliminates after-hours report assembly, which is where industry-typical IAQ investigations spend most of their hours.',
      },
      {
        q: 'Does AtmosFlow work offline?',
        a: 'Yes. AtmosFlow is a Progressive Web App (PWA) that installs to your phone\'s home screen and runs offline. Field data is captured locally; cloud sync resumes when connectivity returns.',
      },
      {
        q: 'What does a walkthrough capture?',
        a: 'Pre-survey context (building type, complaint history, calibration records), HVAC equipment inventory, zone-by-zone observations (instrument readings, photos, occupancy notes), and optional details (floor plans, sampling notes). The workflow is one question at a time and auto-saves continuously.',
      },
      {
        q: 'Can I edit a finalized report?',
        a: 'Finalized reports are immutable to preserve a defensible audit trail. To revise findings, open the assessment as a new draft, make changes, and finalize as a new version. Post-finalization versioning with explicit revision tracking is on the roadmap.',
      },
    ],
  },
  {
    title: 'Scoring and Confidence',
    items: [
      {
        q: 'How does AtmosFlow score an assessment?',
        a: 'AtmosFlow uses a 100-point deterministic scoring model across five categories:\n\n• Ventilation adequacy — 25 points\n• Contaminant exposure risk — 25 points\n• HVAC condition and maintenance — 20 points\n• Occupant complaints and symptoms — 15 points\n• Environmental conditions — 15 points\n\nEach category has its own deterministic deduction rules tied to specific observations, measurements, and reference standards. Identical inputs produce identical outputs.',
      },
      {
        q: 'How is the building composite score calculated?',
        a: 'When multiple zones are assessed, AtmosFlow uses a worst-zone-override approach to prevent severe deficiencies from being averaged away.\n\nIf any zone scores in the Critical band (below 40), the composite equals the worst zone\'s score.\n\nOtherwise, the composite is a priority-weighted mean of zone scores, weighted by occupancy type. Critical infrastructure zones (data halls, battery rooms) carry higher weight; mechanical-only spaces carry less. Standard office and default zones are unweighted.\n\nThis ensures a high-risk zone cannot be hidden by better-performing areas.',
      },
      {
        q: 'What do the risk classifications mean?',
        a: 'AtmosFlow classifies composite scores as:\n\n• 80–100 — Low Risk\n• 60–79 — Moderate\n• 40–59 — High Risk\n• Below 40 — Critical (requires immediate professional review)\n\nThese bands support professional interpretation; they do not replace it.',
      },
      {
        q: 'What is "measurement confidence"?',
        a: 'Every finding carries a confidence level reflecting how complete the underlying data is. Missing photos, missing calibration records, or instruments outside the accuracy database degrade confidence. Findings derived from uncalibrated or out-of-database instruments propagate a "qualitative-only" flag through every rendered output.',
      },
      {
        q: 'Is the scoring deterministic or AI-driven?',
        a: 'Scoring is fully deterministic. Identical inputs produce identical outputs. No AI is involved in the score, the risk classification, or the recommendation severity. AI is used only for narrative drafting, and that output is clearly labeled "IH Review Required."',
      },
    ],
  },
  {
    title: 'Mold, Moisture, and Bioaerosols',
    items: [
      {
        q: 'Does AtmosFlow assess mold?',
        a: 'AtmosFlow surfaces mold and moisture findings as a separate parallel-panel finding with IICRC S520 condition framing (Condition 1 / 2 / 3). Microbial assessment requires its own response framework — area-based response tiers, professional condition determination, and remediation referral — that the platform supports through structured questions and qualified-professional referral language.',
      },
      {
        q: 'Does mold affect the numeric IAQ score?',
        a: 'Yes — partially. Mold and moisture findings deduct points from the Contaminants category (which has a 25-point maximum), so they do influence the composite score. AtmosFlow also surfaces mold as a separate parallel-panel finding with its own IICRC S520 condition framing, because microbial assessment requires its own response framework that a numeric deduction alone cannot capture.',
      },
      {
        q: 'Does AtmosFlow interpret spore counts?',
        a: 'No. Per IOM (2004) and ACMT (2025), spore counts are not direct evidence of health effects. AtmosFlow captures sampling results for documentation but does not present spore counts as health proof or as a basis for medical conclusions.',
      },
    ],
  },
  {
    title: 'Reports and Documentation',
    items: [
      {
        q: 'What does an AtmosFlow report contain?',
        a: 'A finalized report includes a transmittal letter, scope and limitations, methodology, zone-by-zone findings with photos, the deterministic score breakdown, tiered recommendations (Immediate / Short-Term / Long-Term), a sampling plan when warranted, ventilation analysis, and an appendix of cited standards (only standards actually referenced in the body — no automated standards dump).',
      },
      {
        q: 'In what format are reports produced?',
        a: 'Reports export as Microsoft Word (DOCX) for professional editing and as PDF for distribution. The DOCX preserves heading styles for further customization.',
      },
      {
        q: 'Can I add my company logo and branding?',
        a: 'Logo and branding customization is on the roadmap. Today, reports use the AtmosFlow neutral template with assessor name, credentials, and contact information populated from your profile.',
      },
      {
        q: 'How are recommendations prioritized?',
        a: 'Every recommendation carries a tier (Immediate / Short-Term / Long-Term) and is scoped to a specific zone, system, or building-wide action. Immediate-priority items must populate at least one location field (zone ID, system, surface or asset, or free text) so the recommendation is actionable, not abstract.',
      },
    ],
  },
  {
    title: 'AI and Automation',
    items: [
      {
        q: 'Is AtmosFlow an "AI tool"?',
        a: 'No. AtmosFlow is a deterministic scoring and reporting platform with optional AI-assisted narrative drafting. The score, the risk classification, the recommendations, the sampling plan, and the causal chains are all generated by deterministic engines — not AI.',
      },
      {
        q: 'What does the AI actually do?',
        a: 'AI is used to draft professional narrative text from the deterministic engine\'s output. The AI describes what the engine found; it does not invent findings, change scores, or add recommendations. AI-generated narrative is labeled "IH Review Required" and the qualified professional signs the report, not the AI.',
      },
      {
        q: 'Can the AI add findings the engine didn\'t identify?',
        a: 'No. The narrative renderer is constrained to describe the engine\'s structured output. Any finding in the narrative must trace to a deterministic engine output. This is enforced architecturally.',
      },
    ],
  },
  {
    title: 'Limitations',
    items: [
      {
        q: 'What can AtmosFlow not determine?',
        a: 'AtmosFlow does not make compliance determinations, regulatory classifications, definitive causation calls, or medical conclusions. It does not diagnose sick building syndrome, building-related illness, or specific health effects. Those determinations require licensed-professional sign-off based on the screening output.',
      },
      {
        q: 'Does AtmosFlow diagnose sick building syndrome?',
        a: 'No. SBS is a clinical and industrial-hygiene determination requiring qualified-professional review of occupant symptoms, exposure characterization, and medical context. AtmosFlow surfaces relevant indicators but does not make the diagnosis.',
      },
      {
        q: 'What if my instrument isn\'t in the accuracy database?',
        a: 'Findings derived from instruments not in the accuracy database inherit a qualitative-only flag that propagates to every rendered output. The report makes the qualitative-only basis explicit so reviewers and clients understand the documentation\'s evidentiary weight.',
      },
      {
        q: 'What happens if my instrument calibration is stale?',
        a: 'AtmosFlow tracks calibration recency on registered instruments and surfaces a warning before expiry. The finalization gate blocks report generation when a required instrument\'s calibration is past its validity window. This is a deliberate defensibility primitive — calibration gating is a litigation defense and is not bypassable from the UI.',
      },
    ],
  },
  {
    title: 'Business and Product',
    items: [
      {
        q: 'Who builds AtmosFlow?',
        a: 'AtmosFlow is built by Prudence Safety & Environmental Consulting, LLC (PSEC). The platform is designed by a Certified Safety Professional (CSP, BCSP) actively practicing in EHS — not by a software team modeling what they imagine field work to be.',
      },
      {
        q: 'How is my data handled?',
        a: 'Field data is captured locally on your device and synced to a secure cloud backend (Supabase + Postgres) tied to your account. Personally identifiable information is scrubbed before any error telemetry leaves the device. See the Privacy Policy for full detail.',
      },
      {
        q: 'Can I delete my account and data?',
        a: 'Yes. Settings → Danger Zone → Delete Account permanently removes all assessments, reports, and profile data tied to your account. This action cannot be undone.',
      },
      {
        q: 'How do I contact support?',
        a: 'Email support@prudenceehs.com or call 1-(301)-541-8362. We aim to respond to support requests within one business day.',
      },
    ],
  },
]
