/**
 * Mold module — standards, framing and manifest.
 *
 * Guards the defensibility framing the whole module rests on: the IICRC S520
 * classifications are present and sourced, the standing disclaimer + the
 * no-health-limit note say what they must, and the standards manifest carries
 * the mold bibliography. This is the "spore counts are not health proof"
 * anti-pattern, encoded as a test.
 */
import { describe, it, expect } from 'vitest'
import {
  WATER_CATEGORIES, REMEDIATION_CONDITIONS, MOISTURE_INDICATORS, SPORE_SCREENING,
  MOLD_SCREENING_DISCLAIMER, NO_HEALTH_LIMIT_NOTE, MOLD_SOURCES,
} from '../../src/constants/moldStandards.js'
import { STANDARDS_MANIFEST } from '../../src/constants/standards.js'

describe('IICRC S520 classifications', () => {
  it('defines water Categories 1–3, each with a definition sourced to S520', () => {
    for (const id of [1, 2, 3] as const) {
      expect(WATER_CATEGORIES[id].id).toBe(id)
      expect(WATER_CATEGORIES[id].definition.length).toBeGreaterThan(20)
      expect(WATER_CATEGORIES[id].source).toBe(MOLD_SOURCES.s520)
    }
    // Category escalation is modeled (1 and 2 can deteriorate; 3 cannot).
    expect(WATER_CATEGORIES[1].mayEscalate).toBe(true)
    expect(WATER_CATEGORIES[3].mayEscalate).toBe(false)
  })
  it('defines remediation Conditions 1–3, each sourced to S520', () => {
    for (const id of [1, 2, 3] as const) {
      expect(REMEDIATION_CONDITIONS[id].id).toBe(id)
      expect(REMEDIATION_CONDITIONS[id].source).toBe(MOLD_SOURCES.s520)
    }
  })
})

describe('screening framing (defensibility)', () => {
  it('the disclaimer is screening-only and defers interpretation to a professional', () => {
    expect(MOLD_SCREENING_DISCLAIMER).toMatch(/screening only/i)
    expect(MOLD_SCREENING_DISCLAIMER).toMatch(/qualified professional/i)
    expect(MOLD_SCREENING_DISCLAIMER).not.toMatch(/\b(safe to occupy|compliant|acceptable exposure)\b/i)
  })
  it('the no-health-limit note states there is no numeric spore limit and cites IOM + ACMT', () => {
    expect(NO_HEALTH_LIMIT_NOTE).toMatch(/no health-based numeric exposure limit/i)
    expect(NO_HEALTH_LIMIT_NOTE).toContain('2004') // IOM
    expect(NO_HEALTH_LIMIT_NOTE).toContain('2025') // ACMT
  })
  it('spore screening is comparative and names water-damage indicator genera', () => {
    expect(SPORE_SCREENING.method).toMatch(/comparative/i)
    expect(SPORE_SCREENING.waterDamageIndicatorGenera).toContain('Stachybotrys')
    expect(SPORE_SCREENING.outcomes.possibleAmplificationIndicator).toBe('possible-amplification-indicator')
  })
  it('moisture indicators are labeled as growth-potential screening, never health limits', () => {
    for (const key of Object.keys(MOISTURE_INDICATORS)) {
      const ind = MOISTURE_INDICATORS[key as keyof typeof MOISTURE_INDICATORS]
      expect(typeof ind.elevatedAtOrAbovePct).toBe('number')
      expect(ind.source).toBeTruthy()
      expect(ind.note).not.toMatch(/\bhealth limit\b/i)
    }
  })
})

describe('standards manifest carries the mold bibliography', () => {
  it('adds S520, AIHA, EPA, IOM and ACMT entries (bibliographic, not thresholds)', () => {
    expect(STANDARDS_MANIFEST['IICRC S520 Mold Remediation']).toBeTruthy()
    expect(STANDARDS_MANIFEST['AIHA Recognition/Evaluation/Control of Mold']).toBeTruthy()
    expect(STANDARDS_MANIFEST['EPA Mold Remediation in Schools and Commercial Buildings']).toBeTruthy()
    expect(STANDARDS_MANIFEST['IOM Damp Indoor Spaces and Health']).toBeTruthy()
    expect(STANDARDS_MANIFEST['ACMT Position — Mold']).toBeTruthy()
  })
})
