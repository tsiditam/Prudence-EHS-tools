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

export function buildCausalChains(zones, bldg, zoneScores) {
  const chains = []
  zoneScores.forEach((zs, i) => {
    const z = zones[i] || {}, d = { ...bldg, ...z }, zName = zs.zoneName
    // Ventilation deficiency chain
    const ventScore = zs.cats.find(c => c.l === 'Ventilation')
    const hasVentIssue = ventScore && ventScore.s <= 15
    const hasSymptomsRelated = d.cx === 'Yes — complaints reported' && d.sr === 'Yes — clear pattern'
    const hasDamperIssue = d.od === 'Closed / minimum' || d.od === 'Stuck / inoperable'
    const hasWeakFlow = d.sa === 'Weak / reduced' || d.sa === 'No airflow detected'
    if (hasVentIssue && (hasSymptomsRelated || hasDamperIssue || hasWeakFlow)) {
      const ev = []
      if (d.co2) ev.push('CO2 at '+d.co2+' ppm')
      if (hasDamperIssue) ev.push('OA damper: '+d.od)
      if (hasWeakFlow) ev.push('Supply airflow: '+d.sa)
      if (hasSymptomsRelated) ev.push((d.ac||'Multiple')+' occupants with building-related symptoms')
      chains.push({ zone:zName, type:'Ventilation Deficiency',
        rootCause: hasDamperIssue?'Outdoor air damper restriction limiting fresh air delivery':'Inadequate ventilation rate for occupant load',
        evidence:ev, confidence:ev.length>=3?'Strong':ev.length>=2?'Moderate':'Possible' })
    }
    // Moisture chain
    const hasWater = d.wd==='Active leak'||d.wd==='Extensive damage'
    const hasMold  = d.mi&&!['None','Suspected discoloration'].includes(d.mi)
    const hasMusty = (d.ot||[]).includes('Musty / Earthy')
    const hasResp  = (d.sy||[]).some(s=>['Cough','Wheezing','Nasal congestion','Throat irritation'].includes(s))
    if ((hasWater||hasMold||hasMusty)&&(hasMold||hasMusty||hasResp)) {
      const ev = []
      if (hasWater) ev.push('Water intrusion: '+d.wd)
      if (hasMold)  ev.push('Visible mold: '+d.mi)
      if (hasMusty) ev.push('Musty/earthy odor present')
      if (hasResp)  ev.push('Respiratory symptoms: '+(d.sy||[]).filter(s=>['Cough','Wheezing','Nasal congestion'].includes(s)).join(', '))
      if (d.rh&&+d.rh>60) ev.push('Indoor RH at '+d.rh+'%')
      chains.push({ zone:zName, type:'Moisture / Biological',
        rootCause:hasWater?'Active water intrusion supporting microbial amplification':'Chronic moisture condition with biological growth indicators',
        evidence:ev, confidence:ev.length>=3?'Strong':'Moderate' })
    }
    // Chemical chain
    const hasSrc  = (d.src_internal||[]).length>0||(d.src_adjacent||[]).length>0
    const hasVOC  = d.tv&&+d.tv>STD.c.tvoc.con
    const hasHCHO = d.hc&&+d.hc>STD.c.hcho.niosh
    const hasIrr  = (d.sy||[]).some(s=>['Eye irritation','Headache','Throat irritation'].includes(s))
    if (hasSrc&&(hasVOC||hasHCHO)&&hasIrr) {
      const ev = []
      if (hasVOC)  ev.push('TVOCs at '+d.tv+' ug/m3')
      if (hasHCHO) ev.push('HCHO at '+d.hc+' ppm')
      ev.push('Sources: '+[...(d.src_internal||[]),...(d.src_adjacent||[])].filter(s=>s!=='None identified'&&s!=='None of concern').join(', '))
      ev.push('Irritation symptoms: '+(d.sy||[]).filter(s=>['Eye irritation','Headache','Throat irritation'].includes(s)).join(', '))
      chains.push({ zone:zName, type:'Chemical Exposure',
        rootCause:'Identified contaminant source(s) producing elevated chemical concentrations with correlated irritation symptoms',
        evidence:ev, confidence:ev.length>=3?'Strong':'Moderate' })
    }
    // Cross-contamination chain
    if (d.path_crosstalk&&d.path_crosstalk!=='None observed'&&d.path_crosstalk!=='Not assessed') {
      const ev = ['Cross-contamination observed: '+d.path_crosstalk]
      if (d.path_crosstalk_source) ev.push('Source: '+d.path_crosstalk_source)
      if (d.path_pressure==='Negative (draws in)') ev.push('Zone under negative pressure — drawing in contaminated air')
      chains.push({ zone:zName, type:'Cross-Contamination Pathway',
        rootCause:'Air pathway allowing contaminant migration from adjacent source into occupied zone',
        evidence:ev, confidence:ev.length>=2?'Moderate':'Possible' })
    }
  })
  return chains
}