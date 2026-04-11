# Atmosflow Technical Report Authoring Engine

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  UPSTREAM ENGINES                    │
│  (Source of Truth — NEVER modified by report layer)  │
├─────────────┬──────────┬──────────┬─────────────────┤
│  Scoring    │  Causal  │ Sampling │ OSHA Defensib.  │
│  Engine     │  Chain   │ Engine   │ Engine          │
│             │  Engine  │          │                 │
│  scoreZone  │ buildCC  │ genSP    │ evalOSHA       │
│  composite  │          │          │                 │
│  genRecs    │          │          │                 │
└──────┬──────┴────┬─────┴────┬─────┴────┬────────────┘
       │           │          │          │
       ▼           ▼          ▼          ▼
┌─────────────────────────────────────────────────────┐
│              PAYLOAD BUILDER                         │
│  buildReportPayload() → canonical ReportPayload      │
│  Single structured JSON — the ONLY input downstream  │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│            SECTION-WRITING MODULES                   │
│                                                      │
│  Deterministic:          AI-Assisted:                │
│  ├─ Cover Page           ├─ Executive Summary        │
│  ├─ Scope & Method       ├─ Building Context         │
│  ├─ Findings Dashboard   ├─ Zone Interpretation (×N) │
│  ├─ Recommendations      ├─ Causal Analysis          │
│  ├─ Sampling Plan        └──────────────────────     │
│  ├─ Limitations                                      │
│  └─ Appendices                                       │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│              QA LAYER                                │
│                                                      │
│  9 rules applied to every section:                   │
│  ├─ No hallucinated measurements                     │
│  ├─ No invented standards                            │
│  ├─ No unsupported causation                         │
│  ├─ Restrained tone check                            │
│  ├─ Minimum length                                   │
│  ├─ No placeholder text                              │
│  ├─ Score matches payload                            │
│  ├─ No excessive repetition                          │
│  └─ No weak language                                 │
│                                                      │
│  Pass → render | Fail → rewrite (max 1 retry)        │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│         LOCKED TEMPLATE RENDERER                     │
│                                                      │
│  Fixed section order (11 sections)                   │
│  Fixed heading hierarchy                             │
│  Fixed table structure                               │
│  Deterministic chart placement                       │
│  Print-ready HTML → PDF via browser print            │
│                                                      │
│  AI CANNOT change document architecture              │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
src/report-engine/
├── README.md                    # This file
├── types/
│   └── reportPayload.ts        # TypeScript interfaces for all types
├── orchestration/
│   └── reportOrchestrator.js   # Main pipeline: payload → sections → QA → render
├── modules/
│   └── sectionSpecs.js         # Specs + prompt templates for each section
├── qa/
│   └── qaRules.js              # 9 QA rules + runQA() function
└── templates/
    └── templateMap.js          # Fixed section order, typography, pagination
```

## Implementation Phases

### Phase 1: Payload Builder (Week 1)
- Build `buildReportPayload()` that transforms engine outputs into canonical JSON
- Unit test against demo data
- No disruption to existing product

### Phase 2: Section Modules (Week 2-3)
- Implement deterministic sections first (cover, scope, tables)
- Then AI-assisted sections (exec summary, zone interpretation)
- Each module is isolated and testable

### Phase 3: QA Layer (Week 3)
- Wire QA rules into orchestrator
- Test with intentionally bad content
- Tune thresholds

### Phase 4: Template Renderer (Week 4)
- Replace current PrintReport.jsx with template-driven renderer
- Maintain backward compatibility (fallback to old renderer)
- Test print/PDF output

### Phase 5: End-to-End (Week 5)
- Wire orchestrator into MobileApp "Export PDF" flow
- Add "Report Status" indicator (draft/review/final)
- Test full pipeline

## Key Principles

1. **Upstream engines are the source of truth** — report layer never recalculates
2. **AI writes prose, not data** — measurements, scores, and findings come from payload only
3. **QA catches hallucination** — every AI section is validated before render
4. **Template is locked** — AI cannot change section order, headings, or structure
5. **Sections are modular** — each can be developed, tested, and deployed independently
