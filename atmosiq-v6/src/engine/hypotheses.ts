/**
 * AtmosFlow Engine v2.6 §3 — Hypothesis Engine
 *
 * Hypotheses fire on observation patterns BEFORE measurements
 * confirm them — a walkthrough alone is enough to suggest a
 * sampling plan. Each hypothesis carries `SamplingRecommendation`
 * entries that tell the inspector what to measure to confirm or
 * refute the hypothesis.
 *
 * Distinct from causal chains:
 *   - Chains synthesize *findings* into a root cause statement.
 *   - Hypotheses suggest *measurements* prompted by walkthrough
 *     observations.
 *
 * The trigger conditions read from the legacy zone-data shape
 * (the `zonesData[]` and `buildingData` records the bridge already
 * consumes). Field names follow the legacy column-letter pattern
 * documented in src/engines/scoring.js — sa (supply airflow),
 * sy (symptoms array), mi (mold indicator), wd (water damage),
 * od (outdoor-air damper), dp (drain pan), fc (filter condition),
 * ot (odor types), oi (odor intensity), su (space use), and so on.
 *
 * Confidence tiering (§3):
 *   - Multiple independent indicators → provisional_screening_level
 *   - Single observational indicator  → qualitative_only
 *   - No indicators                    → not emitted
 */

import type {
  CIHConfidenceTier, Finding, FindingId, Hypothesis, HypothesisId,
  SamplingRecommendation, ZoneScore,
} from './types/domain'

// ── Public input shape ────────────────────────────────────────

export interface HypothesisInput {
  /** Legacy zone-data records the bridge already consumes. */
  readonly zonesData: ReadonlyArray<Readonly<Record<string, unknown>>>
  /** Building-level walkthrough fields. */
  readonly buildingData: Readonly<Record<string, unknown>>
  /** Findings produced by the bridge (used to source relatedFindingIds). */
  readonly findings: ReadonlyArray<Finding>
  /**
   * v2.1 ZoneScore objects. Optional — used to cross-reference
   * zone names. When omitted, the legacy `zn` field is used.
   */
  readonly zones?: ReadonlyArray<ZoneScore>
}

// ── Field readers ─────────────────────────────────────────────

const str = (z: Readonly<Record<string, unknown>>, key: string): string => {
  const v = z[key]
  return typeof v === 'string' ? v : ''
}

const arr = (z: Readonly<Record<string, unknown>>, key: string): ReadonlyArray<string> => {
  const v = z[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

const num = (z: Readonly<Record<string, unknown>>, key: string): number | null => {
  const v = z[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const zoneName = (z: Readonly<Record<string, unknown>>): string => str(z, 'zn') || 'Unnamed zone'

// ── Pattern detectors ─────────────────────────────────────────

const NEUROLOGICAL_SYMPTOMS: ReadonlyArray<string> = [
  'Headache', 'Dizziness', 'Nausea', 'Confusion', 'Loss of consciousness', 'Drowsiness',
]
const RESPIRATORY_SYMPTOMS: ReadonlyArray<string> = [
  'Cough', 'Wheezing', 'Nasal congestion', 'Throat irritation', 'Shortness of breath', 'Chest tightness',
]

const hasNeurologicalSymptoms = (sy: ReadonlyArray<string>): boolean =>
  sy.some(s => NEUROLOGICAL_SYMPTOMS.includes(s))

const hasRespiratorySymptoms = (sy: ReadonlyArray<string>): boolean =>
  sy.some(s => RESPIRATORY_SYMPTOMS.includes(s))

const hasWeakSupplyAir = (sa: string): boolean =>
  sa === 'Weak / reduced' || sa === 'No airflow detected' || sa === 'weak' || sa === 'none'

const hasCompromisedDamper = (od: string): boolean =>
  od === 'Closed / minimum' || od === 'Stuck / inoperable' || od === 'closed' || od === 'stuck'

const hasMoldIndicator = (mi: string): boolean =>
  mi !== '' && mi !== 'None' && mi !== 'Suspected discoloration'

const hasWaterDamage = (wd: string): boolean =>
  wd !== '' && wd !== 'None' && wd !== 'Historical (resolved)'

const hasDrainPanIssue = (dp: string): boolean => {
  const t = dp.toLowerCase()
  return t.includes('biolog') || t.includes('standing') || t.includes('growth') || t.includes('reservoir')
}

const hasFilterIssue = (fc: string): boolean => {
  const t = fc.toLowerCase()
  return t.includes('loaded') || t.includes('saturated') || t.includes('dirty') || t.includes('heavily')
}

const hasOdor = (ot: ReadonlyArray<string>): boolean =>
  ot.some(o => o !== '' && o !== 'None' && o !== 'No odor')

const hasVisibleDust = (vd: string): boolean => {
  const t = vd.toLowerCase()
  return t.includes('yes') || t.includes('visible') || t.includes('dust observed') || t.includes('heavy')
}

const isDataCenterSpace = (z: Readonly<Record<string, unknown>>): boolean => {
  const subtype = str(z, 'zone_subtype').toLowerCase()
  if (subtype === 'data_hall' || subtype.includes('data')) return true
  const name = str(z, 'zn').toLowerCase()
  return name.includes('data hall') || name.includes('data center') || name.includes('server room')
}

const hasCorrosionIndicator = (z: Readonly<Record<string, unknown>>): boolean => {
  const gc = str(z, 'gaseous_corrosion').toUpperCase()
  if (gc.includes('G2') || gc.includes('G3') || gc.includes('GX')) return true
  const obs = str(z, 'observation_corrosion') || str(z, 'corrosion_notes')
  if (obs && obs.length > 0) return true
  return false
}

// ── Confidence tiering ────────────────────────────────────────

const tierFromIndicatorCount = (count: number): CIHConfidenceTier => {
  if (count >= 2) return 'provisional_screening_level'
  if (count >= 1) return 'qualitative_only'
  return 'insufficient_data'
}

// ── Finding-id collection ─────────────────────────────────────

/**
 * Gather FindingIds whose conditionType matches one of `types`,
 * scoped to zones whose names appear in `zoneNames` (or unscoped
 * when zoneNames is empty).
 */
function findingIdsFor(
  findings: ReadonlyArray<Finding>,
  types: ReadonlyArray<string>,
): ReadonlyArray<FindingId> {
  const set = new Set(types)
  return findings
    .filter(f => set.has(f.conditionType))
    .map(f => f.id)
}

// ── Hypothesis ID generation ──────────────────────────────────

/**
 * Stable per-rule id prefix + a deterministic suffix derived from
 * the input fingerprint. Tests can pin ids by feeding the same
 * input shape repeatedly.
 */
function makeId(prefix: string, fingerprint: string): HypothesisId {
  const hash = simpleHash(fingerprint)
  return `${prefix}_${hash}` as HypothesisId
}

function simpleHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36).padStart(6, '0').slice(0, 8)
}

// ── Hypothesis 1 — Inadequate outdoor-air ventilation ────────

const SAMPLING_VENTILATION: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'CO₂ (multi-zone, peak-occupancy)',
    method: 'NDIR direct-reading instrument; ASHRAE 62.1 surrogate methodology',
    rationale: 'Quantify outdoor-air delivery at peak occupant load by measuring CO₂ differential against outdoor reference across multiple zones.',
  },
  {
    parameter: 'Supply airflow (CFM at terminal)',
    method: 'Balometer or anemometer traverse; AABC/NEBB methodology',
    rationale: 'Compare measured terminal airflow to the design airflow specified by the engineer of record per ASHRAE 62.1.',
  },
  {
    parameter: 'Outdoor-air fraction at AHU',
    method: 'CO₂-balance method or tracer-gas decay (SF₆ or CO₂ pulse)',
    rationale: 'Verify economizer operation and outdoor-air damper actuator function under full system load.',
  },
]

function hypothesisVentilation(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    const sa = str(z, 'sa')
    const sy = arr(z, 'sy')
    const od = str(z, 'od')
    const name = zoneName(z)
    if (hasWeakSupplyAir(sa)) basis.push(`Weak or absent supply airflow observed in ${name}.`)
    if (hasNeurologicalSymptoms(sy)) basis.push(`Neurological symptom pattern reported in ${name} (${sy.join(', ')}).`)
    if (hasCompromisedDamper(od)) basis.push(`Outdoor-air damper compromised in ${name}: "${od}".`)
  }
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_ventilation', basis.join('|')),
    name: 'Inadequate outdoor-air ventilation',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'ventilation_inadequate_outdoor_air',
      'ventilation_co2_only',
      'ventilation_observational_only',
      'hvac_outdoor_air_damper_compromised',
    ]),
    suggestedSampling: SAMPLING_VENTILATION,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Hypothesis 2 — Bioaerosol amplification ──────────────────

const SAMPLING_BIOAEROSOL: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'Total culturable fungi (indoor + outdoor paired)',
    method: 'Andersen N6 single-stage impactor; NIOSH Method 0800',
    rationale: 'Establish indoor amplification factor against outdoor baseline. Indoor:outdoor ratio >1.0 with novel taxa indicates amplification.',
  },
  {
    parameter: 'Surface tape lift on visible growth',
    method: 'ASTM D7338 direct microscopic exam',
    rationale: 'Genus-level identification of visible growth without disturbing the matrix.',
  },
  {
    parameter: 'Bulk material sampling for confirmation',
    method: 'Direct microscopy or qPCR (ERMI) on bulk substrate',
    rationale: 'Viability and species-level characterization where remediation scope depends on species (e.g. Stachybotrys chartarum).',
  },
]

function hypothesisBioaerosol(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    const mi = str(z, 'mi')
    const wd = str(z, 'wd')
    const sy = arr(z, 'sy')
    const name = zoneName(z)
    if (hasMoldIndicator(mi)) basis.push(`Visible or apparent microbial growth in ${name}: "${mi}".`)
    if (hasWaterDamage(wd)) basis.push(`Water damage indicator in ${name}: "${wd}".`)
    if (hasRespiratorySymptoms(sy)) basis.push(`Respiratory symptom pattern reported in ${name} (${sy.filter(s => RESPIRATORY_SYMPTOMS.includes(s)).join(', ')}).`)
  }
  const dp = str(input.buildingData, 'dp')
  if (hasDrainPanIssue(dp)) basis.push(`HVAC drain pan condition: "${dp}".`)
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_bioaerosol', basis.join('|')),
    name: 'Bioaerosol amplification',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'apparent_microbial_growth',
      'active_or_historical_water_damage',
      'humidity_microbial_amplification_range',
      'hvac_drain_pan_microbial_reservoir',
    ]),
    suggestedSampling: SAMPLING_BIOAEROSOL,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Hypothesis 3 — VOC source / off-gassing ──────────────────

const SAMPLING_VOC: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'TVOC + speciation',
    method: 'EPA Method TO-17 sorbent tube + thermal desorption GC/MS',
    rationale: 'Identify dominant VOC species and source; PID-based TVOC alone cannot distinguish individual compounds.',
  },
  {
    parameter: 'Formaldehyde (integrated)',
    method: 'NIOSH Method 2016 (DNPH cartridge + HPLC)',
    rationale: 'Quantify HCHO independently of the TVOC sum; PID and electrochemical instruments lack specificity near the NIOSH REL.',
  },
]

function hypothesisVoc(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    const ot = arr(z, 'ot')
    const oi = num(z, 'oi')
    const name = zoneName(z)
    if (hasOdor(ot) && oi !== null && oi >= 3) {
      basis.push(`Objectionable odor reported in ${name} at intensity ${oi}/5 (types: ${ot.join(', ')}).`)
    } else if (hasOdor(ot) && oi === null) {
      // Odor present without intensity recorded — half-strength signal.
      basis.push(`Odor reported in ${name} (intensity not recorded; types: ${ot.join(', ')}).`)
    }
  }
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_voc', basis.join('|')),
    name: 'VOC source or off-gassing',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'tvoc_screening_elevated',
      'hcho_screening_elevated',
      'hcho_above_pel_documented',
      'objectionable_odor',
    ]),
    suggestedSampling: SAMPLING_VOC,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Hypothesis 4 — Particulate amplification or filter failure ─

const SAMPLING_PARTICULATE: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'PM2.5 / PM10 (indoor + outdoor paired)',
    method: 'Optical aerosol monitor (e.g. TSI DustTrak DRX) with gravimetric verification per NIOSH 0600 if challenged',
    rationale: 'Quantify indoor-to-outdoor ratio to confirm amplification or filter bypass; gravimetric required for regulatory comparison.',
  },
  {
    parameter: 'Particle counts at ISO size thresholds',
    method: 'Calibrated particle counter; ISO 14644-1:2015 Annex B sample plan',
    rationale: 'Required when cleanroom or data-center cleanliness classification is in scope.',
  },
]

function hypothesisParticulate(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    const vd = str(z, 'vd')
    if (hasVisibleDust(vd)) basis.push(`Visible dust observed in ${zoneName(z)}.`)
  }
  const fc = str(input.buildingData, 'fc')
  if (hasFilterIssue(fc)) basis.push(`HVAC filter condition: "${fc}".`)
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_particulate', basis.join('|')),
    name: 'Particulate amplification or filter failure',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'pm_screening_elevated',
      'pm_above_naaqs_documented',
      'pm_indoor_amplification_screening',
      'particle_screening_only',
      'hvac_filter_loaded',
      'hvac_filter_below_recommended_class',
    ]),
    suggestedSampling: SAMPLING_PARTICULATE,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Hypothesis 5 — Combustion source / CO infiltration ───────

const SAMPLING_COMBUSTION: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'CO (continuous, occupied-zone)',
    method: 'Electrochemical direct-reading instrument with data logging at 1-minute resolution',
    rationale: 'Detect transient CO peaks below the OSHA 8-hour TWA that nonetheless produce acute neurological symptoms; an 8-hr TWA average can mask short-duration exposure.',
  },
]

function hypothesisCombustion(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    const sy = arr(z, 'sy')
    if (hasNeurologicalSymptoms(sy)) {
      basis.push(`Neurological symptom pattern reported in ${zoneName(z)} (${sy.filter(s => NEUROLOGICAL_SYMPTOMS.includes(s)).join(', ')}). Combustion-source CO infiltration is a recognized differential.`)
    }
  }
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_combustion', basis.join('|')),
    name: 'Combustion source or carbon monoxide infiltration',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'co_screening_elevated', 'co_above_pel_documented',
    ]),
    suggestedSampling: SAMPLING_COMBUSTION,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Hypothesis 6 — Atmospheric corrosion (data center) ───────

const SAMPLING_CORROSION: ReadonlyArray<SamplingRecommendation> = [
  {
    parameter: 'Copper and silver reactivity coupons (30-day passive)',
    method: 'ANSI/ISA 71.04-2013 environmental classification methodology',
    rationale: 'Classify the gaseous corrosion environment as G1 (mild), G2 (moderate), G3 (harsh), or GX (severe). Required for IT-equipment warranty compliance in OEM data-hall specifications.',
  },
  {
    parameter: 'Gaseous contaminant speciation',
    method: 'Passive badge sampling for H₂S, SO₂, NO_x, Cl₂',
    rationale: 'Identify the controlling corrosive species so the source can be traced (outdoor air ingress vs. internal cleaning chemistry vs. process gas leak).',
  },
]

function hypothesisAtmosphericCorrosion(input: HypothesisInput): Hypothesis | null {
  const basis: string[] = []
  for (const z of input.zonesData) {
    if (!isDataCenterSpace(z)) continue
    if (hasCorrosionIndicator(z)) {
      const gc = str(z, 'gaseous_corrosion')
      const note = gc ? ` (assessor-selected indicator: ${gc})` : ''
      basis.push(`Data-center zone "${zoneName(z)}" with corrosion indicators present${note}.`)
    }
  }
  if (basis.length === 0) return null
  return {
    id: makeId('hyp_corrosion', basis.join('|')),
    name: 'Atmospheric corrosion (data-center / electronics)',
    basis,
    relatedFindingIds: findingIdsFor(input.findings, [
      'possible_corrosive_environment',
    ]),
    suggestedSampling: SAMPLING_CORROSION,
    cihConfidenceTier: tierFromIndicatorCount(basis.length),
  }
}

// ── Public entry point ────────────────────────────────────────

const RULES: ReadonlyArray<(input: HypothesisInput) => Hypothesis | null> = [
  hypothesisVentilation,
  hypothesisBioaerosol,
  hypothesisVoc,
  hypothesisParticulate,
  hypothesisCombustion,
  hypothesisAtmosphericCorrosion,
]

/**
 * v2.6 §3 — Run every hypothesis rule against the assessment
 * input and return the union of fired hypotheses. Each rule is a
 * pure function of (zonesData, buildingData, findings, zones).
 * A hypothesis fires when at least one trigger indicator is
 * present; multiple independent indicators raise its confidence.
 */
export function deriveHypotheses(
  input: HypothesisInput,
): ReadonlyArray<Hypothesis> {
  const out: Hypothesis[] = []
  for (const rule of RULES) {
    const result = rule(input)
    if (result) out.push(result)
  }
  return out
}

// Internals re-exported for tests so individual hypothesis rules
// can be exercised in isolation.
export const __testing = {
  hypothesisVentilation,
  hypothesisBioaerosol,
  hypothesisVoc,
  hypothesisParticulate,
  hypothesisCombustion,
  hypothesisAtmosphericCorrosion,
  isDataCenterSpace,
  hasNeurologicalSymptoms,
  hasRespiratorySymptoms,
}
