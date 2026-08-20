/**
 * Carbon monoxide — indoor criteria, and averaging-time honesty.
 *
 * Before 2026-08 CO scoring fired only above the NIOSH REL (35 ppm) and the
 * OSHA PEL (50 ppm). Both are occupational 8-hour+ TWAs. An office at 15 ppm —
 * a textbook combustion-infiltration signal — produced NO finding, because the
 * thresholds were roughly four times too high to see it.
 */
import { describe, it, expect } from 'vitest'
import { allCriteria } from '../../src/constants/criteria.js'
// @ts-expect-error — JS module without TS types
import { scoreZone } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { classifyCondition } from '../../src/engine/bridge/classify'

const coFindings = (co: string) => {
  const z = scoreZone({ zn: 'Z', su: 'office', co, pm: '5' }, {})
  return (z.cats.find((c: any) => c.l === 'Contaminants')?.r || [])
    .filter((f: any) => String(f.t).startsWith('CO '))
}

describe('indoor CO tiers', () => {
  it('flags an office at 15 ppm — the case that previously produced nothing', () => {
    const f = coFindings('15')
    expect(f).toHaveLength(1)
    expect(f[0].sev).toBe('medium')
    expect(f[0].t).toMatch(/EPA 8-hour NAAQS of 9 ppm/)
    // The combustion-source prompt used to be appended to the finding text,
    // because buildStatement carried the criterion's `action`. A finding
    // states what was measured; what to do about it is a recommendation and
    // the app and the report each render those in their own section. The
    // action still exists on the criterion — asserted below, at its source.
    expect(f[0].t).not.toMatch(/combustion source|Identify|Compare against/i)
    expect(f[0].cid).toBe('co_epa_naaqs_8h')
  })

  it('keeps the follow-up advice on the criterion, not in the finding', () => {
    const criterion: any = allCriteria().find((c: any) => c.id === 'co_epa_naaqs_8h')
    expect(criterion.action).toMatch(/combustion source|infiltration/i)
  })

  it('notes a reading above indoor background but below the NAAQS', () => {
    const f = coFindings('7')
    expect(f).toHaveLength(1)
    expect(f[0].sev).toBe('low')   // an observation, not a finding warranting action
    expect(f[0].t).toMatch(/WHO 24-hour/)
  })

  it('stays silent at typical indoor background', () => {
    expect(coFindings('2')).toHaveLength(0)
    expect(coFindings('6')).toHaveLength(0)
  })

  it('escalates through the acute and occupational tiers', () => {
    expect(coFindings('32')[0].sev).toBe('high')      // WHO 1-hour, 30 ppm
    expect(coFindings('40')[0].sev).toBe('high')      // NIOSH REL value, 35 ppm
    expect(coFindings('60')[0].sev).toBe('critical')  // OSHA PEL value, 50 ppm
  })
})

describe('averaging time is stated honestly', () => {
  it('never asserts a bare PEL exceedance from a short-duration reading', () => {
    const t = coFindings('60')[0].t
    // The old text was "CO 60 ppm — EXCEEDS OSHA PEL", which the phrase
    // library itself lists as a banned alternative for co_screening_elevated.
    expect(t).not.toMatch(/EXCEEDS OSHA PEL/)
    expect(t).toMatch(/8-hour time-weighted average/)
    expect(t).toMatch(/cannot establish compliance with this averaging period/i)
  })

  it('says the same for formaldehyde', () => {
    const z = scoreZone({ zn: 'Z', su: 'office', hc: '1.0', pm: '5' }, {})
    const f = (z.cats.find((c: any) => c.l === 'Contaminants')?.r || [])
      .find((x: any) => String(x.t).startsWith('Formaldehyde'))
    expect(f.t).toMatch(/8-hour time-weighted average/)
    expect(f.t).not.toMatch(/— exceeds OSHA PEL$/)
  })
})

describe('bridge classification is preserved', () => {
  // classify.ts routes CO findings by matching 'osha'/'niosh' in std or text,
  // falling through to co_screening_elevated. New tiers must land there.
  // classifyCondition(finding, category, zone) — it lowercases std itself.
  const classify = (f: any) => classifyCondition(f, 'Contaminants', {} as never)

  it('keeps the occupational tiers on their existing condition types', () => {
    expect(classify(coFindings('60')[0])).toBe('co_above_pel_documented')
    expect(classify(coFindings('40')[0])).toBe('co_screening_elevated')
  })

  it('routes the new indoor tiers to co_screening_elevated', () => {
    expect(classify(coFindings('32')[0])).toBe('co_screening_elevated')
    expect(classify(coFindings('15')[0])).toBe('co_screening_elevated')
    expect(classify(coFindings('7')[0])).toBe('co_screening_elevated')
  })
})
