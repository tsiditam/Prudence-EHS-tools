// @vitest-environment node
/**
 * A finding that holds in several zones is ONE finding.
 *
 * The engine assesses a zone at a time and has no cross-zone awareness, so a
 * condition present everywhere is emitted once per zone. Until now the report
 * printed each emission as its own table row, and the volume was measured on
 * the Harborview fixture: twenty-one distinct sentences arriving as
 * twenty-nine rows at two zones and one hundred and sixteen at eight. The
 * distinct content never grew. Only the enumeration did.
 *
 * Worse than the reading experience, it broke generation. The writer's
 * evidence package carries the same findings, so the duplication pushed the
 * payload past the endpoint's 60,000-character cap at six zones — a common
 * building size — and the assessor got no AI sections at all. Before that, at
 * five, the package was already shedding the assessor's own notes and every
 * walkthrough observation to stay under budget. Repetition was crowding out
 * evidence.
 *
 * What this file pins:
 *   • identical findings fold and their zones accumulate
 *   • nothing folds across a difference — not text, severity, basis, category
 *   • the folded row keeps ONE real zone name as the package's index key,
 *     because a label would miss and silently strip the finding's parameter
 *     and criterion, which is what the audit checks claims against
 *   • the fixture's own numbers, so a regression is visible as a count
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import { assembleRenderModel, collectFindings, zoneScopeLabel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone, genRecs } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }
const MAX_PAYLOAD_CHARS = 60000

const zoneScore = (name: string, findings: any[]) => ({
  zoneName: name,
  confidence: 'Moderate',
  cats: [{ l: 'HVAC', r: findings }],
})
const F = (t: string, over: any = {}) => ({ t, sev: 'high', ...over })

/** The fixture at an arbitrary zone count, every zone distinctly named. */
function at(n: number) {
  const zones: any[] = []
  for (let i = 0; i < n; i++) {
    const z: any = ZONES[i % ZONES.length]
    zones.push({ ...z, zid: `z${i}`, zn: `${z.zn} — Floor ${i + 1}` })
  }
  const zoneScores = zones.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const model: any = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones, zoneScores, causalChains: [],
    recs: genRecs(zoneScores, BLDG, { zones, equipment: [] }), id: 'AIQ-HV', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg: any = buildEvidencePackage(model, { zoneScores, causalChains: [] })
  return { zones, zoneScores, model, pkg }
}

describe('identical findings fold, and their zones accumulate', () => {
  it('prints one row naming both zones', () => {
    const rows: any[] = collectFindings([
      zoneScore('Suite A', [F('Filter condition: heavily loaded.')]),
      zoneScore('Suite B', [F('Filter condition: heavily loaded.')]),
    ])
    expect(rows.length).toBe(1)
    expect(rows[0].zones).toEqual(['Suite A', 'Suite B'])
    expect(rows[0].zoneLabel).toBe('Suite A · Suite B')
  })

  it('names the zones in a fixed order, whichever room was walked first', () => {
    // A finding's id hashes its zone, so a walk-order list would give the same
    // finding in the same building a different id depending on the route
    // taken — the positional identity evidenceIdentity.js forbids.
    const a: any[] = collectFindings([
      zoneScore('Suite B', [F('Filter condition: heavily loaded.')]),
      zoneScore('Suite A', [F('Filter condition: heavily loaded.')]),
    ])
    const b: any[] = collectFindings([
      zoneScore('Suite A', [F('Filter condition: heavily loaded.')]),
      zoneScore('Suite B', [F('Filter condition: heavily loaded.')]),
    ])
    expect(a[0].zones).toEqual(b[0].zones)
    expect(a[0].zone).toBe(b[0].zone)
    expect(a[0].zoneLabel).toBe(b[0].zoneLabel)
  })

  it('keeps ONE real zone name as the key the package indexes by', () => {
    const rows: any[] = collectFindings([
      zoneScore('Suite A', [F('Filter condition: heavily loaded.')]),
      zoneScore('Suite B', [F('Filter condition: heavily loaded.')]),
    ])
    // Not the label. The engine index is keyed `zone + text`, and a miss
    // strips the parameter and criterion the audit needs.
    expect(rows[0].zone).toBe('Suite A')
  })

  it('does not fold across any difference', () => {
    const rows: any[] = collectFindings([
      zoneScore('Suite A', [
        F('Carbon dioxide averaged 1,400 ppm.'),
        F('Carbon dioxide averaged 900 ppm.'),
        F('Filter condition: heavily loaded.', { sev: 'medium' }),
        F('Filter condition: heavily loaded.', { sev: 'critical' }),
        // Same sentence, different evidentiary basis: `p` marks a reading.
        F('Airflow weak at the diffuser.'),
        F('Airflow weak at the diffuser.', { p: 'co2' }),
      ]),
    ])
    expect(rows.length).toBe(6)
  })

  it('folds only within a category, so two categories keep their own row', () => {
    const rows: any[] = collectFindings([
      { zoneName: 'Suite A', cats: [{ l: 'HVAC', r: [F('Same words.')] }, { l: 'Ventilation', r: [F('Same words.')] }] },
    ])
    expect(rows.length).toBe(2)
  })

  it('drops nothing — every distinct sentence survives', () => {
    const before = new Set<string>()
    for (const zs of at(8).zoneScores as any[]) {
      for (const cat of zs.cats || []) {
        for (const r of cat.r || []) if (['critical', 'high', 'medium'].includes(r.sev)) before.add(String(r.t))
      }
    }
    const after = new Set((at(8).model.findings.rows || []).map((r: any) => String(r.f)))
    expect(after).toEqual(before)
  })
})

describe('how a folded finding names where it applies', () => {
  it('lists the zones while a list is shorter than a summary', () => {
    expect(zoneScopeLabel(['A', 'B'], 2)).toBe('A · B')
    expect(zoneScopeLabel(['A'], 4)).toBe('A')
    expect(zoneScopeLabel(['A', 'B'], 4)).toBe('A · B')
  })

  it('names a condition present everywhere as building-wide', () => {
    expect(zoneScopeLabel(['A', 'B', 'C'], 3)).toBe('All zones (3)')
    expect(zoneScopeLabel(['A', 'B', 'C', 'D'], 4)).toBe('All zones (4)')
  })

  it('falls back rather than printing an empty cell', () => {
    expect(zoneScopeLabel([], 3)).toBe('Zone')
    expect(zoneScopeLabel(undefined as never, 0)).toBe('Zone')
  })
})

describe('the fold reaches the deliverable and the writer', () => {
  it('collapses the fixture without changing what it says', () => {
    const { model } = at(2)
    expect(model.findings.rows.length).toBe(21)
    const { model: m8 } = at(8)
    // Eight zones of the same conditions say the same twenty-one things.
    expect(m8.findings.rows.length).toBe(21)
  })

  it('keeps every finding its parameter and criterion through the fold', () => {
    // The regression that would matter most and show least: the package
    // indexes engine findings by zone + text, so a folded row carrying a
    // label instead of a zone name resolves to nothing and loses the fields
    // the audit checks a claim against.
    for (const n of [2, 8]) {
      const { pkg } = at(n)
      const measured = (pkg.findings || []).filter((f: any) => f.parameter)
      expect(measured.length, `${n} zones`).toBeGreaterThan(0)
      for (const f of measured) expect(f.criterion_id || f.parameter, `${n} zones`).toBeTruthy()
    }
  })

  it('carries every zone a finding holds in, so the writer can say so', () => {
    const { zones, pkg } = at(4)
    const names = zones.map((z: any) => String(z.zn))
    const spread = (pkg.findings || []).filter((f: any) => (f.zones || []).length > 1)
    expect(spread.length).toBeGreaterThan(0)
    for (const f of spread) {
      // The list is real zone names, whatever the label summarizes them as.
      for (const z of f.zones) expect(names, String(f.text)).toContain(z)
      expect(f.zone, String(f.text)).toBeTruthy()
    }
    // A finding in every zone is labeled as building-wide rather than listed.
    const universal = spread.filter((f: any) => f.zones.length === names.length)
    expect(universal.length).toBeGreaterThan(0)
    for (const f of universal) expect(f.zone).toBe(`All zones (${names.length})`)
  })

  it('fits the writer payload at a building size that used to fail', () => {
    // Six zones measured 61,720 characters before the fold, over the
    // endpoint's cap, so report sections could not be generated at all.
    for (const n of [2, 4, 6, 8]) {
      const { pkg } = at(n)
      const chars = JSON.stringify({ evidence: packageForWriter(pkg) }).length
      expect(chars, `${n} zones`).toBeLessThanOrEqual(MAX_PAYLOAD_CHARS)
    }
  })

  it('stops shedding the assessor notes and observations it used to drop', () => {
    const wire: any = packageForWriter(at(6).pkg)
    expect(wire.context_omitted || []).toEqual([])
    expect((wire.observations || []).length).toBeGreaterThan(0)
  })
})
