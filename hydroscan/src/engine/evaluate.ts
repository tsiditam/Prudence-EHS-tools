/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Compliance engine — evaluates entered lab results against the hardcoded
 * standards in src/constants/standards.js and produces findings + an advisory
 * tier. Screening-only: thresholds live in the standards manifest, never
 * inline here.
 *
 * Engine v1.1 (Phase 3): tier escalation is centralized through escalateTier
 * (src/engine/tier.ts), fixing the original always-escalate tautology and the
 * precedence gaps where a lower branch only fired from 'compliant'. Each
 * finding now carries a screening_only flag (defensibility propagation). The
 * per-parameter classification and thresholds are otherwise unchanged.
 */

import { PARAM_MAP } from '../constants/standards.js'
import { escalateTier } from './tier'
import type { ComplianceResult, Finding, LabResult, Tier } from '../types/engine'

function newFinding(param: any, value: number | string, qualifier: string | null): Finding {
  return { param, value, qualifier, violations: [], advisories: [], notes: [], screening_only: true }
}

export function evaluateResults(results: LabResult[]): ComplianceResult {
  const findings: Finding[] = []
  let tier: Tier = 'compliant'
  const up = (candidate: Tier) => { tier = escalateTier(tier, candidate) }

  results.forEach((r) => {
    const param = PARAM_MAP[r.id]
    if (!param || r.value === null || r.value === undefined || r.value === '') return

    const val: number | string =
      r.qualifier === 'P' ? 'P' : r.qualifier === 'A' ? 'A' : parseFloat(r.value as string)
    const f = newFinding(param, val, r.qualifier || null)

    // Presence/Absence parameters (coliforms, E. coli)
    if (param.unit === 'P/A') {
      if (val === 'P' || val === 'Detected' || val === 'Present') {
        if (param.id === 'ecoli') {
          f.violations.push({ std: 'EPA MCL', threshold: 'Zero', desc: 'E. coli detected — IMMEDIATE boil water advisory', severity: 'critical' })
          up('immediate')
        } else if (param.id === 'tc') {
          f.violations.push({ std: 'EPA RTCR', threshold: '< 5% positive', desc: 'Total coliforms detected — repeat sampling required', severity: 'high' })
          up('advisory')
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
          up('advisory')
        } else if (num > smcl.max) {
          f.advisories.push({ std: 'EPA SMCL', threshold: `${smcl.min}–${smcl.max}`, desc: `pH ${num} — alkaline; may reduce disinfection efficacy`, severity: 'medium' })
          up('monitor')
        } else {
          f.notes.push(`pH ${num} — within SMCL range`)
        }
      }
      findings.push(f)
      return
    }

    // Standard threshold checks (most-severe first)
    if (param.mcl && typeof param.mcl === 'number' && num > param.mcl) {
      // Primary, health-based MCL violation. Acute contaminants are an
      // emergency (critical); chronic ones are still a primary violation that
      // escalates to the top tier but reads as high (not critical) severity.
      f.violations.push({ std: 'EPA MCL', threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} EXCEEDS MCL of ${param.mcl}`, severity: param.acute ? 'critical' : 'high' })
      up('immediate')
    } else if (param.al && num > param.al) {
      f.violations.push({ std: 'EPA Action Level', threshold: `${param.al} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} exceeds Action Level of ${param.al}`, severity: 'high' })
      up('immediate')
    } else if (param.mrdl && num > param.mrdl) {
      f.violations.push({ std: 'EPA MRDL', threshold: `${param.mrdl} ${param.unit}`, desc: `${param.name} ${num} ${param.unit} exceeds MRDL of ${param.mrdl}`, severity: 'medium' })
      up('advisory')
    } else if (param.who && typeof param.who === 'number' && num > param.who && !(param.mcl && num <= (param.mcl as number))) {
      f.advisories.push({ std: 'WHO Guideline', threshold: `${param.who} ${param.unit}`, desc: `${param.name} ${num} exceeds WHO guideline of ${param.who}`, severity: 'medium' })
      up('monitor')
    } else if (param.mcl && typeof param.mcl === 'number' && num > param.mcl * 0.8) {
      f.advisories.push({ std: 'EPA MCL', threshold: `${param.mcl} ${param.unit}`, desc: `${param.name} ${num} — approaching MCL (>${Math.round(param.mcl * 0.8)})`, severity: 'low' })
      up('monitor')
    } else if (param.smcl && typeof param.smcl === 'number' && num > param.smcl) {
      f.advisories.push({ std: 'EPA SMCL', threshold: `${param.smcl} ${param.unit}`, desc: `${param.name} ${num} — exceeds secondary standard of ${param.smcl}`, severity: 'low' })
      up('monitor')
    } else if (param.healthAdv && num > param.healthAdv) {
      f.advisories.push({ std: 'EPA Health Advisory', threshold: `${param.healthAdv} ${param.unit}`, desc: `${param.name} ${num} — exceeds EPA health advisory level`, severity: 'medium' })
      up('advisory')
    } else if (param.epaAdv && num > param.epaAdv) {
      f.advisories.push({ std: 'EPA Advisory', threshold: `${param.epaAdv} ${param.unit}`, desc: `${param.name} ${num} — exceeds EPA advisory of ${param.epaAdv}`, severity: 'low' })
      up('monitor')
    } else {
      const ref = param.mcl || param.al || param.mrdl || (param.smcl && typeof param.smcl === 'number' ? param.smcl : null)
      if (ref) f.notes.push(`${num} ${param.unit} — below ${ref} ${param.unit}`)
      else f.notes.push(`${num} ${param.unit} — recorded`)
    }

    // Carcinogen flag
    if (param.crc && num > 0) f.notes.push(`${param.crc} carcinogen (IARC)`)
    // MCLG zero check — any detection is noteworthy
    if (param.mclg === 0 && num > 0 && !f.violations.length) f.notes.push('EPA MCLG is zero — any detection warrants attention')

    findings.push(f)
  })

  // PFAS Hazard Index (EPA NPDWR 2024). Individual PFAS MCLs (PFOA/PFOS 4 ppt;
  // PFHxS/PFNA/HFPO-DA 10 ppt) flow through the MCL branch above; the Hazard
  // Index covers the additive mixture risk for PFHxS, PFNA, HFPO-DA, and PFBS.
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
      const f = newFinding({ id: 'pfas_hi', name: 'PFAS Hazard Index (Mixture)', unit: 'unitless', cat: 'PFAS', health: 'Combined health risk from co-occurring PFAS exceeds EPA threshold. The Hazard Index accounts for additive effects of multiple PFAS compounds.' }, hi.toFixed(3), null)
      f.violations.push({ std: 'EPA PFAS NPDWR (Hazard Index MCL)', threshold: '1.0', desc: `PFAS Hazard Index ${hi.toFixed(3)} EXCEEDS MCL of 1.0 — mixture of ${hiParams.length} PFAS compounds`, severity: 'critical' })
      f.notes = hiComponents
      findings.push(f)
      up('immediate')
    } else if (hi > 0.5) {
      const f = newFinding({ id: 'pfas_hi', name: 'PFAS Hazard Index (Mixture)', unit: 'unitless', cat: 'PFAS', health: 'Approaching combined PFAS threshold.' }, hi.toFixed(3), null)
      f.advisories.push({ std: 'EPA PFAS NPDWR', threshold: '1.0', desc: `PFAS HI ${hi.toFixed(3)} — approaching mixture MCL of 1.0`, severity: 'medium' })
      f.notes = hiComponents
      findings.push(f)
      up('monitor')
    }
  }

  return { findings, tier }
}
