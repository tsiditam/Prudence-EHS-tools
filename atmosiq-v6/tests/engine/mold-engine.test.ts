/**
 * Mold screening engine — classifiers + orchestrator.
 *
 * Pins the parallel, deterministic mold engine (src/engines/mold/*): the S520
 * classifiers, comparative spore screening, the assessMold() projection over
 * the demo fixture, determinism, defensive tolerance, and the screening-only
 * invariants (every finding is screening + requires professional review; no
 * health-verdict language; the standing disclaimer + no-health-limit note ride
 * on the result).
 */
import { describe, it, expect } from 'vitest'
import {
  assessMold, classifyWaterCategory, classifyCondition, evaluateMoisture, screenSpores,
} from '../../src/engines/mold/index.js'
import { buildMoldInput } from '../../src/engines/mold/buildInput.js'
import { DEMO_MOLD } from '../../src/constants/demoDataMold.js'
import { MOLD_ENGINE_VERSION } from '../../src/version.js'
import { MOLD_SCREENING_DISCLAIMER, MOLD_SOURCES } from '../../src/constants/moldStandards.js'

// Language that would turn a screening indicator into a verdict — must never
// appear in a finding summary or evidence line.
const BANNED = /\b(safe|unsafe|toxic|hazardous|dangerous|compliant|non-compliant|health limit|acceptable level)\b/i

describe('classifyWaterCategory — S520 water Category from a described source', () => {
  it('maps sanitary / grey / black sources to 1 / 2 / 3', () => {
    expect(classifyWaterCategory('Supply-line leak under sink')?.categoryId).toBe(1)
    expect(classifyWaterCategory('dishwasher discharge')?.categoryId).toBe(2)
    expect(classifyWaterCategory('Sewage backup from floor drain')?.categoryId).toBe(3)
  })
  it('returns null for an unrecognized source (professional to classify — no guess)', () => {
    expect(classifyWaterCategory('mystery fluid')).toBeNull()
    expect(classifyWaterCategory('')).toBeNull()
  })
  it('flags a prolonged Category 1 event as potentially escalated (never silently reclassifies)', () => {
    const c = classifyWaterCategory('Supply-line leak', { prolonged: true })
    expect(c?.categoryId).toBe(1)
    expect(c?.escalationFlag).toBe(true)
  })
})

describe('evaluateMoisture — building-science screening indicator, not a health limit', () => {
  it('flags wood at/above the screening reference and passes below it', () => {
    expect(evaluateMoisture({ material: 'wood', value: 22 }).elevated).toBe(true)
    expect(evaluateMoisture({ material: 'wood', value: 10 }).elevated).toBe(false)
  })
  it('degrades gracefully for an unknown material or missing reading', () => {
    expect(evaluateMoisture({ material: 'other', value: 99 }).elevated).toBe(false)
    expect(evaluateMoisture({ material: 'wood', value: null }).elevated).toBe(false)
    expect(evaluateMoisture({ material: 'wood', value: null }).note).toMatch(/screening indicator/i)
  })
})

describe('screenSpores — comparative indoor/outdoor only', () => {
  it('raises an amplification indicator when a water-damage genus exceeds outdoor', () => {
    const r = screenSpores(
      [{ genus: 'Aspergillus/Penicillium', countPerM3: 3200 }],
      [{ genus: 'Aspergillus/Penicillium', countPerM3: 400 }],
    )
    expect(r.outcome).toBe('possible-amplification-indicator')
    expect(r.indoorExceedsOutdoor).toContain('aspergillus/penicillium')
  })
  it('reads as normal ecology when indoor does not exceed outdoor', () => {
    const r = screenSpores(
      [{ genus: 'Cladosporium', countPerM3: 300 }],
      [{ genus: 'Cladosporium', countPerM3: 450 }],
    )
    expect(r.outcome).toBe('consistent-with-normal-ecology')
  })
  it('is insufficient-data without a paired outdoor reference (no bare-indoor verdict)', () => {
    expect(screenSpores([{ genus: 'Stachybotrys', countPerM3: 9999 }], []).outcome).toBe('insufficient-data')
    expect(screenSpores([], []).outcome).toBe('insufficient-data')
  })
})

describe('classifyCondition — S520 condition from evidence', () => {
  it('actual growth → Condition 3', () => {
    expect(classifyCondition({ visibleGrowth: true }).conditionId).toBe(3)
    expect(classifyCondition({ hiddenSuspected: true }).conditionId).toBe(3)
  })
  it('amplification indicator / odor+moisture → Condition 2', () => {
    expect(classifyCondition({ sporeOutcome: 'possible-amplification-indicator' }).conditionId).toBe(2)
    expect(classifyCondition({ mustyOdor: true, moistureElevated: true }).conditionId).toBe(2)
  })
  it('no signals → Condition 1 (normal ecology)', () => {
    expect(classifyCondition({}).conditionId).toBe(1)
  })
})

describe('assessMold — projection over the demo fixture', () => {
  const input = buildMoldInput(DEMO_MOLD)
  const result = assessMold(input)

  it('is version-stamped by the mold engine, not the IAQ engine', () => {
    expect(result.version).toBe(MOLD_ENGINE_VERSION)
  })

  it('classifies the water events (Cat 1 break room, Cat 3 storage)', () => {
    const byZone = Object.fromEntries(result.waterCategories.map((w) => [w.zoneId, w.categoryId]))
    expect(byZone['z-breakroom']).toBe(1)
    expect(byZone['z-storage']).toBe(3)
  })

  it('suggests a Condition per zone (3 / 3 / 1)', () => {
    const byZone = Object.fromEntries(result.conditions.map((c) => [c.zoneId, c.conditionId]))
    expect(byZone['z-breakroom']).toBe(3)
    expect(byZone['z-storage']).toBe(3)
    expect(byZone['z-lobby']).toBe(1)
  })

  it('screens spores comparatively (break room amplification, lobby normal)', () => {
    const byZone = Object.fromEntries(result.sporeScreening.map((s) => [s.zoneId, s.outcome]))
    expect(byZone['z-breakroom']).toBe('possible-amplification-indicator')
    expect(byZone['z-lobby']).toBe('consistent-with-normal-ecology')
  })

  it('raises the expected finding categories with categorical severities', () => {
    const cats = new Set(result.findings.map((f) => f.category))
    expect(cats).toEqual(new Set(['water_damage', 'moisture', 'visible_growth', 'spore_screening', 'hvac']))
    const visibleBreakroom = result.findings.find((f) => f.category === 'visible_growth' && f.zoneId === 'z-breakroom')
    expect(visibleBreakroom?.severity).toBe('elevated_indicator')
    const cat3 = result.findings.find((f) => f.category === 'water_damage' && f.zoneId === 'z-storage')
    expect(cat3?.severity).toBe('elevated_indicator')
    const lobbySpore = result.findings.find((f) => f.category === 'spore_screening' && f.zoneId === 'z-lobby')
    expect(lobbySpore?.severity).toBe('observation')
  })

  it('marks EVERY finding screening-only and professional-review-required', () => {
    expect(result.findings.length).toBeGreaterThan(0)
    for (const f of result.findings) {
      expect(f.screeningOnly).toBe(true)
      expect(f.requiresProfessionalReview).toBe(true)
    }
  })

  it('never uses health-verdict language in a finding', () => {
    for (const f of result.findings) {
      expect(f.summary).not.toMatch(BANNED)
      for (const e of f.evidence) expect(e).not.toMatch(BANNED)
    }
  })

  it('carries the standing disclaimer, the no-health-limit note, and cites IOM + ACMT', () => {
    expect(result.disclaimer).toBe(MOLD_SCREENING_DISCLAIMER)
    expect(result.limitations.join(' ')).toMatch(/no health-based numeric exposure limit/i)
    expect(result.standardsCited).toContain(MOLD_SOURCES.iom)
    expect(result.standardsCited).toContain(MOLD_SOURCES.acmt)
  })

  it('is deterministic — same input yields identical output', () => {
    expect(assessMold(buildMoldInput(DEMO_MOLD))).toEqual(result)
  })
})

describe('assessMold — defensive tolerance', () => {
  it('never throws on null / malformed input', () => {
    expect(() => assessMold(null as never)).not.toThrow()
    expect(() => assessMold({ zones: 'nope' } as never)).not.toThrow()
    const empty = assessMold(undefined as never)
    expect(empty.findings).toEqual([])
    expect(empty.version).toBe(MOLD_ENGINE_VERSION)
  })
  it('records a limitation when a water source cannot be classified', () => {
    const r = assessMold({ zones: [{ id: 'z1' }], waterEvents: [{ zoneId: 'z1', source: 'mystery fluid' }] })
    expect(r.limitations.join(' ')).toMatch(/could not be auto-classified/i)
    expect(r.waterCategories).toEqual([])
  })
})
