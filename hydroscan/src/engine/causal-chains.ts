/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Causal-chain engine — links field observations (plumbing, source, building
 * conditions) to lab findings to surface candidate contamination pathways:
 * lead, microbial, Legionella, nitrate, and corrosion. Screening-only — these
 * are hypotheses with a stated confidence, not causation determinations.
 *
 * Engine v1.1 (Phase 3): confidence is now a weighted-evidence score (anchor
 * finding + corroborating evidence) mapped to a label, and each chain carries
 * a dataGaps list — what additional data would raise confidence. The corrosion
 * chain folds in the Langelier Saturation Index when its inputs are present.
 */

import { computeLSI } from './lsi'
import type { CausalChain, Finding } from '../types/engine'

type FieldData = Record<string, any>

/**
 * Weighted confidence. The triggering lab finding is the anchor (0.4); each
 * corroborating field/lab evidence item adds 0.2 up to +0.6. The thresholds
 * preserve the prior labels (≥3 evidence ≈ Strong, ≥2 ≈ Moderate) while making
 * the score explicit for the report.
 */
function score(evidenceCount: number): { confidence: CausalChain['confidence']; confidenceScore: number } {
  const corroborating = Math.max(0, evidenceCount - 1)
  const s = Math.min(1, 0.4 + Math.min(0.6, corroborating * 0.2))
  const confidence = s >= 0.75 ? 'Strong' : s >= 0.5 ? 'Moderate' : 'Preliminary'
  return { confidence, confidenceScore: Number(s.toFixed(2)) }
}

export function buildWaterCausalChains(fieldData: FieldData, labFindings: Finding[]): CausalChain[] {
  const chains: CausalChain[] = []
  const fd = fieldData || {}
  const num = (id: string): number | null => {
    const f = labFindings?.find((x) => x.param.id === id)
    const v = f ? parseFloat(String(f.value)) : NaN
    return isNaN(v) ? null : v
  }

  // Lead pathway
  const leadF = labFindings?.find((f) => f.param.id === 'pb' && f.violations.length > 0)
  if (leadF) {
    const ev = [`Lead ${leadF.value} µg/L — exceeds Action Level`]
    const gaps: string[] = []
    if ((fd.b_pipe_mat || '').includes('Lead')) ev.push('Lead service line identified')
    else if (!fd.b_pipe_mat || fd.b_pipe_mat === 'Unknown' || fd.b_pipe_mat === 'Not accessible') gaps.push('Service line material not confirmed')
    if ((fd.b_int_pipe || '').includes('lead')) ev.push('Pre-1986 copper with potential lead solder')
    if ((fd.b_fix_age || '').includes('Pre-')) ev.push('Older fixtures may contain lead')
    const phF = labFindings?.find((f) => f.param.id === 'ph')
    if (phF && (phF.value as number) < 7) ev.push(`Low pH (${phF.value}) — corrosive water leaches lead`)
    else if (!phF) gaps.push('pH not measured — corrosivity unknown')
    if (fd.b_stag && fd.b_stag !== 'No — all areas in regular use') ev.push('Stagnation present — increases lead leaching')
    chains.push({ type: 'Lead Contamination', evidence: ev, ...score(ev.length), dataGaps: gaps, severity: 'critical', recommendation: 'Implement corrosion control, flush before use, consider lead service line replacement. For children under 6: use only cold water for drinking and cooking, run water 2+ minutes after stagnation.' })
  }

  // Microbial contamination (private wells)
  const ecoliF = labFindings?.find((f) => f.param.id === 'ecoli' && f.violations.length > 0)
  const tcF = labFindings?.find((f) => f.param.id === 'tc' && f.violations.length > 0)
  if (ecoliF || tcF) {
    const ev: string[] = []
    const gaps: string[] = []
    if (ecoliF) ev.push('E. coli detected — fecal contamination confirmed')
    if (tcF && !ecoliF) ev.push('Total coliforms detected — treatment/distribution concern')
    if ((fd.src_well_cap || '') !== 'Sealed — good condition' && fd.src_type?.includes('well')) ev.push(`Well cap: ${fd.src_well_cap || 'unknown condition'}`)
    if ((fd.src_well_flood || '') === 'Yes — significant flooding') ev.push('Recent flooding of well area')
    else if (!fd.src_well_flood) gaps.push('Recent flooding history not recorded')
    if ((fd.src_well_prox || []).some((p: string) => p.includes('Septic'))) ev.push('Septic system within proximity')
    else if (!(fd.src_well_prox || []).length) gaps.push('Proximity to contamination sources not assessed')
    const turbF = labFindings?.find((f) => f.param.id === 'turb' && (f.violations.length > 0 || f.advisories.length > 0))
    if (turbF) ev.push(`Elevated turbidity (${turbF.value} NTU) — may harbor pathogens`)
    chains.push({ type: 'Microbial Contamination', evidence: ev, ...score(ev.length), dataGaps: gaps, severity: 'critical', recommendation: ecoliF ? 'IMMEDIATE: Issue boil water advisory. Shock chlorinate well. Investigate contamination source. Retest after treatment. Consider UV disinfection.' : 'Repeat sampling within 24 hours. If confirmed, investigate source and disinfect.' })
  }

  // Legionella risk (building systems)
  if (fd.b_wh_temp && !['140°F or above', 'Unknown'].includes(fd.b_wh_temp)) {
    const ev = [`Water heater temperature: ${fd.b_wh_temp}`]
    const gaps: string[] = []
    if (fd.b_stag && fd.b_stag !== 'No — all areas in regular use') ev.push(`Stagnation: ${fd.b_stag}`)
    if (fd.b_deadlegs === 'Yes' || fd.b_deadlegs === 'Suspected') ev.push('Dead legs present — high-risk stagnation zones')
    else if (!fd.b_deadlegs) gaps.push('Dead-leg survey not recorded')
    if (fd.b_wh_age && ['10–15 years', 'Over 15 years'].includes(fd.b_wh_age)) ev.push(`Aging water heater (${fd.b_wh_age}) — biofilm accumulation risk`)
    if ((fd.b_visual || []).includes('Biofilm / slime at fixtures')) ev.push('Visible biofilm observed at fixtures')
    gaps.push('Legionella culture (ISO 11731 / CDC ELITE) not yet collected')
    if (ev.length >= 2) chains.push({ type: 'Legionella Risk Factors', evidence: ev, ...score(ev.length), dataGaps: gaps, severity: 'high', recommendation: 'Implement water management program per ASHRAE 188-2018. Raise stored water temperature to ≥140°F (60°C). Flush low-use fixtures weekly. Consider Legionella culture testing. Consult with water management specialist.' })
  }

  // Nitrate contamination (agricultural/septic)
  const no3F = labFindings?.find((f) => f.param.id === 'no3' && (f.violations.length > 0 || f.advisories.length > 0))
  if (no3F) {
    const ev = [`Nitrate: ${no3F.value} mg/L`]
    const gaps: string[] = []
    if ((fd.src_well_prox || []).some((p: string) => p.includes('Agricultural') || p.includes('Septic'))) ev.push('Contamination source nearby: ' + (fd.src_well_prox || []).filter((p: string) => p.includes('Agricultural') || p.includes('Septic')).join(', '))
    else gaps.push('Agricultural/septic proximity not confirmed')
    if (fd.b_children === 'Yes') ev.push('VULNERABLE POPULATION: Children under 6 present — methemoglobinemia risk')
    else if (!fd.b_children) gaps.push('Presence of infants/pregnant occupants not recorded')
    chains.push({ type: 'Nitrate Contamination', evidence: ev, ...score(ev.length), dataGaps: gaps, severity: no3F.violations.length > 0 ? 'critical' : 'high', recommendation: 'Do not use for infant formula preparation. Identify and eliminate contamination source. Consider treatment (ion exchange or RO). Retest quarterly.' })
  }

  // Corrosion indicators (+ Langelier Saturation Index when inputs are present)
  const phF = labFindings?.find((f) => f.param.id === 'ph' && f.advisories.length > 0 && (f.value as number) < 6.5)
  const cuF = labFindings?.find((f) => f.param.id === 'cu' && (f.violations.length > 0 || f.advisories.length > 0))
  if (phF || (cuF && leadF)) {
    const ev: string[] = []
    const gaps: string[] = []
    if (phF) ev.push(`Low pH (${phF.value}) — aggressive/corrosive water`)
    if (leadF) ev.push(`Elevated lead (${leadF.value} µg/L)`)
    if (cuF) ev.push(`Elevated copper (${cuF.value} mg/L)`)
    if ((fd.b_visual || []).includes('Green / blue staining (copper)')) ev.push('Blue-green staining observed at fixtures')

    const lsi = computeLSI({
      ph: num('ph') ?? undefined,
      tds: num('tds') ?? undefined,
      tempC: fd.f_temp != null && fd.f_temp !== '' ? (parseFloat(fd.f_temp) - 32) * (5 / 9) : undefined,
      calciumHardness: num('hard') ?? undefined,
      alkalinity: fd.f_alkalinity != null && fd.f_alkalinity !== '' ? parseFloat(fd.f_alkalinity) : undefined,
    })
    if (lsi) ev.push(lsi.interpretation)
    else gaps.push('Langelier Index not computable — need pH, total alkalinity, calcium hardness, TDS, and temperature')

    if (ev.length >= 2) chains.push({ type: 'Corrosive Water / Pipe Leaching', evidence: ev, ...score(ev.length), dataGaps: gaps, severity: leadF ? 'critical' : 'high', recommendation: 'Install acid neutralizer (calcite/corosex) to raise pH. Consider phosphate-based corrosion inhibitor. Replace lead components. Monitor lead/copper quarterly.' })
  }

  return chains
}
