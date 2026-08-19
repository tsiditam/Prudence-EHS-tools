/**
 * Criteria Applied — one standard per parameter, and it has to be the one
 * the conclusion rests on.
 *
 * The consultant report used to print every criterion the platform knows —
 * seven for carbon monoxide alone — leaving the reader to work out which one
 * the assessment actually rested on. Logger Studio never had that problem:
 * one selected reference per parameter drives everything downstream.
 *
 * Adopting Logger Studio's DEFAULTS directly would have reintroduced the
 * class of contradiction this session started with. Two traps, both live and
 * both pinned below:
 *
 *   • Temperature — the Logger default resolves the ASHRAE 55 ACCEPTABLE
 *     range (67–82 °F), while scoreEnv also flags the tighter seasonal
 *     OPTIMAL band (73–79 °F). Printing 67–82 beside a finding on a 72 °F
 *     reading says the reading is inside the very band it was flagged against.
 *   • CO — the Logger default is the EPA 8-hour NAAQS at 9 ppm, while the
 *     engine's ladder reaches the WHO 24-hour indoor guideline at 6 ppm. A
 *     7 ppm reading is flagged, and a fixed 9 ppm reference says it is under
 *     the bar.
 *
 * So: cite the criterion behind the governing finding when there is one, and
 * the default reference the reading cleared when there is not.
 */
import { describe, it, expect } from 'vitest'
import { deriveAppliedReferences } from '../../src/components/docx/applied-references.js'
import { BENCHMARK_TYPE_LABELS } from '../../src/components/docx/canonical-content.js'
import { scoreZone } from '../../src/engines/scoring.js'
import { allCriteria } from '../../src/constants/criteria.js'

const AUG = '2026-08-19'          // summer band: optimal 73–79 °F
const refs = (zones: any[], date = AUG) =>
  deriveAppliedReferences(zones, zones.map((z) => scoreZone(z, { assessmentDate: date })), { assessmentDate: date })
const byParam = (rows: any[], p: string) => rows.find((r) => r.param === p)

describe('one row per measured parameter', () => {
  it('lists each measured parameter exactly once', () => {
    const rows = refs([{ zn: 'Z1', co2: '700', co2o: '420', co: '1', pm: '6', pmo: '6', tv: '110', hc: '0', tf: '75', rh: '45' }])
    const params = rows.map((r: any) => r.param)
    expect(new Set(params).size).toBe(params.length)
    expect(params.sort()).toEqual(['co', 'co2', 'hcho', 'pm25', 'rh', 'temperature', 'tvoc'].sort())
  })

  it('omits parameters that were not measured', () => {
    const rows = refs([{ zn: 'Z1', co2: '700', co2o: '420' }])
    expect(rows.map((r: any) => r.param)).toEqual(['co2'])
  })

  it('returns nothing when nothing was measured', () => {
    expect(refs([{ zn: 'Z1' }])).toEqual([])
    expect(deriveAppliedReferences([], [], {})).toEqual([])
    expect(deriveAppliedReferences(undefined as never, undefined as never, {})).toEqual([])
  })
})

describe('the citation follows the engine, never a fixed default', () => {
  it('cites the OPTIMAL band a temperature finding rests on, not the wider comfort range', () => {
    // 72 °F in August: inside ASHRAE 55's acceptable range (67–82), outside
    // the summer optimal band (73–79) that scoreEnv flags.
    const row: any = byParam(refs([{ zn: 'Z1', tf: '72' }]), 'temperature')
    expect(row.basis).toBe('applied')
    expect(row.value).toContain('73')
    expect(row.value).toContain('79')
    expect(row.value).not.toContain('67')
    expect(row.value).not.toContain('82')
  })

  it('cites the criterion a CO finding rests on, below the EPA default', () => {
    // 7 ppm clears the EPA 8-hour NAAQS (9 ppm) and trips the WHO 24-hour
    // indoor guideline (6 ppm). Citing 9 ppm would contradict the finding.
    const row: any = byParam(refs([{ zn: 'Z1', co: '7' }]), 'co')
    expect(row.basis).toBe('applied')
    expect(row.value).toMatch(/^6 ppm/)
    expect(row.source).toMatch(/WHO/)
  })

  it('escalates the citation with the finding', () => {
    // Worst-first over the criteria the reading EXCEEDS: 60 ppm is over the
    // OSHA PEL (50) and under the NIOSH ceiling (200), so the PEL governs.
    const row: any = byParam(refs([{ zn: 'Z1', co: '60' }]), 'co')
    expect(row.value).toMatch(/^50 ppm/)
    expect(row.source).toMatch(/OSHA|1910\.1000/)
    // And a reading over the ceiling escalates to it.
    const ceiling: any = byParam(refs([{ zn: 'Z1', co: '250' }]), 'co')
    expect(ceiling.value).toMatch(/^200 ppm/)
    expect(ceiling.source).toMatch(/NIOSH/)
  })

  it('cites the worst zone when zones disagree, stably', () => {
    const zones = [{ zn: 'A', co: '1' }, { zn: 'B', co: '60' }, { zn: 'C', co: '7' }]
    const forward: any = byParam(refs(zones), 'co')
    const reversed: any = byParam(refs([...zones].reverse()), 'co')
    expect(forward.value).toBe(reversed.value)
    expect(forward.value).toMatch(/^50 ppm/)
  })
})

describe('when nothing was flagged, cite the yardstick that was cleared', () => {
  it('uses the parameter default and marks the basis as compared', () => {
    const rows = refs([{ zn: 'Z1', co: '1', pm: '6', pmo: '6', tf: '75', rh: '45' }])
    const co: any = byParam(rows, 'co')
    expect(co.basis).toBe('compared')
    expect(co.value).toMatch(/^9 ppm/)                 // EPA 8-hour NAAQS
    expect(co.source).toMatch(/40 CFR 50\.8|EPA/)
    expect(byParam(rows, 'pm25')!.value).toMatch(/^35 /)
    expect(byParam(rows, 'temperature')!.basis).toBe('compared')
  })

  it('never claims "within" a criterion the engine flagged', () => {
    // The whole point: basis 'compared' must imply no finding for that
    // parameter, and basis 'applied' must imply one.
    const zones = [{ zn: 'Z1', co2: '1600', co2o: '420', co: '1', tf: '72', rh: '45', pm: '6', pmo: '6' }]
    const zoneScores = zones.map((z) => scoreZone(z, { assessmentDate: AUG }))
    const rows = deriveAppliedReferences(zones, zoneScores, { assessmentDate: AUG })
    for (const row of rows as any[]) {
      const flagged = zoneScores.some((zs: any) =>
        zs.cats.some((c: any) => c.r.some((f: any) => f.p === row.param && f.sev !== 'pass' && f.sev !== 'info')))
      expect(row.basis, `${row.param}`).toBe(flagged ? 'applied' : 'compared')
    }
  })
})

describe('presentation', () => {
  it('labels every row with a §7 taxonomy benchmark type', () => {
    const rows = refs([{ zn: 'Z1', co2: '1600', co2o: '420', co: '60', hc: '1', tv: '4000', pm: '60', pmo: '6', tf: '90', rh: '80' }])
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows as any[]) {
      expect(BENCHMARK_TYPE_LABELS, `${r.param} → ${r.type}`).toContain(r.type)
    }
  })

  it('never presents a NIOSH advisory value as an enforceable limit', () => {
    const row: any = byParam(refs([{ zn: 'Z1', co: '40' }]), 'co')   // NIOSH REL, 35 ppm
    expect(row.source).toMatch(/NIOSH/)
    expect(row.type).toBe('Recommended exposure limit')
  })

  it('does not repeat the value in the criterion name', () => {
    // Profile labels embed their value for the Logger Studio dropdown
    // ("Mølhave advisory (500 µg/m³)"); beside a Value column that is noise.
    const rows: any[] = refs([{ zn: 'Z1', co2: '700', co2o: '420', tv: '110', rh: '45' }])
    for (const r of rows) {
      expect(r.reference, `${r.param} repeats its value`).not.toMatch(/\(\s*[\d,]+(\.\d+)?\s*(ppm|ppb|µg\/m³|%)?\s*\)$/)
    }
    expect(rows.find(r => r.param === 'tvoc').reference).toBe('Mølhave advisory')
  })

  it('keeps a qualifying parenthetical that is not just the value', () => {
    const t: any = byParam(refs([{ zn: 'Z1', tf: '72' }]), 'temperature')
    expect(t.reference).toMatch(/\(summer\)/)
  })

  it('never reintroduces the retired "screening" label', () => {
    // A Logger Studio profile label ("Screening advisory (1,000 ppm)")
    // reached the consultant report through this table and put the word back
    // into a client deliverable three months after it was stripped.
    const rows: any[] = refs([{ zn: 'Z1', co2: '700', co2o: '420', co: '1', hc: '0', tv: '110', pm: '6', pmo: '6', tf: '75', rh: '45' }])
    for (const r of rows) {
      expect(`${r.reference} ${r.type} ${r.source}`.toLowerCase(), r.param).not.toContain('screening')
    }
  })

  it('states the averaging period for a time-averaged criterion', () => {
    const co: any = byParam(refs([{ zn: 'Z1', co: '7' }]), 'co')
    expect(co.value).toMatch(/24-hour/)
    const pel: any = byParam(refs([{ zn: 'Z1', co: '60' }]), 'co')
    expect(pel.value).toMatch(/ceiling|hour/)
  })

  it('carries every criterion id it can emit back to the registry', () => {
    const ids = new Set(allCriteria().map((c: any) => c.id))
    const rows = refs([{ zn: 'Z1', co2: '1600', co2o: '420', co: '60', hc: '1', tv: '4000', pm: '60', pmo: '6' }])
    for (const r of rows as any[]) {
      // Applied rows resolve through the registry, so their citation must be
      // a registry citation — no free-text sources reaching the report.
      if (r.basis === 'applied' && r.param !== 'temperature' && r.param !== 'rh') {
        expect(allCriteria().some((c: any) => c.source === r.source), `${r.param}: ${r.source}`).toBe(true)
      }
    }
    expect(ids.size).toBeGreaterThan(0)
  })
})

describe('seasonality', () => {
  it('cites the winter band for a winter survey', () => {
    // 72 °F is inside the winter optimal band (68.5–74) and outside the
    // summer one (73–79). Same reading, different citation, correctly.
    expect(byParam(refs([{ zn: 'Z1', tf: '72' }], '2026-01-15'), 'temperature')!.basis).toBe('compared')
    expect(byParam(refs([{ zn: 'Z1', tf: '72' }], '2026-08-19'), 'temperature')!.basis).toBe('applied')
  })
})
