// @vitest-environment node
/**
 * Every layer of a report must say the same thing about the same data.
 *
 * The report is assembled by layers that each formed their own opinion:
 * the legacy scorer, the bridge, the professional-opinion rollup, the
 * phrase library, the parameter prose, and the renderers. Every
 * contradiction this codebase has shipped came from one of them deciding
 * something the others did not know about:
 *
 *   • A hardcoded 68–78 °F band in the renderer disagreed with the
 *     seasonal band in the scorer, so one report called 72 °F both within
 *     and outside the ASHRAE 55 comfort range.
 *   • `ventilation_co2_only`'s template asserted "CO₂ results were within
 *     the reference range" whatever the reading, and a substring
 *     classifier routed the WORST CO₂ tier into it — "inadequacy" does not
 *     contain "inadequate". The FM demo shipped with one zone listed as
 *     Elevated in Results and within-range in Zone Findings.
 *   • The opinion rollup required 2+ findings, so a single high-severity
 *     finding produced "No significant indoor air quality concerns were
 *     identified" above a Results paragraph describing the problem.
 *
 * Each was fixed at its own root. This file exists so the NEXT one fails
 * here instead of in a client's inbox: it renders real consultant reports
 * across a matrix and asserts the layers agree with each other and with
 * the engine, rather than testing any layer alone.
 */
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { getConsultantDocxBlob } from '../../src/components/DocxReport.js'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'
import { buildCausalChains } from '../../src/engines/causalChains.js'

const DATE = '2026-08-19'
const BUILDING = { fn: 'Consistency Fixture', fl: '1 Test St', ft: 'Office', ht: 'CAV AHU', assessmentDate: DATE }
const PRESURVEY = {
  ps_survey_date: DATE, ps_recipient_org: 'Consistency Fixture',
  ps_inst_meter: 'TSI Q-Trak 7575', ps_inst_serial: 'Q1',
  ps_inst_cal: '2026-06-02', ps_inst_cal_status: 'Current',
}

const SIGNIFICANT = new Set(['critical', 'high', 'medium'])
const RANK: Record<string, number> = { pass: 0, info: 0, low: 1, medium: 2, high: 3, critical: 4 }

/** Assessments spanning every tier the opinion rollup can produce. */
const FIXTURES: ReadonlyArray<{ name: string; zones: Array<Record<string, string>> }> = [
  { name: 'clean', zones: [{ zid: 'z1', zn: 'Suite 100', su: 'office', tf: '75', rh: '45', co2: '650', co2o: '420', co: '1', pm: '6', pmo: '6', tv: '110', hc: '0', oc: '8' }] },
  // The single-finding case: one high-severity reading and nothing else.
  { name: 'co2-single-high', zones: [{ zid: 'z1', zn: 'Conference Room', su: 'office', co2: '2500', co2o: '420', oc: '10' }] },
  { name: 'co2-mid-tier', zones: [{ zid: 'z1', zn: 'Open Office', su: 'office', co2: '900', co2o: '420', oc: '12' }] },
  { name: 'co2-no-outdoor', zones: [{ zid: 'z1', zn: 'Break Room', su: 'office', co2: '980', oc: '6' }] },
  { name: 'pm-only', zones: [{ zid: 'z1', zn: 'Lobby', su: 'office', pm: '60', pmo: '6', oc: '4' }] },
  { name: 'co-regulatory', zones: [{ zid: 'z1', zn: 'Loading Bay', su: 'office', co: '60', oc: '3' }] },
  { name: 'mixed-two-zones', zones: [
    { zid: 'z1', zn: 'Zone A', su: 'office', tf: '90', rh: '80', co2: '1600', co2o: '420', pm: '60', pmo: '6', tv: '4000', oc: '10' },
    { zid: 'z2', zn: 'Zone B', su: 'office', tf: '73', rh: '46', co2: '700', co2o: '420', co: '1', oc: '8' },
  ] },
]

interface Rendered { text: string; worst: string; flagged: Set<string> }

async function render(zones: Array<Record<string, string>>): Promise<Rendered> {
  const zoneScores = zones.map((z) => scoreZone(z, BUILDING))
  const comp = compositeScore(zoneScores)
  const { blob } = await getConsultantDocxBlob({
    building: BUILDING, presurvey: PRESURVEY, zones, zoneScores, comp,
    causalChains: buildCausalChains(zones, BUILDING, zoneScores),
    profile: { name: 'J. Smith, CIH' }, photos: {}, version: '6.0.0', userMode: 'ih',
  })
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()))
  const xml = await zip.file('word/document.xml')!.async('string')
  const text = xml.split('</w:p>')
    .map((p) => (p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))
    .filter(Boolean).join('\n')

  let worst = 'pass'
  const flagged = new Set<string>()
  for (const zs of zoneScores as any[]) {
    for (const cat of zs.cats) {
      for (const f of cat.r) {
        if (!SIGNIFICANT.has(f.sev)) continue
        if ((RANK[f.sev] ?? 0) > (RANK[worst] ?? 0)) worst = f.sev
        if (f.p) flagged.add(f.p)
      }
    }
  }
  return { text, worst, flagged }
}

describe('the report never contradicts the engine', () => {
  for (const fx of FIXTURES) {
    it(`${fx.name}: the overall opinion matches what the engine found`, async () => {
      const { text, worst } = await render(fx.zones)
      const saysNoConcerns = text.includes('No significant indoor air quality concerns were identified')
      if (SIGNIFICANT.has(worst)) {
        // The defect that shipped: one high finding, header says no concerns.
        expect(saysNoConcerns, `engine found a ${worst} finding, report says no concerns`).toBe(false)
      } else {
        expect(saysNoConcerns, 'engine found nothing significant, report should say so').toBe(true)
      }
    })

    it(`${fx.name}: no parameter is both elevated and within range`, async () => {
      const { text } = await render(fx.zones)
      // The CO₂ pattern, generalised: a document may not carry a
      // within-range claim beside an elevated-in claim.
      const withinRange = /results were within the reference range/i.test(text)
      expect(withinRange, 'a template asserted "within the reference range"').toBe(false)
    })

    it(`${fx.name}: the Results narrative agrees with the opinion`, async () => {
      const { text, worst } = await render(fx.zones)
      const noConditions = text.includes('No conditions of concern were identified during this assessment')
      const didNotIdentify = text.includes('did not identify conditions warranting further evaluation')
      if (SIGNIFICANT.has(worst)) {
        expect(noConditions || didNotIdentify,
          `engine found a ${worst} finding, Results says none were identified`).toBe(false)
      }
    })
  }

  it('every fixture renders a report at all', async () => {
    for (const fx of FIXTURES) {
      const { text } = await render(fx.zones)
      expect(text.length, `${fx.name} rendered nothing`).toBeGreaterThan(500)
      // Artifacts that mean a layer failed silently.
      for (const artifact of ['NaN', 'undefined', '[object Object]', 'Infinity']) {
        expect(text, `${fx.name} rendered "${artifact}"`).not.toContain(artifact)
      }
    }
  })
})
