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
  gaseous_corrosion?: string
  dp_temp?: string
  iso_class?: string
  h2_monitoring?: string
  h2_ppm?: string
  exhaust_cfm_sqft?: string
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

export interface CategoryScore {
  s: number | null
  mx: number
  l: string
  r: Finding[]
  gate5?: boolean
  adminGap?: boolean
  synergistic?: boolean
  status?: 'SUPPRESSED' | 'INSUFFICIENT' | 'DATA_GAP'
  reason?: string
  capped?: boolean
  sufficiency?: SufficiencyResult
  suppressed?: boolean
  origMx?: number
}

export interface ZoneScore {
  tot: number | null
  risk: string
  rc: string
  cats: CategoryScore[]
  zoneName: string
  partialScore: boolean
  confidence: string
  sufficiency: Record<string, SufficiencyResult>
  zoneSubtype?: string
  weights: Record<string, number>
  normalizedFrom: number | null
  availableMax: number
  insufficientCats: string[]
  hvacAdminGap: boolean
}

export interface CompositeScore {
  tot: number | null
  avg: number | null
  worst: number | null
  risk: string
  rc: string
  count: number
  logic: string
  rationale: string
  partialComposite: boolean
  confidence: string
}

export interface SufficiencyResult {
  sufficiency: number
  reqSufficiency: number
  present: string[]
  missing: string[]
  isInsufficient: boolean
  maxAwardable: number
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
  comp: CompositeScore
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
