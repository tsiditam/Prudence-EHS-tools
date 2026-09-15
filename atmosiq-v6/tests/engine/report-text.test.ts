/**
 * The report's prose, by section — and the proof that it is the report's.
 *
 * This is the load-bearing test of Semantic Report QA. Everything downstream
 * trusts that a quote resolved against `collectReportText` is a quote the
 * reader saw, and nothing downstream can detect it if that is false. So the
 * central assertion here is not a fixture comparison: it builds the REAL DOCX
 * children from the same model and asserts every collected block appears in
 * the document, character for character.
 *
 * Four properties:
 *
 *   1. FIDELITY. Every block is in the rendered document. A block that is not
 *      is text no client ever saw, and a finding quoting it would be a defect
 *      raised about a sentence that does not exist.
 *   2. NOTHING TRANSFORMED IS COLLECTED. Table cells go through `fmt()` and
 *      `sev().label`, headings through `label()`. Those strings differ between
 *      the model and the page, so they are excluded — by test, not by comment.
 *   3. THE RENDERER'S CONDITIONS ARE MIRRORED. A section the document does not
 *      print has no blocks. Collecting from one would let a reviewer quote
 *      text the report omitted.
 *   4. IT IS PURE AND STABLE. Same model, same blocks, same fingerprint, with
 *      identity derived from content rather than position.
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { atmosFlowReportChildren } from '../../src/components/docx/sections-atmosflow.js'
import {
  collectReportText, nonEmptySections, reportTextFingerprint, blockId,
  REPORT_SECTIONS, REPORT_SECTION_IDS, EXCLUDED_FROM_TEXT, BLOCK_SEPARATOR,
  REPORT_TEXT_VERSION,
// @ts-expect-error js
} from '../../src/report/reportText.js'

const BLDG = { fn: 'Consistency Tower', ft: 'Commercial Office', ht: 'Central AHU — VAV', sa: 'Weak / reduced', od: 'Closed / minimum' }

const COMPLAINT = {
  zn: '4th Floor Open Office — North', su: 'office', sf: '8200', oc: '46',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '6-10', cc: 'Yes — this zone',
  tc: 'Slightly warm', wd: 'Old staining', wl: ['Ceiling'],
  co2: '1385', co2o: '430', tf: '76.8', tfo: '84', rh: '63', rho: '70', pm: '19', pmo: '9', co: '1.5', tv: '850', hc: '0.03',
  meas_duration: '5-minute average', znt: 'Diffusers read low at the north bank.',
}
const CLEAN = { zn: 'Z1', su: 'office', co2: '600', co2o: '420', co: '2', tf: '74', rh: '45', pm: '5', cx: 'No complaints' }

function build(zones: any[], extra: any = {}) {
  const presurvey = extra.presurvey || { ps_survey_date: '2026-07-15', ps_assessor: 'T. Tester, CIH' }
  const bldg = { ...BLDG, assessmentDate: presurvey.ps_survey_date }
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  return assembleRenderModel({
    id: 'rpt-x', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs: genRecs(zoneScores, bldg, { zones, equipment: [] }),
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'T. Tester, CIH', certs: ['CIH'] },
    ...extra.data,
  }, { now: new Date('2026-09-01T12:00:00Z') })
}

/**
 * The document's own text, one string per rendered paragraph.
 *
 * Runs are concatenated within a paragraph, because a run is a formatting
 * boundary and not a reading one: `lead()` prints a bold lead and a justified
 * remainder as one visual line, and a reader quoting it quotes across both.
 */
function paragraphTexts(children: any[]): string[] {
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
    const name = node.constructor && node.constructor.name
    if (name === 'Paragraph') {
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

/** Every block the collector produced, flattened. */
const allBlocks = (sections: any[]) =>
  sections.flatMap((s: any) => s.blocks.map((b: any) => ({ section_id: s.section_id, text: b.text })))

// ── 1. Fidelity ───────────────────────────────────────────────────────────

describe('every collected block is in the document the client receives', () => {
  const cases: Array<[string, any[]]> = [
    ['a clean single zone', [CLEAN]],
    ['a complaint zone with every parameter', [COMPLAINT]],
    ['two zones, one clean', [COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }]],
    ['three zones with a second complaint', [COMPLAINT, { ...COMPLAINT, zn: 'Zone B' }, { ...CLEAN, zn: 'Zone C' }]],
  ]

  for (const [name, zones] of cases) {
    it(name, () => {
      const model = build(zones)
      const sections = collectReportText(model)
      const paras = paragraphTexts(atmosFlowReportChildren(model))
      const blocks = allBlocks(sections)
      expect(blocks.length).toBeGreaterThan(5)
      for (const b of blocks) {
        const found = paras.some((p) => p.includes(b.text))
        expect(found, `not in the rendered document [${b.section_id}]: ${JSON.stringify(b.text.slice(0, 120))}`).toBe(true)
      }
    })
  }

  it('holds for an AI-authored discussion folded into the model', () => {
    // The five writable sections reach the document through the same
    // primitives, so AI prose must be quotable exactly as deterministic prose
    // is. Folded in the way `applyAiSections` folds it.
    const model: any = build([COMPLAINT])
    model.discussion = { paragraphs: ['Carbon dioxide rose through the afternoon in the north bank.', 'The pattern is consistent with occupancy rather than a source.'] }
    const sections = collectReportText(model)
    const paras = paragraphTexts(atmosFlowReportChildren(model))
    const discussion = sections.find((s: any) => s.section_id === 'discussion')
    expect(discussion.blocks.length).toBeGreaterThan(1)
    for (const b of discussion.blocks) expect(paras.some((p) => p.includes(b.text))).toBe(true)
  })

  it('quotes an assessor note without the label the renderer adds', () => {
    const model: any = build([COMPLAINT])
    const obs = collectReportText(model).find((s: any) => s.section_id === 'walkthrough_observations')
    const note = obs.blocks.find((b: any) => b.text === 'Diffusers read low at the north bank.')
    expect(note, 'the assessor note should be its own block').toBeTruthy()
    // The document prints "Assessor notes: " before it. That prefix is the
    // renderer's, not the report's, so it is not part of the quotable text —
    // while the note itself still resolves inside the rendered line.
    expect(note.text.startsWith('Assessor notes')).toBe(false)
    const paras = paragraphTexts(atmosFlowReportChildren(model))
    expect(paras.some((p) => p.startsWith('Assessor notes: ') && p.includes(note.text))).toBe(true)
  })
})

// ── 2. Nothing transformed is collected ───────────────────────────────────

describe('it collects nothing the renderer transforms', () => {
  const model = build([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])
  const sections = collectReportText(model)
  const joined = sections.map((s: any) => s.text).join('\n')

  const blockTexts = new Set(allBlocks(sections).map((b: any) => b.text))

  it('collects no table cell', () => {
    // EXACT match, not substring, and the difference is a real property of
    // the report rather than a weaker test.
    //
    // The document states one claim in as many as three places and three
    // forms: the findings table prints "6-10 occupants reporting symptoms" in
    // a cell, the executive summary prints the same claim as a bullet with
    // the zone prefixed, and the walkthrough observations print it as a
    // sentence. Those are three different strings that share a substring. A
    // substring assertion would call the two prose bullets a table leak and
    // force them out of the reviewable text — removing exactly the restatement
    // a cross-section contradiction check exists to read.
    //
    // What "no table cell" means is that no BLOCK is a cell. That is this.
    for (const row of model.findings?.rows || []) {
      expect(blockTexts.has(row.f), `findings row collected verbatim: ${row.f}`).toBe(false)
    }
    for (const r of model.recommendations?.register || []) {
      expect(blockTexts.has(r.action), `register action collected verbatim: ${r.action}`).toBe(false)
    }
    for (const q of model.qaQc || []) {
      expect(blockTexts.has(q), `qa/qc row collected verbatim: ${q}`).toBe(false)
    }
    for (const [ref] of model.references || []) {
      expect(blockTexts.has(String(ref)), `reference collected verbatim: ${ref}`).toBe(false)
    }
    // The tables really were populated, so the assertions above had something
    // to be true about.
    expect((model.findings?.rows || []).length).toBeGreaterThan(2)
    expect((model.references || []).length).toBeGreaterThan(0)
  })

  it('keeps a claim the report restates in prose, in every prose place it appears', () => {
    // The corollary of the rule above, asserted so a later tightening of the
    // exclusion cannot quietly delete it. A reviewer comparing the summary
    // against the observations needs both sentences to be quotable.
    const summary = sections.find((s: any) => s.section_id === 'executive_summary').text
    const observed = sections.find((s: any) => s.section_id === 'walkthrough_observations').text
    const claim = '6-10 occupants reporting symptoms'
    expect(summary).toContain(claim)
    expect(observed).toContain(claim)
  })

  it('collects no heading', () => {
    for (const s of REPORT_SECTIONS) {
      expect(joined.includes(s.name), `heading leaked: ${s.name}`).toBe(false)
    }
  })

  it('states each exclusion with a reason rather than leaving an absence', () => {
    expect(Object.isFrozen(EXCLUDED_FROM_TEXT)).toBe(true)
    for (const [key, why] of Object.entries(EXCLUDED_FROM_TEXT)) {
      expect(typeof why, key).toBe('string')
      expect((why as string).length, key).toBeGreaterThan(30)
    }
    expect(Object.keys(EXCLUDED_FROM_TEXT)).toContain('findings_table')
    expect(Object.keys(EXCLUDED_FROM_TEXT)).toContain('references')
  })
})

// ── 3. The renderer's conditions are mirrored ─────────────────────────────

describe('a section the document does not print carries no blocks', () => {
  const textOf = (model: any, id: string) =>
    collectReportText(model).find((s: any) => s.section_id === id).text

  it('returns every declared section, empty ones included', () => {
    const sections = collectReportText({})
    expect(sections.map((s: any) => s.section_id)).toEqual(REPORT_SECTION_IDS)
    for (const s of sections) {
      expect(s.blocks).toEqual([])
      expect(s.text).toBe('')
    }
    expect(nonEmptySections(sections)).toEqual([])
  })

  it('drops section 5 prose entirely when there are no findings', () => {
    const withFindings = { findings: { intro: 'The intro.' }, discussion: { paragraphs: ['A paragraph.'] } }
    expect(textOf(withFindings, 'discussion')).toContain('The intro.')
    // The renderer wraps all of section 5 in `if (M.findings)`, so without it
    // the discussion paragraph reaches no reader.
    expect(textOf({ discussion: { paragraphs: ['A paragraph.'] } }, 'discussion')).toBe('')
  })

  it('drops the recommendations intro when neither a register nor a list exists', () => {
    expect(textOf({ recommendations: { intro: 'Rec intro.' } }, 'recommended_actions')).toBe('')
    expect(textOf({ recommendations: { intro: 'Rec intro.', register: [{ action: 'x' }] } }, 'recommended_actions'))
      .toBe('Rec intro.')
    // The legacy shape prints its bullets, so those are quotable too.
    const legacy = textOf({ recommendations: { intro: 'Rec intro.', immediate: ['Do the thing.'] } }, 'recommended_actions')
    expect(legacy).toContain('Rec intro.')
    expect(legacy).toContain('Do the thing.')
    // A register prints a table, so its actions are NOT quotable prose.
    expect(textOf({ recommendations: { register: [{ action: 'In the table.' }] } }, 'recommended_actions'))
      .not.toContain('In the table.')
  })

  it('drops a conceptual-model or hypotheses intro with no rows behind it', () => {
    const base = { findings: {} }
    expect(textOf({ ...base, conceptualModel: { intro: 'CSM intro.' } }, 'discussion')).toBe('')
    expect(textOf({ ...base, conceptualModel: { intro: 'CSM intro.', rows: [['Element', 'Value']] } }, 'discussion'))
      .toBe('CSM intro.')
    expect(textOf({ ...base, workingHypotheses: { intro: 'WH intro.' } }, 'discussion')).toBe('')
    expect(textOf({ ...base, workingHypotheses: { intro: 'WH intro.', items: ['One.'] } }, 'discussion'))
      .toBe('WH intro.\n\nOne.')
  })

  it('drops the sampling intro with no sampling rows', () => {
    expect(textOf({ sampling: { intro: 'Sampling intro.' } }, 'recommended_actions')).toBe('')
    expect(textOf({ sampling: { intro: 'Sampling intro.', rows: [{ zone: 'Z1' }] } }, 'recommended_actions'))
      .toBe('Sampling intro.')
  })

  it('accepts the legacy string executive summary the renderer still accepts', () => {
    expect(textOf({ execSummary: 'One stored paragraph.' }, 'executive_summary')).toBe('One stored paragraph.')
  })

  it('drops parameter background with no parameters', () => {
    expect(textOf({ results: { perParamIntro: 'Intro.' } }, 'parameter_background')).toBe('')
    expect(textOf({ results: { perParamIntro: 'Intro.', parameters: [{ body: ['Carbon dioxide: a line.'] }] } }, 'parameter_background'))
      .toBe('Intro.\n\nCarbon dioxide: a line.')
  })

  it('ignores a non-string in a prose slot rather than stringifying it', () => {
    // A number where a sentence belongs is a defect upstream. Quoting
    // `String(42)` would invent a sentence the report does not make.
    const s = collectReportText({ limitations: [42, null, '', '   ', 'A real limitation.'] })
      .find((x: any) => x.section_id === 'limitations')
    expect(s.blocks.map((b: any) => b.text)).toEqual(['A real limitation.'])
  })

  it('survives a malformed model without throwing', () => {
    for (const bad of [null, undefined, 'a string', 42, [], { observations: { zones: [null, {}] } }]) {
      expect(() => collectReportText(bad as never)).not.toThrow()
    }
  })
})

// ── 4. Pure, stable, content-addressed ────────────────────────────────────

describe('it is deterministic and identified by content', () => {
  it('returns byte-identical output for the same model', () => {
    const model = build([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])
    expect(JSON.stringify(collectReportText(model))).toBe(JSON.stringify(collectReportText(model)))
  })

  it('identifies a block by its text, never its position', () => {
    // Looked up by id, not by array index: a section added to the list must
    // not silently re-point this assertion at a different section, which is
    // the same positional-identity defect the test itself is about.
    const at = (model: any, id: string) => collectReportText(model).find((s: any) => s.section_id === id)
    const a = at({ limitations: ['One.', 'Two.'] }, 'limitations')
    const b = at({ limitations: ['Two.', 'One.'] }, 'limitations')
    expect(a.section_id).toBe('limitations')
    expect(new Set(a.blocks.map((x: any) => x.id))).toEqual(new Set(b.blocks.map((x: any) => x.id)))
    expect(a.blocks[0].id).toBe(blockId('One.'))
  })

  it('lists one entry per distinct string, so a repeat is one handle', () => {
    const s = collectReportText({ limitations: ['Same.', 'Same.', 'Other.'] })
      .find((x: any) => x.section_id === 'limitations')
    expect(s.blocks.map((b: any) => b.text)).toEqual(['Same.', 'Other.'])
  })

  it('joins blocks with a separator no block contains', () => {
    const model = build([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])
    for (const s of collectReportText(model)) {
      for (const b of s.blocks) expect(b.text.includes(BLOCK_SEPARATOR)).toBe(false)
      expect(s.text).toBe(s.blocks.map((b: any) => b.text).join(BLOCK_SEPARATOR))
    }
  })

  it('fingerprints the prose, and moving a paragraph between sections changes it', () => {
    const a = collectReportText({ limitations: ['A limitation.'] })
    const b = collectReportText({ limitations: ['A limitation.'] })
    expect(reportTextFingerprint(a)).toBe(reportTextFingerprint(b))
    // Same sentence, different section: a different document.
    const moved = collectReportText({ execSummary: { paragraphs: ['A limitation.'] } })
    expect(reportTextFingerprint(moved)).not.toBe(reportTextFingerprint(a))
    expect(reportTextFingerprint(collectReportText({}))).not.toBe(reportTextFingerprint(a))
    expect(reportTextFingerprint(null as never)).toBe(reportTextFingerprint([]))
  })

  it('freezes what it returns, so a consumer cannot edit another consumer’s view', () => {
    const [first] = collectReportText({ execSummary: { paragraphs: ['A.'] } })
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.blocks)).toBe(true)
    expect(Object.isFrozen(first.blocks[0])).toBe(true)
    expect(Object.isFrozen(REPORT_SECTIONS)).toBe(true)
  })

  it('carries a version that a section-list change has to move', () => {
    expect(REPORT_TEXT_VERSION).toBe(2)
    expect(REPORT_SECTION_IDS).toHaveLength(11)
    // The id is the stable handle a reviewer names; renaming one is a
    // breaking change to every stored quote. In DOCUMENT order — the
    // management layer opens the body, after the executive summary and
    // before the first numbered technical section.
    expect(REPORT_SECTION_IDS).toEqual([
      'executive_summary', 'management_summary', 'scope_and_purpose', 'methods',
      'walkthrough_observations', 'measurement_results', 'discussion', 'recommended_actions',
      'limitations', 'professional_review', 'parameter_background',
    ])
  })
})
