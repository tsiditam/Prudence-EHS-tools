/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * This software is the proprietary information of Prudence Safety
 * & Environmental Consulting, LLC. Unauthorized copying, modification,
 * distribution, or use is strictly prohibited.
 *
 * Contact: tsidi@prudenceehs.com
 */

import { STD } from '../constants/standards'
import { detectSBSPattern } from './scoring'

export function buildCausalChains(zones, bldg, zoneScores) {
  const chains = []
  zoneScores.forEach((zs, i) => {
    const z = zones[i] || {}, d = { ...bldg, ...z }, zName = zs.zoneName

    // Gap 3: SBS pattern fires causal chains from complaints alone
    const sbsDetected = detectSBSPattern(d)
    if (sbsDetected && !chains.some(c => c.zone === zName && c.type === 'Ventilation Deficiency')) {
      const ev = []
      if (d.ac) ev.push((d.ac) + ' occupants with symptoms')
      if (d.sr === 'Yes — clear pattern') ev.push('Symptoms resolve when away from building')
      if (d.cc === 'Yes — this zone') ev.push('Symptom clustering in this zone')
      if ((d.sy||[]).length) ev.push('Reported: ' + d.sy.join(', '))
      chains.push({ zone: zName, type: 'SBS Pattern — Ventilation Deficiency Hypothesis',
        rootCause: 'Occupant symptom pattern consistent with sick building syndrome. Under-delivered outdoor air is the most common contributor and should be investigated first.',
        evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate' })
      chains.push({ zone: zName, type: 'SBS Pattern — Bioaerosol / Microbial Hypothesis',
        rootCause: 'Hidden moisture or microbial amplification cannot be ruled out without moisture mapping and bioaerosol sampling.',
        evidence: [...ev, 'Hypothesis — requires confirmatory investigation'], confidence: 'Possible' })
      chains.push({ zone: zName, type: 'SBS Pattern — VOC Source Hypothesis',
        rootCause: 'New materials, cleaning products, or adjacent processes may be contributing VOCs not captured by walkthrough.',
        evidence: [...ev, 'Hypothesis — requires TVOC/speciation sampling'], confidence: 'Possible' })
    }

    // Ventilation deficiency chain (measurement-based)
    const ventScore = zs.cats.find(c => c.l === 'Ventilation')
    const hasVentIssue = ventScore && ventScore.s !== null && ventScore.s <= 15
    const hasSymptomsRelated = d.cx === 'Yes — complaints reported' && d.sr === 'Yes — clear pattern'
    const hasDamperIssue = d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable'
    const hasWeakFlow = d.sa === 'Weak / reduced' || d.sa === 'No airflow detected'
    if (hasVentIssue && (hasSymptomsRelated || hasDamperIssue || hasWeakFlow)) {
      const ev = []
      if (d.co2) ev.push('CO₂ at ' + d.co2 + ' ppm')
      if (hasDamperIssue) ev.push('OA damper: ' + d.od)
      if (hasWeakFlow) ev.push('Supply airflow: ' + d.sa)
      if (hasSymptomsRelated) ev.push((d.ac||'Multiple') + ' occupants with building-related symptoms')
      if (!chains.some(c => c.zone === zName && c.type.includes('Ventilation')))
        chains.push({ zone: zName, type: 'Ventilation Deficiency', rootCause: hasDamperIssue ? 'Outdoor air damper restriction limiting fresh air delivery' : 'Inadequate ventilation rate for occupant load', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : ev.length >= 2 ? 'Moderate' : 'Possible' })
    }
    // Moisture chain
    const hasWater = d.wd === 'Active leak' || d.wd === 'Extensive damage'
    const hasMold = d.mi && !['None','Suspected discoloration'].includes(d.mi)
    const hasMusty = (d.ot||[]).includes('Musty / Earthy')
    const hasResp = (d.sy||[]).some(s => ['Cough','Wheezing','Nasal congestion','Throat irritation'].includes(s))
    if ((hasWater||hasMold||hasMusty) && (hasMold||hasMusty||hasResp)) {
      const ev = []
      if (hasWater) ev.push('Water intrusion: ' + d.wd)
      if (hasMold) ev.push('Visible mold: ' + d.mi)
      if (hasMusty) ev.push('Musty/earthy odor')
      if (hasResp) ev.push('Respiratory symptoms reported')
      if (d.rh && +d.rh > 60) ev.push('Indoor RH at ' + d.rh + '%')
      chains.push({ zone: zName, type: 'Moisture / Biological', rootCause: hasWater ? 'Active water intrusion supporting microbial amplification' : 'Chronic moisture condition with biological growth indicators', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate' })
    }
    // Chemical chain
    const hasSrc = (d.src_internal||[]).length > 0 || (d.src_adjacent||[]).length > 0
    const hasVOC = d.tv && +d.tv > STD.c.tvoc.con
    const hasHCHO = d.hc && +d.hc > STD.c.hcho.niosh
    const hasIrr = (d.sy||[]).some(s => ['Eye irritation','Headache','Throat irritation'].includes(s))
    if (hasSrc && (hasVOC || hasHCHO) && hasIrr) {
      const ev = []
      if (hasVOC) ev.push('TVOCs at ' + d.tv + ' µg/m³')
      if (hasHCHO) ev.push('HCHO at ' + d.hc + ' ppm')
      ev.push('Sources: ' + [...(d.src_internal||[]),...(d.src_adjacent||[])].filter(s => s !== 'None identified').join(', '))
      ev.push('Irritation symptoms reported')
      chains.push({ zone: zName, type: 'Chemical Exposure', rootCause: 'Contaminant source(s) producing elevated concentrations with correlated symptoms', evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate' })
    }
    // Cross-contamination chain
    if (d.path_crosstalk && d.path_crosstalk !== 'None observed' && d.path_crosstalk !== 'Not assessed') {
      const ev = ['Cross-contamination: ' + d.path_crosstalk]
      if (d.path_crosstalk_source) ev.push('Source: ' + d.path_crosstalk_source)
      if (d.path_pressure === 'Negative (draws in)') ev.push('Zone under negative pressure')
      chains.push({ zone: zName, type: 'Cross-Contamination Pathway', rootCause: 'Air pathway allowing contaminant migration from adjacent source', evidence: ev, confidence: ev.length >= 2 ? 'Moderate' : 'Possible' })
    }
    // Data center: Gaseous Corrosion Risk (screening hypothesis)
    if (d.zone_subtype === 'data_hall') {
      const hasCorrosion = d.gaseous_corrosion && (d.gaseous_corrosion.includes('G2') || d.gaseous_corrosion.includes('G3') || d.gaseous_corrosion.includes('GX'))
      const hasHighRH = d.rh && +d.rh > 60
      if (hasCorrosion && hasHighRH) {
        const ev = [`Screening indicators consistent with elevated gaseous corrosion risk (assessor-selected: ${d.gaseous_corrosion})`, `Relative humidity: ${d.rh}% (exceeds ASHRAE TC 9.9 A1/A2 upper bound of 60%)`]
        if (d.dp_temp) ev.push(`Dew point: ${d.dp_temp}°F`)
        if (d.pm) ev.push(`PM2.5 mass: ${d.pm} µg/m³ (elevated if >10 for MERV-filtered data hall)`)
        chains.push({ zone: zName, type: 'Gaseous Corrosion Risk (Screening)', rootCause: 'Elevated humidity combined with screening indicators of gaseous contamination creates conditions consistent with accelerated creep corrosion risk on circuit board surfaces. Definitive G-class determination requires 30-day passive copper+silver reactivity coupon deployment per ANSI/ISA 71.04-2013.', evidence: ev, confidence: 'Low (screening-only data)', refutableBy: 'Coupon results returning G1 (<300 Å Cu, <200 Å Ag per month). Particle count data showing ISO Class within target. Outdoor air screening showing no upwind sulfur sources.', std: 'ANSI/ISA 71.04-2013 (screening); ASHRAE TC 9.9' })
      }
      if (hasCorrosion && !hasHighRH) {
        chains.push({ zone: zName, type: 'Gaseous Contamination Concern (Screening)', rootCause: 'Screening indicators suggest gaseous corrosion environment may exceed G1 (mild). Source investigation recommended — evaluate outdoor air ingress, gas-phase filter media condition, and adjacent-space process changes.', evidence: [`Screening indicator: ${d.gaseous_corrosion} (assessor-selected, not coupon-measured)`, 'RH currently within ASHRAE TC 9.9 control range'], confidence: 'Low (screening-only data)', refutableBy: 'Coupon results returning G1 (<300 Å Cu, <200 Å Ag per month).', std: 'ANSI/ISA 71.04-2013 (screening)' })
      }
    }
  })
  return chains
}