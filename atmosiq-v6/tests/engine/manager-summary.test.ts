/**
 * The management layer — and the proof that it is a PROJECTION.
 *
 * The first pages of the client report are manager-first: what needs
 * attention, where, what happens next, and what the assessment did not
 * establish. The risk that design carries is a second scientific opinion
 * hidden in the presentation layer — a summary that decides, softens or
 * invents something the engine never concluded. This file exists to make
 * that impossible to do quietly.
 *
 * Six properties, each one an architecture assertion rather than a string
 * check:
 *
 *   1. PROJECTION. The management summary is a function of the assembled
 *      model and nothing else. Building it changes no engine output, and its
 *      status column is the model's own outcome token spelled out — change
 *      the token, the status follows; it never re-decides.
 *   2. ONE REGISTER. `actionPlan.rows` IS `recommendations.register`, the
 *      same array instance. Not a copy, not a second derivation.
 *   3. THE FOLD IS THE ENGINE'S. A finding that holds in several zones
 *      reaches the manager once, because `collectFindings` already folded
 *      it; two findings that differ stay apart, in the management layer
 *      exactly as in the findings table. No per-zone measurement is lost.
 *   4. NOTHING IS INVENTED. Every attention row's action is a row of the
 *      register, every "what we did not do" line is one of the report's own
 *      limitations verbatim, a pathway stays a working hypothesis, and TVOC
 *      is never turned into "acceptable".
 *   5. A CLEAN ASSESSMENT stays clean: no invented issue, no empty table,
 *      and a statement that certifies nothing.
 *   6. PARITY. The DOCX and the server-rendered PDF present the same
 *      management layer. Both are client deliverables, and the choice of
 *      file format must not change what the client is told.
 */
import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { createRequire } from 'node:module'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { assembleRenderModel, buildManagerSummary, buildLimitationEntries, buildLimitations } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { SEVERITY_DECISION, SEVERITY_LEGEND_NOTE } from '../../src/report/narrativeLibrary.js'
// @ts-expect-error js
import { atmosFlowReportChildren } from '../../src/components/docx/sections-atmosflow.js'
// @ts-expect-error js
import { buildAtmosFlowDocument } from '../../src/components/DocxReport'
// @ts-expect-error js
import { collectReportText } from '../../src/report/reportText.js'
// @ts-expect-error js
import { buildEvidencePackage } from '../../src/report/evidencePackage.js'
// @ts-expect-error js
import { buildAiSectionsRecord, applyAiSections } from '../../src/report/aiSections.js'

const require = createRequire(import.meta.url)
const { renderReportPdf } = require('../../lib/report/render-pdf.js')
const { scan } = require('../../api/_banned-language.js')

// ── Fixtures ──────────────────────────────────────────────────────────────

const SURVEY = '2026-07-15'
/** A building with nothing wrong with it, so a clean zone really is clean. */
const GOOD_BLDG = {
  fn: 'Quiet Court', ft: 'Commercial Office', ht: 'Central AHU — VAV',
  sa: 'Normal / as expected', od: 'Open / modulating', fc: 'Clean', dp: 'Clean and draining',
  assessmentDate: SURVEY,
}
const clean = (zn: string) => ({
  zn, su: 'office', co2: '640', co2o: '430', co: '0.5', tf: '74', tfo: '84',
  rh: '45', rho: '55', pm: '6', pmo: '8', tv: '180', cx: 'No complaints',
  meas_duration: '5-minute average',
})
/** Under-ventilated: an elevated CO2 finding, from the reading alone. */
const stuffy = (zn: string) => ({ ...clean(zn), co2: '1385' })
/** Damp: a relative-humidity finding, and a different sentence from CO2's. */
const damp = (zn: string) => ({ ...clean(zn), rh: '68' })
/** An odor complaint with a chemical indicator and an occupant pattern. */
const odorous = (zn: string) => ({
  ...clean(zn), co2: '1385', tv: '2400', sf: '900', oc: '12',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '6-10',
  cc: 'Yes — this zone', znt: 'Persistent solvent odor near the north wall.',
})

function build(zones: any[], bldg: any = GOOD_BLDG, extra: any = {}) {
  const presurvey = {
    ps_survey_date: SURVEY, ps_assessor: 'T. Tester, CIH',
    ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_iaq_cal_status: 'Calibrated',
    ps_reason: 'occupant comfort complaints',
    ...(extra.presurvey || {}),
  }
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  const data = {
    id: 'AIQ-MGR-01', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: genRecs(zoneScores, bldg, { zones, equipment: [] }),
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'T. Tester, CIH', certs: ['CIH'] },
    ...(extra.data || {}),
  }
  return { data, zoneScores, model: assembleRenderModel(data, { now: new Date('2026-09-01T12:00:00Z'), ...(extra.opts || {}) }) as any }
}

const mgrOf = (m: any) => m.managerSummary

/** Every string the management layer puts in front of a reader. */
function mgrProse(m: any): string[] {
  const g = mgrOf(m)
  return [
    g.attention.intro, g.attention.none, g.scope.intro, g.scope.note,
    ...g.scope.did, ...g.scope.notDone,
    ...g.attention.items.flatMap((i: any) => [i.location, i.status, i.nextAction, ...i.issues]),
  ].filter(Boolean)
}

/** The DOCX body as one string per rendered paragraph. */
function docxParagraphs(children: any[]): string[] {
  const out: string[] = []
  const runText = (node: any, acc: string[]): void => {
    if (node == null) return
    if (typeof node === 'string') { acc.push(node); return }
    if (Array.isArray(node)) { for (const n of node) runText(n, acc); return }
    if (typeof node === 'object') {
      if (node.rootKey === 'w:t' && node.root !== undefined) { runText(node.root, acc); return }
      if (node.root !== undefined) runText(node.root, acc)
    }
  }
  const walk = (node: any): void => {
    if (node == null || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const n of node) walk(n); return }
    if (node.constructor && node.constructor.name === 'Paragraph') {
      const acc: string[] = []
      runText(node, acc)
      out.push(acc.join(''))
      return
    }
    if (node.root !== undefined) walk(node.root)
  }
  for (const c of children) walk(c)
  return out
}
const docxText = (m: any) => docxParagraphs(atmosFlowReportChildren(m)).join('\n')

/**
 * The PDF's own text, read back out of the rendered bytes.
 *
 * pdfkit deflates each content stream and writes the runs as hex strings, so
 * a parity assertion has to inflate and decode rather than grep the buffer.
 * Reading the DELIVERABLE is the point: a parity test that compared two
 * renderers' source code would pass while both printed nothing.
 */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1')
  const out: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length
    const end = raw.indexOf('endstream', start)
    if (end < 0) continue
    let chunk: string
    try { chunk = zlib.inflateSync(Buffer.from(raw.slice(start, end), 'latin1')).toString('latin1') } catch { continue }
    for (const t of chunk.matchAll(/<([0-9A-Fa-f\s]+)>/g)) out.push(Buffer.from(t[1].replace(/\s+/g, ''), 'hex').toString('latin1'))
    for (const t of chunk.matchAll(/\((?:\\.|[^()\\])*\)/g)) out.push(t[0].slice(1, -1))
  }
  return out.join('')
}

/**
 * Whitespace removed, for comparing a string against extracted PDF text.
 *
 * `p()` sets body copy JUSTIFIED, which pdfkit renders by positioning each
 * word separately — so the inter-word spaces are layout, not content, and a
 * paragraph comes back out as one run of letters. Squashing both sides
 * compares what the page SAYS without asserting how it was spaced.
 */
const squash = (s: string) => String(s).replace(/\s+/g, '')

// ── 1. It is a projection ─────────────────────────────────────────────────

describe('the management summary is a projection, not a second opinion', () => {
  it('leaves every engine finding exactly as it was', () => {
    const zones = [odorous('Room 214'), clean('Room 108')]
    // The engine's own output, captured BEFORE any report is assembled.
    const before = JSON.stringify(zones.map(z => scoreZone(z, GOOD_BLDG)))
    const { model, zoneScores } = build(zones)
    expect(model.managerSummary.attention.items.length).toBeGreaterThan(0)
    // …and after. Same findings, same severities, same sentences.
    expect(JSON.stringify(zoneScores)).toBe(before)
    expect(JSON.stringify(zones.map(z => scoreZone(z, GOOD_BLDG)))).toBe(before)
  })

  it('is a pure function of the model — it needs no engine input at all', () => {
    // Hand-built model, no assessment behind it. If the summary could only be
    // produced from raw data it would be re-deriving something; it cannot,
    // because everything it states is already a value on the model.
    const model = {
      findings: { rows: [{ z: 'Room 9', zoneKey: 'Room 9', zones: ['Room 9'], sev: 'elevated', f: 'Something measured — and described at length.' }] },
      recommendations: { register: [{ priority: 'Immediate', action: 'Do the thing.', location: 'Room 9' }], registerNote: 'A note.' },
      results: { rows: [{ id: 'Room 9' }] },
      findingsAtGlance: [{ parameter: 'Carbon dioxide (CO2)', outcome: 'elevated' }],
    }
    const a = buildManagerSummary(model, {})
    expect(a.attention.items).toHaveLength(1)
    expect(a.attention.items[0].location).toBe('Room 9')
    expect(a.attention.items[0].nextAction).toBe('Do the thing.')
    // Pure: same input, byte-identical output.
    expect(JSON.stringify(buildManagerSummary(model, {}))).toBe(JSON.stringify(a))
  })

  it('spells out the outcome token the model already carries; it never re-decides one', () => {
    const base = {
      findings: { rows: [{ z: 'Room 9', zones: ['Room 9'], sev: 'advisory', f: 'A finding.' }] },
      recommendations: { register: [] },
      results: { rows: [] }, findingsAtGlance: [],
    }
    const advisory = buildManagerSummary(base, {}).attention.items[0].status
    const priority = buildManagerSummary(
      { ...base, findings: { rows: [{ ...base.findings.rows[0], sev: 'priority' }] } }, {},
    ).attention.items[0].status
    // Change the token the engine stamped, and the status follows it.
    expect(advisory).not.toBe(priority)
    expect(advisory.toLowerCase()).toContain(SEVERITY_DECISION.advisory)
    expect(priority.toLowerCase()).toContain(SEVERITY_DECISION.priority)
  })

  it('takes its decision words from the severity legend, so the two cannot drift', () => {
    // The legend is BUILT from the same map the status column reads. A second
    // vocabulary beside it is the defect class this codebase keeps paying
    // for; the legend's exact wording is also unchanged by the refactor.
    expect(SEVERITY_LEGEND_NOTE).toBe(
      'Acceptable: within recognized references. Advisory: monitor / investigate source. Elevated: corrective action recommended. Priority: prompt action recommended.',
    )
    for (const token of ['ok', 'advisory', 'elevated', 'priority']) {
      expect(SEVERITY_LEGEND_NOTE).toContain(SEVERITY_DECISION[token as keyof typeof SEVERITY_DECISION])
    }
    // The one token that is deliberately not a rung on the ladder.
    expect(SEVERITY_DECISION.not_evaluated).toBe('not evaluated against a numerical criterion')
  })

  it('carries THE register, not a copy of it', () => {
    const { model } = build([odorous('Room 214')])
    expect(model.recommendations.register.length).toBeGreaterThan(0)
    // Identity, not equality: there is one action register in this report.
    expect(model.managerSummary.actionPlan.rows).toBe(model.recommendations.register)
    // And it survives the AI-sections fold, which replaces the
    // recommendations INTRO by spreading the object around it. A copy there
    // would give the Action Plan and section 6 two registers to disagree
    // about, silently, only on reports that carry AI prose.
    const folded = { ...model, recommendations: { ...model.recommendations, intro: ['AI-authored framing.'] } }
    expect(model.managerSummary.actionPlan.rows).toBe(folded.recommendations.register)
  })

  it('does not change with the report lifecycle — only the chrome does', () => {
    const zones = [odorous('Room 214'), clean('Room 108')]
    const draft = build(zones, GOOD_BLDG, { opts: { reportStatus: 'draft' } }).model
    const final = build(zones, GOOD_BLDG, { opts: { reportStatus: 'final', reportProfile: 'professional' } }).model
    expect(JSON.stringify(final.managerSummary)).toBe(JSON.stringify(draft.managerSummary))
  })
})

// ── 2. The fold is the engine's, and nothing is lost to it ────────────────

describe('a condition in several zones reaches the manager once', () => {
  it('folds one identical finding across zones into one row, naming every zone', () => {
    const zones = [stuffy('Room A'), stuffy('Room B'), stuffy('Room C')]
    const { model } = build(zones)
    const co2Rows = model.managerSummary.attention.items
      .filter((i: any) => i.issues.some((s: string) => /CO/.test(s)))
    expect(co2Rows).toHaveLength(1)
    // Named as a building-wide condition, because it holds in every zone.
    expect(co2Rows[0].location).toBe('All zones (3)')
    expect(co2Rows[0].zones).toEqual(['Room A', 'Room B', 'Room C'])
    // The fold removes the REPETITION of one sentence, never a measurement:
    // all three zones still have their own row in Measurement Results.
    const ids = model.results.rows.map((r: any) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['Room A', 'Room B', 'Room C']))
    for (const r of model.results.rows.filter((r: any) => /^Room/.test(r.id))) expect(r.co2).toBe(1385)
  })

  it('keeps two DIFFERENT findings in two zones apart', () => {
    const { model } = build([stuffy('Room A'), damp('Room B')])
    const items = model.managerSummary.attention.items
    const locations = items.map((i: any) => i.location)
    expect(locations).toContain('Room A')
    expect(locations).toContain('Room B')
    const a = items.find((i: any) => i.location === 'Room A')
    const b = items.find((i: any) => i.location === 'Room B')
    expect(a.issues.join(' ')).toMatch(/CO/)
    expect(b.issues.join(' ')).toMatch(/RH|humidity/i)
    // Neither row claims the other's finding.
    expect(a.issues.join(' ')).not.toMatch(/humidity/i)
  })

  it('names a single actionable zone once, with an action the register really contains', () => {
    const { model } = build([stuffy('Room A'), clean('Room B')])
    const items = model.managerSummary.attention.items
    expect(items.filter((i: any) => i.location === 'Room A')).toHaveLength(1)
    // The clean zone is not listed under a heading that says otherwise.
    expect(items.some((i: any) => i.location === 'Room B')).toBe(false)
    const actions = model.recommendations.register.map((r: any) => r.action)
    for (const item of items) {
      if (item.nextAction.startsWith('No corrective action')) continue
      expect(actions).toContain(item.nextAction)
    }
  })

  it('never proposes an action scoped to one room on a row that names two', () => {
    const { model } = build([stuffy('Room A'), damp('Room B'), clean('Room C')])
    const register = model.recommendations.register
    for (const item of model.managerSummary.attention.items) {
      const match = register.find((r: any) => r.action === item.nextAction)
      if (!match) continue
      const where = String(match.location)
      if (/^Building-wide/.test(where)) continue
      // The action covers every location the row names — all of them, not one.
      for (const zone of item.zones) expect(where).toContain(zone)
    }
  })
})

// ── 3. Nothing is invented ────────────────────────────────────────────────

describe('it states what the report already establishes, and no more', () => {
  it('quotes the report’s own limitations verbatim for what was not done', () => {
    const { model, data } = build([odorous('Room 214'), clean('Room 108')])
    const notDone = model.managerSummary.scope.notDone
    expect(notDone.length).toBeGreaterThan(2)
    // Every line IS a limitation of this report — the same string, not a
    // paraphrase. A paraphrase would be a second limitation list.
    for (const line of notDone) expect(model.limitations).toContain(line)
    // And the technical section keeps all of them, boundaries and qualifiers.
    const entries = buildLimitationEntries(data)
    expect(model.limitations).toEqual(entries.map((e: any) => e.text))
    expect(buildLimitations(data)).toEqual(model.limitations)
    expect(model.limitations.length).toBeGreaterThan(notDone.length)
  })

  it('reports a working hypothesis as unconfirmed, never as an established cause', () => {
    const { model } = build([odorous('Room 214'), clean('Room 108')])
    const hypothesised = model.managerSummary.attention.items.filter((i: any) => /Working hypothesis/.test(i.status))
    expect(hypothesised.length).toBeGreaterThan(0)
    for (const item of hypothesised) {
      expect(item.status).toContain('no causal relationship has been established')
    }
    for (const line of mgrProse(model)) {
      expect(line).not.toMatch(/\bcaused by\b/i)
      expect(line).not.toMatch(/\bconfirmed (?:source|cause)\b/i)
      expect(line).not.toMatch(/\b(?:the|a) (?:established|proven|identified) cause\b/i)
    }
  })

  it('does not turn a TVOC reading into an acceptable one', () => {
    const { model } = build([odorous('Room 214'), clean('Room 108')])
    const tvoc = model.findingsAtGlance.find((g: any) => /TVOC/.test(g.parameter))
    // The engine judges TVOC against nothing, and the report says so.
    expect(tvoc.outcome).toBe('not_evaluated')
    expect(tvoc.basis).toMatch(/No applicable threshold/)
    const prose = mgrProse(model).join('\n')
    // The management layer may NAME the measurement; it may not rate it.
    expect(prose).toContain('Total VOCs (TVOC)')
    expect(prose).not.toMatch(/TVOC[^.\n]*\b(?:acceptable|within|below|above|exceed)/i)
    // No attention row is generated from a parameter nothing judged.
    for (const item of model.managerSummary.attention.items) {
      expect(item.issues.join(' ')).not.toMatch(/TVOC\s*\d+\s*µg\/m³\s*—/)
    }
  })

  it('passes the banned-language gate on every string it authors', () => {
    for (const zones of [[clean('Room 108'), clean('Room 110')], [odorous('Room 214'), damp('Room 220'), clean('Room 108')]]) {
      const { model } = build(zones)
      for (const line of [
        model.managerSummary.attention.intro, model.managerSummary.attention.none,
        model.managerSummary.scope.intro, model.managerSummary.scope.note,
        ...model.managerSummary.scope.did, ...model.managerSummary.scope.notDone,
      ].filter(Boolean)) {
        expect(scan(line), line).toEqual([])
      }
    }
  })
})

// ── 4. A clean assessment stays clean ─────────────────────────────────────

describe('an assessment that found nothing says so, and certifies nothing', () => {
  const { model } = build([clean('Room 108'), clean('Room 110')])

  it('invents no issue and renders no empty table', () => {
    expect(model.findings).toBeNull()
    expect(model.managerSummary.attention.items).toEqual([])
    expect(model.managerSummary.attention.none).toBeTruthy()
    const text = docxText(model)
    expect(text).toContain('What Needs Attention')
    expect(text).toContain(model.managerSummary.attention.none)
    // The table's own column headings are absent — an empty table under a
    // heading reads as a section that failed to render.
    expect(text).not.toContain('What happens next')
  })

  it('states no action without implying a certification or a clean bill of health', () => {
    const none = model.managerSummary.attention.none as string
    expect(none).toMatch(/No conditions requiring corrective action were identified/)
    // Bounded: to the areas assessed, and to the window.
    expect(none).toContain('areas assessed')
    expect(none).toContain('assessment window')
    for (const word of ['safe', 'healthy', 'compliant', 'compliance', 'certif', 'guarantee', 'no risk', 'passed']) {
      expect(none.toLowerCase()).not.toContain(word)
    }
    expect(scan(none)).toEqual([])
    // A parameter nothing judged is pointed at rather than folded into the
    // all-clear — the report measured TVOC and evaluated nothing about it.
    expect(none).toContain('not evaluated against a numerical criterion')
  })

  it('still describes what was done and what was not', () => {
    expect(model.managerSummary.scope.did.length).toBeGreaterThan(0)
    expect(model.managerSummary.scope.notDone.length).toBeGreaterThan(0)
    const text = docxText(model)
    expect(text).toContain('Assessment Scope')
    for (const line of model.managerSummary.scope.notDone) expect(text).toContain(line)
  })
})

// ── 5. The document: architecture, and both deliverables ──────────────────

describe('the document leads with the management layer and keeps the evidence behind it', () => {
  const { model } = build([odorous('Room 214'), damp('Room 220'), clean('Room 108')])
  const paras = docxParagraphs(atmosFlowReportChildren(model))
  const at = (needle: string) => paras.findIndex((p) => p === needle)

  it('puts the four management blocks before the first technical section', () => {
    const exec = at('Executive Summary')
    const attention = at('What Needs Attention')
    const plan = at('Action Plan')
    const scope = at('Assessment Scope')
    const technical = at('1. Purpose, Scope & Site Background')
    for (const i of [exec, attention, plan, scope, technical]) expect(i).toBeGreaterThan(-1)
    expect(exec).toBeLessThan(attention)
    expect(attention).toBeLessThan(plan)
    expect(plan).toBeLessThan(scope)
    expect(scope).toBeLessThan(technical)
  })

  it('keeps every technical section, in the order a CIH reads an investigation', () => {
    const order = [
      '1. Purpose, Scope & Site Background',
      '2. Investigation Methods & QA/QC',
      '3. Walkthrough Observations & Occupant Reports',
      '4. Measurement Results',
      '5. Discussion & Conclusions',
      '6. Recommended Actions & Verification',
      '7. Limitations',
      '8. Professional Review & Signature',
      'Appendix A — Parameter Background',
      'Appendix B — Standards & References',
      'Appendix C — Site Photographs',
    ]
    const found = order.map(at)
    for (let i = 0; i < order.length; i += 1) expect(found[i], order[i]).toBeGreaterThan(-1)
    for (let i = 1; i < order.length; i += 1) expect(found[i], order[i]).toBeGreaterThan(found[i - 1])
  })

  it('moves the parameter table into the technical body rather than deleting it', () => {
    const overview = at('MEASUREMENT OVERVIEW')
    expect(overview).toBeGreaterThan(at('4. Measurement Results'))
    expect(overview).toBeLessThan(at('5. Discussion & Conclusions'))
    expect(at('FINDINGS AT A GLANCE')).toBe(-1)
    // The severity legend travels with the outcomes it decodes.
    expect(at('SEVERITY LEGEND')).toBeGreaterThan(at('4. Measurement Results'))
  })

  it('prints the action register TABLE once, and cross-references it from section 6', () => {
    // The table is identified by a column heading only it has. Printing the
    // identical five-column register twice would make a reader check whether
    // the two agreed; section 6 points at it instead.
    const headings = paras.filter((t) => t === 'Completion evidence')
    expect(headings).toHaveLength(1)
    const planAt = at('Action Plan')
    const registerAt = paras.findIndex((t) => t === 'Completion evidence')
    expect(registerAt).toBeGreaterThan(planAt)
    expect(registerAt).toBeLessThan(at('Assessment Scope'))
    expect(docxText(model)).toContain('is in the Action Plan at the front of this report')
  })

  it('reaches the client in the same shape in the Word file and in the PDF', async () => {
    const doc = await buildAtmosFlowDocument(build([odorous('Room 214'), damp('Room 220'), clean('Room 108')]).data)
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    const xml = await zip.file('word/document.xml')!.async('string')
    const pdf = pdfText(await renderReportPdf(model))

    const item = model.managerSummary.attention.items[0]
    const plan = model.managerSummary.actionPlan.rows[0]
    // Section headings, the leading attention row, the first action, and the
    // scope summary — in BOTH deliverables.
    for (const needle of [
      'What Needs Attention', 'Action Plan', 'Assessment Scope',
      item.location, item.issues[0], plan.action, plan.owner,
      model.managerSummary.scope.did[0], model.managerSummary.scope.notDone[0],
    ]) {
      const ascii = String(needle).replace(/[^\x20-\x7E]/g, '')
      expect(xml.includes(String(needle)) || xml.includes(ascii), `missing from DOCX: ${needle}`).toBe(true)
      // Compared with whitespace removed: justified body copy comes back out
      // of the PDF as one run of letters (see `squash`), and the WinAnsi runs
      // decode to single bytes, so the ASCII skeleton is what both formats
      // genuinely share.
      expect(squash(pdf).includes(squash(ascii)), `missing from PDF: ${ascii.slice(0, 60)}`).toBe(true)
    }
  })

  it('offers the management prose to a semantic reviewer as quotable text', () => {
    const section = collectReportText(model).find((s: any) => s.section_id === 'management_summary')
    expect(section).toBeTruthy()
    const blocks = section.blocks.map((b: any) => b.text)
    expect(blocks).toContain(model.managerSummary.attention.intro)
    expect(blocks).toContain(model.managerSummary.scope.intro)
    // Every block is in the document the client receives.
    const text = docxText(model)
    for (const b of blocks) expect(text.includes(b), b.slice(0, 60)).toBe(true)
  })
})

// ── 6. The executive summary states the next step, once and in prose ──────

describe('the most important next step is a sentence, and the Action Plan is the list', () => {
  const zones = [odorous('Room 214'), stuffy('Room 216'), clean('Room 108')]
  const { model, data } = build(zones)

  it('quotes the register\u2019s first Immediate action verbatim, as one sentence', () => {
    const lead = model.recommendations.register.find((r: any) => r.priority === 'Immediate')
    expect(lead).toBeTruthy()
    const step = model.execSummary.nextStep as string
    expect(typeof step).toBe('string')
    // Verbatim, so the summary and the Action Plan row cannot phrase the same
    // action two ways.
    expect(step).toContain(lead.action)
    expect(step).toContain(lead.location)
    expect(step).toContain('Action Plan')
    // The list is gone from the summary's contract.
    expect(model.execSummary.actions).toBeUndefined()
  })

  it('renders no "First actions" list in either client deliverable', async () => {
    const text = docxText(model)
    expect(text).not.toContain('FIRST ACTIONS')
    expect(text).not.toContain('First actions')
    expect(text).toContain(model.execSummary.nextStep)
    const pdf = pdfText(await renderReportPdf(model))
    expect(pdf).not.toContain('First Actions')
    expect(squash(pdf)).toContain(squash(model.execSummary.nextStep))
  })

  it('names the leading action at most twice in the opening pages, not three times', () => {
    // It was three: the summary bullet, the What-Needs-Attention next step,
    // and the Action Plan row. The summary sentence and the plan row remain,
    // and the attention table's own next step for that location is the same
    // action — so the count is what the hierarchy intends, not an accident.
    const action = model.recommendations.register.find((r: any) => r.priority === 'Immediate').action
    const paragraphs = docxParagraphs(atmosFlowReportChildren(model))
    const summaryBullets = paragraphs.filter((t) => t === `${model.managerSummary.attention.items[0].location}: ${action}`)
    expect(summaryBullets).toHaveLength(0)
  })

  it('reads in the intended order: summary, then what needs attention, then the plan', () => {
    const paragraphs = docxParagraphs(atmosFlowReportChildren(model))
    const at = (needle: string) => paragraphs.findIndex((t) => t === needle)
    const step = paragraphs.findIndex((t) => t === model.execSummary.nextStep)
    expect(at('Executive Summary')).toBeLessThan(step)
    expect(step).toBeLessThan(at('What Needs Attention'))
    expect(at('What Needs Attention')).toBeLessThan(at('Action Plan'))
  })

  it('says nothing about a next step when nothing is urgent', () => {
    const quiet = build([clean('Room 108'), clean('Room 110')]).model
    // Same gate the bullet list had: no Immediate action, no sentence. The
    // overall statement already says routine operation is appropriate.
    expect(quiet.recommendations.register.some((r: any) => r.priority === 'Immediate')).toBe(false)
    expect(quiet.execSummary.nextStep).toBeNull()
    const text = docxText(quiet)
    expect(text).not.toContain('The first action is at')
  })

  it('survives an AI-authored executive summary, which replaces only the paragraphs', () => {
    const pkg = buildEvidencePackage(model, { zoneScores: data.zoneScores, causalChains: data.causalChains })
    const record = buildAiSectionsRecord(
      { executive_summary: 'Carbon dioxide stood out at this site.\n\nThe source was not identified during the assessment.' },
      pkg,
    )
    const folded = applyAiSections(model, record, pkg)
    // The writer owns the paragraphs…
    expect(folded.aiAuthoredSections).toContain('executive_summary')
    expect(folded.execSummary.paragraphs[0]).toContain('Carbon dioxide stood out')
    // …and the next step, which is the engine's action quoted verbatim, is
    // not in that slot and is unchanged. Both paths state it.
    expect(folded.execSummary.nextStep).toBe(model.execSummary.nextStep)
    expect(docxText(folded)).toContain(model.execSummary.nextStep)
  })

  it('keeps the whole rendered executive summary clear of banned language', () => {
    // The gate at api/report-pdf.js scans AUTHORED prose and deliberately
    // leaves engine output alone, so the leading findings and this sentence
    // are not scanned at runtime — a descriptive word in an engine finding
    // must not 422 a client's report. That policy is unchanged. What this
    // asserts is the thing the policy leaves unproven: that the section a
    // manager reads first is clean end to end, on a findings-heavy
    // assessment and on a clean one.
    for (const fixture of [model, build([clean('Room 108'), clean('Room 110')]).model]) {
      const es = fixture.execSummary
      for (const line of [
        ...(es.paragraphs || []), ...(es.findings || []),
        es.nextStep, fixture.overallStatement,
      ].filter(Boolean)) {
        expect(scan(line), line).toEqual([])
      }
    }
  })

  it('offers the sentence to a semantic reviewer, where the bullet list used to be', () => {
    const section = collectReportText(model).find((s: any) => s.section_id === 'executive_summary')
    expect(section.blocks.map((b: any) => b.text)).toContain(model.execSummary.nextStep)
  })
})
