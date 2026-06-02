/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Causal-chain engine — links field observations (plumbing, source, building
 * conditions) to lab findings to surface candidate contamination pathways:
 * lead, microbial, Legionella, nitrate, and corrosion. Screening-only —
 * these are hypotheses with stated confidence, not causation determinations.
 *
 * Ported verbatim from the original App.jsx (Phase 1 relocation).
 */

import type { CausalChain, Finding } from '../types/engine'

type FieldData = Record<string, any>

export function buildWaterCausalChains(fieldData: FieldData, labFindings: Finding[]): CausalChain[] {
  const chains: CausalChain[] = []
  const fd = fieldData || {}

  // Lead pathway
  const leadF = labFindings?.find((f) => f.param.id === 'pb' && f.violations.length > 0)
  if (leadF) {
    const ev = [`Lead ${leadF.value} µg/L — exceeds Action Level`]
    if ((fd.b_pipe_mat || '').includes('Lead')) ev.push('Lead service line identified')
    if ((fd.b_int_pipe || '').includes('lead')) ev.push('Pre-1986 copper with potential lead solder')
    if ((fd.b_fix_age || '').includes('Pre-')) ev.push('Older fixtures may contain lead')
    const phF = labFindings?.find((f) => f.param.id === 'ph')
    if (phF && (phF.value as number) < 7) ev.push(`Low pH (${phF.value}) — corrosive water leaches lead`)
    if (fd.b_stag && fd.b_stag !== 'No — all areas in regular use') ev.push('Stagnation present — increases lead leaching')
    chains.push({ type: 'Lead Contamination', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : ev.length >= 2 ? 'Moderate' : 'Preliminary', severity: 'critical', recommendation: 'Implement corrosion control, flush before use, consider lead service line replacement. For children under 6: use only cold water for drinking and cooking, run water 2+ minutes after stagnation.' })
  }

  // Microbial contamination (private wells)
  const ecoliF = labFindings?.find((f) => f.param.id === 'ecoli' && f.violations.length > 0)
  const tcF = labFindings?.find((f) => f.param.id === 'tc' && f.violations.length > 0)
  if (ecoliF || tcF) {
    const ev: string[] = []
    if (ecoliF) ev.push('E. coli detected — fecal contamination confirmed')
    if (tcF && !ecoliF) ev.push('Total coliforms detected — treatment/distribution concern')
    if ((fd.src_well_cap || '') !== 'Sealed — good condition' && fd.src_type?.includes('well')) ev.push(`Well cap: ${fd.src_well_cap || 'unknown condition'}`)
    if ((fd.src_well_flood || '') === 'Yes — significant flooding') ev.push('Recent flooding of well area')
    if ((fd.src_well_prox || []).some((p: string) => p.includes('Septic'))) ev.push('Septic system within proximity')
    const turbF = labFindings?.find((f) => f.param.id === 'turb' && (f.violations.length > 0 || f.advisories.length > 0))
    if (turbF) ev.push(`Elevated turbidity (${turbF.value} NTU) — may harbor pathogens`)
    chains.push({ type: 'Microbial Contamination', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate', severity: 'critical', recommendation: ecoliF ? 'IMMEDIATE: Issue boil water advisory. Shock chlorinate well. Investigate contamination source. Retest after treatment. Consider UV disinfection.' : 'Repeat sampling within 24 hours. If confirmed, investigate source and disinfect.' })
  }

  // Legionella risk (building systems)
  if (fd.b_wh_temp && !['140°F or above', 'Unknown'].includes(fd.b_wh_temp)) {
    const ev = [`Water heater temperature: ${fd.b_wh_temp}`]
    if (fd.b_stag && fd.b_stag !== 'No — all areas in regular use') ev.push(`Stagnation: ${fd.b_stag}`)
    if (fd.b_deadlegs === 'Yes' || fd.b_deadlegs === 'Suspected') ev.push('Dead legs present — high-risk stagnation zones')
    if (fd.b_wh_age && ['10–15 years', 'Over 15 years'].includes(fd.b_wh_age)) ev.push(`Aging water heater (${fd.b_wh_age}) — biofilm accumulation risk`)
    if ((fd.b_visual || []).includes('Biofilm / slime at fixtures')) ev.push('Visible biofilm observed at fixtures')
    if (ev.length >= 2) chains.push({ type: 'Legionella Risk Factors', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate', severity: 'high', recommendation: 'Implement water management program per ASHRAE 188-2018. Raise stored water temperature to ≥140°F (60°C). Flush low-use fixtures weekly. Consider Legionella culture testing. Consult with water management specialist.' })
  }

  // Nitrate contamination (agricultural/septic)
  const no3F = labFindings?.find((f) => f.param.id === 'no3' && (f.violations.length > 0 || f.advisories.length > 0))
  if (no3F) {
    const ev = [`Nitrate: ${no3F.value} mg/L`]
    if ((fd.src_well_prox || []).some((p: string) => p.includes('Agricultural') || p.includes('Septic'))) ev.push('Contamination source nearby: ' + (fd.src_well_prox || []).filter((p: string) => p.includes('Agricultural') || p.includes('Septic')).join(', '))
    if (fd.b_children === 'Yes') ev.push('VULNERABLE POPULATION: Children under 6 present — methemoglobinemia risk')
    chains.push({ type: 'Nitrate Contamination', evidence: ev, confidence: ev.length >= 2 ? 'Moderate' : 'Preliminary', severity: no3F.violations.length > 0 ? 'critical' : 'high', recommendation: 'Do not use for infant formula preparation. Identify and eliminate contamination source. Consider treatment (ion exchange or RO). Retest quarterly.' })
  }

  // Corrosion indicators
  const phF = labFindings?.find((f) => f.param.id === 'ph' && f.advisories.length > 0 && (f.value as number) < 6.5)
  const cuF = labFindings?.find((f) => f.param.id === 'cu' && (f.violations.length > 0 || f.advisories.length > 0))
  if (phF || (cuF && leadF)) {
    const ev: string[] = []
    if (phF) ev.push(`Low pH (${phF.value}) — aggressive/corrosive water`)
    if (leadF) ev.push(`Elevated lead (${leadF.value} µg/L)`)
    if (cuF) ev.push(`Elevated copper (${cuF.value} mg/L)`)
    if ((fd.b_visual || []).includes('Green / blue staining (copper)')) ev.push('Blue-green staining observed at fixtures')
    if (ev.length >= 2) chains.push({ type: 'Corrosive Water / Pipe Leaching', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate', severity: leadF ? 'critical' : 'high', recommendation: 'Install acid neutralizer (calcite/corosex) to raise pH. Consider phosphate-based corrosion inhibitor. Replace lead components. Monitor lead/copper quarterly.' })
  }

  return chains
}
