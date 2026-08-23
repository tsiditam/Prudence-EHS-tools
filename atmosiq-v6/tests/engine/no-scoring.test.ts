/**
 * The 100-point composite score is gone. It must stay gone.
 *
 * Modelled on `no-data-center-module.test.ts`, whose commit recorded the
 * lesson this file exists to act on: *"A removal this wide comes back one
 * helper at a time if nothing watches it."* The score reached further
 * than the data-center module did — the engine, the bridge, the report
 * layer, four print surfaces, the portfolio roll-up, storage and
 * analytics — so a single helper creeping back is exactly how it
 * returns.
 *
 * Three things are asserted:
 *
 *   1. Nothing computes a score, a weight, a deduction or a band. This
 *      is checked against the ENGINE'S OUTPUT, not by grepping for
 *      names, so a rename cannot evade it.
 *   2. No band ladder has reappeared. There were six, in four different
 *      threshold sets, including one inside the file that claimed to be
 *      their single source of truth. That is what a re-introduction
 *      looks like: not a decision, but a local convenience.
 *   3. A saved assessment still carrying `comp` / `composite` / `score`
 *      keys is INERT — no crash, no resurrected band, no zone rendered
 *      as "0". Every pre-v3.0 record in production carries them.
 */

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import { scoreZone, summarizeAssessment } from '../../src/engines/scoring'
import { buildCausalChains } from '../../src/engines/causalChains'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy'
import { renderInternalReport } from '../../src/engine/report/internal'
import { countFindings } from '../../src/utils/assessmentVerdict'
import { assemblePortfolioModel } from '../../src/report/portfolioModel'

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

const META = {
  siteName: 'Test Site',
  siteAddress: '1 Test Way',
  assessmentDate: '2026-07-15',
  preparingAssessor: { fullName: 'A. Assessor', credentials: ['CIH'] },
  reviewStatus: 'draft_pending_professional_review' as const,
  issuingFirm: { name: 'PSEC' },
  projectNumber: 'P-1',
  transmittalRecipient: { fullName: 'R', organization: 'O' },
}

const ZONE = {
  zn: 'Z1', su: 'office', sf: '2000', oc: '10',
  co2: '1800', tf: '82', rh: '68', pm: '40', pmo: '9', co: '2',
  cx: 'Yes — complaints reported', ac: '6-10', wd: 'Active leak',
}
const BLDG = { ft: 'Commercial Office', assessmentDate: '2026-07-15', hm: 'Unknown' }

describe('nothing computes a score', () => {
  it('a zone assessment carries findings and status, never points', () => {
    const zs: any = scoreZone(ZONE, BLDG)
    for (const gone of ['tot', 'risk', 'rc', 'weights', 'normalizedFrom', 'availableMax']) {
      expect(zs, `zone assessment resurrected \`${gone}\``).not.toHaveProperty(gone)
    }
    for (const cat of zs.cats) {
      for (const gone of ['s', 'mx', 'origMx', 'capped', 'suppressed']) {
        expect(cat, `category "${cat.l}" resurrected \`${gone}\``).not.toHaveProperty(gone)
      }
      expect(Array.isArray(cat.r), `category "${cat.l}" lost its findings`).toBe(true)
    }
  })

  it('the site summary counts findings, it does not rate the building', () => {
    const summary: any = summarizeAssessment([scoreZone(ZONE, BLDG)])
    for (const gone of ['tot', 'avg', 'worst', 'risk', 'rc', 'logic', 'rationale']) {
      expect(summary, `site summary resurrected \`${gone}\``).not.toHaveProperty(gone)
    }
    expect(summary.findings).toEqual(countFindings([scoreZone(ZONE, BLDG)]))
    expect(summary.count).toBe(1)
  })

  it('the bridge maps no site score and no tier', () => {
    const zs = scoreZone(ZONE, BLDG)
    const score: any = legacyToAssessmentScore(
      [zs] as never, summarizeAssessment([zs]) as never, [{ ...ZONE, ...BLDG }] as never, { meta: META } as never,
    )
    expect(score).not.toHaveProperty('siteScore')
    expect(score).not.toHaveProperty('siteTier')
    expect(score.zones[0]).not.toHaveProperty('composite')
    expect(score.zones[0]).not.toHaveProperty('tier')
    for (const c of score.zones[0].categories) {
      for (const gone of ['rawScore', 'cappedScore', 'maxScore']) {
        expect(c).not.toHaveProperty(gone)
      }
    }
  })

  it('no rendered report carries a numeric score field', () => {
    const zs = scoreZone(ZONE, BLDG)
    const score = legacyToAssessmentScore(
      [zs] as never, summarizeAssessment([zs]) as never, [{ ...ZONE, ...BLDG }] as never, { meta: META } as never,
    )
    const json = JSON.stringify(renderInternalReport(score))
    for (const gone of ['"siteScore"', '"siteTier"', '"rawScore"', '"cappedScore"', '"maxScore"', '"deductionInternal"', '"composite"']) {
      expect(json, `the internal report resurrected ${gone}`).not.toContain(gone)
    }
  })
})

describe('no band ladder has reappeared', () => {
  // Six existed, in four different threshold sets, and they disagreed.
  //
  // Every file below carries a comment saying what was removed from it —
  // that record is the point of the removal and must not be what fails the
  // test. So comments are stripped first and the patterns run against CODE.
  // The alternative, contorting each regex to dodge prose, is how a guard
  // ends up matching nothing.
  const stripComments = (code: string) =>
    code
      // HTML comments first. Several files here are HTML templates, and a
      // removal record inside one is still a removal record.
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/([^:])\/\/.*$/gm, '$1')

  /**
   * Decode the HTML entities that hid a live band ladder for four months.
   *
   * `PrintReport.jsx` published "if any zone scores Critical (&lt;40), the
   * composite equals the worst zone score" in a client deliverable from the
   * v3.0 removal until 2026-08. Every pattern below hunts for a comparison
   * operator; in an HTML template that operator is written `&lt;`, so none of
   * them could see it. The file was IN this sweep the whole time and the
   * sweep was structurally unable to read it.
   *
   * Decoding is not cosmetic here — it is the difference between a guard and
   * the appearance of one.
   */
  const decodeEntities = (code: string) =>
    code
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&le;/g, '<=')
      .replace(/&ge;/g, '>=')
      .replace(/&#x?0*(3c|60);/gi, '<')
      .replace(/&#x?0*(3e|62);/gi, '>')
      .replace(/&amp;/g, '&')

  const readable = (file: string) => decodeEntities(stripComments(SRC(file)))

  /**
   * The methodology PROSE, which is the other half of what went undetected.
   *
   * The arithmetic patterns below would not have caught "Max Points" or
   * "priority-weighted mean" even decoded, because those sentences contain no
   * comparison at all. A report can describe a scoring system perfectly well
   * without ever writing an inequality, and that is exactly what shipped.
   */
  const METHODOLOGY_PROSE = [
    /Transparent Scoring Summary/i,
    /Max Points/i,
    /composite (score|equals|reflects)/i,
    /priority-weighted mean/i,
    /category weights?,/i,
    /carry 1\.5\s*[x×]\s*weight/i,
    /deterministic scoring methodology/i,
    /100-point/i,
  ]

  const LADDER_SHAPES = [
    // A threshold comparison against a stored total or score.
    /\b(tot|score|composite)\s*[<>]=?\s*\d/,
    /\.tot\s*[<>]=?\s*\d/,
    // A ternary chain that turns a number into a label or a colour.
    /\d{2}\s*\?\s*['"][^'"]+['"]\s*:\s*.*\d{2}\s*\?/,
    // The label set itself, in code rather than in a removal record.
    /['"](Low|High|Moderate|Critical) Risk['"]/,
    // A legend or caption naming a numeric band.
    /(Low Risk|Moderate|Critical)\s*\(\s*[<>]?\s*\d{2}/,
  ]
  const FILES = [
    'src/engines/scoring.js',
    'src/engines/scoring-legacy.js',
    'src/engines/riskBands.js',
    'src/engines/causalChains.js',
    'src/utils/assessmentVerdict.js',
    'src/utils/primaryDriver.js',
    'src/report/portfolioModel.js',
    'src/components/PrintReport.jsx',
    'src/components/SpatialMap.jsx',
    'src/components/docx/styles.js',
    'src/components/docx/sections-technical.js',
    'src/components/print/modern-summary.js',
    'src/engine/bridge/legacy.ts',
  ]

  it.each(FILES)('%s carries no band ladder', (file) => {
    const code = readable(file)
    for (const shape of LADDER_SHAPES) {
      expect(code, `${file} matches band-ladder shape ${shape}`).not.toMatch(shape)
    }
  })

  it.each(FILES)('%s does not describe a scoring methodology', (file) => {
    const code = readable(file)
    for (const shape of METHODOLOGY_PROSE) {
      expect(code, `${file} matches methodology prose ${shape}`).not.toMatch(shape)
    }
  })

  it('reads through HTML entities — the gap that let Appendix B survive', () => {
    // A positive control on the decoder itself, written as the escaped text
    // that actually shipped. Without this, a decoder that silently stopped
    // decoding would leave every assertion above green and blind.
    const asShipped = 'if any zone scores Critical (&lt;40), the composite equals the worst zone score'
    const decoded = decodeEntities(asShipped)
    expect(decoded).toContain('(<40)')
    expect(LADDER_SHAPES.some((sh) => sh.test(decoded)) || METHODOLOGY_PROSE.some((sh) => sh.test(decoded)))
      .toBe(true)
    // And prove the raw form is what escaped: no ladder shape matches it.
    expect(LADDER_SHAPES.some((sh) => sh.test(asShipped))).toBe(false)
  })

  it('catches the methodology prose that carries no inequality at all', () => {
    const restored = [
      '<th>Max Points</th>',
      'the composite reflects a priority-weighted mean',
      '<h2>Appendix B — Transparent Scoring Summary</h2>',
      'AtmosFlow applies a deterministic scoring methodology',
    ]
    for (const line of restored) {
      expect(METHODOLOGY_PROSE.some((sh) => sh.test(line)), `no prose shape caught: ${line}`).toBe(true)
      // The point of this control: the ARITHMETIC patterns miss all of them.
      expect(LADDER_SHAPES.some((sh) => sh.test(line)), `a ladder shape unexpectedly caught: ${line}`).toBe(false)
    }
  })

  it('the stripper does not simply delete the file it is meant to read', () => {
    // A comment-stripper that over-matches turns every assertion above into
    // a tautology, which is the failure mode that would go unnoticed.
    const code = stripComments(SRC('src/engines/scoring.js'))
    expect(code).toContain('export function scoreZone')
    expect(code).toContain('export function summarizeAssessment')
    expect(code.length).toBeGreaterThan(4000)

    // And the HTML template it now also has to read. PrintReport is mostly
    // markup; an over-eager `<!-- ... -->` rule could swallow the document.
    const html = stripComments(SRC('src/components/PrintReport.jsx'))
    expect(html).toContain('Appendix B — How Findings Are Classified')
    expect(html).toContain('export function generatePrintHTML')
    expect(html.length).toBeGreaterThan(20000)
  })

  it('the shapes still catch a ladder that is put back', () => {
    // A positive control. Without it, a regex that silently stopped matching
    // would read as a clean removal.
    const restored = [
      'const risk = tot < 40 ? "Critical" : "Low"',
      'function band(score) { return score >= 80 ? "Low Risk" : score >= 60 ? "Moderate" : "High Risk" }',
      'const LEGEND = "Low Risk (80-100)"',
    ]
    for (const line of restored) {
      expect(LADDER_SHAPES.some((sh) => sh.test(line)), `no shape caught: ${line}`).toBe(true)
    }
  })

  it('the exports that produced bands are gone', async () => {
    const bands: any = await import('../../src/engines/riskBands')
    for (const gone of ['RISK_BANDS', 'getRiskBand', 'findingsToBand', 'SEVERITY_TO_BAND', 'deriveFMSummary']) {
      expect(bands[gone], `riskBands.js resurrected ${gone}`).toBeUndefined()
    }
    // Confidence survived. The claim here used to be "it was never a band
    // over a score", which is too strong: it IS a four-rung ladder over a
    // number. The number is a data-completeness fraction, not the
    // composite, and the one place confidence WAS coupled to the score —
    // `_overall` weighted by the category point caps — was cut in v3.0.
    // The property that makes that true is asserted below.
    expect(bands.getConfidenceLevel).toBeTypeOf('function')
    // The dead second copy of the ladder is gone; see riskBands.js.
    expect(bands.CONFIDENCE_LEVELS).toBeUndefined()
  })

  it('confidence rates the record, not the building', () => {
    // The test that would have caught a re-coupling: two zones with an
    // IDENTICAL set of captured fields, one benign and one with readings
    // that produce critical findings. Completeness is the same, so
    // confidence must be the same. If confidence ever starts moving with
    // severity, it has become a rating of the site again.
    const fields = { zn: 'Z', su: 'office', sf: '2000', oc: '10', ac: '6-10', hm: 'Quarterly' }
    const benign: any = scoreZone({ ...fields, co2: '600', tf: '72', rh: '45', pm: '5', pmo: '4', co: '0' }, BLDG)
    const severe: any = scoreZone({ ...fields, co2: '2500', tf: '85', rh: '70', pm: '80', pmo: '5', co: '30' }, BLDG)

    expect(countFindings([severe]).total).toBeGreaterThan(countFindings([benign]).total)
    // Six findings against one, and the completeness ratio is identical to
    // ten decimal places. Severity does not reach it.
    expect(severe.sufficiency._overall).toBeCloseTo(benign.sufficiency._overall, 10)
    expect(severe.confidence).toBe(benign.confidence)

    // ...and the other direction, so the equality above is not just two
    // values that happen to sit in the same band: dropping captured fields
    // DOES move the ratio, which is what confidence is supposed to track.
    const sparse: any = scoreZone({ ...fields, co2: '2500' }, BLDG)
    expect(sparse.sufficiency._overall).toBeLessThan(severe.sufficiency._overall)
  })

  it('the score-visibility flag is gone, along with its escape hatch', async () => {
    const flags: any = await import('../../src/utils/featureFlags')
    expect(flags.isIaqScoreVisible).toBeUndefined()
    expect(flags.IAQ_SCORE_VISIBLE_DEFAULT).toBeUndefined()
  })
})

describe('a pre-v3.0 record is inert', () => {
  // Every finalized report in production carries these keys. They are
  // deliberately NOT migrated — an issued report's record is the only
  // evidence of what it said — so they must simply be ignored.
  const legacyZone: any = {
    ...ZONE,
    tot: 42, risk: 'High Risk', rc: '#FB923C',
    weights: { Ventilation: 25 }, normalizedFrom: 38, availableMax: 80,
  }

  it('scores as an ordinary zone, with the stale keys ignored', () => {
    const zs: any = scoreZone(legacyZone, { ...BLDG, bld_pressure: 'Negative (air pulls in)' })
    expect(zs).not.toHaveProperty('tot')
    expect(zs).not.toHaveProperty('risk')
    expect(zs.assessedCats.length).toBeGreaterThan(0)
    // The findings are real, not inherited from the stale score.
    expect(countFindings([zs]).total).toBeGreaterThan(0)
  })

  it('summarizes without reading a stored composite', () => {
    const stale: any = { cats: [], confidence: 'Low', partialScore: true, insufficientCats: ['HVAC'], tot: 42, risk: 'High Risk' }
    const summary: any = summarizeAssessment([stale])
    expect(summary.findings.total).toBe(0)
    expect(summary).not.toHaveProperty('tot')
    expect(summary.confidence).toBe('Low')
  })

  it('builds causal chains without crashing on a stale zone score', () => {
    const zs = scoreZone(legacyZone, BLDG)
    expect(() => buildCausalChains([legacyZone], BLDG, [zs] as never)).not.toThrow()
  })

  it('a report index entry with only a legacy `score` shows as not recorded', () => {
    const model: any = assemblePortfolioModel({
      now: new Date('2026-08-16T00:00:00Z'),
      reports: [{ id: 'r1', ts: '2026-04-01', facility: 'Legacy Site', score: 55 }],
      drafts: [],
    })
    const row = model.siteRows.find((r: any) => r.facility === 'Legacy Site')
    expect(row.findings).toBeNull()
    expect(row.band.id).toBe('unassessed')
    // And it contributes nothing to the totals rather than a zero.
    expect(model.kpis.totalFindings).toBeNull()
  })
})
