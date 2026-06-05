# AtmosFlow Secondary-Use Data Schema & Export Contract

**Version:** 1.1
**Status:** Architecture Specification
**Last Updated:** June 2026
**Audience:** Product, Engineering, Legal/Compliance Review

---

## 0. Reviewer Revisions (v1.1)

v1.0 (author: Tsidi Tamakloe) was reviewed against the live codebase. Six
fixes are folded into this revision; each is marked inline with **[R#]**.

1. **[R1] Type rename — `AssessmentContext` → `SurveyConditions`.** The name
   `AssessmentContext` is already taken in `lib/context/types.ts` for the
   engine-output connectivity context (readiness, finalization blockers,
   confidence buckets). Reusing it for "survey conditions" collides and
   trips the drift-guard test (`tests/lib/buildAssessmentContext.test.ts`).
   The root field is `survey_conditions: SurveyConditions`.
2. **[R2] Exports are projections, not a parallel store.** Per the
   connectivity-layer rule (CLAUDE.md), exports READ from
   `buildAssessmentContext` + the `sites` table + `instrumentRegistry` +
   `audit_log` — they do not hand-build a second source of truth. The
   `AtmosSurvey` shape below is the *projection target*, not a new DB model.
3. **[R3] Immutability is staged.** "Write-once" is an app-level lock after
   finalization / CIH sign-off in Phase 1; DB-enforced append-only is a
   later hardening (assessments are editable offline-first drafts today).
4. **[R4] Retention vs. erasure reconciled.** Benchmarking retention is
   opt-in via the existing `ai_training_consent` pattern (migration 015),
   and the "AtmosFlow retains a copy" carve-out must be Legal-approved and
   reflected in `api/delete-account.js` (see the go-live GDPR finding).
5. **[R5] Derived indices removed from the measurement set.**
   `mold_risk_index` / `sick_building_syndrome_index` are engine outputs /
   attributions, not measurements; they're excluded from
   `MeasurementParameter` to preserve "confidence attaches to measurements,
   not attributions" and the no-building-related-illness rule.
6. **[R6] Certification comparisons are informational, not verdicts.** The
   ESG export emits `measured_value` + `threshold` + `threshold_source` with
   an explicit "informational, not a certification determination" label —
   no boolean `passes_threshold`, which would read as a compliance verdict.

Minor: outdoor-CO₂ validation widened from 380–420 to 380–600 ppm
(ambient is already ~420+ and rising); `accept:v2.7` is wired as a config
under `scripts/acceptance/`, not an ad-hoc script.

---

## 1. Overview & Rationale

### 1.1 Purpose

AtmosFlow screening surveys capture measurement data beyond what appears in
the CIH-reviewed report. This schema formalizes *what* secondary data to
collect, *why* (mapped to downstream value), and *how* to export it in
defensible, auditable, reusable forms — without violating AtmosFlow's core
defensibility posture (confidence attaches to measurements, not
attributions; no compliance verdicts; no building-specific causal claims).

### 1.2 Core Principle

The secondary value lives **entirely in the measurements and their
metadata**. AtmosFlow captures, preserves, and exports the raw data and
provenance — not conclusions. Downstream users (facilities teams, asset
managers, ESG reporters, researchers) draw their own interpretations against
published standards and their own business rules.

This keeps AtmosFlow in the screening lane while maximizing utility.

### 1.3 Secondary Uses Enabled

| Use Case | Stakeholder | Data Driver | Value |
|---|---|---|---|
| **Ventilation & energy optimization** | Facilities/operations | CO₂ + occupancy + zone mapping | 9–38% HVAC energy savings via demand-controlled ventilation (ASHRAE RP-1747, Vaisala) |
| **Occupant health/productivity business case** | HR, leadership, occupiers | CO₂, PM₂.₅ at occupied zones + occupancy | Productivity multiplier aligned with Harvard COGfx (2–3× cognitive improvement range) |
| **ESG & green-building evidence** | Asset managers, investors, compliance | Full parameter set + calibration provenance + audit trail | Feed WELL v2, RESET, LEED O+M, GRESB disclosures; pre-certification gap-finding |
| **Predictive maintenance & capital planning** | Facility directors, asset teams | HVAC entity history + filter/service metadata + recurring patterns | Early signal for equipment end-of-life, filtration deficiency, maintenance scheduling |
| **Risk, litigation, insurance defensibility** | Legal, risk, insurance | Chain of custody + calibration + timestamps + photo evidence + methodology version | Defensible historical record; transaction due diligence |
| **Aggregate benchmarking (product moat)** | AtmosFlow, asset portfolios | Anonymized standardized readings across buildings | Percentile benchmarking ("your CO₂ at 60th percentile of comparable Class A"); enterprise defensibility asset |

---

## 2. Core Survey Data Schema

> **[R2]** This shape is the **export projection target**. It is assembled
> by a projection layer that reads the existing data sources
> (`buildAssessmentContext` output, `sites`, `instrumentRegistry`,
> `audit_log`, the `assessments` JSONB row). It is **not** a new write model
> and must not become a second source of truth.

### 2.1 TypeScript Type Definitions

```typescript
// ============================================================================
// ATMOSFLOW SECONDARY-USE SCHEMA v1.1
// ============================================================================

/**
 * Root survey document (PROJECTION TARGET — see [R2]).
 * Core measurement fields are write-once after finalization (app-level lock,
 * see [R3]); all edits tracked via audit_trail.
 */
interface AtmosSurvey {
  // Immutable identifiers & versioning
  survey_id: string;                    // UUID; globally unique
  survey_version: "1.1";                // Schema version this survey was captured under
  created_at: ISO8601Timestamp;         // Server time, UTC
  created_by: CIHCredential;            // Who initiated the survey

  // Methodology & standards
  methodology_manifest: MethodologyManifest;

  // Survey scope
  building: BuildingEntity;             // Projection of the `sites` table row
  climate_zone: ClimateZone;

  // Survey conditions ([R1] — renamed from AssessmentContext)
  survey_conditions: SurveyConditions;

  // Capture data
  zones: Zone[];
  hvac_entities: HVACEntity[];
  outdoor_reference: OutdoorReference;

  // Report & defensibility
  report_metadata: ReportMetadata;
  cih_sign_off: CIHSignOffRecord;

  // Audit & immutability
  audit_trail: AuditLogEntry[];         // Projection of `audit_log`
  export_history: ExportRecord[];
}

/**
 * Methodology manifest: frozen at survey creation.
 * Ensures reproducibility and defensibility.
 */
interface MethodologyManifest {
  atmosflow_version: string;                      // e.g., "2.6.1"
  standards_snapshot: {
    [standard_name: string]: {
      title: string;
      edition: string;
      publication_year: number;
      snapshot_date: ISO8601Date;
    };
  };
  // e.g., ASHRAE 62.1-2019, ACGIH TLVs snapshot (public domain only), ANSI/ASHRAE 188-2021

  scope_definition: string;  // "Screening assessment" or "Pre-certification gap analysis" etc.
  ai_constraints_active: boolean;  // Always true; confirms no causation language
  banned_phrases_linter_version: string;
}

/**
 * Building entity: persistent across surveys of same building.
 * Projection of the `sites` table (migration 017) — enables longitudinal
 * comparison. Do not duplicate; reference the site row.
 */
interface BuildingEntity {
  building_id: string;                   // UUID; persistent for this building (sites.id)
  name: string;
  address: StreetAddress;

  // Geospatial anchor (enables benchmarking aggregation)
  latitude: number;                      // WGS84
  longitude: number;

  // Building classification
  building_type:
    | "office" | "retail" | "healthcare" | "education" | "industrial"
    | "data_center" | "hospitality" | "residential" | "mixed_use"
    | "other";
  occupancy_classification: string;      // e.g., "Class A Office", "Tier III Data Center"
  gross_floor_area_sqft: number;
  year_built: number;

  // Certification status (for ESG mapping)
  certifications: {
    standard: "LEED" | "WELL" | "RESET" | "Fitwel" | "ENERGY STAR" | "BREEAM";
    level: string;  // e.g., "Gold", "v2+", "Certification"
    issue_date: ISO8601Date;
    expiration_date?: ISO8601Date;
  }[];

  // Optional: floorplan reference (for spatial anchoring across surveys)
  floorplan_url?: URL;
  floorplan_reference_system?: "svg_coordinates" | "real_coordinates" | "zone_labels";
}

/**
 * Climate zone from ASHRAE 169 or equivalent.
 */
interface ClimateZone {
  ashrae_169_zone: string;               // e.g., "3A", "5C"
  koppen_classification?: string;         // Optional; for research
  heating_cooling_degree_days?: {
    heating_base_65f: number;
    cooling_base_65f: number;
  };
}

/**
 * Survey conditions ([R1], formerly "AssessmentContext").
 * Answers "Under what conditions was this survey conducted?"
 * Mirrors the UX context bar in AtmosFlow reports. Renamed to avoid the
 * collision with lib/context/types.ts `AssessmentContext` (engine output).
 */
interface SurveyConditions {
  survey_type: "Initial screening" | "Recertification" | "Due diligence" | "Follow-up";
  survey_date: ISO8601Date;
  survey_duration_hours: number;
  season: "winter" | "spring" | "summer" | "fall";

  // Building operational state
  building_occupancy_state:
    | "fully_occupied" | "partially_occupied" | "vacant"
    | "mixed" | "unknown";
  hvac_operational_state:
    | "normal" | "reduced" | "maintenance" | "emergency" | "off" | "unknown";

  // Environmental influences
  recent_weather_events?: string;         // e.g., "heavy rainfall", "air quality alert"
  nearby_construction?: boolean;
  occupant_complaints_reported?: boolean;

  // Scope notes
  scope_notes: string;                   // Free text; e.g., "Survey limited to 3 of 12 zones"
  known_limitations?: string;            // e.g., "HVAC not operating during survey"
}

/**
 * Zone: individual measurement location.
 * The unit of spatial granularity.
 */
interface Zone {
  zone_id: string;                       // UUID; or site-assigned label
  zone_label: string;                    // Human-readable; e.g., "Open Office Floor 3", "Server Room B"

  // Spatial anchor
  floor_number: number;
  room_function: RoomFunction;
  zone_coordinates?: {
    x: number;                           // Relative to floorplan or absolute (lat/lon)
    y: number;
    z?: number;                          // Height above grade
    coordinate_system: "floorplan_svg" | "real_world_meters" | "building_relative";
  };

  // Physical context
  zone_dimensions?: {
    length_meters: number;
    width_meters: number;
    height_meters: number;
    calculated_volume_m3: number;
  };
  volume_m3?: number;                    // If not calculated from dims

  // HVAC servicing
  hvac_supply_present: boolean;
  hvac_return_present: boolean;
  hvac_entity_id?: string;               // Ref to HVACEntity (nullable if unknown)
  windows_present: boolean;
  window_operable: boolean;

  // Occupancy at time of measurement
  occupancy: OccupancyContext;

  // Measurements
  measurements: Measurement[];

  // Photos (with timestamps and location)
  photos: SurveyPhoto[];
}

/**
 * Room function classification.
 * Enables secondary-use filtering (e.g., "exclude bathrooms from air quality benchmarking").
 */
type RoomFunction =
  | "office_open" | "office_enclosed" | "conference" | "breakroom"
  | "restroom" | "storage" | "mechanical" | "electrical"
  | "data_center" | "server_room" | "telecom_closet"
  | "lab" | "clean_room" | "hospital_patient_room" | "surgical_suite"
  | "classroom" | "library" | "cafeteria" | "corridor" | "lobby"
  | "retail_sales" | "warehouse" | "manufacturing"
  | "other";

/**
 * Occupancy context: answers "Who/what is in this zone right now?"
 * Critical for secondary uses: energy DCV interpretation, productivity business case, sensibility checks.
 */
interface OccupancyContext {
  survey_time: ISO8601Timestamp;         // When measurements were taken

  // Occupancy snapshot
  people_present_count: number;          // 0 to n; or "estimated_5_10" if inexact
  typical_occupancy_count?: number;      // What this zone normally holds
  occupancy_diversity?:
    | "sedentary" | "light_activity" | "moderate_activity" | "high_activity";

  // Temporal context
  time_of_week: "weekday_business_hours" | "weekday_after_hours" | "weekend" | "holiday";
  hvac_runtime_hours_since_occupancy?: number;  // If zone just occupied, how long has HVAC been on?

  // Occupancy source/confidence
  occupancy_method: "visual_count" | "badge_data" | "sensor_data" | "estimate";
  occupancy_confidence: "high" | "medium" | "low";
}

/**
 * Individual measurement reading.
 * Immutable once finalized ([R3]); links to instrument provenance and averaging period.
 */
interface Measurement {
  measurement_id: string;                // UUID
  parameter: MeasurementParameter;
  value: number;
  unit: string;                          // "ppm", "µg/m³", "°C", "%RH", "ppm_eq", etc.

  // Instrument & provenance
  instrument: InstrumentRecord;

  // Sampling context
  sampling_duration_minutes: number;
  averaging_period_minutes: number;      // CRITICAL: Logger Studio uses this for threshold comparison
  measurement_method:
    | "continuous_direct_read"
    | "grab_sample"
    | "integrated_passive"
    | "integrating_sensor";

  // Quality & validity
  quality_flag: QualityFlag;
  notes?: string;                        // e.g., "HVAC just turned on", "Cleaning in progress"

  // Measured under what conditions
  temperature_during_measurement_c?: number;
  relative_humidity_during_measurement_pct?: number;

  // Statistical context (if device provided)
  min_value?: number;
  max_value?: number;
  mean_value?: number;
  standard_deviation?: number;
  sample_count?: number;                 // Samples averaged for this reading

  timestamp: ISO8601Timestamp;
}

/**
 * Measurement parameter enumeration.
 * Extensible; subset required for secondary uses.
 *
 * [R5] Derived indices (mold_risk_index, sick_building_syndrome_index) are
 * NOT measurements — they are engine outputs / attributions and are
 * deliberately excluded here. If exported at all, they live in a separate
 * clearly-labeled `derived_indices` block sourced from the engine, never in
 * the raw measurement set, to preserve the "confidence attaches to
 * measurements, not attributions" principle and the no-building-related-
 * illness defensibility rule.
 */
type MeasurementParameter =
  // Core IAQ parameters (required for most secondary uses)
  | "CO2" | "PM2.5" | "PM10" | "TVOC" | "CO"
  | "temperature" | "relative_humidity"

  // Optional but valuable for secondary uses
  | "formaldehyde" | "particle_count_0.3um" | "particle_count_0.5um"
  | "particle_count_2.5um" | "particle_count_5um" | "particle_count_10um"
  | "ozone" | "NO2" | "radon"

  // Data center / specialized
  | "isopropyl_alcohol" | "isopropanol_concentration";

/**
 * Quality flag: indicates confidence in this measurement.
 * Used by secondary consumers to filter/weight data.
 */
type QualityFlag =
  | "valid"                      // Measurement meets QA criteria
  | "suspect_low_confidence"     // Instrument drift, environmental anomaly, etc.
  | "outlier_flagged"            // Statistical outlier; investigate before secondary use
  | "instrument_error"           // Instrument reports error; value invalid
  | "post_maintenance"           // Taken immediately after instrument maintenance; may be settling
  | "environmental_anomaly";     // e.g., door/window opened during measurement

/**
 * Instrument provenance: answers "Which device measured this? Is it trustworthy?"
 * Projection of `instrumentRegistry`. Critical for chain-of-custody and
 * secondary-use defensibility.
 */
interface InstrumentRecord {
  instrument_id: string;                 // Serial number or device UUID
  make_model: string;                    // e.g., "Awair Element", "Kaiterra Egg+"
  measurement_principle: string;         // e.g., "NDIR CO₂ sensor", "optical particle counter"

  // Accuracy & spec
  accuracy_spec: string;                 // From manufacturer; e.g., "±3% of reading or ±30 ppm"
  lower_detection_limit: number;
  upper_measurement_range: number;
  uncertainty_value?: number;            // Calculated post-measurement if possible

  // Calibration pedigree
  calibration_date: ISO8601Date;
  calibration_expiration: ISO8601Date;
  calibration_method:
    | "factory_default" | "zero_span_check" | "certified_gas" | "nist_traceable" | "other";
  calibration_certificate_url?: URL;
  calibration_notes?: string;

  // Data logger provisioning (if the device has a datalogger)
  datalogger?: {
    datalogger_id: string;
    configuration_timestamp: ISO8601Timestamp;
    export_timestamp: ISO8601Timestamp;
    data_integrity_hash?: string;        // SHA256 or similar for forensic integrity
  };
}

/**
 * HVAC entity: first-class object, not per-zone duplication.
 * Enables predictive maintenance, energy analysis, equipment history.
 */
interface HVACEntity {
  hvac_entity_id: string;                // UUID; persistent for this building
  system_label: string;                  // e.g., "AHU-01", "Rooftop Unit 3"

  // Equipment classification
  system_type:
    | "air_handling_unit"
    | "rooftop_unit"
    | "split_system_indoor"
    | "fan_coil"
    | "dedicated_outdoor_air_system"
    | "other";

  equipment_details: {
    make_model: string;
    installed_year: number;
    serial_number?: string;
    nameplate_capacity_tons?: number;   // For cooling/heating calc
    supply_air_cfm_nameplate?: number;
  };

  // Current condition & maintenance
  observed_deficiencies?: string[];      // e.g., ["dirty filter", "refrigerant leak sign"]
  filter_type: string;
  filter_merv_rating?: number;
  last_filter_change_date?: ISO8601Date;
  last_service_date?: ISO8601Date;
  last_service_notes?: string;
  estimated_end_of_life_year?: number;   // Engineering estimate for capital planning

  // Operational data from survey
  hvac_runtime_during_survey: HVACRuntimeData;

  // Control system
  controls_type: "manual" | "pneumatic" | "analog_electric" | "direct_digital_control";
  outdoor_air_intake_location?: string;  // "roof", "ground_level", "loading_dock", etc.
  outdoor_air_damper_observed_position?: "fully_open" | "partial" | "closed";
}

/**
 * HVAC runtime data during survey: basis for energy-savings calculation.
 */
interface HVACRuntimeData {
  system_was_running_during_survey: boolean;
  supply_air_temperature_c?: number;
  return_air_temperature_c?: number;
  // If DCV-capable, the setpoint CO₂:
  demand_control_setpoint_ppm?: number;
  // Visual/aural assessment:
  runtime_assessment: "normal" | "operating_reduced" | "compromised" | "off";
}

/**
 * Outdoor reference: baseline for indoor/outdoor comparisons.
 * Critical for secondary uses: energy analysis, pollutant source attribution, benchmarking.
 */
interface OutdoorReference {
  outdoor_measurement_location: string;  // e.g., "Rooftop sensor", "National Weather Service"

  // Simultaneous outdoor measurements (if sensor present)
  measurements: Measurement[];           // Same schema as indoor

  // Weather context (from API or manual)
  weather_data?: {
    measurement_time: ISO8601Timestamp;
    temperature_c: number;
    relative_humidity_pct: number;
    wind_speed_ms: number;
    wind_direction_degrees: number;
    solar_radiation_w_m2?: number;
    precipitation_mm?: number;
  };

  // Air quality (from sensor or AirNow/API)
  air_quality_index?: {
    aqi_value: number;
    aqi_category: "good" | "moderate" | "unhealthy_sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";
    primary_pollutant: string;
    source: "measured" | "aql_api" | "epa_airnow";
  };

  // Optional: pollen, wildfire smoke, industrial influence
  source_attribution?: string;           // e.g., "wildfire smoke from 150 km northwest"
}

/**
 * Survey photo: timestamped visual evidence.
 */
interface SurveyPhoto {
  photo_id: string;
  url: URL;                              // Stored in Supabase Storage
  timestamp: ISO8601Timestamp;           // EXIF or system time
  zone_id: string;                       // Which zone(s) visible
  caption: string;                       // e.g., "Filter visibly dirty", "Window left open"
  equipment_visible?: {
    equipment_id: string;                // HVAC entity ref, if visible
    equipment_label: string;
  };
}

/**
 * Report metadata: ties survey to CIH-reviewed output.
 */
interface ReportMetadata {
  report_id: string;
  report_version: number;
  rendered_at: ISO8601Timestamp;
  report_format: "internal" | "external";  // Internal (operator dashboard) vs. external (CIH deliverable)
  cih_review_completed: boolean;
  cih_review_timestamp?: ISO8601Timestamp;
}

/**
 * CIH sign-off record: required for external reports.
 * AtmosFlow maintains that the customer's CIH (not AtmosFlow) signs off.
 * Sourced from the peer-review workflow (migration 021 peer_reviews).
 */
interface CIHSignOffRecord {
  customer_cih_name: string;
  customer_cih_credential: string;       // e.g., "CIH #12345"
  customer_cih_organization: string;
  signature_timestamp: ISO8601Timestamp;
  signed_report_hash: string;            // SHA256 of finalized report for forensics
}

/**
 * Audit log entry: immutable record of all changes to the survey.
 * Projection of `audit_log`.
 */
interface AuditLogEntry {
  audit_id: string;
  action: "survey_created" | "measurement_added" | "zone_updated" | "report_rendered" | "exported" | "modified";
  actor: string;                         // User ID or service
  timestamp: ISO8601Timestamp;
  change_summary: string;
  previous_value?: Record<string, unknown>;
  new_value?: Record<string, unknown>;
}

/**
 * Export record: track what has been exported, when, for whom, in what format.
 * Used for secondary-use traceability.
 */
interface ExportRecord {
  export_id: string;
  export_timestamp: ISO8601Timestamp;
  export_format: "raw_measurement" | "esg_certification" | "operational_intelligence";
  exported_by: string;
  exported_to_system?: string;           // e.g., "GRESB Portal", "Facilities CMMS"
  data_hash: string;                     // For integrity verification
  recipient_email?: string;              // If emailed export
}

// ============================================================================
// TIMESTAMP & UTILITY TYPES
// ============================================================================

type ISO8601Timestamp = string;          // "2026-06-05T14:30:00Z"
type ISO8601Date = string;               // "2026-06-05"
type URL = string;

/**
 * Building address for geographic registration.
 */
interface StreetAddress {
  street_line_1: string;
  street_line_2?: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
}

/**
 * CIH credential for audit.
 */
interface CIHCredential {
  name: string;
  credential_type: "CIH" | "BCSP_other" | "industrial_hygienist_candidate";
  credential_number?: string;
  organization: string;
}
```

---

## 3. Field → Secondary-Use Dependency Matrix

This table shows which schema fields are **required** (R), **strongly
recommended** (S), or **optional** (O) for each secondary use.

| Field | Type | Ventilation & Energy | Health & Productivity | ESG/Certification | Predictive Maintenance | Litigation/Risk | Benchmarking | Notes |
|---|---|---|---|---|---|---|---|---|
| **survey_id** | Root | R | R | R | R | R | R | Globally unique identifier |
| **created_at** | Metadata | R | R | R | R | R | R | Defensibility; also time-stamps all secondary uses |
| **methodology_manifest** | Root | R | S | R | S | R | R | Reproducibility; esp. critical for ESG audit & litigation |
| **building.latitude/longitude** | Building | S | O | S | O | S | **R** | Geospatial anchor; **essential for benchmarking aggregation** |
| **building.building_type** | Building | O | S | S | S | O | **R** | Filtering for peer benchmarking |
| **building.gross_floor_area_sqft** | Building | O | O | S | O | O | S | ESG reporting; energy intensity calcs |
| **survey_conditions** | Context | **R** | S | S | S | **R** | S | Answers "under what conditions?" — critical for all interpretation ([R1]) |
| **climate_zone** | Context | S | O | S | O | O | S | Energy calc baseline; peer grouping |
| **zones[].zone_coordinates** | Spatial | O | S | S | O | S | S | Floorplan alignment for repeat surveys |
| **zones[].occupancy** | Occupancy | **R** | **R** | S | S | O | S | **Unlocks energy DCV & productivity interpretation** |
| **zones[].hvac_entity_id** | Reference | **R** | O | O | **R** | O | O | Links zone to equipment for energy & maintenance |
| **measurements[].CO2** | IAQ Core | **R** | **R** | **R** | O | S | **R** | The most versatile secondary-use parameter |
| **measurements[].PM2.5** | IAQ Core | O | **R** | **R** | O | O | **R** | Cognitive function parameter; certification requirement |
| **measurements[].TVOC** | IAQ Core | O | S | **R** | O | O | S | ESG & green-building standard |
| **measurements[].averaging_period_minutes** | Metadata | **R** | S | **R** | O | S | **R** | **Critical: Logger Studio uses this for threshold comparison** |
| **measurements[].quality_flag** | QA | S | S | **R** | S | **R** | S | ESG/certification data must be "valid" or flagged |
| **measurements[].instrument** | Provenance | S | S | **R** | S | **R** | S | Calibration chain = defensibility; **critical for ESG & litigation** |
| **hvac_entities[].equipment_details** | HVAC | **R** | O | O | **R** | S | O | Capital planning; predictive maintenance |
| **hvac_entities[].last_filter_change_date** | Maintenance | O | O | O | **R** | O | O | Predictive maintenance signal |
| **hvac_entities[].hvac_runtime_during_survey** | Operational | **R** | O | O | **R** | O | O | Supply/return temps; DCV setpoint for energy calc |
| **outdoor_reference** | Context | **R** | S | S | O | S | **R** | Indoor/outdoor ratios; source attribution; benchmarking normalization |
| **photos[]** | Evidence | S | O | S | S | **R** | O | Filter condition, equipment state, visual anomalies |
| **audit_trail** | Integrity | O | O | S | O | **R** | O | **Essential for litigation & regulatory audit** |
| **cih_sign_off** | Authority | O | O | **R** | O | S | O | CIH review record; required for external reports |

**Legend:** **R** = Required for meaningful secondary use · **S** = Strongly
recommended; missing materially weakens secondary use · **O** = Optional;
useful context but not blocking

---

## 4. Export Contracts

AtmosFlow exports secondary data in three distinct contracts. Each is
immutable (signed hash), audit-logged, and suitable for downstream systems.
**[R2]** Each export is produced by a projection function over the existing
data sources — not assembled from a separate store.

### 4.1 Raw Measurement Export

**Purpose:** Longitudinal trending, energy analysis, benchmarking aggregation.
**Format:** JSON (line-delimited NDJSON for bulk exports).
**Audience:** Facilities teams, asset managers, data scientists, benchmarking consortium.
**Retention:** Per customer data-rights agreement; benchmarking retention is opt-in ([R4]).

```json
{
  "export_id": "exp_20260605_raw_001",
  "survey_id": "srv_2026_bldg_acme_001",
  "building_id": "bldg_acme_manhattan",
  "export_timestamp": "2026-06-05T15:00:00Z",
  "export_format_version": "1.1",
  "data_hash": "sha256:abcd1234...",

  "building": {
    "name": "Acme Tower, Manhattan",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "building_type": "office",
    "occupancy_classification": "Class A"
  },

  "climate_zone": { "ashrae_169": "4A" },

  "survey_conditions": {
    "survey_date": "2026-06-05",
    "season": "summer",
    "hvac_operational_state": "normal"
  },

  "zones": [
    {
      "zone_id": "z_floor3_open",
      "zone_label": "Open Office, Floor 3",
      "room_function": "office_open",
      "occupancy_count": 12,
      "typical_occupancy": 15,
      "occupancy_time": "business_hours",
      "measurements": [
        {
          "parameter": "CO2",
          "value": 820,
          "unit": "ppm",
          "timestamp": "2026-06-05T10:30:00Z",
          "averaging_period_minutes": 5,
          "quality_flag": "valid",
          "instrument_id": "sensor_kaiterra_01",
          "calibration_date": "2026-05-05"
        },
        {
          "parameter": "PM2.5",
          "value": 8.3,
          "unit": "µg/m³",
          "timestamp": "2026-06-05T10:30:00Z",
          "averaging_period_minutes": 5,
          "quality_flag": "valid",
          "instrument_id": "sensor_awair_03"
        }
      ]
    }
  ],

  "outdoor_reference": {
    "CO2": 420,
    "PM2.5": 12.1,
    "temperature_c": 28,
    "relative_humidity_pct": 65,
    "timestamp": "2026-06-05T10:30:00Z"
  }
}
```

**Secondary Uses:** Energy DCV tuning · longitudinal trending · benchmarking
percentiles · predictive modeling (occupancy vs. indoor quality).

### 4.2 ESG & Certification Evidence Export

**Purpose:** Feed WELL v2, RESET, LEED O+M, GRESB, Fitwel compliance & disclosure.
**Format:** JSON; includes full provenance, calibration, audit chain.
**Audience:** Asset managers, ESG/sustainability teams, certification verifiers, disclosure platforms.
**Retention:** 7 years minimum (regulatory); flagged if audit-ready.

> **[R6]** Threshold blocks present `measured_value`, `threshold`, and
> `threshold_source` as an **informational comparison only**. AtmosFlow does
> not emit a pass/fail verdict — that is the verifier's determination.

```json
{
  "export_id": "exp_20260605_esg_001",
  "export_timestamp": "2026-06-05T15:15:00Z",
  "export_format_version": "1.1",
  "audit_ready": true,
  "data_hash": "sha256:efgh5678...",
  "retention_policy": "7_years_regulatory",

  "certification_context": {
    "target_standard": "WELL_v2_air",
    "purpose": "Annual recertification evidence"
  },

  "building": {
    "building_id": "bldg_acme_manhattan",
    "name": "Acme Tower, Manhattan",
    "address": "123 Park Ave, New York, NY 10022",
    "gross_floor_area_sqft": 500000,
    "certifications": [
      { "standard": "WELL", "level": "v2+", "issue_date": "2024-03-15", "expiration_date": "2027-03-15" }
    ]
  },

  "survey_metadata": {
    "survey_id": "srv_2026_bldg_acme_001",
    "survey_date": "2026-06-05",
    "survey_type": "Recertification",
    "methodology_version": "atmosflow_2.6",
    "standards_snapshot": { "ASHRAE_62.1": "2019 edition (snapshot 2026-06-05)" }
  },

  "measurements": [
    {
      "zone_id": "z_floor3_open",
      "zone_label": "Open Office, Floor 3",
      "parameter": "CO2",
      "value": 820,
      "unit": "ppm",
      "timestamp": "2026-06-05T10:30:00Z",
      "averaging_period_minutes": 5,
      "quality_flag": "valid",
      "instrument": {
        "make_model": "Kaiterra Egg+",
        "serial_number": "KA_20201234",
        "measurement_principle": "NDIR CO₂",
        "accuracy_spec": "±3% of reading or ±50 ppm",
        "calibration_date": "2026-05-05",
        "calibration_method": "factory_default",
        "calibration_certificate_url": "https://s3.amazonaws.com/atmosflow-certs/..."
      },
      "threshold_comparison": {
        "comparison_type": "informational_only",
        "disclaimer": "Measured value vs. published threshold. NOT a certification determination.",
        "precondition": "WELL v2 A01 - CO2 Concentrations",
        "threshold": 1000,
        "threshold_unit": "ppm",
        "measured_value": 820,
        "threshold_source": "WELL v2 A01 definition"
      }
    },
    {
      "zone_id": "z_floor3_open",
      "parameter": "PM2.5",
      "value": 8.3,
      "unit": "µg/m³",
      "timestamp": "2026-06-05T10:30:00Z",
      "quality_flag": "valid",
      "instrument": {
        "make_model": "Awair Element",
        "serial_number": "AW_20191567",
        "measurement_principle": "Optical particle counter",
        "accuracy_spec": "±10% of reading",
        "calibration_date": "2026-04-20",
        "calibration_method": "certified_gas"
      },
      "threshold_comparison": {
        "comparison_type": "informational_only",
        "disclaimer": "Measured value vs. published threshold. NOT a certification determination.",
        "precondition": "WELL v2 A02 - Particulate Matter",
        "threshold": 15,
        "threshold_unit": "µg/m³",
        "measured_value": 8.3,
        "threshold_source": "WELL v2 A02 definition"
      }
    }
  ],

  "outdoor_reference": { "PM2.5": 12.1, "timestamp": "2026-06-05T10:30:00Z" },

  "chain_of_custody": {
    "survey_conducted_by": { "name": "Jane Smith", "credential": "CIH #54321" },
    "report_reviewed_by": { "name": "Dr. John Doe", "credential": "CIH #12345", "organization": "Acme EHS Consulting" },
    "audit_trail": [
      { "timestamp": "2026-06-05T10:45:00Z", "action": "survey_captured", "actor": "jsmith" },
      { "timestamp": "2026-06-05T15:00:00Z", "action": "cih_review_completed", "actor": "jdoe" },
      { "timestamp": "2026-06-05T15:15:00Z", "action": "exported_to_well_recertification", "actor": "system" }
    ]
  },

  "attestation": {
    "data_accuracy_certification": true,
    "certified_by": "Dr. John Doe, CIH #12345",
    "certification_timestamp": "2026-06-05T15:00:00Z",
    "signed_data_hash": "sha256:efgh5678..."
  }
}
```

**Secondary Uses:** ESG disclosure (GRESB, CSRD, GRI) · green-building
certification evidence (WELL, RESET, LEED O+M) · audit trail (regulatory,
insurance) · recertification evidence.

### 4.3 Operational Intelligence Export

**Purpose:** Facilities/operations: energy optimization, HVAC tuning, maintenance planning.
**Format:** JSON; optimized for real-time dashboards and CMMS integration.
**Audience:** Facilities directors, HVAC technicians, energy managers, BMS/CMMS systems.
**Retention:** 2 years typical (operational); truncated after baseline is set.

```json
{
  "export_id": "exp_20260605_ops_001",
  "export_timestamp": "2026-06-05T16:00:00Z",
  "export_format_version": "1.1",
  "data_hash": "sha256:ijkl9012...",
  "building_id": "bldg_acme_manhattan",
  "survey_id": "srv_2026_bldg_acme_001",

  "energy_optimization_insights": [
    {
      "hvac_entity_id": "ahu_01",
      "system_label": "AHU-01, Floors 1-4",
      "current_hvac_state": "operating_normal",
      "co2_analysis": {
        "zones_served": ["z_floor1", "z_floor2", "z_floor3", "z_floor4"],
        "average_co2_ppm": 850,
        "occupied_zones": 3,
        "vacant_zones": 1,
        "highest_co2_zone": { "zone_id": "z_floor3_open", "zone_label": "Open Office Floor 3", "co2_ppm": 820, "occupancy_count": 12 },
        "lowest_co2_zone": { "zone_id": "z_floor2_storage", "co2_ppm": 450, "occupancy_count": 0 }
      },
      "dcv_opportunity": {
        "current_setpoint_ppm": null,
        "recommended_setpoint_ppm": 900,
        "estimated_energy_savings_percent": 15,
        "rationale": "Zones with <700 ppm CO2 could reduce ventilation; currently providing excess air to vacant/lightly-occupied spaces."
      },
      "equipment_condition": {
        "filter_status": "should_monitor",
        "last_filter_change_date": "2025-12-10",
        "months_since_change": 6,
        "estimated_remaining_life_months": 6,
        "supply_temp_c": 12.5,
        "return_temp_c": 23.8,
        "delta_temp_c": 11.3,
        "supply_temp_assessment": "normal"
      },
      "maintenance_alerts": [
        { "alert_type": "routine", "message": "Filter due for change in ~6 months (estimate)", "priority": "low", "recommended_action": "Schedule Q4 filter replacement" }
      ]
    }
  ],

  "outdoor_reference": { "outdoor_co2_ppm": 420, "outdoor_temperature_c": 28, "outdoor_humidity_pct": 65, "outdoor_pm25_µg_m3": 12.1 },

  "actionable_recommendations": [
    {
      "category": "energy",
      "priority": "medium",
      "recommendation": "Tune AHU-01 demand-controlled ventilation to 900 ppm CO2 setpoint. Current operation likely provides 15%+ excess ventilation.",
      "expected_benefit": "15% reduction in AHU-01 fan energy; ~5 kW savings if sustained 8h/day",
      "implementation_effort": "1–2 hours (BMS technician)"
    },
    {
      "category": "maintenance",
      "priority": "low",
      "recommendation": "Schedule filter replacement Q4 2026.",
      "expected_benefit": "Restore supply air velocity; improve indoor air quality"
    }
  ],

  "export_notes": "This data is operative/internal only. Not suitable for external reporting or certification without full chain-of-custody and CIH review. Redact before sharing outside facilities team."
}
```

**Secondary Uses:** HVAC tuning (DCV setpoint optimization) · energy savings
forecasting · maintenance scheduling · BMS/CMMS integration (work orders).

---

## 5. Validation & Chain of Custody

### 5.1 Required Fields by Survey Type

| Field | Initial Screening | Recertification | Due Diligence | Post-Complaint | ESG Gap-Finding |
|---|---|---|---|---|---|
| survey_id | R | R | R | R | R |
| methodology_manifest | R | R | R | R | R |
| building (full) | R | R | R | R | R |
| zones[] | R | R | R | R | R |
| occupancy per zone | **R** | **R** | **R** | **R** | **R** |
| measurements (CO₂, PM₂.₅) | R | R | R | R | R |
| measurements (TVOC) | S | R | R | S | **R** |
| instrument calibration | S | R | R | R | R |
| hvac_entities[] | S | R | S | S | S |
| outdoor_reference | **R** | **R** | **R** | **R** | **R** |
| photos[] | S | S | **R** | **R** | S |
| survey_conditions | R | R | R | R | R |
| audit_trail | O | S | **R** | **R** | S |

### 5.2 Data Integrity Validation Rules

Before export, AtmosFlow enforces:

1. **Temporal coherence:** All measurements within a zone must have timestamps within `survey_duration_hours` of `survey_date`.
2. **Instrument validity:** `calibration_date` ≤ `survey_date` < `calibration_expiration`.
3. **Quality flag consensus:** Measurements flagged "instrument_error" or "invalid" are excluded from secondary-use exports unless explicitly marked for forensic review.
4. **Spatial consistency:** Zone coordinates must be finite and within plausible building bounds.
5. **Occupancy sanity:** `people_present_count` ≤ `typical_occupancy_count` → soft flag if violated (crowding/events are legitimate).
6. **Outdoor reference:** Outdoor CO₂ expected **380–600 ppm** (ambient is ~420+ and rising); flag with source if outside. *([R6-minor] widened from the original 380–420.)*
7. **Parameter unit match:** Each measurement's unit must match the parameter definition (e.g., CO₂ in ppm, not mg/m³).

### 5.3 Chain-of-Custody Immutability ([R3])

Once a survey is finalized (report rendered / CIH sign-off), the **core
measurement data is locked at the application layer**:

- `survey_id`, `created_at`, `measurements[]` (parameter, value, timestamp, instrument) are **write-once after finalization**.
- Any correction (e.g., discovered calibration error) requires: an explicit `audit_trail` entry (change, reason, approver); a new `report_version` if re-rendered; and a re-export notification to any system that imported the prior export.
- **Phase-1 enforcement is app-level** (UI + API guards). DB-enforced append-only / write-once via triggers or an immutable measurements table is a later hardening step — assessments are editable, offline-first, queue-synced drafts today, so DB-level immutability is a deliberate migration, not an assumption.

---

## 6. Integration with Existing AtmosFlow Patterns

### 6.1 Projection over the connectivity layer ([R2])

Exports are **derived**, not hand-built. The projection reads:

| Export concept | Existing source |
|---|---|
| `building` / `BuildingEntity` | `sites` table (migration 017) |
| survey body (zones, measurements, photos, composite) | `assessments` JSONB row (014) + `buildAssessmentContext` output |
| `instrument` / `InstrumentRecord` | `instrumentRegistry` |
| `audit_trail` | `audit_log` |
| `cih_sign_off` | `peer_reviews` (021) |

This honors the standing rule: *new export consumers READ from the builder;
they do not bypass it.* It also prevents export/report drift (the failure
mode the connectivity layer exists to prevent).

### 6.2 Banned-Phrase Linter & AI Constraints

The secondary schema introduces **no new banned-phrase risk** — it is
measurement and metadata only. The linter operates at report-generation time
(where conclusions are drawn). The `methodology_manifest` records
`ai_constraints_active: true` and the linter version so downstream systems
know AtmosFlow's AI-drawn conclusions are constrained (no causation, no
compliance verdicts).

### 6.3 CIH Review Flag

Secondary-use exports **do not require CIH sign-off** when they are raw
measurements, operational intelligence (descriptive, no causation), or ESG
evidence with full provenance (the CIH review is on the *report*, not the raw
data). **If** a secondary export is repackaged into a *new narrative*
(e.g. a benchmarking marketing claim), that narrative must be CIH-reviewed
before external use.

### 6.4 Logger Studio & Averaging-Period Awareness

The schema captures `averaging_period_minutes` per measurement. Downstream:
energy DCV → raw 5-min averages; ESG → align to the standard's specified
averaging windows; benchmarking → normalize to 1-hour averages. The export
documents the averaging period used so consumers can adjust.

### 6.5 HVAC-as-Entity Defensibility

HVAC as a first-class entity enables predictive maintenance and energy
optimization **without** causation or compliance claims — e.g. "filter due
based on service date + equipment type" (not "this zone's poor air is
*caused by* equipment age"); "DCV tuning to 900 ppm can save 15% fan energy"
(not "your ventilation fails ASHRAE 62.1").

---

## 7. Implementation Roadmap

### Phase 1: Core Schema & Raw-Measurement Export (v2.7)

- [ ] Implement TypeScript types (Section 2.1) — **with the `SurveyConditions` rename [R1]**
- [ ] Add `zone.occupancy` capture to the survey walkthrough UI
- [ ] Add `instrument.calibration_date` to the device-pairing flow
- [ ] Implement the raw export as a **projection** `buildRawExport(ctx)` over `buildAssessmentContext` + `sites` + `instrumentRegistry` [R2]
- [ ] Endpoint `/api/survey/[id]/export/raw` (Bearer-authed; user owns the survey)
- [ ] SHA256 `data_hash` on every export for integrity
- [ ] New acceptance config `scripts/acceptance/v2.7.json` + `npm run accept:v2.7`

**Acceptance:** `accept:v2.7` validates the schema and a raw export matching the spec above.

### Phase 2: ESG/Certification Evidence Export (v2.8)

- [ ] Implement the ESG export contract (Section 4.2) with **informational threshold comparisons [R6]**
- [ ] WELL v2 / RESET threshold *reference* mapping (data, not verdicts)
- [ ] Chain-of-custody assembly from `audit_log` + `peer_reviews`
- [ ] `requires_esg_audit_ready` flag on surveys
- [ ] Endpoint `/api/survey/[id]/export/esg`

**Acceptance:** ESG export can be forwarded to a WELL recertification platform without re-entry.

### Phase 3: Operational Intelligence Export & CMMS Integration (v2.9)

- [ ] Implement the operational export contract (Section 4.3)
- [ ] DCV energy-savings calculator + HVAC maintenance-alert logic
- [ ] Integrate with common CMMS APIs (Fiix, etc.)
- [ ] Endpoint `/api/survey/[id]/export/operations`

**Acceptance:** Facilities team receives an actionable DCV tuning recommendation within 24h of survey completion.

### Phase 4: Benchmarking Pipeline & Data Asset (v3.0)

- [ ] **Consent gate first [R4]:** benchmarking inclusion is opt-in via the `ai_training_consent` pattern (migration 015); no building enters the aggregate without it
- [ ] Anonymization pipeline (`building_id` → hash, location → postal/region, drop street address + precise lat/long)
- [ ] Aggregate store + percentile API (by building class, climate zone)
- [ ] Portfolio benchmarking dashboard + partner API

**Acceptance:** A consenting customer sees "Your building's CO₂ at 65th percentile of 200+ comparable Class A offices," and a non-consenting customer's data never appears in the aggregate.

---

## 8. Legal & Compliance Notes

1. **No causation claims in secondary exports.** Raw data is exported;
   conclusions drawn downstream are that system's responsibility.
2. **CIH review** is on the *report*, not the raw measurements. Repackaging
   raw data into a new narrative triggers review.
3. **Data ownership & retention carve-out ([R4]) — requires Legal sign-off.**
   The customer owns the survey data and exports. AtmosFlow's retention of
   (a) an **anonymized** benchmarking copy and (b) a full audit copy for
   litigation defensibility must be: explicitly authorized in the ToS/MSA;
   gated by consent for (a); and **reconciled with the right to erasure** —
   `api/delete-account.js` must define exactly what survives a deletion
   (anonymized aggregates and legally-required audit records only) and purge
   everything else. This directly ties to the open go-live GDPR finding
   (analytics_events / invoices not purged).
4. **Retention windows:** ESG/certification exports retained per regulatory
   requirement (7 years); operational exports deleted after 2 years or on
   customer request.
5. **GDPR / privacy:** Occupancy counts are occupant-behavior data; in EU
   installations they must be anonymized/aggregated and covered by the
   consent + erasure handling in note 3.

---

## 9. References

- ASHRAE Standard 62.1-2019 (Ventilation for Acceptable Indoor Air Quality)
- ASHRAE RP-1747 (Demand-Controlled Ventilation research)
- WELL Building Standard v2 (Indoor Air Quality preconditions & optimizations)
- RESET Air Standard (Continuous monitoring for IAQ)
- GRESB Real Estate Assessment (ESG benchmarking)
- Harvard COGfx Study (Cognitive function & IAQ, Allen et al.)
- ANSI/ASHRAE 188-2021 (Legionella risk management)

---

## Document Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-05 | Tsidi Tamakloe | Initial schema spec; all six secondary uses; Phase 1 roadmap |
| 1.1 | 2026-06-05 | Engineering review (Claude) | Applied six review fixes ([R1]–[R6]) against the live codebase: `SurveyConditions` rename; exports as projections over the connectivity layer; staged immutability; retention↔erasure reconciliation + consent gate; derived indices removed from the measurement set; informational (non-verdict) certification comparisons. Minor: outdoor-CO₂ range widened; acceptance wired as a config. See §0. |
