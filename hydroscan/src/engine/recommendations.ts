/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Recommendation engine — buckets findings + causal-chain guidance into
 * Immediate / Short-term / Long-term / Monitoring actions. Screening-only.
 *
 * Ported verbatim from the original App.jsx (Phase 1 relocation).
 */

import type { CausalChain, Finding, Recommendations } from '../types/engine'

type FieldData = Record<string, any>

export function generateRecommendations(_tier: string, findings: Finding[], chains: CausalChain[], fieldData: FieldData): Recommendations {
  const recs: Recommendations = { immediate: [], shortTerm: [], longTerm: [], monitoring: [] }
  const fd = fieldData || {}

  findings.forEach((f) => {
    f.violations.forEach((v) => {
      if (v.severity === 'critical') {
        if (f.param.id === 'ecoli') recs.immediate.push('BOIL WATER ADVISORY — Do not consume water without boiling for 1 minute. Notify all occupants immediately.')
        else if (f.param.id === 'pb') recs.immediate.push('Flush cold water taps for 2+ minutes before drinking or cooking. Use only cold water for consumption. Install NSF-certified point-of-use filter rated for lead removal.')
        else if (f.param.id === 'no3' && fd.b_children === 'Yes') recs.immediate.push('DO NOT use water for infant formula preparation. Provide alternative water source for infants and pregnant women.')
        else recs.immediate.push(`${f.param.name} exceeds EPA limit — restrict use pending investigation and treatment.`)
      } else {
        recs.shortTerm.push(`${f.param.name} exceeds ${v.std} (${v.threshold}) — investigate source and treatment options within 30 days.`)
      }
    })
    f.advisories.forEach((a) => {
      if (a.severity === 'medium' || a.severity === 'high') recs.shortTerm.push(`${f.param.name}: ${a.desc} — monitor and consider treatment.`)
      else recs.monitoring.push(`${f.param.name}: ${a.desc} — retest in 6-12 months.`)
    })
  })

  chains.forEach((ch) => {
    if (ch.recommendation && !recs.immediate.includes(ch.recommendation) && !recs.shortTerm.includes(ch.recommendation)) {
      if (ch.severity === 'critical') recs.immediate.push(ch.recommendation)
      else recs.shortTerm.push(ch.recommendation)
    }
  })

  // General monitoring
  if (fd.src_type?.includes('well')) recs.monitoring.push('Private wells: test annually for bacteria, nitrate, and any previously detected contaminants. Test every 3-5 years for comprehensive parameters.')
  if ((fd.b_pipe_mat || '').includes('Lead') || (fd.b_int_pipe || '').includes('lead')) recs.monitoring.push('Lead plumbing identified — test lead levels annually until service line is replaced.')

  return recs
}
