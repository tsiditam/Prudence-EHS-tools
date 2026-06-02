/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Sampling-plan generator — hypothesis-driven recommendations keyed to the
 * source-pathway-receptor model, with EPA/Standard-Methods method numbers,
 * containers, preservatives, and hold times. Method/standard strings are
 * sourced from the standards manifest bibliography.
 *
 * Ported verbatim from the original App.jsx (Phase 1 relocation).
 */

import type { SamplingPlanItem } from '../types/engine'

type FieldData = Record<string, any>

export function generateSamplingPlan(fieldData: FieldData): SamplingPlanItem[] {
  const plan: SamplingPlanItem[] = []
  const fd = fieldData || {}
  const isWell = (fd.src_type || '').includes('well') || (fd.src_type || '') === 'Spring'

  // Always recommend for private wells with no recent testing
  if (isWell && fd.src_history !== 'Tested within 1 year') {
    plan.push({ test: 'Basic Water Chemistry', method: 'EPA 200.7/200.8 (metals), SM 4500 (nutrients)', params: 'Total Coliforms, E. coli, Nitrate, Lead, Copper, pH, Iron, Manganese, TDS, Hardness', trigger: 'Private well without recent testing', hold: 'Bacteria: 6 hours on ice. Metals: HNO₃ preserved, 180 days', notes: 'First-draw sample for lead (stagnation ≥ 6 hours). Second draw for general chemistry.', std: 'EPA Private Well Guidelines' })
  }

  // Lead/Copper — any building with risk factors
  if ((fd.b_pipe_mat || '').includes('Lead') || (fd.b_int_pipe || '').includes('lead') || (fd.b_int_pipe || '').includes('Galvanized') || (fd.b_fix_age || '').includes('Pre-')) {
    plan.push({ test: 'Lead & Copper — First Draw / Flush Profile', method: 'EPA 200.8 (ICP-MS)', params: 'Lead (Pb), Copper (Cu)', trigger: `Plumbing risk: ${fd.b_pipe_mat || 'unknown service line'}, ${fd.b_int_pipe || 'unknown interior'}`, hold: '250 mL first-draw after ≥ 6-hour stagnation. Preserve with HNO₃. 180-day hold.', notes: 'Collect 1st draw (1L), 2nd draw (1L), and flushed sample per EPA 3Ts protocol. Compare to identify lead source (service line vs. interior vs. fixture).', std: 'EPA 3Ts, Lead and Copper Rule Revisions (LCRR 2024)' })
  }

  // Microbial — wells near septic, flooding, complaints
  if ((fd.src_well_prox || []).some((p: string) => p.includes('Septic')) || (fd.src_well_flood || '').includes('Yes') || (fd.src_complaints || []).includes('Gastrointestinal illness')) {
    plan.push({ test: 'Microbial Panel', method: 'SM 9223 (Colilert)', params: 'Total Coliforms, E. coli, Heterotrophic Plate Count', trigger: fd.src_well_flood?.includes('Yes') ? 'Recent flooding of well area' : 'Septic system proximity or GI complaints', hold: 'Sterile container with Na₂S₂O₃ if chlorinated. Ice, <10°C. 6-hour hold time (strict).', notes: 'Sample at point of use (kitchen cold water tap). Do not flame or pre-flush for bacteria samples.', std: 'EPA Total Coliform Rule' })
  }

  // Legionella — building risk factors
  if (fd.b_stag && fd.b_stag !== 'No — all areas in regular use' && fd.b_type && !['Single family residence'].includes(fd.b_type)) {
    plan.push({ test: 'Legionella Culture', method: 'ISO 11731, CDC ELITE protocol', params: 'Legionella pneumophila, Legionella spp.', trigger: `Stagnation: ${fd.b_stag}. Water heater: ${fd.b_wh_temp || 'unknown'}`, hold: 'Sterile container, no preservative. Room temp. 24-hour hold.', notes: 'Sample from distal fixtures (furthest from water heater), hot water return, water heater drain, and any cooling towers. Include hot and cold samples.', std: 'ASHRAE 188-2018, ASHRAE Guideline 12-2020' })
  }

  // VOCs — near industrial, USTs, or chemical complaints
  if ((fd.src_well_prox || []).some((p: string) => p.includes('Underground') || p.includes('Industrial')) || (fd.src_complaints || []).includes('Chemical / solvent') || (fd.b_odor || '') === 'Chemical / solvent') {
    plan.push({ test: 'VOC Screen', method: 'EPA 524.2 (GC-MS)', params: '60+ compounds including benzene, TCE, PCE, vinyl chloride, MTBE', trigger: fd.src_well_prox?.filter((p: string) => p.includes('Underground') || p.includes('Industrial')).join(', ') || 'Chemical odor reported', hold: '40 mL VOA vials with HCl preservative. Zero headspace. Ice. 14-day hold.', notes: 'Sample from raw (untreated) water source. Avoid splashing or aerating sample.', std: 'EPA SDWA VOC MCLs' })
  }

  // Aesthetic complaints
  if ((fd.src_complaints || []).some((c: string) => ['Discoloration (brown/yellow/black)', 'Metallic taste', 'Rotten egg / sulfur odor', 'Staining (fixtures/laundry)'].includes(c))) {
    const existing = plan.find((p) => p.params?.includes('Iron'))
    if (!existing) {
      plan.push({ test: 'Aesthetic / Secondary Parameters', method: 'EPA 200.7, SM 4500, SM 2120', params: 'Iron, Manganese, Sulfate, Chloride, TDS, pH, Color, Hardness', trigger: `Complaints: ${(fd.src_complaints || []).filter((c: string) => !['No complaints', 'Gastrointestinal illness', 'Skin irritation / rash', 'Low pressure'].includes(c)).join(', ')}`, hold: 'Metals: HNO₃ preserved. General: ice, unpreserved. 180-day / 28-day hold.', notes: 'Include both first-draw and flushed samples to differentiate plumbing source from supply source.', std: 'EPA Secondary MCLs' })
    }
  }

  // Radionuclides — well in known radionuclide area or if comprehensive
  if (isWell && fd.src_well_depth && parseInt(fd.src_well_depth) > 200) {
    plan.push({ test: 'Radionuclide Screen', method: 'EPA 900.0', params: 'Gross Alpha, Radium 226+228', trigger: `Deep well (${fd.src_well_depth} ft) — bedrock aquifer`, hold: 'HNO₃ or HCl preserved. 180-day hold.', notes: 'If gross alpha > 5 pCi/L, follow up with speciated analysis. Granite/metamorphic bedrock increases risk.', std: 'EPA SDWA Radionuclide MCLs' })
  }

  // PFAS — near military bases, airports, industrial sites, firefighting facilities
  if ((fd.src_well_prox || []).some((p: string) => p.includes('Industrial')) || (fd.src_trigger || '') === 'Nearby contamination event' || isWell) {
    plan.push({ test: 'PFAS Panel (6 Regulated Compounds)', method: 'EPA 533 or EPA 537.1 (LC-MS/MS)', params: 'PFOA, PFOS, PFHxS, PFNA, HFPO-DA (GenX), PFBS + Hazard Index calculation', trigger: isWell ? 'Private well — EPA recommends PFAS testing for all private wells near potential sources' : 'Potential PFAS source proximity', hold: 'HDPE or polypropylene bottle (no glass). Trizma preservative. Ice. 14-day hold. No field filtering.', notes: 'PFAS contamination sources include: military bases (AFFF firefighting foam), airports, landfills, wastewater treatment plants, and industrial facilities. Detection limits must be ≤2 ppt for PFOA/PFOS compliance evaluation.', std: 'EPA PFAS NPDWR (40 CFR 141, April 2024)' })
  }

  return plan
}
