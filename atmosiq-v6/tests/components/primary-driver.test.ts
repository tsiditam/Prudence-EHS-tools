/**
 * primaryDriver — the severity gate on the assessment headline.
 *
 * Regression origin: the Lakeside Professional Center card rendered
 * "Ventilation inadequacy" as its headline and "Primary driver", directly
 * above body text reading "Conditions within acceptable range". Nothing had
 * failed; Ventilation was simply the relatively lowest-scoring category, and
 * the label was applied with no severity check.
 */
import { describe, it, expect } from 'vitest'
import {
  resolvePrimaryDriver, selectDriverCategory, warrantsAttention, DRIVER_LABELS,
} from '../../src/utils/primaryDriver'

const cat = (l: string, s: number, mx: number, sev: string[] = []) =>
  ({ l, s, mx, r: sev.map(v => ({ t: `${l} finding`, sev: v })) })

// Lakeside: everything passes, Ventilation merely scores lowest of the five.
const CLEAN = [
  cat('Ventilation', 22, 25, ['pass', 'pass']),
  cat('Contaminants', 20, 20, ['pass']),
  cat('HVAC', 15, 15, ['pass']),
  cat('Complaints', 15, 15, ['pass']),
  cat('Environment', 15, 15, ['pass']),
]

describe('resolvePrimaryDriver', () => {
  it('names no driver when nothing warrants attention', () => {
    const d = resolvePrimaryDriver(CLEAN)
    // The weakest category is still identified — it is just not slandered.
    expect(d.category?.l).toBe('Ventilation')
    expect(d.label).toBeNull()
    expect(d.cause).toBeNull()
    expect(d.scored).toBe(true)
  })

  it('names the driver when the category actually has a finding', () => {
    const withFinding = CLEAN.map(c =>
      c.l === 'Ventilation' ? cat('Ventilation', 12, 25, ['high']) : c)
    const d = resolvePrimaryDriver(withFinding)
    expect(d.label).toBe(DRIVER_LABELS.Ventilation)
    expect(d.cause).toMatch(/outdoor air delivery/i)
  })

  it('does not treat a low-severity observation as a deficiency', () => {
    // "Inadequacy" is strong language; a low observation does not carry it.
    const low = CLEAN.map(c =>
      c.l === 'Ventilation' ? cat('Ventilation', 21, 25, ['low', 'pass']) : c)
    expect(resolvePrimaryDriver(low).label).toBeNull()
  })

  it('distinguishes assessed-and-clean from nothing-assessed', () => {
    // scored:false must not render as reassurance — it is a data gap.
    expect(resolvePrimaryDriver([]).scored).toBe(false)
    expect(resolvePrimaryDriver(undefined as never).scored).toBe(false)
    expect(resolvePrimaryDriver(CLEAN).scored).toBe(true)
  })

  it('never selects Complaints as the driver — a symptom is not a cause', () => {
    const complaintsWorst = [
      cat('Ventilation', 25, 25, ['pass']),
      cat('Complaints', 2, 15, ['critical']),
    ]
    expect(selectDriverCategory(complaintsWorst)?.l).toBe('Ventilation')
  })

  it('returns null when Complaints is the only category', () => {
    expect(selectDriverCategory([cat('Complaints', 2, 15, ['high'])])).toBeNull()
  })
})

describe('warrantsAttention', () => {
  it('fires on medium and above only', () => {
    expect(warrantsAttention(cat('V', 1, 10, ['critical']))).toBe(true)
    expect(warrantsAttention(cat('V', 1, 10, ['high']))).toBe(true)
    expect(warrantsAttention(cat('V', 1, 10, ['medium']))).toBe(true)
    expect(warrantsAttention(cat('V', 9, 10, ['low']))).toBe(false)
    expect(warrantsAttention(cat('V', 10, 10, ['pass', 'info']))).toBe(false)
    expect(warrantsAttention(undefined as never)).toBe(false)
  })
})
