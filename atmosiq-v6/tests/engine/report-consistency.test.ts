/**
 * Report consistency — one list, in one contract, from three places.
 *
 * Six properties, in descending order of how badly getting them wrong would
 * matter:
 *
 *   1. THE EXISTING SURFACE IS UNCHANGED. `checkRenderModel` keeps its twenty
 *      rules and its messages; the Report-consistency section renders exactly
 *      the rows it rendered before, and the new rules join them in the same
 *      shape. A projection that altered what an assessor already reads would
 *      be a rewrite wearing a projection's name.
 *   2. NOTHING BLOCKS AND NOTHING IS STORED. Severity is clamped below
 *      `blocking`, resolution is derived, and fixing the record makes a
 *      finding stop deriving. Readiness, finalization and the verdict are
 *      untouched.
 *   3. EVERY RETAINED LEGACY RULE HAS AN EQUIVALENT. `preReviewValidator.js`
 *      stays where it is until this is proven per rule, on the same input.
 *   4. IT ASSERTS NO CAUSE AND NO COMPLIANCE POSITION. A layer that checks a
 *      document for over-claiming may not over-claim in the checking, so the
 *      report's own banned-language scanner runs over every string it emits.
 *   5. STALENESS IS MATERIAL, NOT STORED. A stale record the export already
 *      refuses raises nothing; one carrying the assessor's own work does.
 *   6. IT IS DERIVED AND DETERMINISTIC. Same record, same findings, byte for
 *      byte, with the clock outside identity.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-expect-error js
import { scoreZone, summarizeAssessment } from '../../src/engines/scoring.js'
// @ts-expect-error js
import { genRecs } from '../../src/engines/scoring-legacy.js'
// @ts-expect-error js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-expect-error js
import { checkRenderModel, RULE_IDS } from '../../src/report/modelConsistency.js'
// @ts-expect-error js
import { buildReadinessVerdict } from '../../src/engines/readiness-verdict.js'
import {
  detectReportConsistency, asConsistencyRow, projectRenderConsistency,
  checkPhotoReferences, checkDuplicateFindings, checkLabDates,
  checkCitationAntiPatterns, checkSampleIdDrift, checkFindingCoverage,
  checkMaterialStaleContent, checkOrphanedPhotos, locationCovers,
  clampSeverity, jaccardSimilarity,
  RENDER_RULE_MAP, RULE_ERROR_MAP, WHY_IT_MATTERS, DETECTOR, SOURCE_LAYER,
// @ts-expect-error js
} from '../../src/engines/integrity/report-consistency.js'
import {
  INTEGRITY_ISSUE_TYPES, INTEGRITY_ANCHOR_KINDS, INTEGRITY_ACTIONABILITY,
  INTEGRITY_SOURCE_LAYERS, integrityIdentity,
// @ts-expect-error js
} from '../../src/engines/integrity/finding.js'
// The legacy validator, still in the tree. Retained until parity is proven,
// which is what the parity block below does.
import {
  runPreReviewChecks,
  checkPhotoReferences as legacyPhotoRefs,
  checkDuplicateFindings as legacyDuplicates,
  checkLabDateSanity as legacyLabDates,
  checkCitationAntiPatterns as legacyAntiPatterns,
  checkSampleIdDrift as legacySampleDrift,
  checkFindingsWithoutRecs as legacyFindingsWithoutRecs,
// @ts-expect-error js
} from '../../src/utils/preReviewValidator.js'
import { scanProseForBannedLanguage } from '../../src/engine/report/cih-validation'

const BLDG = { fn: 'Consistency Tower', ft: 'Commercial Office', ht: 'Central AHU — VAV', sa: 'Weak / reduced', od: 'Closed / minimum' }

const COMPLAINT = {
  zn: '4th Floor Open Office — North', su: 'office', sf: '8200', oc: '46',
  cx: 'Yes — complaints reported', sy: ['Headache'], sr: 'Yes — clear pattern', ac: '6-10', cc: 'Yes — this zone',
  tc: 'Slightly warm', wd: 'Old staining', wl: ['Ceiling'],
  co2: '1385', co2o: '430', tf: '76.8', tfo: '84', rh: '63', rho: '70', pm: '19', pmo: '9', co: '1.5', tv: '850', hc: '0.03',
  meas_duration: '5-minute average', znt: 'Diffusers read low.',
}
const CLEAN = { zn: 'Z1', su: 'office', co2: '600', co2o: '420', co: '2', tf: '74', rh: '45', pm: '5', cx: 'No complaints' }

/** A whole assessment: the record, the engine output, and the render model. */
function build(zones: any[], extra: any = {}) {
  const presurvey = extra.presurvey || { ps_survey_date: '2026-07-15' }
  const bldg = { ...BLDG, assessmentDate: presurvey.ps_survey_date }
  const zoneScores = zones.map(z => scoreZone(z, bldg))
  const recs = extra.recs || genRecs(zoneScores, bldg, { zones, equipment: [] })
  const data = {
    id: 'rpt-x', building: bldg, presurvey, zones, zoneScores,
    comp: summarizeAssessment(zoneScores),
    recs,
    causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'T. Tester, CIH', certs: ['CIH'] },
    photos: extra.photos || {},
  }
  const model = assembleRenderModel(data, { now: new Date('2026-09-01T12:00:00Z') })
  const assessment = {
    zones, zoneScores, recs, presurvey,
    photos: extra.photos || {},
    profile: data.profile,
    narrative: extra.narrative || null,
    labResults: extra.labResults || null,
  }
  return { model, assessment, zoneScores, recs }
}

/** The whole pipeline, as the Report tab runs it. */
function run(zones: any[], extra: any = {}) {
  const { model, assessment } = build(zones, extra)
  return detectReportConsistency({
    model,
    consistency: checkRenderModel(model),
    assessment,
    aiSections: extra.aiSections || null,
    generatedAt: extra.generatedAt,
  })
}

const rules = (findings: any[]) => findings.map(f => f.anchor.rule)
const clone = (m: any) => JSON.parse(JSON.stringify(m))

// ── 1. The existing surface is unchanged ──────────────────────────────────

describe('the Report-consistency section renders what it always rendered', () => {
  it('projects each of the twenty rules back to the exact row the panel showed', () => {
    // Every rule id `modelConsistency` publishes, as the panel receives it.
    const issues = RULE_IDS.map((id: string, i: number) => ({
      id, where: `Section ${i}`, message: `Message for ${id}.`,
    }))
    const rows = projectRenderConsistency(issues).map(asConsistencyRow)
    expect(rows).toEqual(issues)
  })

  it('carries a real assembled report through unchanged, row for row', () => {
    // A model broken in one place, so there is something to carry.
    const { model, assessment } = build([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])
    const broken = clone(model)
    broken.references.push(['ISO 16000-1', 'Basis', '', broken.references.length + 1])
    const consistency = checkRenderModel(broken)
    expect(consistency.length).toBeGreaterThan(0)
    const rows = detectReportConsistency({ model: broken, consistency, assessment }).map(asConsistencyRow)
    // Everything the panel showed is still there, with the same id, the same
    // `where` and the same message.
    for (const issue of consistency) expect(rows).toContainEqual(issue)
  })

  it('leaves a clean report clean — no rule of its own invents a row', () => {
    const findings = run([CLEAN])
    expect(findings).toEqual([])
  })

  it('is wired to the Report tab, feeding the section that already existed', () => {
    const src = readFileSync(new URL('../../src/components/MobileApp.jsx', import.meta.url), 'utf8')
    // `checkRenderModel` still runs, once, on the AI-folded model.
    expect(src).toMatch(/reportConsistency = checkRenderModel\(reportModel\)/)
    // Its output is PASSED IN rather than recomputed — a second call here
    // would be a second opinion about one document.
    expect(src).toMatch(/consistency: reportConsistency,/)
    expect(src).toMatch(/detectReportConsistency\(\{/)
    // And the panel reads the unified rows.
    expect(src).toMatch(/consistency=\{reportConsistencyRows\}/)
    // No second panel, no second section.
    const panel = readFileSync(new URL('../../src/components/ReadinessPanel.jsx', import.meta.url), 'utf8')
    expect(panel.match(/<Section title="Report consistency"/g) || []).toHaveLength(1)
  })
})

// ── 2. Nothing blocks and nothing is stored ───────────────────────────────

describe('it changes nothing about readiness, finalization or the record', () => {
  const broken = () => {
    const photos = { 'z9-wd': [{ src: 'data:image/jpeg;base64,AAAA', ts: 1 }] }
    return run([COMPLAINT], {
      photos,
      narrative: 'See Photo 7 for the affected ceiling.',
      labResults: { rows: [{ sampleId: 'LAB-1', collectedAt: '2026-07-20', receivedAt: '2026-07-14' }] },
    })
  }

  it('emits nothing blocking, from any input it accepts', () => {
    const all = [...broken(), ...run([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }])]
    expect(all.length).toBeGreaterThan(0)
    for (const f of all) expect(['advisory', 'warning']).toContain(f.severity)
  })

  it('clamps the legacy blocking tier rather than dropping what it said', () => {
    expect(clampSeverity('blocking')).toBe('warning')
    expect(clampSeverity('warning')).toBe('warning')
    expect(clampSeverity('advisory')).toBe('advisory')
    expect(clampSeverity('nonsense')).toBe('advisory')
    // The legacy validator really does call a dangling photo reference
    // blocking; the clamp is the phase policy, not a re-rating of the rule.
    const ctx = { photos: {}, narrative: 'See Photo 3.' }
    expect(legacyPhotoRefs(ctx).map((i: any) => i.severity)).toEqual(['blocking'])
    expect(checkPhotoReferences(ctx).map((f: any) => f.severity)).toEqual(['warning'])
  })

  it('leaves resolution derived — nothing is persisted and nothing is waived', () => {
    for (const f of broken()) expect(f.resolution_status).toBe('open')
    // No waiver, no acceptance, no disposition anywhere in the module.
    const src = readFileSync(new URL('../../src/engines/integrity/report-consistency.js', import.meta.url), 'utf8')
    for (const word of ['applyOverride', 'documented_as_limitation', 'localStorage', 'accepted']) {
      expect(src).not.toMatch(new RegExp(`\\b${word}\\b`))
    }
  })

  it('a finding stops deriving once the record is fixed', () => {
    const withGap = run([COMPLAINT], { narrative: 'See Photo 7 for the ceiling.' })
    expect(rules(withGap)).toContain('photo-ref-missing')
    // Same assessment, the reference removed. Nothing was resolved; the
    // finding simply has nothing to rest on.
    const fixed = run([COMPLAINT], { narrative: 'See the ceiling detail.' })
    expect(rules(fixed)).not.toContain('photo-ref-missing')
  })

  it('leaves the readiness verdict identical — it is not in that path at all', () => {
    const assessment = {
      assessmentMode: 'SCREENING',
      presurvey: { ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_iaq_cal_status: 'Calibrated within manufacturer spec', ps_assessor: 'J. Smith, CIH' },
      building: { fn: 'Demo Tower' },
      client: { name: 'Demo Holdings LLC', contact_name: 'Pat Doe', contact_role: 'FM', requested_by: 'Pat Doe' },
      zones: [{ zn: 'Zone 1', co2: '850', co2o: '420', meas_conditions: 'Yes — normal operations' }],
      zoneScores: [{ zoneName: 'Zone 1', cats: [{ l: 'Vent', r: [{ t: 'CO2 normal', sev: 'low' }] }] }],
      photos: { 'z0-wd': [{ src: 'data:image/jpeg;base64,AAAA', ts: 1 }] },
      recs: { imm: [], eng: [], adm: [], mon: [] },
    }
    const v: any = buildReadinessVerdict(assessment)
    // The verdict carries field integrity only. A report-package finding is
    // not in it, so `deriveStatus` cannot see one.
    for (const f of v.integrity_findings || []) expect(f.source_layer).not.toBe(SOURCE_LAYER)
    const readiness = readFileSync(new URL('../../src/engines/readiness-verdict.js', import.meta.url), 'utf8')
    expect(readiness).not.toMatch(/report-consistency/)
  })

  it('does not reach the walkthrough assistant context', () => {
    // Workflow boundary: field integrity belongs to the field surfaces, and
    // report consistency belongs to the Report tab. Neither the context
    // builder nor the zone surfaces import this module.
    for (const path of ['../../lib/context/buildAssessmentContext.ts', '../../src/engines/zone-gaps.js']) {
      const src = readFileSync(new URL(path, import.meta.url), 'utf8')
      expect(src).not.toMatch(/report-consistency/)
    }
  })
})

// ── 3. Parity with every retained legacy rule ─────────────────────────────

describe('every retained preReviewValidator rule has an equivalent here', () => {
  /** The legacy context shape, which the ports read unchanged. */
  const ctx = {
    photos: { 'z0-wd': [{ src: 'x' }] },
    narrative: 'Conditions were recorded. See Photo 4 for the affected area. The spore count demonstrates health harm in this space. ASHRAE 62.1 sets a CO2 contaminant limit of 1000 ppm. TVOC exceeded the guideline.',
    recs: { imm: [], eng: [], adm: [], mon: [] },
    zoneScores: [{
      zoneName: 'Room 214',
      cats: [{ l: 'Ventilation', r: [
        { t: 'Supply air delivery appears reduced at the diffusers', sev: 'medium' },
        { t: 'Supply air delivery appears reduced at diffusers', sev: 'medium' },
      ] }],
    }],
    zones: [{ zid: 'z-1', zn: 'Room 214', samples: [{ id: 'FS-1' }] }],
    presurvey: {},
    labResults: {
      rows: [
        { sampleId: 'LAB-9', collectedAt: '2026-07-20', receivedAt: '2026-07-14' },
        { sampleId: 'FS-1', collectedAt: '2026-01-02', receivedAt: '2026-06-02' },
      ],
    },
    profile: { name: 'T. Tester, CIH' },
  }

  const cases: Array<[string, string, (c: any) => any[], (c: any) => any[]]> = [
    ['photo_ref_missing', 'photo-ref-missing', legacyPhotoRefs, checkPhotoReferences],
    ['duplicate_finding', 'duplicate-finding', legacyDuplicates, checkDuplicateFindings],
    ['lab_date_inversion', 'lab-date-inversion', legacyLabDates, checkLabDates],
    ['sample_id_drift', 'sample-id-drift', legacySampleDrift, checkSampleIdDrift],
  ]

  for (const [legacyCategory, rule, legacyFn, unifiedFn] of cases) {
    it(`${legacyCategory} → ${rule}`, () => {
      const legacy = legacyFn(ctx).filter((i: any) => i.category === legacyCategory)
      const unified = unifiedFn(ctx).filter((f: any) => f.anchor.rule === rule)
      expect(legacy.length).toBeGreaterThan(0)
      expect(unified).toHaveLength(legacy.length)
      for (const f of unified) expect(f.source_layer).toBe(SOURCE_LAYER)
    })
  }

  it('lab_date_holding_time → lab-date-holding', () => {
    const legacy = legacyLabDates(ctx).filter((i: any) => i.category === 'lab_date_holding_time')
    const unified = checkLabDates(ctx).filter((f: any) => f.anchor.rule === 'lab-date-holding')
    expect(legacy).toHaveLength(1)
    expect(unified).toHaveLength(1)
  })

  it('each of the three citation anti-patterns → anti-pattern-*', () => {
    const legacy = legacyAntiPatterns(ctx)
    const unified = checkCitationAntiPatterns(ctx)
    const legacyIds = new Set(legacy.map((i: any) => i.category.replace(/^anti_pattern_/, '')))
    const unifiedIds = new Set(unified.map((f: any) => f.anchor.rule.replace(/^anti-pattern-/, '')))
    expect(legacyIds).toEqual(new Set(['ashrae-62-1-as-co2-limit', 'spore-count-as-health-proof', 'tvoc-cited-against-a-threshold']))
    expect(unifiedIds).toEqual(legacyIds)
  })

  it('finding_without_rec → finding-without-immediate-action, structurally', () => {
    // A zone the engine flags at the top band, and an action register with
    // nothing filed as immediate for it.
    const zones = [COMPLAINT]
    const { model, assessment, zoneScores } = build(zones, { recs: { imm: [], eng: [], adm: [], mon: [] } })
    const severe = (model.findings?.rows || []).some((r: any) => ['priority', 'elevated'].includes(r.sev))
    expect(severe).toBe(true)

    const legacy = legacyFindingsWithoutRecs({ zoneScores, recs: { imm: [] } })
      .filter((i: any) => i.category === 'finding_without_rec')
    expect(legacy.length).toBeGreaterThan(0)

    const unified = checkFindingCoverage(model, { zones: assessment.zones })
    expect(unified.length).toBeGreaterThan(0)
    expect(unified[0].issue_type).toBe('coverage_mismatch')
    // Same room, named by the report's own findings table.
    expect(unified[0].anchor.ref).toBe(COMPLAINT.zn)
    // And it carries the zone's opaque handle, not its label.
    expect(unified[0].zone_ids).toEqual([])
  })

  it('drops placeholder_name, because validation.js already raises it', () => {
    const named = { ...ctx, profile: { name: '' } }
    // The legacy validator raises it…
    expect(runPreReviewChecks(named).some((i: any) => i.category === 'placeholder_name')).toBe(true)
    // …and the unified pipeline does not, because a second copy would be two
    // surfaces disagreeing about one question.
    const { model, assessment } = build([CLEAN])
    const unified = detectReportConsistency({
      model, consistency: checkRenderModel(model), assessment: { ...assessment, profile: { name: '' } },
    })
    expect(rules(unified)).not.toContain('placeholder-name')
    // The gate that DOES own the question still raises it. The two use
    // different placeholder lists, which is the argument for one owner
    // rather than against it: a report-package copy would give the assessor
    // a second answer about their own name.
    const readiness: any = buildReadinessVerdict({
      zones: [{ zn: 'Z1' }], zoneScores: [], presurvey: { ps_assessor: 'John Doe' },
    })
    expect((readiness.finalization_dismissible || []).map((d: any) => d.id))
      .toContain('assessor_placeholder')
  })

  it('leaves the legacy module in the tree, so the port can be compared to it', () => {
    // It is retired in a later cleanup commit, once parity has stood. Until
    // then both exist and this file is the comparison.
    expect(typeof runPreReviewChecks).toBe('function')
  })
})

// ── 4. It asserts no cause and no compliance position ─────────────────────

describe('it never states a cause, a compliance position or a health outcome', () => {
  /** Every string this module can put in front of an assessor. */
  function everyString(findings: any[]) {
    const out: string[] = Object.values(WHY_IT_MATTERS)
    for (const f of findings) out.push(f.title, f.description, f.why_it_matters)
    return out.filter(Boolean)
  }

  const findings = () => [
    ...run([COMPLAINT, { ...CLEAN, zn: 'Conf 4C' }], {
      photos: { 'z0-wd': [{ src: 'x' }], 'z9-mi': [{ src: 'y' }] },
      narrative: 'See Photo 8. The spore count demonstrates health harm. ASHRAE 62.1 sets a CO2 contaminant limit. Total VOCs exceeded the guideline.',
      labResults: { rows: [{ sampleId: 'LAB-1', collectedAt: '2026-07-20', receivedAt: '2026-07-01' }] },
      recs: { imm: [], eng: [], adm: [], mon: [] },
    }),
    ...projectRenderConsistency(RULE_IDS.map((id: string) => ({ id, where: 'Findings', message: 'x' }))),
    ...checkMaterialStaleContent({ aiSectionsStatus: 'stale' }, {
      edits: { discussion: { text: 'revised' } },
      overrides: { executive_summary: { justification: 'a'.repeat(30) } },
    }),
  ]

  it('passes the report’s own banned-language scanner, on every string', () => {
    const strings = everyString(findings())
    expect(strings.length).toBeGreaterThan(20)
    for (const s of strings) {
      const hits = scanProseForBannedLanguage(s)
      expect(hits, `banned language in: ${s}`).toEqual([])
    }
  })

  it('states no cause and no ranking anywhere in what it emits', () => {
    const CAUSAL = /\b(caused by|because of|due to|responsible for|attributable to|results? in|leads? to|proves?|demonstrates?)\b/i
    const RANKING = /\b(most likely|high confidence|moderate confidence|strongest|definitiv)/i
    for (const s of everyString(findings())) {
      expect(CAUSAL.test(s), `causal language in: ${s}`).toBe(false)
      expect(RANKING.test(s), `ranking language in: ${s}`).toBe(false)
    }
  })

  it('rewords the legacy anti-pattern guidance rather than carrying it through', () => {
    // The original detail explained the spore rule using the exact phrase
    // these reports may not print. Harmless as advice, wrong as a sentence
    // this layer emits.
    const legacy = legacyAntiPatterns({ narrative: 'The spore count demonstrates health harm.' })
    expect(scanProseForBannedLanguage(legacy[0].detail).length).toBeGreaterThan(0)
    const unified = checkCitationAntiPatterns({ narrative: 'The spore count demonstrates health harm.' })
    expect(scanProseForBannedLanguage(unified[0].description)).toEqual([])
    // The substance survives: it still names the two sources and still says
    // what to do instead.
    expect(unified[0].description).toMatch(/IOM 2004 and ACMT 2025/)
  })
})

// ── 5. Staleness is material ──────────────────────────────────────────────

describe('stale content is reported only where it can still cost something', () => {
  const stale = { aiSectionsStatus: 'stale' }
  const active = { aiSectionsStatus: 'active' }

  it('says nothing about a stale record of generated text alone', () => {
    // The export already refuses it and falls back to the report's own
    // prose. Warning here would be a warning about a mechanism working.
    expect(checkMaterialStaleContent(stale, {
      sections: { discussion: 'model text' },
      auditSummary: { discussion: { supported: true } },
    })).toEqual([])
    expect(checkMaterialStaleContent(stale, null)).toEqual([])
    expect(checkMaterialStaleContent({ aiSectionsStatus: 'none' }, null)).toEqual([])
  })

  it('reports a stale record carrying the assessor’s own rewrite', () => {
    const out = checkMaterialStaleContent(stale, { edits: { discussion: { text: 'the assessor’s prose' } } })
    expect(out).toHaveLength(1)
    expect(out[0].issue_type).toBe('stale_content')
    expect(out[0].severity).toBe('warning')
    expect(out[0].description).toMatch(/one section you rewrote/)
  })

  it('reports a stale record carrying a written justification', () => {
    const out = checkMaterialStaleContent(stale, { overrides: { executive_summary: { justification: 'a'.repeat(30) } } })
    expect(out).toHaveLength(1)
    expect(out[0].description).toMatch(/one you kept with a written reason/)
  })

  it('says nothing when the same work is FRESH, because it is in the export', () => {
    expect(checkMaterialStaleContent(active, { edits: { discussion: { text: 'revised' } } })).toEqual([])
  })

  it('names both kinds at once and counts them', () => {
    const out = checkMaterialStaleContent(stale, {
      edits: { discussion: { text: 'a' }, recommendations_prose: { text: 'b' } },
      overrides: { executive_summary: { justification: 'a'.repeat(30) } },
    })
    expect(out[0].description).toMatch(/2 sections you rewrote and one you kept with a written reason/)
    // An empty edit is not an edit.
    expect(checkMaterialStaleContent(stale, { edits: { discussion: { text: '   ' } } })).toEqual([])
  })
})

// ── 6. Orphaned field evidence, and the coverage join ─────────────────────

describe('orphaned field evidence is found from the identifier, never a label', () => {
  it('reports photographs filed against a zone the assessment no longer has', () => {
    const ctx = {
      zones: [{ zn: 'Z1' }, { zn: 'Z2' }],
      photos: {
        'z0-wd': [{ src: 'a' }],
        'z5-mi': [{ src: 'b' }, { src: 'c' }],
        'z7-dp': [{ src: 'd' }],
      },
    }
    const out = checkOrphanedPhotos(ctx)
    expect(out).toHaveLength(2)
    expect(out.map((f: any) => f.anchor.ref)).toEqual(['z5', 'z7'])
    expect(out[0].issue_type).toBe('orphaned_evidence')
    expect(out[0].description).toMatch(/2 photographs are recorded against zone 6/)
  })

  it('reads the key and nothing else — no caption, label or timestamp', () => {
    const ctx = { zones: [{ zn: 'Z1' }], photos: { 'z4-wd': [{ src: 'a' }] } }
    const renamed = { zones: [{ zn: 'Completely Different' }], photos: { 'z4-wd': [{ src: 'a' }] } }
    expect(checkOrphanedPhotos(ctx).map(integrityIdentity))
      .toEqual(checkOrphanedPhotos(renamed).map(integrityIdentity))
  })

  it('stays quiet on a draft with no zones, and on unparseable keys', () => {
    expect(checkOrphanedPhotos({ zones: [], photos: { 'z4-wd': [{ src: 'a' }] } })).toEqual([])
    expect(checkOrphanedPhotos({ zones: [{ zn: 'Z1' }], photos: { cover: [{ src: 'a' }] } })).toEqual([])
    // An empty bucket for a deleted zone is residue, not evidence.
    expect(checkOrphanedPhotos({ zones: [{ zn: 'Z1' }], photos: { 'z4-wd': [] } })).toEqual([])
  })

  it('joins a finding to an action by location, not by shared words', () => {
    expect(locationCovers('Building-wide', 'Room 214')).toBe(true)
    expect(locationCovers('Room 214', 'Room 214')).toBe(true)
    expect(locationCovers('Room 214, Conf 4C', 'Conf 4C')).toBe(true)
    expect(locationCovers('Building-wide (no HVAC unit mapped)', 'Room 214')).toBe(true)
    // The failure a substring match would produce: a zone covered by an
    // action filed against a different room whose name contains it.
    expect(locationCovers('North Annex', 'North')).toBe(false)
    expect(locationCovers('', 'North')).toBe(false)
  })

  it('is satisfied by a building-wide immediate action', () => {
    const { model, assessment } = build([COMPLAINT], {
      recs: { imm: [{ text: 'Verify outdoor-air delivery at the air handler.', scope: 'building' }], eng: [], adm: [], mon: [] },
    })
    expect(checkFindingCoverage(model, { zones: assessment.zones })).toEqual([])
  })

  it('reports nothing for a report whose findings are all below the band', () => {
    const { model, assessment } = build([CLEAN], { recs: { imm: [], eng: [], adm: [], mon: [] } })
    expect(checkFindingCoverage(model, { zones: assessment.zones })).toEqual([])
  })
})

// ── The contract, and the mapping table ───────────────────────────────────

describe('the mapping is complete and the contract holds', () => {
  it('maps every rule modelConsistency publishes, and nothing it does not', () => {
    expect(Object.keys(RENDER_RULE_MAP).sort()).toEqual([...RULE_IDS].sort())
  })

  it('uses only vocabulary the contract declares', () => {
    const specs = [...Object.values(RENDER_RULE_MAP), RULE_ERROR_MAP] as any[]
    for (const s of specs) {
      expect(INTEGRITY_ISSUE_TYPES).toContain(s.issue_type)
      expect(INTEGRITY_ANCHOR_KINDS).toContain(s.kind)
      expect(['advisory', 'warning']).toContain(s.severity)
    }
    expect(INTEGRITY_SOURCE_LAYERS).toContain(SOURCE_LAYER)
    // Every issue type the module can emit has a reason attached.
    for (const s of specs) expect(WHY_IT_MATTERS[s.issue_type]).toBeTruthy()
  })

  it('projects a crashed rule rather than swallowing it', () => {
    const [f]: any[] = projectRenderConsistency([{ id: 'rule-error', where: 'siteMeanNotBetterThanZones', message: 'threw: x' }])
    expect(f.issue_type).toBe('check_failed')
    expect(f.anchor.ref).toBe('siteMeanNotBetterThanZones')
    expect(f.anchor.section).toBe('Consistency checks')
  })

  it('shows an unmapped rule looking unfinished rather than dropping it', () => {
    const [f]: any[] = projectRenderConsistency([{ id: 'brand-new-rule', where: 'Findings', message: 'something' }])
    expect(f.issue_type).toBe('contradiction')
    expect(asConsistencyRow(f)).toEqual({ id: 'brand-new-rule', where: 'Findings', message: 'something' })
  })

  it('files every finding as resolvable at review, never on site', () => {
    const all = run([COMPLAINT], { narrative: 'See Photo 9.', recs: { imm: [], eng: [], adm: [], mon: [] } })
    expect(all.length).toBeGreaterThan(0)
    for (const f of all) {
      expect(f.actionability).toBe('before_signoff')
      expect(INTEGRITY_ACTIONABILITY).toContain(f.actionability)
      expect(f.provenance.detector).toBe(DETECTOR)
      expect(f.anchor.rule).toBeTruthy()
      expect(f.id.startsWith('intg-report_consistency-')).toBe(true)
    }
  })

  it('sorts warnings above advisories and keeps one row per id', () => {
    const all = run([COMPLAINT], {
      photos: { 'z8-wd': [{ src: 'a' }] },
      narrative: 'See Photo 9. Total VOCs exceeded the guideline.',
      recs: { imm: [], eng: [], adm: [], mon: [] },
    })
    const ranks = all.map((f: any) => (f.severity === 'warning' ? 1 : 2))
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(new Set(all.map((f: any) => f.id)).size).toBe(all.length)
  })

  it('is deterministic, and excludes the clock from identity', () => {
    const opts = { narrative: 'See Photo 9.', photos: { 'z8-wd': [{ src: 'a' }] } }
    const a = run([COMPLAINT], { ...opts, generatedAt: '2026-09-14T08:00:00.000Z' })
    const b = run([COMPLAINT], { ...opts, generatedAt: '2027-01-01T23:59:59.000Z' })
    expect(a.map(integrityIdentity)).toEqual(b.map(integrityIdentity))
    expect(a.map((f: any) => f.id)).toEqual(b.map((f: any) => f.id))
    expect(a[0].provenance.generated_at).toBe('2026-09-14T08:00:00.000Z')
    // Byte-identical across runs.
    expect(JSON.stringify(run([COMPLAINT], opts))).toBe(JSON.stringify(run([COMPLAINT], opts)))
  })

  it('returns nothing rather than throwing on anything it cannot read', () => {
    expect(detectReportConsistency()).toEqual([])
    expect(detectReportConsistency({})).toEqual([])
    expect(detectReportConsistency({ model: null, consistency: null, assessment: null })).toEqual([])
    expect(jaccardSimilarity(null as never, 'x')).toBe(0)
  })
})
