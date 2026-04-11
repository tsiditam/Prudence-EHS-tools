/**
 * AtmosFlow Technical Report Authoring Engine
 * Type Definitions — Canonical Report Payload
 *
 * This is the ONLY input to the report-writing system.
 * All data originates from upstream engines (scoring, causal, sampling, OSHA).
 * The report layer NEVER recalculates or overrides these values.
 */

// ─── Upstream Engine Outputs (read-only) ───

export interface Finding {
  t: string           // Finding text
  std?: string        // Standard reference (e.g., 'ASHRAE 62.1-2025')
  sev: 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'
}

export interface CategoryScore {
  s: number           // Score earned
  mx: number          // Maximum possible (25, 25, 20, 15, 15)
  l: 'Ventilation' | 'Contaminants' | 'HVAC' | 'Complaints' | 'Environment'
  r: Finding[]        // Findings in this category
}

export interface ZoneScore {
  tot: number         // 0-100
  risk: string        // 'Low Risk' | 'Moderate' | 'High Risk' | 'Critical'
  rc: string          // Color hex
  cats: CategoryScore[]
  zoneName: string
}

export interface CompositeScore {
  tot: number         // Weighted: avg*0.6 + worst*0.4
  avg: number
  worst: number
  risk: string
  rc: string
  count: number
}

export interface OSHAResult {
  flag: boolean
  fl: string[]        // Flag descriptions
  conf: 'High' | 'Medium' | 'Limited'
  gaps: string[]      // Data gap descriptions
}

export interface Recommendations {
  imm: string[]       // Immediate (0-48 hrs)
  eng: string[]       // Engineering (1-4 weeks)
  adm: string[]       // Administrative (1-3 months)
  mon: string[]       // Monitoring (ongoing)
}

export interface CausalChain {
  zone: string
  type: 'Ventilation Deficiency' | 'Moisture / Biological' | 'Chemical Exposure' | 'Cross-Contamination Pathway'
  rootCause: string
  evidence: string[]
  confidence: 'Strong' | 'Moderate' | 'Possible'
}

export interface SamplingItem {
  zone: string
  type: string        // 'Bioaerosol' | 'Formaldehyde' | 'VOC Speciation' etc.
  priority: 'critical' | 'high' | 'medium'
  hypothesis: string
  method: string
  controls: string
  standard: string
}

export interface SamplingPlan {
  plan: SamplingItem[]
  outdoorGaps: string[]
}

export interface VentCalc {
  pOA: number         // Per-person OA requirement
  aOA: number         // Per-area OA requirement
  tot: number         // Total CFM
  pp: number          // OA per occupant
  ref: string
}

// ─── Assessment Context ───

export interface Presurvey {
  ps_assessor: string
  ps_assessor_certs: string[]
  ps_assessor_exp: string
  ps_inst_iaq: string
  ps_inst_iaq_serial: string
  ps_inst_iaq_cal: string
  ps_inst_iaq_cal_status: string
  ps_inst_pid?: string
  ps_inst_pid_cal?: string
  ps_reason: string
  ps_complaint_narrative?: string
  ps_complaint_severity?: string
  ps_complaint_formal?: string
  ps_prior?: string
  ps_prior_notes?: string
  ps_water_history?: string
  ps_water_detail?: string
  ps_complaint_count?: string
  ps_complaint_timeline?: string
  ps_affected_areas?: string
}

export interface Building {
  fn: string          // Facility name
  fl: string          // Location/address
  ft: string          // Facility type
  ba?: string         // Year built
  rn?: string         // Renovation timeline
  ht: string          // HVAC type
  hm: string          // Last maintenance
  fm?: string         // Filter type
  fc?: string         // Filter condition
  sa?: string         // Supply airflow
  od?: string         // OA damper status
  dp?: string         // Drain pan condition
  bld_pressure?: string
}

export interface ZoneData {
  zn: string          // Zone name
  su?: string         // Space use
  sf?: string         // Square feet
  oc?: string         // Occupancy
  // Measurements
  co2?: string; co2o?: string
  tf?: string; tfo?: string
  rh?: string; rho?: string
  pm?: string; pmo?: string
  co?: string
  tv?: string; tvo?: string
  hc?: string
  // Observations
  cx?: string         // Complaints
  sy?: string[]       // Symptoms
  wd?: string         // Water damage
  mi?: string         // Mold indicators
  op?: string         // Odor
  ot?: string[]       // Odor types
  znt?: string        // Notes
}

// ─── Canonical Report Payload ───

export interface ReportPayload {
  // Metadata
  meta: {
    reportId: string
    reportVersion: string       // 'v1.0'
    reportStatus: 'draft' | 'review' | 'final'
    generatedAt: string         // ISO timestamp
    platformVersion: string     // '6.0.0'
    assessmentDate: string
    reportDate: string
  }

  // Facility
  facility: {
    name: string
    address: string
    type: string
    building: Building
  }

  // Assessor
  assessor: {
    name: string
    credentials: string[]
    experience: string
    instrument: string
    instrumentSerial?: string
    calibrationStatus: string
    calibrationDate?: string
    pidMeter?: string
    pidCalibration?: string
  }

  // Presurvey context
  context: {
    reason: string
    complaintNarrative?: string
    complaintSeverity?: string
    priorAssessments?: string
    waterHistory?: string
    affectedAreas?: string
  }

  // Scoring (from upstream engines — READ ONLY)
  scoring: {
    composite: CompositeScore
    zones: ZoneScore[]
    osha: OSHAResult
  }

  // Zone raw data
  zoneData: ZoneData[]

  // Analysis (from upstream engines — READ ONLY)
  analysis: {
    causalChains: CausalChain[]
    samplingPlan: SamplingPlan
    recommendations: Recommendations
    ventCalcs: (VentCalc | null)[]
  }

  // Narrative (AI-generated, review-required)
  narrative: string | null

  // Standards referenced
  standards: string[]
}

// ─── Report Section Outputs ───

export interface SectionOutput {
  sectionId: string
  title: string
  content: string             // HTML or markdown
  status: 'generated' | 'qa_passed' | 'qa_failed' | 'approved'
  qaScore: number             // 0-100
  qaIssues: string[]
  wordCount: number
}

export interface ReportOutput {
  payload: ReportPayload
  sections: SectionOutput[]
  overallQaScore: number
  readyForRender: boolean
  generatedAt: string
}
