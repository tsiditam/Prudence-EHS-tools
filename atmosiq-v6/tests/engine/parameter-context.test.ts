// @vitest-environment node
/**
 * `parameter_context` — the one place the writer is GIVEN technical
 * background instead of forbidden from recalling it.
 *
 * ── The contradiction this closes ──────────────────────────────────────
 * The prompt's boundaries say the model may never originate a threshold, a
 * guideline value or a standard, and may not "recall" limits from training
 * data. The parameter-background section then asked it for exactly that:
 * "what the parameter is and why it is measured", with no approved text
 * supplied. So the one section whose first half is general technical
 * background was the one section written from model memory, against the
 * rule every other part of the prompt enforces — and it is background that
 * names ASHRAE 55 and the EPA moisture-control range, which is precisely
 * the kind of claim the boundaries exist to keep out of a model's hands.
 *
 * It was never necessary. `PARAMETER_BACKGROUND` is reviewed copy that the
 * deterministic report has rendered the whole time. The fix is to hand it
 * over rather than to ask for it back.
 *
 * ── What is asserted here ──────────────────────────────────────────────
 * That the context is a PROJECTION of what the report renders (so the two
 * cannot drift), that it is handed over VERBATIM (a summary of reviewed
 * copy is a paraphrase of reviewed copy), that it reaches the wire, and
 * that the deterministic report is byte-identical after the refactor that
 * gave both readers one map.
 */
import { describe, it, expect } from 'vitest'
// @ts-ignore js
import { buildEvidencePackage, packageForWriter, WIRE_BUDGET_CHARS } from '../../src/report/evidencePackage.js'
// @ts-ignore js
import { PARAMETER_BACKGROUND, WHAT_IS } from '../../src/report/narrativeLibrary.js'
// @ts-ignore js
import { assembleRenderModel } from '../../src/report/reportModel.js'
// @ts-ignore js
import { scoreZone } from '../../src/engines/scoring.js'
// @ts-ignore js
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-ignore js
import { REPORT_SECTIONS_SYSTEM_PROMPT as PROMPT } from '../../src/engines/reportSections.js'
// @ts-ignore js
import { DEMO_FINDINGS_BUILDING as BLDG, DEMO_FINDINGS_ZONES as ZONES, DEMO_FINDINGS_PRESURVEY as PRESURVEY } from '../../src/constants/demoDataFindings'

const AT = { assessmentDate: '2026-06-10' }

function build(zones: any[] = ZONES) {
  const zoneScores = zones.map((z: any) => scoreZone(z, { ...BLDG, ...AT }))
  const causalChains = buildCausalChains(zones, BLDG, zoneScores)
  const model = assembleRenderModel({
    building: BLDG, presurvey: PRESURVEY, zones, zoneScores, causalChains,
    recs: { imm: [], eng: [], adm: [], mon: [] },
    profile: { name: 'John Smith', certs: ['CIH'], firm: 'PSEC' },
    id: 'AIQ-DEMO', ts: '2026-06-10',
  }, { now: new Date('2026-06-11T12:00:00Z') })
  return { model, pkg: buildEvidencePackage(model, { zoneScores, causalChains }) }
}

describe('one map, read by the renderer and the package', () => {
  it('PARAMETER_BACKGROUND is WHAT_IS under the group keys the report uses', () => {
    // Two key spaces exist: the library's own (`tempRh`) and the group the
    // report, the package and the AI record all use (`thermal`). The join
    // used to be inline in reportModel.js, which was fine as the only
    // consumer and became a second opinion the moment the package needed it.
    expect(PARAMETER_BACKGROUND.thermal).toBe(WHAT_IS.tempRh)
    for (const k of ['co2', 'co', 'pm25', 'tvoc']) {
      expect(PARAMETER_BACKGROUND[k], k).toBe(WHAT_IS[k])
    }
  })

  it('the deterministic report still renders that prose, unchanged', () => {
    // The refactor routed the renderer through the shared map, and this is
    // the check that the map is RIGHT. Verified by mutation: pointing
    // `thermal` at the particulate explainer fails here and leaves
    // `render-determinism.test.ts` green, because that suite asks whether
    // two renders agree — not whether either is correct. A wrong map is
    // perfectly stable.
    const { model } = build()
    const rendered = (model.results.parameters || []).map((p: any) => p.body[0]).join('\n')
    for (const row of model.results.parameters || []) {
      expect(rendered).toContain(`What it is and why we measure it: ${PARAMETER_BACKGROUND[row.key]}`)
    }
  })
})

describe('the package projects what the report renders', () => {
  it('carries one entry per rendered parameter group, in the same order', () => {
    const { model, pkg } = build()
    const rendered = (model.results.parameters || [])
      .map((p: any) => p.key)
      .filter((k: string) => PARAMETER_BACKGROUND[k])
    expect(pkg.parameter_context.map((p: any) => p.parameter_group)).toEqual(rendered)
  })

  it('combines temperature and relative humidity into ONE thermal entry', () => {
    const { pkg } = build()
    const groups = pkg.parameter_context.map((p: any) => p.parameter_group)
    expect(groups).toContain('thermal')
    // The grouping is not restated here — it is inherited from the report,
    // which is the point. No second opinion about which parameters pair.
    expect(groups.filter((g: string) => g === 'thermal')).toHaveLength(1)
    expect(groups).not.toContain('temperature')
    expect(groups).not.toContain('relativeHumidity')
  })

  it('hands the approved prose over VERBATIM', () => {
    // A summarized explainer would be a paraphrase of reviewed copy, which
    // is the thing being avoided. Byte-for-byte or it is not the approved
    // text any more.
    const { pkg } = build()
    for (const row of pkg.parameter_context) {
      expect(row.background, row.parameter_group).toBe(PARAMETER_BACKGROUND[row.parameter_group])
    }
  })

  it('omits a group this assessment did not measure', () => {
    // A single zone with CO2 only must not be handed background for
    // particulate. Offering it invites a paragraph about a parameter the
    // report has no reading for.
    const bare: any = { ...ZONES[0], zn: 'Zone 1', co2: '900' }
    // The zone's own measurement fields, dropped rather than blanked — an
    // empty string is still a captured reading to some of these paths.
    for (const k of ['tf', 'tfo', 'rh', 'rho', 'pm', 'pmo', 'co', 'tv', 'tvo', 'hc']) delete bare[k]
    const one = [bare]
    const { pkg } = build(one as any)
    const groups = pkg.parameter_context.map((p: any) => p.parameter_group)
    expect(groups).toContain('co2')
    expect(groups).not.toContain('pm25')
    expect(groups.length).toBeLessThan(5)
  })

  it('reaches the writer, within budget', () => {
    const { pkg } = build()
    const wire = packageForWriter(pkg)
    expect(wire.parameter_context).toEqual(pkg.parameter_context)
    // Measured, not assumed: the whole point of adding context is lost if it
    // pushes the payload over the cap and gets shed.
    expect(JSON.stringify(wire).length).toBeLessThanOrEqual(WIRE_BUDGET_CHARS)
  })
})

describe('the prompt sources background from the package, not from memory', () => {
  it('introduces parameter_context as the approved source', () => {
    expect(PROMPT).toMatch(/`parameter_context` is APPROVED background prose/)
    expect(PROMPT).toMatch(/do not substitute your own recollection of the parameter/)
  })

  it('binds the section to the supplied groups rather than a hardcoded list', () => {
    expect(PROMPT).toMatch(/keyed by `parameter_group` from `parameter_context`/)
    expect(PROMPT).toMatch(/Write a key for every group that list carries and no others/)
  })

  it('still forbids extending the approved text with a figure it does not carry', () => {
    // Handing over background must not become a license to elaborate on it.
    // Compression is allowed; addition is not.
    expect(PROMPT).toMatch(/do not add a standard, threshold or figure it does not contain/)
    expect(PROMPT).toMatch(/You may compress it .*; you may not extend it/)
  })

  it('no longer asks the model for what the parameter IS as an open question', () => {
    // The old contract: "2 to 4 sentences combining what the parameter is and
    // why it is measured with what was observed at this site" — with nothing
    // supplied. That phrasing is the defect, and it must not come back.
    expect(PROMPT).not.toMatch(/sentences combining what the parameter is and why it is measured with what was observed/)
  })

  it('and boundary 1 still forbids recalling limits, which is what made this a contradiction', () => {
    expect(PROMPT).toMatch(/Do not "recall" limits from training data/)
  })
})
