# AtmosFlow Report Schema

## Report Object Structure

Every generated report MUST contain these top-level fields:

```
{
  meta: {
    reportId:       string    // "RPT-XXXXXX" unique identifier
    reportVersion:  string    // "1.0" — increments on revision
    reportStatus:   enum      // "draft" | "reviewed" | "final"
    generatedAt:    ISO8601   // timestamp of generation
    platformVersion: string   // "6.0.0"
    assessmentDate: string    // long-form date of site visit
    reportDate:     string    // long-form date of report generation
    reviewerName:   string|null  // null until reviewed
    reviewerSignoff: ISO8601|null
    distributionControl: string  // "Confidential — For client use only"
  },

  facility: {
    name:     string
    address:  string
    type:     string    // office, healthcare, etc.
    building: object    // raw building survey data
  },

  assessor: {
    name:         string
    credentials:  string[]
    instrument:   string
    serial:       string
    calibration:  string
    pidMeter:     string|null
    pidCal:       string|null
  },

  context: {
    reason:             string
    complaintNarrative: string
    waterHistory:       string
    priorAssessments:   string
  },

  scoring: {
    zones: ZoneScore[]    // per-zone scoring with findings
    composite: {
      tot: number         // 0-100
      avg: number
      worst: number
      count: number
      risk: string        // "Low Risk" | "Moderate" | "High Risk" | "Critical"
    },
    osha: {
      flag: boolean
      fl: string[]        // OSHA-relevant condition descriptions
      conf: string        // "High" | "Medium" | "Limited"
      gaps: string[]      // data gap descriptions
    }
  },

  zoneData: ZoneData[]    // raw zone survey responses

  analysis: {
    causalChains:   CausalChain[]
    samplingPlan:   { plan: SampleRec[], outdoorGaps: string[] }
    recommendations: { imm: string[], eng: string[], adm: string[], mon: string[] }
  },

  narrative: string|null,  // AI-generated narrative (requires review flag)

  photos: {               // keyed by "z{zoneIndex}-{fieldId}"
    [key: string]: { src: string, ts: string }[]
  }
}
```

## Section Order (12 sections)

| # | Section ID | Title | Required |
|---|-----------|-------|----------|
| 1 | cover | Cover Page | Yes |
| 2 | exec-summary | Executive Summary | Yes |
| 3 | scope-methods | Assessment Scope and Methods | Yes |
| 4 | benchmarks | Standards, Guidelines, and Benchmark Types | Yes |
| 5 | building-context | Building and Complaint Context | Yes |
| 6 | zone-results | Zone-by-Zone Results | Yes |
| 7 | pathways | Potential IAQ Pathways Requiring Follow-Up | Conditional |
| 8 | follow-up | Recommended Follow-Up Actions | Yes |
| 9 | sampling | Recommended Sampling Plan | Conditional |
| 10 | limitations | Limitations and Professional Judgment | Yes |
| 11 | appendix-a | Appendix A — Raw Measurement Data | Yes |
| 12 | appendix-b | Appendix B — Scoring Methodology | Yes |

## ZoneScore Shape

```
{
  zoneName: string,
  tot: number,
  risk: string,
  cats: [{
    l: string,        // category label
    s: number,        // score achieved
    mx: number,       // maximum possible
    r: [{             // findings array
      t: string,      // finding text
      sev: string,    // critical | high | medium | low | pass
      std: string,    // reference standard
      basis: string,  // NEW: "measurement" | "observation" | "occupant_report" | "facility_report" | "inferred"
      confidence: string  // NEW: "confirmed" | "directional" | "preliminary"
    }]
  }]
}
```

## CausalChain Shape

```
{
  type: string,           // pathway type label
  zone: string,           // zone name
  rootCause: string,      // hypothesis statement
  evidence: string[],     // supporting evidence items
  evidenceGaps: string[], // NEW: what's missing
  confidence: string,     // "Higher" | "Moderate" | "Preliminary"
  recommendedFollowUp: string  // NEW: what confirms/rules out
}
```
