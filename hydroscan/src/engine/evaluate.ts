/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Compliance engine — evaluates entered lab results against the hardcoded
 * standards in src/constants/standards.js and produces a list of findings
 * plus an advisory tier. Screening-only: thresholds live in the standards
 * manifest, never inline here.
 *
 * Ported verbatim from the original App.jsx (Phase 1 relocation). The
 * tier-escalation logic is preserved exactly as shipped; Phase 3 will
 * correct and centralize it under versioned tests.
 */

import { PARAM_MAP } from '../constants/standards.js'
import type { ComplianceResult, Finding, LabResult, Tier } from '../types/engine'

export function evaluateResults(results: LabResult[]): ComplianceResult {
  // results = [{id, value, unit, qualifier}]
  const findings: Finding[] = []
  let tier: Tier = 'compliant' // compliant|monitor|advisory|immediate

  results.forEach((r) => {
    const param = PARAM_MAP[r.id]
    if (!param || r.value === null || r.value === undefined || r.value === '') return

    const val: number | string =
      r.qualifier === 'P' ? 'P' : r.qualifier === 'A' ? 'A' : parseFloat(r.value as string)
    const f: Finding = { param, value: val, qualifier: r.qualifier || null, violations: [], advisories: [], notes: [] }

    // Presence/Absence parameters (coliforms, E. coli)
    if (param.unit === 'P/A') {
      if (val === 'P' || val === 'Detected' || val === 'Present') {
        if (param.id === 'ecoli') {
          f.violations.push({ std: 'EPA MCL', threshold: 'Zero', desc: 'E. coli detected — IMMEDIATE boil water advisory', severity: 'critical' })
          tier = 'immediate'
        } else if (param.id === 'tc') {
          f.violations.push({ std: 'EPA RTCR', threshold: '< 5% positive', desc: 'Total coliforms detected — repeat sampling required', severity: 'high' })
          if (tier !== 'immediate') tier = 'advisory'
        }
      } else {
        f.notes.push('Not detected — compliant')
      }
      findings.push(f)
      return
    }

    if (isNaN(val as number)) {
      findings.push(f)
      return
    }
    const num = val as number

    // pH — range check
    if (param.id === 'ph') {
      const smcl = param.smcl as { min: number; max: number } | undefined
      if (smcl) {
        if (num < smcl.min) {
          f.advisories.push({ std: 'EPA SMCL', threshold: `${smcl.min}–${smcl.max}`, desc: `pH ${num} — corrosive; may leach lead/copper from pipes`, severity: 'high' })
          if (tier === 'compliant') tier = 'advisory'
        } else if (num > smcl.max) {
          f.advisories.push({ std: 'EPA SMCL', threshold: `${smcl.min}–${smcl.max}`, desc: `pH ${num} — alkaline; may reduce disinfection efficacy`, severity: 'medium' })
          if (tier === 'compliant') tier = 'monitor'
        } else {
          f.notes.push(`pH ${num} — within SMCL range`)
        }
      }
      findings.push(f)
      return
    }

    // Standard threshold checks
    // MCL check (primary — legal)
    if (param.mcl && typeof param.mcl === 'number' && num > param.mcl) {
      f.violations.push({ std: 'EPA MCL', threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} EXCEEDS MCL of ${param.mcl}`, severity: param.acute ? 'critical' : 'high' })
      tier = param.acute ? 'immediate' : tier !== 'immediate' ? 'immediate' : tier
    }
    // Action Level (Lead/Copper Rule)
    else if (param.al && num > param.al) {
      f.violations.push({ std: 'EPA Action Level', threshold: `${param.al} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} exceeds Action Level of ${param.al}`, severity: 'high' })
      if (tier !== 'immediate') tier = 'immediate'
    }
    // MRDL (disinfectant)
    else if (param.mrdl && num > param.mrdl) {
      f.violations.push({ std: 'EPA MRDL', threshold: `${param.mrdl} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} exceeds MRDL of ${param.mrdl}`, severity: 'medium' })
      if (tier === 'compliant' || tier === 'monitor') tier = 'advisory'
    }
    // WHO guideline exceedance (non-US jurisdictions or health reference)
    else if (param.who && typeof param.who === 'number' && num > param.who && !(param.mcl && num <= (param.mcl as number))) {
      f.advisories.push({ std: 'WHO Guideline', threshold: `${param.who} ${param.unit}`, desc: `${param.name} ${num} exceeds WHO guideline of ${param.who}`, severity: 'medium' })
      if (tier === 'compliant') tier = 'monitor'
    }
    // Approaching MCL (> 80%)
    else if (param.mcl && typeof param.mcl === 'number' && num > param.mcl * 0.8) {
      f.advisories.push({ std: 'EPA MCL', threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${num} — approaching MCL (>${Math.round(param.mcl * 0.8)})`, severity: 'low' })
      if (tier === 'compliant') tier = 'monitor'
    }
    // SMCL exceedance (aesthetic)
    else if (param.smcl && typeof param.smcl === 'number' && num > param.smcl) {
      f.advisories.push({ std: 'EPA SMCL', threshold: `${param.smcl} ${param.unit}`, desc: `${param.name} ${num} — exceeds secondary standard of ${param.smcl}`, severity: 'low' })
      if (tier === 'compliant') tier = 'monitor'
    }
    // Health advisory (manganese, MTBE, sodium)
    else if (param.healthAdv && num > param.healthAdv) {
      f.advisories.push({ std: 'EPA Health Advisory', threshold: `${param.healthAdv} ${param.unit}`, desc: `${param.name} ${num} — exceeds EPA health advisory level`, severity: 'medium' })
      if (tier === 'compliant' || tier === 'monitor') tier = 'advisory'
    } else if (param.epaAdv && num > param.epaAdv) {
      f.advisories.push({ std: 'EPA Advisory', threshold: `${param.epaAdv} ${param.unit}`, desc: `${param.name} ${num} — exceeds EPA advisory of ${param.epaAdv}`, severity: 'low' })
      if (tier === 'compliant') tier = 'monitor'
    }
    // Pass
    else {
      const ref = param.mcl || param.al || param.mrdl || (param.smcl && typeof param.smcl === 'number' ? param.smcl : null)
      if (ref) f.notes.push(`${num} ${param.unit} — below ${ref} ${param.unit}`)
      else f.notes.push(`${num} ${param.unit} — recorded`)
    }

    // Carcinogen flag
    if (param.crc && num > 0) {
      f.notes.push(`${param.crc} carcinogen (IARC)`)
    }

    // MCLG zero check — any detection is noteworthy
    if (param.mclg === 0 && num > 0 && !f.violations.length) {
      f.notes.push('EPA MCLG is zero — any detection warrants attention')
    }

    findings.push(f)
  })

  // PFAS Hazard Index calculation (EPA NPDWR 2024)
  // HI = sum of (concentration / health-based water concentration) for PFHxS, PFNA, HFPO-DA, PFBS
  const hiParams = results.filter((r) => PARAM_MAP[r.id]?.pfasHI && r.value && parseFloat(r.value as string) > 0)
  if (hiParams.length >= 2) {
    let hi = 0
    const hiComponents: string[] = []
    hiParams.forEach((r) => {
      const p = PARAM_MAP[r.id]
      const v = parseFloat(r.value as string)
      const fraction = v / (p.hiDenom as number)
      hi += fraction
      hiComponents.push(`${p.name}: ${v}/${p.hiDenom} = ${fraction.toFixed(3)}`)
    })
    if (hi > 1) {
      findings.push({
        param: { id: 'pfas_hi', name: 'PFAS Hazard Index (Mixture)', unit: 'unitless', cat: 'PFAS', health: 'Combined health risk from co-occurring PFAS exceeds EPA threshold. The Hazard Index accounts for additive effects of multiple PFAS compounds.' },
        value: hi.toFixed(3),
        qualifier: null,
        violations: [{ std: 'EPA PFAS NPDWR (Hazard Index MCL)', threshold: '1.0', desc: `PFAS Hazard Index ${hi.toFixed(3)} EXCEEDS MCL of 1.0 — mixture of ${hiParams.length} PFAS compounds`, severity: 'critical' }],
        advisories: [],
        notes: hiComponents,
      })
      tier = 'immediate'
    } else if (hi > 0.5) {
      findings.push({
        param: { id: 'pfas_hi', name: 'PFAS Hazard Index (Mixture)', unit: 'unitless', cat: 'PFAS', health: 'Approaching combined PFAS threshold.' },
        value: hi.toFixed(3),
        qualifier: null,
        violations: [],
        advisories: [{ std: 'EPA PFAS NPDWR', threshold: '1.0', desc: `PFAS HI ${hi.toFixed(3)} — approaching mixture MCL of 1.0`, severity: 'medium' }],
        notes: hiComponents,
      })
      if (tier === 'compliant') tier = 'monitor'
    }
  }

  return { findings, tier }
}
