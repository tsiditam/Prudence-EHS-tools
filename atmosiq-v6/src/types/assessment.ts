/**
 * AtmosFlow Core Type Definitions
 * Single source of truth for all data shapes in the application.
 */

// ── Zone & Measurement Data ──

export interface ZoneData {
  // Stable per-assessment identifier. Auto-assigned on first save when
  // absent so HvacEquipment.servedZoneIds can reference zones across
  // renames. Existing drafts are migrated lazily (see migrateZoneIds).
  zid?: string
  // IDs of HvacEquipment units serving this zone. Empty array (or
  // missing) means equipment is unmapped — the engine emits a
  // building-scoped fallback action prefixed "HVAC equipment not yet
  // identified —" rather than a duplicated per-zone action.
  servingEquipmentIds?: string[]
  zn?: string
  su?: string
  sf?: string
  oc?: string
  zone_subtype?: string
  // Measurements
  co2?: string
  co2o?: string
  tf?: string
  tfo?: string
  rh?: string
  rho?: string
  pm?: string
  pmo?: string
  co?: string
  tv?: string
  tvo?: string
  hc?: string
  // Complaint fields
  cx?: string
  ac?: string
  sy?: string[]
  sr?: string
  cc?: string
  // Environment
  tc?: string
  hp?: string
  wd?: string
  wl?: string[]
  mi?: string
  mia?: string
  // Odor
  op?: string
  ot?: string[]
  // Airflow
  sa?: string
  od?: string
  dp?: string
  // Pathways
  path_pressure?: string
  path_crosstalk?: string
  path_crosstalk_source?: string
  // DC specific
  // Measurement metadata
  meas_time?: string
  meas_occ?: string
  meas_duration?: string
  meas_conditions?: string
  // Spatial
  mapX?: number
  mapY?: number
  // Notes
  znt?: string
  [key: string]: unknown
}

export interface BuildingData {
  fn?: string
  fl?: string
  ft?: string
  ba?: string
  rn?: string
  ht?: string
  hm?: string
  fm?: string
  fc?: string
  sa?: string
  od?: string
  dp?: string
  bld_pressure?: string
  bld_exhaust?: string[]
  bld_intake_proximity?: string[]
  // ── Building pressurization (mechanism module) ──
  //
  // Captured on the building record and deliberately OUTSIDE the scored
  // parameters: pressurization explains findings, it is never itself
  // scored. See src/engines/pressurization.js and the isolation test in
  // tests/engine/pressurization.test.ts.
  //
  // `bld_press_door` supersedes `bld_pressure` above, which conflated
  // the observation ("air pulls in") with the conclusion ("negative").
  // The old field is retained and still read as a fallback so
  // pre-module assessments do not read as unevaluated.
  bld_press_door?: string
  bld_press_method?: string
  bld_press_door_behavior?: string
  bld_press_dp_measured?: string
  /** Signed. Negative = interior below outdoor. Canonicalized to Pa by the engine. */
  bld_press_dp?: string
  bld_press_dp_units?: string
  bld_press_dp_location?: string
  /** USER-ENTERED design intent from the building's O&M docs — never a standard. */
  bld_press_design?: string
  bld_press_design_units?: string
  bld_press_design_src?: string
  [key: string]: unknown
}

export interface PresurveyData {
  ps_assessor?: string
  ps_assessor_certs?: string[]
  ps_assessor_exp?: string
  ps_inst_iaq?: string
  ps_inst_iaq_serial?: string
  ps_inst_iaq_cal?: string
  ps_inst_iaq_cal_status?: string
  ps_inst_pid?: string
  ps_inst_pid_cal?: string
  // Differential-pressure meter — the same ps_inst_* envelope as the IAQ
  // meter and the PID, plus `res` (resolution), which the pressurization
  // module needs to tell an indeterminate reading from a neutral one.
  ps_inst_press?: string
  ps_inst_press_serial?: string
  ps_inst_press_accuracy?: string
  ps_inst_press_acc_units?: string
  ps_inst_press_res?: string
  ps_inst_press_res_units?: string
  ps_inst_press_cal?: string
  ps_inst_press_cal_status?: string
  ps_inst_other?: string
  ps_reason?: string
  ps_complaint_narrative?: string
  [key: string]: unknown
}

// ── Scoring Types ──

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'pass' | 'info'

export interface Finding {
  t: string
  sev: Severity
  std?: string
}

/**
 * A category's assessment. `s` / `mx` / `capped` / `origMx` / `suppressed`
 * carried the 100-point score and went with it; `r` — the findings — is
 * and always was the payload.
 */
export interface CategoryScore {
  l: string
  r: Finding[]
  gate5?: boolean
  adminGap?: boolean
  synergistic?: boolean
  status?: 'INSUFFICIENT' | 'DATA_GAP'
  reason?: string
  sufficiency?: SufficiencyResult
}

export interface ZoneScore {
  cats: CategoryScore[]
  zoneName: string
  /**
   * A category went unassessed. Named `partialScore` before the score was
   * removed and kept that way deliberately: it is read by four renderers
   * and by hasPartialData(), and it never meant "the score is partial".
   */
  partialScore: boolean
  confidence: string
  sufficiency: Record<string, SufficiencyResult>
  zoneSubtype?: string
  insufficientCats: string[]
  assessedCats: string[]
  hvacAdminGap: boolean
}

/**
 * The site-level roll-up, from `summarizeAssessment`. Replaces
 * `CompositeScore`, which carried the 0-100 composite, the zone average,
 * the worst zone, a risk band and the name of the rule that produced
 * them.
 */
export interface AssessmentSummary {
  count: number
  findings: {
    total: number
    attention: number
    bySeverity: { critical: number; high: number; medium: number; low: number }
  }
  confidence: string
  partialData: boolean
}

export interface SufficiencyResult {
  sufficiency: number
  reqSufficiency: number
  present: string[]
  missing: string[]
  isInsufficient: boolean
  unmetOptional?: string[]
  capReason?: string | null
  reason: string | null
}

// ── HVAC Equipment ──

export type HvacEquipmentType =
  | 'AHU' | 'RTU' | 'FCU' | 'VRF_INDOOR' | 'ERV' | 'MAU' | 'DOAS' | 'OTHER'

export interface HvacEquipment {
  id: string
  label: string
  type: HvacEquipmentType
  servedZoneIds: string[]
  location?: string
  lastServiceDate?: string
  filterClass?: string
  notes?: string
}

// ── Recommendations / Actions ──

export type ActionScope = 'zone' | 'equipment' | 'building'

export interface RecommendationAction {
  // Scope is declared on the rule, not inferred at runtime. Engine is
  // deterministic — a rule that emits an equipment-scoped action will
  // always emit equipment-scoped (or fall back to building-scoped if
  // the zone has no equipment mapped).
  scope: ActionScope
  text: string
  affectedZoneIds: string[]
  // Display-only zone labels resolved at scoring time so renderers
  // never have to re-resolve from the zones array.
  affectedZoneNames?: string[]
  // Required when scope === 'equipment'.
  equipmentId?: string
  equipmentLabel?: string
  // Set for scope === 'zone'; redundant with affectedZoneIds[0] but
  // explicit for renderers.
  zoneId?: string
  zoneName?: string
}

export interface Recommendations {
  imm: RecommendationAction[]
  eng: RecommendationAction[]
  adm: RecommendationAction[]
  mon: RecommendationAction[]
}

// ── Report Types ──

export interface SamplingPlanEntry {
  zone: string
  type: string
  priority: string
  hypothesis: string
  method: string
  controls: string
  standard: string
}

export interface SamplingPlan {
  plan: SamplingPlanEntry[]
  outdoorGaps: string[]
}

export interface CausalChain {
  zone: string
  type: string
  rootCause: string
  evidence: string[]
  confidence: string
  std?: string
  refutableBy?: string
}

export interface OSHAResult {
  flag: boolean
  fl: string[]
  conf: string
  gaps: string[]
}

export interface MoldResult {
  condition: number
  label: string
  sqft: number | null
  investigationTriggered: boolean
  visual: string
  caveat: string
}

export interface MeasurementConfidence {
  overall: string
  zones: string[]
}

export interface Report {
  id: string
  ts: string
  ver: string
  presurvey: PresurveyData
  building: BuildingData
  zones: ZoneData[]
  // HVAC equipment captured during the walkthrough. Empty when an
  // assessment was completed before equipment capture existed —
  // renderers must handle the empty case (legacy reports).
  equipment?: HvacEquipment[]
  photos: Record<string, PhotoEntry[]>
  floorPlan?: string | null
  zoneScores: ZoneScore[]
  comp: AssessmentSummary
  oshaEvals: OSHAResult[]
  recs: Recommendations
  samplingPlan: SamplingPlan
  causalChains: CausalChain[]
  narrative?: string | null
  standardsManifest: Record<string, string>
}

export interface PhotoEntry {
  src: string
  ts?: string
  label?: string
}

// ── Profile Types ──

export interface UserProfile {
  id?: string
  name?: string
  email?: string
  certs?: string[]
  firm?: string
  firm_address?: string
  firm_phone?: string
  iaq_meter?: string
  isNew?: boolean
  [key: string]: unknown
}

// ── Index Types ──

export interface IndexEntry {
  id: string
  ts: string
  facility?: string
  score?: number | null
  ua?: string
}

export interface StorageIndex {
  reports: IndexEntry[]
  drafts: IndexEntry[]
}
