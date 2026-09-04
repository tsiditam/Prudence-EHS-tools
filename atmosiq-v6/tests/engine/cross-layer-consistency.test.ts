/**
 * Cross-layer consistency on the AtmosFlow report (audit 2026-09, H3).
 *
 * The consultant report's version of this test went with that report in
 * 2026-08, and nothing rendered the surviving deliverable and checked its
 * layers against each other. This does: `assembleRenderModel` is run over a
 * fixture matrix and, for every cell, the Results-table outcome, the
 * Findings-at-a-glance outcome, the findings list and the Appendix A rows
 * must agree with each other AND with what `scoreZone` concluded.
 *
 * `reportModel.paramOutcome` — a second verdict ladder that always used the
 * summer band, called CO acceptable below 9 while the engine flagged at 6,
 * and rated RH beyond 70 "elevated" while the engine caps at medium — is
 * gone. Outcomes derive from the engine's findings; this file is the proof.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — JS module without TS types
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring'
// @ts-expect-error — JS module without TS types
import { assembleRenderModel, zoneParamOutcome } from '../../src/report/reportModel'

const SEV_TO_OUTCOME: Record<string, string> = { critical: 'priority', high: 'elevated', medium: 'advisory', low: 'ok', pass: 'ok', info: 'ok' }
const RANK: Record<string, number> = { not_evaluated: -1, ok: 0, advisory: 1, elevated: 2, priority: 3 }
const PARAM_P: Record<string, string> = { co2: 'co2', co: 'co', t: 'temperature', rh: 'rh', pm: 'pm25' }

const BLDG = { fn: 'Consistency Tower', hm: 'Within 6 months', fc: 'Clean' }
const CLEAN = { su: 'office', co2: '600', co: '2', tf: '74', rh: '45', pm: '5', cx: 'No complaints' }

/** name, zone, date, expected outcome per parameter key (results-table token). */
const MATRIX: Array<{ name: string; zone: Record<string, unknown>; date: string; expect: Record<string, string> }> = [
  { name: 'clean zone', zone: { ...CLEAN }, date: '2026-07-15', expect: { co2: 'ok', co: 'ok', t: 'ok', rh: 'ok', pm: 'ok' } },
  { name: 'CO₂ 1180 (Δ760 above default outdoor)', zone: { ...CLEAN, co2: '1180' }, date: '2026-07-15', expect: { co2: 'elevated' } },
  { name: 'CO 7 — above WHO 24-h, an observation', zone: { ...CLEAN, co: '7' }, date: '2026-07-15', expect: { co: 'ok' } },
  { name: 'CO 40 — above NIOSH REL', zone: { ...CLEAN, co: '40' }, date: '2026-07-15', expect: { co: 'elevated' } },
  { name: 'RH 65', zone: { ...CLEAN, rh: '65' }, date: '2026-07-15', expect: { rh: 'advisory' } },
  { name: 'RH 75 — capped at medium by comfort_consensus', zone: { ...CLEAN, rh: '75' }, date: '2026-07-15', expect: { rh: 'advisory' } },
  { name: 'temp 70 in January (winter band 68–76)', zone: { ...CLEAN, tf: '70' }, date: '2026-01-15', expect: { t: 'ok' } },
  { name: 'temp 70 in July (summer band 73–79)', zone: { ...CLEAN, tf: '70' }, date: '2026-07-15', expect: { t: 'advisory' } },
  { name: 'formaldehyde 0.05 — above NIOSH REL', zone: { ...CLEAN, hc: '0.05' }, date: '2026-07-15', expect: {} },
  { name: 'non-numeric CO₂ reading', zone: { ...CLEAN, co2: 'abc' }, date: '2026-07-15', expect: { co2: 'not_evaluated' } },
  { name: 'temp with no survey date', zone: { ...CLEAN, tf: '70' }, date: '', expect: { t: 'not_evaluated' } },
]

function render(zone: Record<string, unknown>, date: string) {
  const bldg = date ? { ...BLDG, assessmentDate: date } : BLDG
  const zones = [{ zn: 'Z1', ...zone }]
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  const data = {
    id: 'rpt-x', building: bldg, presurvey: date ? { ps_survey_date: date } : {}, zones, zoneScores,
    comp: summarizeAssessment(zoneScores), recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'T', certs: [] },
  }
  const model = assembleRenderModel(data, { now: new Date('2026-09-01T12:00:00Z') })
  return { zoneScores, model, zones }
}

/** What the engine itself says about a parameter in a zone, mapped to the table token. */
function engineOutcome(zs: any, p: string): string {
  const findings = (zs.cats as any[]).flatMap((c: any) => (c.r || []).filter((r: any) => r.p === p))
  if (findings.some((r: any) => r.dataGap)) return 'not_evaluated'
  return findings.reduce((w: string, r: any) => (RANK[SEV_TO_OUTCOME[r.sev]] > RANK[w] ? SEV_TO_OUTCOME[r.sev] : w), 'ok')
}

describe('every layer of the AtmosFlow report says what the engine said', () => {
  for (const fx of MATRIX) {
    describe(fx.name, () => {
      const { zoneScores, model } = render(fx.zone, fx.date)
      const zs = zoneScores[0]
      const row = model.results.rows[0]

      it('the Results row carries the worst engine outcome across its judged cells', () => {
        let worst = 'not_evaluated'
        for (const [key, p] of Object.entries(PARAM_P)) {
          if (row[key] === null || row[key] === undefined) continue
          const o = engineOutcome(zs, p)
          if (RANK[o] > RANK[worst]) worst = o
        }
        expect(row.sev).toBe(worst)
      })

      it('every judged cell agrees with the engine finding for that parameter', () => {
        for (const [key, p] of Object.entries(PARAM_P)) {
          const modelKey = { co2: 'co2', co: 'co', t: 'temperature', rh: 'relativeHumidity', pm: 'pm25' }[key]!
          const fromModel = zoneParamOutcome(zs, modelKey)
          const fromEngine = engineOutcome(zs, p)
          expect(fromModel === 'acceptable' ? 'ok' : fromModel, `${key}`).toBe(fromEngine)
        }
      })

      it('matches the expected outcome the fixture was built for', () => {
        for (const [key, want] of Object.entries(fx.expect)) {
          const glance = model.findingsAtGlance.find((g: any) => g.parameter.toLowerCase().startsWith(
            { co2: 'carbon dioxide', co: 'carbon monoxide', t: 'temperature', rh: 'relative humidity', pm: 'fine particulate' }[key]!))
          if (want === 'not_evaluated') {
            // The cell renders '—' / not evaluated; the findings-at-a-glance
            // row (if the parameter had ANY numeric reading) says the same.
            if (glance) expect(glance.outcome).toBe('not_evaluated')
          } else {
            expect(glance, `${key} should appear in findings at a glance`).toBeDefined()
            expect(glance.outcome).toBe(want)
          }
        }
      })

      it('the Findings table lists exactly the engine findings the report flags, verbatim', () => {
        const flagged = (zs.cats as any[]).flatMap((c: any) => (c.r || []).filter((r: any) => ['critical', 'high', 'medium'].includes(r.sev)))
        const rows = model.findings ? model.findings.rows : []
        expect(rows).toHaveLength(flagged.length)
        for (const f of flagged) {
          const r = rows.find((x: any) => x.f === f.t)
          expect(r, f.t).toBeDefined()
          expect(r.sev).toBe(SEV_TO_OUTCOME[f.sev])
        }
      })

      it('Appendix A carries every criterion a listed finding cites', () => {
        const refs = new Set(model.references.map((r: any[]) => r[0]))
        for (const r of (model.findings ? model.findings.rows : [])) {
          const f = (zs.cats as any[]).flatMap((c: any) => c.r || []).find((x: any) => x.t === r.f)
          if (f && f.std) expect(refs.has(f.std), f.std).toBe(true)
        }
      })

      it('a data gap the engine raised is stated in Limitations, never rendered as a verdict', () => {
        const gaps = (zs.cats as any[]).flatMap((c: any) => (c.r || []).filter((r: any) => r.dataGap))
        for (const g of gaps) {
          expect(model.limitations.some((l: string) => l.includes(g.t))).toBe(true)
        }
        if (gaps.some((g: any) => g.p === 'co2')) expect(row.co2).toBeNull()
      })
    })
  }
})

describe('the seasonal band is the engine\'s, not a fixed summer band', () => {
  it('70°F reads Acceptable in January and Advisory in July, on every surface', () => {
    const jan = render({ ...CLEAN, tf: '70' }, '2026-01-15').model
    const jul = render({ ...CLEAN, tf: '70' }, '2026-07-15').model
    expect(jan.results.rows[0].sev).toBe('ok')
    expect(jul.results.rows[0].sev).toBe('advisory')
    expect(jan.findings).toBeNull()
    expect(jul.findings.rows[0].f).toContain('73–79°F summer')
    expect(jan.findingsAtGlance.find((g: any) => g.parameter === 'Temperature').outcome).toBe('ok')
    expect(jul.findingsAtGlance.find((g: any) => g.parameter === 'Temperature').outcome).toBe('advisory')
  })
})

describe('a zone with nothing judged is not "Acceptable"', () => {
  it('renders not_evaluated for a row with no measured parameter', () => {
    const { model } = render({ su: 'office', cx: 'No complaints' }, '2026-07-15')
    expect(model.results.rows[0].sev).toBe('not_evaluated')
  })
})
