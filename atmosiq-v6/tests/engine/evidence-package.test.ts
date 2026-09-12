// @vitest-environment node
/**
 * The closed evidence package, and the deterministic audit over it.
 *
 * Two properties matter more than the individual rules.
 *
 * The package is a PROJECTION of the render model, so it can never disagree
 * with the report: every measurement in it is a number the results table
 * prints, every finding is the engine's sentence verbatim, every reference is
 * one the report cites. The first describe block pins that.
 *
 * The audit has to catch an altered figure and an unsupported criterion
 * WITHOUT flagging the prose the prompt asks for — counts, ratios, spelled-out
 * comparisons, the required disclaimers. A rule that cries wolf is turned off,
 * and then nothing is checked at all. So every rule has a negative case AND the
 * whole suite is run over a narrative written the way the prompt asks, which
 * must come back clean.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
// @ts-ignore js
import { REASONING_SYSTEM_PROMPT as PROMPT } from '../../src/engines/narrative.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter, PACKAGE_VERSION, WRITABLE_SECTIONS, IMMUTABLE_SECTIONS, MAY_ASSERT_LEGEND, WIRE_BUDGET_CHARS } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { auditNarrative, summarizeAudit, AUDIT_RULE_IDS } from '../../src/report/narrativeAudit.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

function build(extra: Record<string, unknown> = {}) {
  const zoneScores = ZONES.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const causalChains = buildCausalChains(ZONES, BLDG, zoneScores)
  const data = {
    building: BLDG, presurvey: PRESURVEY, zones: ZONES, zoneScores, causalChains,
    recs: {
      imm: [{ text: 'Verify supply airflow to the flagged zone.', scope: 'zone', zoneName: 'Zone 1', controlTier: 'engineering_control' }],
      eng: [], adm: [], mon: [],
    },
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10', ...extra,
  }
  const model = assembleRenderModel(data, { now: new Date('2026-06-11T12:00:00Z') })
  const pkg = buildEvidencePackage(model, { zoneScores, causalChains })
  return { data, model, pkg, zoneScores, causalChains }
}

describe('buildEvidencePackage — a projection of the report, not a second opinion', () => {
  it('carries the package version and every documented top-level key', () => {
    const { pkg } = build()
    expect(pkg.version).toBe(PACKAGE_VERSION)
    expect(Object.keys(pkg).sort()).toEqual([
      'facts', 'findings', 'immutable_values', 'measurements', 'observations',
      'prohibited_claims', 'recommendation_options', 'references', 'report_id',
      'report_limitations', 'required_limitations', 'allowed_interpretations',
      'context_standards', 'sections', 'version',
    ].sort())
  })

  describe('context_standards — what the report names for scale, not what it applied', () => {
    // The report's own deterministic prose names standards on every report:
    // REFERENCE_FRAMEWORK lists ASHRAE 62.1, ASHRAE 55, the EPA NAAQS and the
    // OSHA PELs, and the PM2.5 background quotes the NAAQS figure "for scale
    // only". `references` carries only the criteria that FIRED, so the audit
    // read a writer naming one of those as a fabricated citation and discarded
    // the section — for doing exactly what the prose beside it does.
    it('names standards the report states but no finding was evaluated against', () => {
      const { pkg } = build()
      expect(pkg.context_standards.length).toBeGreaterThan(0)
      expect(pkg.context_standards).toContain('naaqs')
    })

    it('never duplicates a standard that IS an applied criterion', () => {
      const { pkg } = build()
      const cited = (pkg.references || []).map((r: any) => String(r.name).toLowerCase())
      for (const token of pkg.context_standards) {
        expect(cited.some((n: string) => n.includes(token)), token).toBe(false)
      }
    })

    it('is derived from the report text, so it empties when the report names nothing', () => {
      const { pkg } = build()
      const bare = buildEvidencePackage({ ...pkg, methodology: {}, results: { parameters: [] }, references: [] } as any, {})
      expect(bare.context_standards).toEqual([])
    })
  })

  it('every measurement value is a number the results table prints', () => {
    const { model, pkg } = build()
    const printed = new Set<number>()
    for (const row of model.results.rows) {
      for (const k of ['co2', 'co', 't', 'rh', 'pm', 'tvoc']) {
        if (typeof row[k] === 'number') printed.add(row[k])
      }
    }
    expect(pkg.measurements.length).toBeGreaterThan(0)
    for (const m of pkg.measurements) expect(printed.has(m.value)).toBe(true)
  })

  it('every finding is the engine sentence verbatim and joins back to an engine finding', () => {
    const { model, pkg } = build()
    expect(pkg.findings.length).toBe(model.findings.rows.length)
    for (const f of pkg.findings) {
      expect(model.findings.rows.some((r: any) => r.f === f.text && r.z === f.zone)).toBe(true)
      // A row that cannot be joined means a layer reworded a finding on its
      // way to the page — the defect class `editorial-engine-parity` covers.
      expect(f.unjoined).toBe(false)
    }
  })

  it('carries only the references the report cites — not the whole manifest', () => {
    const { model, pkg } = build()
    expect(pkg.references.map((r: any) => r.name)).toEqual(model.references.map((r: any[]) => r[0]))
    // The open manifest has many more entries than any one report applies.
    expect(pkg.references.length).toBeLessThan(12)
  })

  it('recommendation options are the action register, and nothing else is eligible', () => {
    const { model, pkg } = build()
    expect(pkg.recommendation_options.map((r: any) => r.action))
      .toEqual(model.recommendations.register.map((r: any) => r.action))
  })

  it('names the sections a writer may author and those it may not', () => {
    const { pkg } = build()
    expect(pkg.sections.writable).toEqual([...WRITABLE_SECTIONS])
    expect(pkg.sections.immutable).toEqual([...IMMUTABLE_SECTIONS])
    expect(pkg.sections.writable).toContain('executive_summary')
    expect(pkg.sections.immutable).toContain('measurement_results')
    expect(pkg.sections.immutable).toContain('qa_qc')
  })

  it('derives the permitted interpretation from the engine determinative flag, never by hand', () => {
    const { pkg } = build()
    const withCriterion = pkg.findings.filter((f: any) => f.criterion_id)
    expect(withCriterion.length).toBeGreaterThan(0)
    for (const f of withCriterion) {
      const allow = pkg.allowed_interpretations.find((a: any) => a.subject === f.id)
      expect(allow, `no permitted interpretation for ${f.id}`).toBeTruthy()
      if (f.determinative === false) {
        expect(allow.statement).toMatch(/indication only|cannot settle/)
        expect(pkg.prohibited_claims.some((p: any) => p.subject === f.id && p.claim === 'compliance_determination')).toBe(true)
      }
    }
  })

  it('prohibits comparing TVOC to anything, on every assessment that measured it', () => {
    const { pkg } = build()
    expect(pkg.measurements.some((m: any) => m.parameter === 'tvoc')).toBe(true)
    const ban = pkg.prohibited_claims.find((p: any) => p.id === 'prohibit-param-tvoc')
    expect(ban).toBeTruthy()
    expect(ban.claim).toBe('criterion_comparison')
  })

  it('requires the statutory limitation and the assessment-date limitation on every report', () => {
    const { pkg } = build()
    const ids = pkg.required_limitations.map((l: any) => l.id)
    expect(ids).toContain('lim-not-a-determination')
    expect(ids).toContain('lim-assessment-date')
    for (const l of pkg.required_limitations) expect(l.must_mention.length).toBeGreaterThan(0)
  })

  it('a parameter no criterion judged is reportable but not comparable', () => {
    const { pkg } = build()
    const bans = pkg.prohibited_claims.filter((p: any) => p.claim === 'criterion_comparison')
    for (const b of bans) {
      expect(pkg.allowed_interpretations.some((a: any) => a.subject === b.parameter)).toBe(true)
    }
  })

  it('packageForWriter withholds the audit index and the layering diagnostic', () => {
    const { pkg } = build()
    const forWriter = packageForWriter(pkg)
    expect(forWriter.immutable_values).toBeUndefined()
    expect(forWriter.findings.every((f: any) => !('unjoined' in f))).toBe(true)
    // Same readings, same values; the criterion object is sent once under
    // `criteria` and the label and unit once under `parameters`.
    expect(forWriter.measurements.map((m: any) => [m.zone, m.parameter, m.value]))
      .toEqual(pkg.measurements.map((m: any) => [m.zone, m.parameter, m.value]))
    for (const m of pkg.measurements) {
      if (m.criterion) expect(forWriter.criteria[m.criterion.id].standard).toBe(m.criterion.standard)
      expect(forWriter.parameters[m.parameter]).toEqual({ label: m.label, unit: m.unit })
    }
  })

  it('the wire form carries each pathway once with its confidence and hypothesis flag', () => {
    const { pkg, causalChains } = build()
    const wire = packageForWriter(pkg)
    expect(wire.pathways.length).toBe(causalChains.filter((c: any) => c && c.type).length)
    for (const p of wire.pathways) {
      expect(['Possible', 'Moderate', 'Strong']).toContain(p.confidence)
      expect(typeof p.hypothesis).toBe('boolean')
      expect(p.type).not.toMatch(/\(Hypothesis\)/)
    }
    expect(wire.pathways.some((p: any) => p.hypothesis)).toBe(causalChains.some((c: any) => /\(Hypothesis\)/.test(c.type)))
    expect(wire.pathway_rule).toMatch(/never as the cause/)
    expect(wire.allowed_interpretations.every((a: any) => a.subject_kind === 'parameter')).toBe(true)
    expect(wire.prohibited_claims.every((p: any) => p.subject_kind === 'parameter')).toBe(true)
  })

  it('the wire form drops the evidentiary caveat the token now encodes, and the audit copy keeps it', () => {
    const { pkg } = build()
    const wire = packageForWriter(pkg)
    const caveat = /A short-duration reading (is indicative but not determinative|cannot establish compliance)/
    expect(pkg.findings.some((f: any) => caveat.test(f.text))).toBe(true)
    expect(wire.findings.some((f: any) => caveat.test(f.text))).toBe(false)
    expect(wire.findings.length).toBe(pkg.findings.length)
  })

  it('every finding carries its permitted interpretation as one token, tracking the determinative flag', () => {
    const { pkg } = build()
    for (const f of pkg.findings) {
      expect(['exceedance', 'indication', 'observation']).toContain(f.may_assert)
      if (!f.criterion_id) expect(f.may_assert).toBe('observation')
      else expect(f.may_assert).toBe(f.determinative === true ? 'exceedance' : 'indication')
    }
    expect(Object.keys(MAY_ASSERT_LEGEND).sort()).toEqual(['exceedance', 'indication', 'observation'])
  })

  it('the wire form folds per-finding permission into the token and sends the legend once', () => {
    const { pkg } = build()
    const wire = packageForWriter(pkg)
    expect(wire.may_assert_legend).toEqual({ ...MAY_ASSERT_LEGEND })
    // Sentences per finding are gone from the wire; the audit's copy keeps them.
    expect(wire.allowed_interpretations.some((a: any) => a.subject_kind === 'finding')).toBe(false)
    expect(wire.prohibited_claims.some((p: any) => p.subject_kind === 'finding')).toBe(false)
    expect(pkg.allowed_interpretations.some((a: any) => a.subject_kind === 'finding')).toBe(true)
    // Parameter and pathway rules are not derivable from a finding and stay.
    expect(wire.prohibited_claims.some((p: any) => p.subject_kind === 'parameter')).toBe(true)
    expect(wire.context_omitted).toEqual([])
  })

  it('the wire form stays under the endpoint cap on a dense eight-zone assessment', () => {
    const zones = Array.from({ length: 8 }, (_, i) => ({ ...(ZONES as any)[i % ZONES.length], zn: `Zone ${i + 1}` }))
    const zoneScores = zones.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
    const causalChains = buildCausalChains(zones, BLDG, zoneScores)
    const model = assembleRenderModel({
      building: BLDG, presurvey: PRESURVEY, zones, zoneScores, causalChains,
      recs: { imm: [{ text: 'Verify supply airflow to the flagged zone.', scope: 'zone', zoneName: 'Zone 1', controlTier: 'engineering_control' }], eng: [], adm: [], mon: [] },
      id: 'AIQ-8', ts: '2026-06-10',
    }, { now: new Date('2026-06-11T12:00:00Z') })
    const pkg = buildEvidencePackage(model, { zoneScores, causalChains })
    const wire = packageForWriter(pkg)
    const bytes = JSON.stringify({ payload: { evidence: wire } }).length
    expect(bytes, `eight zones came to ${bytes} chars`).toBeLessThanOrEqual(WIRE_BUDGET_CHARS)
    // Evidence for a claim is never shed, whatever was dropped.
    expect(wire.findings.length).toBe(pkg.findings.length)
    expect(wire.measurements.length).toBe(pkg.measurements.length)
    expect(wire.recommendation_options.length).toBe(pkg.recommendation_options.length)
  })

  it('sheds context in a fixed order when over budget, and says so', () => {
    const { pkg } = build()
    const tight = packageForWriter(pkg, { budgetChars: 1 })
    expect(tight.context_omitted).toEqual(['assessor notes', 'report scope limitations', 'walkthrough observations'])
    expect(tight.observations).toEqual([])
    expect(tight.report_limitations).toEqual([])
    expect(tight.findings.length).toBe(pkg.findings.length)
    expect(tight.references.length).toBe(pkg.references.length)
  })

  it('the wire budget matches the cap the endpoint enforces', () => {
    const api = readFileSync(new URL('../../api/narrative.js', import.meta.url), 'utf8')
    const m = api.match(/MAX_PAYLOAD_CHARS\s*=\s*([\d_]+)/)
    expect(m, 'api/narrative.js no longer declares MAX_PAYLOAD_CHARS').toBeTruthy()
    expect(Number(m![1].replace(/_/g, ''))).toBe(WIRE_BUDGET_CHARS)
  })

  it('produces a package from an empty model without throwing', () => {
    const pkg = buildEvidencePackage({}, {})
    expect(pkg.measurements).toEqual([])
    expect(pkg.findings).toEqual([])
    expect(pkg.required_limitations.length).toBeGreaterThan(0)
  })
})

// ── The audit ──────────────────────────────────────────────────────────

/**
 * A narrative written the way the prompt asks: plain-language finding first,
 * numbers after, a named criterion only where one applied, the required
 * disclaimers, and a ratio stated in words. This must audit clean, or the
 * rules are too aggressive to leave switched on.
 */
function cleanNarrative(pkg: any) {
  const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
  const lines = [
    '**Overall Finding**',
    '',
    `Carbon dioxide, a gauge of how much fresh air is reaching a room, was the condition that stood out. In ${co2.zone} it measured ${co2.value} ppm.`,
    'Carbon dioxide is an indicator of outdoor-air delivery. No ventilation rate was measured directly.',
    'The source of these conditions was not identified during the assessment.',
    'Readings were taken during the assessment and reflect conditions on the assessment date only.',
    'Short-duration readings are indicative and do not represent time-weighted exposures.',
    'Total VOCs were recorded for context. No applicable threshold exists for TVOC, so the reading is reported and not judged.',
    'The remaining parameters did not identify an additional notable condition during the assessment.',
    '',
    '**Recommended Next Steps**',
    '',
    '- Verify supply airflow to the flagged zone and record what the check finds.',
    '',
    'This is not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.',
    'AI-assisted narrative — verify before issue; not a regulatory, compliance, or medical determination.',
  ]
  return lines.join('\n')
}

describe('auditNarrative — supported prose passes, altered prose does not', () => {
  it('passes a narrative written the way the prompt asks', () => {
    const { pkg } = build()
    const issues = auditNarrative(cleanNarrative(pkg), pkg)
    expect(issues, `unexpected findings:\n${issues.map((i: any) => `${i.id}: ${i.message}`).join('\n')}`).toEqual([])
    expect(summarizeAudit(issues).supported).toBe(true)
  })

  it('does not flag counts, ratios or spelled-out comparisons', () => {
    const { pkg } = build()
    const text = `${cleanNarrative(pkg)}\nThree areas were assessed. Indoor levels were roughly twenty times the outdoor reading, a ratio of 19.6.`
    expect(auditNarrative(text, pkg).map((i: any) => i.id)).toEqual([])
  })

  it('figure-unsupported — catches an altered measurement', () => {
    const { pkg } = build()
    const co2 = pkg.measurements.find((m: any) => m.parameter === 'co2' && m.kind === 'zone')
    const text = cleanNarrative(pkg).replace(`${co2.value} ppm`, `${co2.value + 300} ppm`)
    const issues = auditNarrative(text, pkg)
    expect(issues.some((i: any) => i.id === 'figure-unsupported')).toBe(true)
    expect(summarizeAudit(issues).supported).toBe(false)
  })

  it('figure-unsupported — allows a rounded figure and the spelled-out unit', () => {
    const pkg = {
      immutable_values: [{ value: 45.3, unit: 'µg/m³', source: 'm1' }],
      required_limitations: [], prohibited_claims: [], references: [], findings: [], recommendation_options: [],
    }
    expect(auditNarrative('Levels reached 45 µg/m³ indoors.', pkg)).toEqual([])
    expect(auditNarrative('Levels reached 45 micrograms per cubic meter indoors.', pkg)).toEqual([])
    expect(auditNarrative('Levels reached 52 µg/m³ indoors.', pkg).map((i: any) => i.id)).toEqual(['figure-unsupported'])
  })

  it('criterion-unattested — catches a standard used as a criterion that the report never applied', () => {
    const { pkg } = build()
    const text = `${cleanNarrative(pkg)}\nThe reading exceeds the ACGIH threshold of 500 ppm for this contaminant.`
    const ids = auditNarrative(text, pkg).map((i: any) => i.id)
    expect(ids).toContain('criterion-unattested')
  })

  it('criterion-unattested — leaves a standard named inside a disclaimer alone', () => {
    const { pkg } = build()
    // The mandated limitation names OSHA and is not a citation.
    expect(auditNarrative(cleanNarrative(pkg), pkg).some((i: any) => i.id === 'criterion-unattested')).toBe(false)
  })

  it('criterion-unattested — allows a standard the report itself names for scale', () => {
    // The deterministic PM2.5 background quotes this exact figure "for scale
    // only … cited here for context rather than as a pass/fail threshold", and
    // REFERENCE_FRAMEWORK names the NAAQS on every report. Blocking the writer
    // for saying what the paragraph beside it says is the writer and the
    // document disagreeing, not the writer over-reaching.
    const pkg = {
      immutable_values: [], references: [], findings: [], recommendation_options: [],
      required_limitations: [], prohibited_claims: [],
      context_standards: ['naaqs', 'epa'],
    }
    const text = 'For scale, the US EPA 24-hour NAAQS is 35 µg/m³, an outdoor population-level standard rather than an office screening limit.'
    expect(auditNarrative(text, pkg).some((i: any) => i.id === 'criterion-unattested')).toBe(false)
  })

  it('criterion-unattested — still catches a standard on neither list', () => {
    // The skip is scoped to what the report states. A standard the document
    // never names is still an invented citation.
    const pkg = {
      immutable_values: [], references: [], findings: [], recommendation_options: [],
      required_limitations: [], prohibited_claims: [],
      context_standards: ['naaqs', 'epa'],
    }
    const issues = auditNarrative('The reading exceeds the ACGIH threshold of 500 ppm for this contaminant.', pkg)
    expect(issues.map((i: any) => i.id)).toContain('criterion-unattested')
    expect(issues.find((i: any) => i.id === 'criterion-unattested').where).toBe('acgih')
  })

  it('interpretation-exceeded — catches a settled comparison on a criterion the reading cannot settle', () => {
    const pkg = {
      immutable_values: [], references: [], findings: [], recommendation_options: [], required_limitations: [],
      prohibited_claims: [{ id: 'p1', claim: 'compliance_determination', parameter: 'co', why: 'The criterion is hour8 and a short-duration reading cannot settle it.' }],
    }
    const issues = auditNarrative('Carbon monoxide exceeds the applicable limit in the loading bay.', pkg)
    expect(issues.map((i: any) => i.id)).toContain('interpretation-exceeded')
  })

  it('criterion-comparison-unsupported — catches TVOC compared to anything', () => {
    const { pkg } = build()
    const text = `${cleanNarrative(pkg)}\nTVOC was within the accepted guideline for an office.`
    expect(auditNarrative(text, pkg).map((i: any) => i.id)).toContain('criterion-comparison-unsupported')
  })

  it('causation-asserted — catches cause stated for a weighed pathway', () => {
    const { pkg } = build()
    const text = `${cleanNarrative(pkg)}\nThe elevated readings are caused by the adjacent renovation work.`
    expect(auditNarrative(text, pkg).map((i: any) => i.id)).toContain('causation-asserted')
  })

  it('limitation-missing — catches a dropped disclosure', () => {
    const { pkg } = build()
    // The averaging-period caveat. Dropping the statutory floor would NOT
    // fire, because the mandated closing line still carries it — which is the
    // rule reading the prose rather than the line it was written on.
    const text = cleanNarrative(pkg).replace('Short-duration readings are indicative and do not represent time-weighted exposures.\n', '')
    const issues = auditNarrative(text, pkg)
    expect(issues.some((i: any) => i.id === 'limitation-missing' && i.where === 'lim-averaging-period')).toBe(true)
  })

  it('limitation-missing — a disclosure the closing line already carries is not demanded twice', () => {
    const { pkg } = build()
    const text = cleanNarrative(pkg).replace('This is not a regulatory exposure determination, OSHA compliance certification, or medical evaluation.\n', '')
    expect(auditNarrative(text, pkg).some((i: any) => i.where === 'lim-not-a-determination')).toBe(false)
  })

  it('limitation-missing — stays quiet about a subject the narrative never raises', () => {
    const { pkg } = build()
    expect(pkg.required_limitations.some((l: any) => l.id === 'lim-tvoc')).toBe(true)
    // No TVOC sentence at all → no TVOC caveat owed.
    const text = 'Carbon dioxide was elevated during the assessment. Short-duration readings are indicative. Not a regulatory determination.'
    expect(auditNarrative(text, pkg).some((i: any) => i.where === 'lim-tvoc')).toBe(false)
  })

  it('finding-contradicted — catches prose clearing a parameter the engine flagged', () => {
    const pkg = {
      immutable_values: [], references: [], recommendation_options: [], required_limitations: [], prohibited_claims: [],
      findings: [{ id: 'f1', parameter: 'co2', text: 'CO2 1800 ppm', zone: 'Zone 1' }],
    }
    const issues = auditNarrative('Carbon dioxide did not identify a notable condition during the assessment.', pkg)
    expect(issues.map((i: any) => i.id)).toContain('finding-contradicted')
  })

  it('recommendation-unsupported — catches a control the register never proposed', () => {
    const { pkg } = build()
    const text = `${cleanNarrative(pkg)}\n- Install HEPA filtration in the affected area.`
    const issues = auditNarrative(text, pkg)
    const hit = issues.find((i: any) => i.id === 'recommendation-unsupported')
    expect(hit).toBeTruthy()
    // A control is the writer's addition, not a wrong number — advisory.
    expect(hit.severity).toBe('warning')
    expect(summarizeAudit(issues).supported).toBe(true)
  })

  it('recommendation-unsupported — stays quiet when the register proposes it', () => {
    const { pkg } = build()
    pkg.recommendation_options.push({ id: 'rec-x', action: 'Install HEPA filtration in the affected area.', priority: 'Short term', timeframe: '7–30 days', location: 'Zone 1', control: 'Engineering', owner: 'Facilities', evidence: 'Service record' })
    const text = `${cleanNarrative(pkg)}\n- Install HEPA filtration in the affected area.`
    expect(auditNarrative(text, pkg).some((i: any) => i.id === 'recommendation-unsupported')).toBe(false)
  })

  it('returns nothing for empty prose or a missing package', () => {
    const { pkg } = build()
    expect(auditNarrative('', pkg)).toEqual([])
    expect(auditNarrative('anything', null)).toEqual([])
  })

  it('every rule id it can emit has a case in this file', () => {
    const source = String(FILE_SOURCE)
    for (const id of AUDIT_RULE_IDS) {
      if (id === 'rule-error') continue
      expect(source.includes(`'${id}'`), `no case asserts rule ${id}`).toBe(true)
    }
  })
})

/**
 * The wiring, guarded at the source.
 *
 * A package the model never receives and an audit nobody sees are the two
 * ways this layer becomes decoration. This codebase has shipped that exact
 * shape — `aiProvenanceBanner()` sat guarded by its own test with no
 * production importer for months — so the connection is asserted, not
 * assumed.
 */
describe('the package is wired, not decorative', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

  it('the narrative request sends the package and no longer sends the manifest', () => {
    const src = read('../../src/engines/narrative.js')
    expect(src).toMatch(/const payload = \{ evidence: packageForWriter\(evidence\) \}/)
    expect(src).toMatch(/buildEvidencePackage\(model, \{ zoneScores/)
    // The open threshold store is gone. The import is the load-bearing check
    // — the payload keys themselves are asserted at runtime in
    // `narrative-assessor-notes.test.ts`, which a source grep cannot do
    // without also matching the comment recording why it was removed.
    expect(src).not.toMatch(/^import \{ STANDARDS_MANIFEST/m)
    expect(src).not.toMatch(/^import \{ SENSOR_FIELDS/m)
  })

  it('the response is audited against the same package it was written from', () => {
    const src = read('../../src/engines/narrative.js')
    expect(src).toMatch(/const audit = text \? auditNarrative\(text, evidence\) : \[\]/)
    expect(src).toMatch(/return \{ narrative: text, audit, auditSummary/)
    // The banned-language gate still runs FIRST and still suppresses. It is a
    // different question and it is the liability floor.
    expect(src.indexOf("data.language_review === 'failed'")).toBeLessThan(src.indexOf('auditNarrative(text, evidence)'))
  })

  it('the app passes the rest of the report data so the package describes the real report', () => {
    const src = read('../../src/components/MobileApp.jsx')
    expect(src).toMatch(/generateNarrative\(bldg, zones, zoneScores, recs, presurvey, \{[\s\S]{0,320}causalChains,/)
  })

  it('the audit reaches the assessor rather than only the console', () => {
    const src = read('../../src/components/MobileApp.jsx')
    // The audit is stored with the narrative (`narrativeMeta`) and the panel
    // reads it back off that record — see ai-output-persistence.test.ts.
    expect(src).toMatch(/audit: result\.audit \|\| \[\], auditSummary: result\.auditSummary/)
    expect(src).toMatch(/const narrativeAudit = auditFromMeta\(narrativeMeta\)/)
    expect(src).toMatch(/narrativeAudit && narrativeAudit\.issues\.length > 0/)
    expect(src).toMatch(/Checked against the assessment record/)
  })

  it('the prompt tells the model the package is closed and read-only', () => {
    expect(PROMPT).toMatch(/# The evidence package is the whole world/)
    expect(PROMPT).toMatch(/CLOSED evidence package/)
    expect(PROMPT).toMatch(/READ-ONLY/)
    expect(PROMPT).toMatch(/recommendation_options` is the COMPLETE set of eligible actions/)
    expect(PROMPT).toMatch(/Null means no criterion was applied/)
    // The manifest it replaced must not be described any more.
    expect(PROMPT).not.toMatch(/standardsManifest/)
  })
})

// Read once so the coverage assertion above reads this file rather than
// guessing. Same trick `model-consistency.test.ts` uses to fail when a rule
// is added without a negative case.
const FILE_SOURCE = readFileSync(new URL(import.meta.url), 'utf8')
