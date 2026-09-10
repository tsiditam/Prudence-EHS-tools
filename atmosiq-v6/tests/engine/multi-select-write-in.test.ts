/**
 * Multi-select "Other" write-ins are recorded, printed, and never inferred
 * from.
 *
 * The walkthrough's multi-selects (symptoms, water-damage location, odor
 * type, sources within / adjacent to the zone) accept an "Other" write-in,
 * stored beside the list as `<id>_other`. The engine's rules are keyed to
 * the option vocabulary because that vocabulary maps to published criteria
 * and exposure pathways; free text cannot be interpreted, only reported.
 * So a write-in must:
 *   • reach the reader — in the Complaints finding line and in causal-chain
 *     evidence, as what the assessor recorded;
 *   • never satisfy a rule — not the ventilation symptom set, not the
 *     respiratory or irritant sets, not "a source exists";
 *   • never move a chain's confidence, alone or on top of real selections.
 */
import { describe, it, expect } from 'vitest'
import { buildCausalChains } from '../../src/engines/causalChains'
import { scoreZone } from '../../src/engines/scoring'

const BLDG = { hm: 'Within 6 months', fc: 'Clean', assessmentDate: '2026-07-15' }
const base = { zn: 'Z', su: 'office', cx: 'Yes — complaints reported' }

const score = (zone: Record<string, unknown>) => scoreZone({ ...base, ...zone } as never, BLDG as never)
const findings = (zone: Record<string, unknown>, cat: string): string[] =>
  (score(zone).cats.find((c: any) => c.l === cat)?.r || []).map((r: any) => r.t)
const chainsFor = (zone: Record<string, unknown>) => {
  const z = { ...base, ...zone }
  return buildCausalChains([z] as never, BLDG as never, [scoreZone(z as never, BLDG as never)] as never)
}

describe('symptom write-in', () => {
  it('prints in the Complaints line alongside the selected symptoms', () => {
    const lines = findings({ sy: ['Headache'], sy_other: 'Metallic taste' }, 'Complaints')
    const sym = lines.find((t) => t.startsWith('Symptoms:'))!
    expect(sym).toContain('headache')
    // The write-in keeps the assessor's own casing; the list is lowercased.
    expect(sym).toContain('Metallic taste')
  })

  it('prints on its own when nothing from the list was selected', () => {
    const lines = findings({ sy: [], sy_other: 'Metallic taste' }, 'Complaints')
    expect(lines.find((t) => t.startsWith('Symptoms:'))).toContain('Metallic taste')
  })

  it('does not raise the ventilation finding the listed symptoms would', () => {
    // With no airflow data, a listed ventilation-set symptom (Headache) is
    // the one indicator and yields "minor indicators observed"; a write-in
    // saying the same thing in different words is not in the set.
    const withListed = score({ sy: ['Headache'] })
    const withWriteIn = score({ sy: [], sy_other: 'headaches' })
    const withNone = score({ sy: [] })
    const vent = (zs: any) => zs.cats.find((c: any) => c.l === 'Ventilation').r.map((r: any) => r.t).join('|')
    expect(vent(withWriteIn)).toBe(vent(withNone))
    expect(vent(withListed)).not.toBe(vent(withNone))
  })

  it('does not stand in for a respiratory symptom on the moisture chain', () => {
    const moisture = (zone: Record<string, unknown>) => chainsFor({ wd: 'Active leak', ...zone }).find((c: any) => c.type === 'Moisture / Biological')
    // The chain needs mold, musty odor, or a respiratory symptom on top of water.
    expect(moisture({ sy: ['Cough'] })).toBeTruthy()
    expect(moisture({ sy: [], sy_other: 'coughing fits' })).toBeUndefined()
  })

  it('rides in the same evidence line, not a second one, on the complaint-driven chains', () => {
    const type = 'Ventilation Deficiency (Hypothesis)'
    // The complaint pattern needs two signals; the symptom list is a third.
    const pattern = { ac: '3-5', sr: 'Yes — clear pattern' }
    const bare = chainsFor({ ...pattern, sy: ['Fatigue'] }).find((c: any) => c.type === type)!
    const withWriteIn = chainsFor({ ...pattern, sy: ['Fatigue'], sy_other: 'Metallic taste' }).find((c: any) => c.type === type)!
    expect(withWriteIn.evidence.length).toBe(bare.evidence.length)
    expect(withWriteIn.evidence.join(' ')).toContain('Metallic taste')
    expect(withWriteIn.confidence).toBe(bare.confidence)
  })
})

describe('source write-ins', () => {
  const chemical = (zone: Record<string, unknown>) =>
    chainsFor({ hc: '0.5', sy: ['Eye irritation'], ...zone }).find((c: any) => c.type === 'Chemical Exposure')

  it('do not count as an identified source', () => {
    expect(chemical({ src_internal: ['Stored chemicals'] })).toBeTruthy()
    expect(chemical({ src_internal: [], src_internal_other: 'Epoxy curing in the corridor' })).toBeUndefined()
    expect(chemical({ src_adjacent: [], src_adjacent_other: 'Print shop next door' })).toBeUndefined()
  })

  it('print with the sources when the chain does fire', () => {
    const c = chemical({ src_internal: ['Stored chemicals'], src_adjacent_other: 'Print shop next door' })!
    const sources = c.evidence.find((e: string) => e.startsWith('Sources:'))!
    expect(sources).toContain('Stored chemicals')
    expect(sources).toContain('Print shop next door')
  })
})

describe('other write-ins are inert', () => {
  it('a musty-odor write-in does not fire the moisture chain the listed option would', () => {
    const moisture = (zone: Record<string, unknown>) => chainsFor({ wd: 'Active leak', ...zone }).find((c: any) => c.type === 'Moisture / Biological')
    expect(moisture({ op: 'Intermittent', ot: ['Musty / Earthy'] })).toBeTruthy()
    expect(moisture({ op: 'Intermittent', ot: [], ot_other: 'musty smell by the window' })).toBeUndefined()
  })
})
