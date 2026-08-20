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

    // Occupant-complaint pattern fires environmental hypotheses
    // from complaints alone. The platform screens building conditions only —
    // it never characterizes occupant health, so no SBS / building-related-
    // illness language appears in any output. Symptom characterization
    // requires an occupant survey + medical/occupational-health input and is
    // outside this assessment's scope.
    const sbsDetected = detectSBSPattern(d)
    if (sbsDetected && !chains.some(c => c.zone === zName && c.type.includes('Ventilation'))) {
      const ev = []
      if (d.ac) ev.push((d.ac) + ' occupants with symptoms')
      if (d.sr === 'Yes — clear pattern') ev.push('Symptoms resolve when away from building')
      if (d.cc === 'Yes — this zone') ev.push('Symptom clustering in this zone')
      if ((d.sy||[]).length) ev.push('Reported: ' + d.sy.join(', '))
      // rootCause states the CAUSE only. What to do about it — check
      // ventilation rates, check damper operation — is a recommendation, and
      // the recommendations register and the actions list both carry it. It
      // used to be appended here, which made the cause too long for its card
      // and got it truncated mid-word in the app.
      chains.push({ zone: zName, type: 'Ventilation Deficiency (Hypothesis)',
        rootCause: 'Occupant complaints were reported in this zone. Insufficient outdoor-air delivery is a common contributor to complaint patterns of this kind.',
        evidence: ev, confidence: ev.length >= 3 ? 'Strong' : 'Moderate' })
      chains.push({ zone: zName, type: 'Microbial / Bioaerosol (Hypothesis)',
        rootCause: 'Concealed moisture or microbial amplification behind finishes remains possible; a walkthrough cannot see it.',
        evidence: [...ev, 'Hypothesis — requires confirmatory investigation'], confidence: 'Possible' })
      chains.push({ zone: zName, type: 'VOC Source (Hypothesis)',
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
      if (!chains.some(c => c.zone === zName && c.type === 'Ventilation Deficiency'))
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
      const hasQuantitative = hasWater || hasMold || (d.rh && +d.rh > 65)
      chains.push({ zone: zName, type: 'Moisture / Biological', rootCause: hasWater ? 'Active water intrusion supporting microbial amplification' : 'Chronic moisture condition with biological growth indicators', evidence: ev, confidence: ev.length >= 4 && hasQuantitative ? 'Strong' : ev.length >= 2 ? 'Moderate' : 'Possible' })
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
    // Data center: Gaseous Corrosion Risk (hypothesis)
    if (d.zone_subtype === 'data_hall') {
      const hasCorrosion = d.gaseous_corrosion && (d.gaseous_corrosion.includes('G2') || d.gaseous_corrosion.includes('G3') || d.gaseous_corrosion.includes('GX'))
      const hasHighRH = d.rh && +d.rh > 60
      if (hasCorrosion && hasHighRH) {
        const ev = [`Walkthrough indicators consistent with elevated gaseous corrosion risk (assessor-selected: ${d.gaseous_corrosion})`, `Relative humidity: ${d.rh}% (exceeds ASHRAE TC 9.9 A1/A2 upper bound of 60%)`]
        if (d.dp_temp) ev.push(`Dew point: ${d.dp_temp}°F`)
        if (d.pm) ev.push(`PM2.5 mass: ${d.pm} µg/m³ (elevated if >10 for MERV-filtered data hall)`)
        chains.push({ zone: zName, type: 'Gaseous Corrosion Risk (Hypothesis)', rootCause: 'Elevated humidity combined with walkthrough indicators of gaseous contamination creates conditions consistent with accelerated creep corrosion on circuit board surfaces.', evidence: ev, confidence: 'Low (walkthrough data only)', refutableBy: 'Coupon results returning G1 (<300 Å Cu, <200 Å Ag per month). Particle count data showing ISO Class within target. Outdoor air sampling showing no upwind sulfur sources.', std: 'ANSI/ISA 71.04-2013 (walkthrough basis); ASHRAE TC 9.9' })
      }
      if (hasCorrosion && !hasHighRH) {
        chains.push({ zone: zName, type: 'Gaseous Contamination Concern (Hypothesis)', rootCause: 'Walkthrough indicators suggest the gaseous corrosion environment may exceed G1 (mild).', evidence: [`Walkthrough indicator: ${d.gaseous_corrosion} (assessor-selected, not coupon-measured)`, 'RH currently within ASHRAE TC 9.9 control range'], confidence: 'Low (walkthrough data only)', refutableBy: 'Coupon results returning G1 (<300 Å Cu, <200 Å Ag per month).', std: 'ANSI/ISA 71.04-2013 (walkthrough basis)' })
      }
    }
  })
  return chains
}