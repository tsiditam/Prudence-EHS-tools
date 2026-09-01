/**
 * Pure-function tests for the user-template DOCX renderer.
 *
 * Pins the contract:
 *   • Token discovery returns every {{tag}} in the document body
 *   • Tokens in the registry land in `found`; others in `unknown`
 *   • Render replaces every token with its resolver's literal output
 *   • Resolvers returning '' produce blanks (not "null"/"undefined")
 *   • Unknown tokens render as blanks (no throw — stale templates
 *     stay renderable)
 *   • A malformed-zip input throws TemplateRenderError('invalid_docx')
 *
 * The fixtures are generated in-test using the `docx` package so we
 * don't have to check binary .docx files into the repo. This also
 * makes the assertions easier to read — the template content is
 * literally next to the assertion.
 */

import { describe, it, expect } from 'vitest'
import { Document, Packer, Paragraph, TextRun } from 'docx'
import {
  discoverTokens,
  renderTemplate,
  TemplateRenderError,
} from '../../lib/report-templates/render'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

async function buildTemplate(paragraphTexts: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: paragraphTexts.map(
          (t) => new Paragraph({ children: [new TextRun(t)] }),
        ),
      },
    ],
  })
  return Packer.toBuffer(doc)
}

function readRenderedText(buf: Buffer): string {
  const zip = new PizZip(buf)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
  })
  return doc.getFullText()
}

const SAMPLE_CTX = {
  presurvey: {
    ps_recipient_name: 'Jane Owner',
    ps_recipient_firm: 'Acme Property Group',
  },
  buildingProfile: {
    name: 'Acme HQ',
    address: '100 Main St, Anytown, USA',
  },
  profile: {
    name: 'Tsidi Tamakloe',
    title: 'OSH Program Manager',
    credentials: 'CSP',
  },
  meta: {
    assessment_date: '2026-05-28',
  },
  zones: [
    { label: 'A1', use: 'Office' },
    { label: 'A2', use: 'Conference' },
  ],
  findings: [
    { severity: 'critical', title: 'Visible mold growth', location: 'A1' },
    { severity: 'high', title: 'Elevated CO2', location: 'A1' },
    { severity: 'medium', title: 'Stained ceiling tile', location: 'A2' },
  ],
  recommendations: [
    { priority: 'immediate', text: 'Isolate Zone A1', location: 'A1' },
    { priority: 'medium', text: 'Recommission DCV', location: 'A2' },
  ],
}

describe('discoverTokens', () => {
  it('finds every {{token}} in the body, partitioned by registry membership', async () => {
    const buf = await buildTemplate([
      'Hello {{client.name}} at {{client.firm}}.',
      'Site: {{facility.name}} ({{facility.address}}).',
      'Unknown thing: {{nope.x}} and {{something_else}}.',
    ])
    const result = discoverTokens(buf)
    expect(result.found).toEqual([
      'client.firm',
      'client.name',
      'facility.address',
      'facility.name',
    ])
    expect(result.unknown).toEqual(['nope.x', 'something_else'])
  })

  it('returns empty arrays for a template with no tokens', async () => {
    const buf = await buildTemplate(['Just a plain paragraph with no placeholders.'])
    expect(discoverTokens(buf)).toEqual({ found: [], unknown: [] })
  })

  it('throws TemplateRenderError(invalid_docx) on non-zip input', () => {
    expect(() => discoverTokens(Buffer.from('definitely not a docx'))).toThrow(
      TemplateRenderError,
    )
  })
})

describe('renderTemplate', () => {
  it('substitutes registered tokens with resolver output', async () => {
    const buf = await buildTemplate([
      'Prepared for {{client.name}} at {{client.firm}}.',
      'Site: {{facility.name}} — {{facility.address}}.',
      'Assessor: {{assessor.name}}, {{assessor.credentials}}.',
    ])
    const result = renderTemplate(buf, SAMPLE_CTX)
    const text = readRenderedText(result.buffer)
    expect(text).toContain('Prepared for Jane Owner at Acme Property Group.')
    expect(text).toContain('Site: Acme HQ — 100 Main St, Anytown, USA.')
    expect(text).toContain('Assessor: Tsidi Tamakloe, CSP.')
    expect(result.tokens_filled).toEqual([
      'assessor.credentials',
      'assessor.name',
      'client.firm',
      'client.name',
      'facility.address',
      'facility.name',
    ])
    expect(result.tokens_empty).toEqual([])
    expect(result.tokens_unknown).toEqual([])
  })

  it('counts findings by severity and renders bullet summaries', async () => {
    const buf = await buildTemplate([
      'Critical: {{findings.critical_count}}, High: {{findings.high_count}}.',
      'Findings:',
      '{{findings.summary_bullets}}',
    ])
    const result = renderTemplate(buf, SAMPLE_CTX)
    const text = readRenderedText(result.buffer)
    expect(text).toContain('Critical: 1, High: 1.')
    expect(text).toContain('• CRITICAL — Visible mold growth — A1')
    expect(text).toContain('• HIGH — Elevated CO2 — A1')
    expect(text).toContain('• MEDIUM — Stained ceiling tile — A2')
  })

  it('renders empty strings (not "null"/"undefined") when data is missing', async () => {
    const buf = await buildTemplate(['Hello {{client.name}}.'])
    const result = renderTemplate(buf, {})
    const text = readRenderedText(result.buffer)
    expect(text).toBe('Hello .')
    expect(result.tokens_filled).toEqual([])
    expect(result.tokens_empty).toEqual(['client.name'])
    expect(result.tokens_unknown).toEqual([])
  })

  it('leaves unknown tokens blank — does not throw', async () => {
    const buf = await buildTemplate([
      'Hi {{client.name}}, also {{not_a_real_token}} here.',
    ])
    const result = renderTemplate(buf, SAMPLE_CTX)
    const text = readRenderedText(result.buffer)
    expect(text).toBe('Hi Jane Owner, also  here.')
    expect(result.tokens_unknown).toEqual(['not_a_real_token'])
    expect(result.tokens_filled).toEqual(['client.name'])
  })

  it('lists zones with their use types', async () => {
    const buf = await buildTemplate(['Zones surveyed: {{zones.list}}.'])
    const text = readRenderedText(renderTemplate(buf, SAMPLE_CTX).buffer)
    expect(text).toBe('Zones surveyed: A1 (Office), A2 (Conference).')
  })

  it('throws TemplateRenderError(invalid_docx) on garbage input', () => {
    expect(() => renderTemplate(Buffer.from('not a docx'), {})).toThrow(
      TemplateRenderError,
    )
  })
})

// ───────────────────────────────────────────────────────────────────────────
// The context a template is ACTUALLY rendered against
// ───────────────────────────────────────────────────────────────────────────
/**
 * Everything above renders against `SAMPLE_CTX` — a fixture hand-shaped to
 * match the resolvers. That agreement is worth exactly nothing on its own, and
 * it is how thirteen of twenty-seven tokens came to be dead in production
 * without a single test going red.
 *
 * The resolvers were authored against the flat `context = {...}` literal
 * MobileApp.jsx used to hand Jasper — `findings`, `recommendations` and
 * `sampling_plan` at the top level. Jasper was migrated onto
 * `buildAssessmentContext`, where those live at `walkthrough_findings` and
 * under `engine_outputs`. The render path inherited the new shape and nobody
 * repointed the resolvers, so every finding, recommendation, sampling and
 * report-identity token resolved to '' or '0'. `firstString` returns '' when no
 * path hits and a blank token is the DESIGNED behaviour for missing data, so
 * the failure had no symptom short of opening the rendered file.
 *
 * These tests take the other path: build real app state, run the real engine,
 * pass it through the real `buildJasperContext`, and require the tokens to
 * carry the investigation. A fixture cannot drift into agreement with them.
 */
import { buildJasperContext } from '../../lib/context/buildJasperContext'
import { scoreZone, genRecs } from '../../src/engines/scoring'
import { generateSamplingPlan } from '../../src/engines/sampling'

const PRESURVEY = {
  ps_survey_date: '2026-07-15',
  ps_assessor: 'T. Tamakloe, CSP',
  ps_assessor_certs: ['CSP', 'CIH-in-Training'],
  ps_recipient_name: 'Jane Owner',
  ps_recipient_firm: 'Acme Property Group',
  ps_recipient_email: 'jane@acme.example',
  ps_recipient_phone: '555-0100',
}

const BLDG = {
  fn: 'Acme HQ',
  address: '100 Main St, Anytown, USA',
  type: 'office',
  sqft: '48000',
  assessmentDate: '2026-07-15',
}

// Conditions chosen to fire several different engine branches: a CO2 finding,
// a moisture/mold finding with a sampling trigger, and a renovation source.
const ZONES = [
  {
    zn: 'Suite 300',
    su: 'office',
    co2: '1650',
    tf: '75',
    rh: '58',
    oc: '20',
    ac: '3-5',
    src_internal: ['New furniture / carpet / paint'],
    rn: 'Yes',
    znt: 'Occupants report stuffiness after lunch.',
  },
  {
    zn: 'Copy Room',
    su: 'office',
    co2: '900',
    tf: '74',
    rh: '64',
    mi: 'Small isolated patch',
    wd: 'Active leak',
    znt: '',
  },
]

function realContext() {
  const zoneScores = ZONES.map((z) => scoreZone(z as never, BLDG as never))
  const recs = genRecs(zoneScores as never, BLDG as never, { zones: ZONES } as never)
  const samplingPlan = generateSamplingPlan(ZONES as never, BLDG as never)
  return buildJasperContext({
    view: 'results',
    presurvey: PRESURVEY,
    bldg: BLDG,
    zones: ZONES,
    curZone: 0,
    zoneScores,
    recs,
    samplingPlan,
    profile: { name: 'T. Tamakloe', certs: ['CSP'], firm: 'PSEC' },
    draftId: 'draft-abc123',
  } as never) as unknown as Record<string, unknown>
}

describe('the real assessment context reaches every token', () => {
  const ctx = realContext()

  const renderOne = async (token: string) => {
    const buf = await buildTemplate([`X{{${token}}}X`])
    const r = renderTemplate(buf, ctx)
    return { text: readRenderedText(buf === buf ? r.buffer : r.buffer), result: r }
  }

  it('the fixture itself is a real engine run, not a shaped object', () => {
    // Guards the guard: if the engine stops producing findings for these
    // inputs, every assertion below would pass vacuously.
    expect(Array.isArray(ctx.walkthrough_findings)).toBe(true)
    expect((ctx.walkthrough_findings as unknown[]).length).toBeGreaterThan(0)
    const eo = ctx.engine_outputs as Record<string, any>
    expect(eo).toBeTruthy()
    expect(eo.recommendations.imm.length + eo.recommendations.eng.length).toBeGreaterThan(0)
    expect(eo.sampling_plan.plan.length).toBeGreaterThan(0)
  })

  it.each([
    ['client.name', 'Jane Owner'],
    ['client.firm', 'Acme Property Group'],
    ['client.email', 'jane@acme.example'],
    ['client.phone', '555-0100'],
    ['facility.name', 'Acme HQ'],
    ['facility.address', '100 Main St, Anytown, USA'],
    ['facility.type', 'office'],
    ['facility.sqft', '48000'],
    ['assessor.name', 'T. Tamakloe, CSP'],
    ['assessor.credentials', 'CSP, CIH-in-Training'],
    ['report.date', 'July 15, 2026'],
    ['report.date_iso', '2026-07-15'],
    ['report.id', 'draft-abc123'],
    ['zones.count', '2'],
  ])('%s resolves to %s', async (token, expected) => {
    const { text } = await renderOne(token)
    expect(text).toBe(`X${expected}X`)
  })

  it('the finding counts are the engine census, not zero', async () => {
    const total = (ctx.walkthrough_findings as unknown[]).length
    const { text } = await renderOne('findings.total_count')
    expect(text).toBe(`X${total}X`)
    expect(total).toBeGreaterThan(1)
  })

  it('the findings bullets name findings the engine actually raised', async () => {
    const { text } = await renderOne('findings.summary_bullets')
    const titles = (ctx.walkthrough_findings as Array<{ title: string }>).map((f) => f.title)
    for (const t of titles) expect(text).toContain(t)
  })

  it('the immediate recommendations come out of the engine bucket', async () => {
    const imm = (ctx.engine_outputs as any).recommendations.imm as Array<{ text: string }>
    const { text, result } = await renderOne('recommendations.immediate_bullets')
    if (imm.length === 0) {
      // Not vacuous — assert the count agrees rather than skipping.
      expect(result.tokens_empty).toContain('recommendations.immediate_bullets')
    } else {
      for (const r of imm) expect(text).toContain(r.text)
    }
  })

  it('the sampling plan names what the engine planned, in the zone it planned it', async () => {
    const plan = (ctx.engine_outputs as any).sampling_plan.plan as Array<{ type: string; zone: string }>
    const { text } = await renderOne('sampling_plan.summary')
    for (const p of plan) {
      expect(text).toContain(p.type)
      expect(text).toContain(p.zone)
    }
  })

  it('every registered token is reachable from a real context', async () => {
    // The class guard. A token nobody can fill is worse than no token: the
    // Settings panel advertises it and the template renders blank. Any token
    // that cannot resolve here either needs repointing or removing.
    const { TOKEN_REGISTRY } = await import('../../lib/report-templates/token-registry')
    const dead = TOKEN_REGISTRY
      .filter((t) => !t.resolve(ctx as never))
      .map((t) => t.token)
    expect(dead, 'tokens that resolve to nothing from a real assessment').toEqual([])
  })
})

describe('repeating sections', () => {
  const ctx = realContext()

  it('repeats a findings row once per finding', async () => {
    const buf = await buildTemplate([
      '{{#findings}}',
      'ROW {{severity}} | {{title}} | {{zone_label}}',
      '{{/findings}}',
    ])
    const r = renderTemplate(buf, ctx)
    const text = readRenderedText(r.buffer)
    const rows = (text.match(/ROW /g) || []).length
    expect(rows).toBe((ctx.walkthrough_findings as unknown[]).length)
    for (const f of ctx.walkthrough_findings as Array<{ title: string }>) {
      expect(text).toContain(f.title)
    }
    expect(r.tokens_filled).toContain('#findings')
  })

  it('repeats zones, recommendations and the sampling plan the same way', async () => {
    const eo = ctx.engine_outputs as any
    const expectedRecs =
      eo.recommendations.imm.length + eo.recommendations.eng.length +
      eo.recommendations.adm.length + eo.recommendations.mon.length
    for (const [section, count] of [
      ['zones', (ctx.zones as unknown[]).length],
      ['recommendations', expectedRecs],
      ['sampling_plan', eo.sampling_plan.plan.length],
    ] as const) {
      const buf = await buildTemplate([`{{#${section}}}`, 'ROW', `{{/${section}}}`])
      const text = readRenderedText(renderTemplate(buf, ctx).buffer)
      expect((text.match(/ROW/g) || []).length, section).toBe(count)
    }
  })

  it('renders a section with no rows zero times, and calls it empty not unknown', async () => {
    // A correct template over an assessment with nothing to say is not the
    // same problem as a template with a typo in it.
    const buf = await buildTemplate(['{{#sampling_plan}}', 'ROW', '{{/sampling_plan}}'])
    const empty = buildJasperContext({
      view: 'dash', presurvey: {}, bldg: {}, zones: [], curZone: 0,
    } as never) as unknown as Record<string, unknown>
    const r = renderTemplate(buf, empty)
    expect(readRenderedText(r.buffer)).not.toContain('ROW')
    expect(r.tokens_empty).toContain('#sampling_plan')
    expect(r.tokens_unknown).not.toContain('sampling_plan')
  })

  it('reports an unknown field against the section that does not define it', async () => {
    const buf = await buildTemplate([
      '{{#findings}}', '{{severity}} {{not_a_field}}', '{{/findings}}',
    ])
    const r = renderTemplate(buf, ctx)
    expect(r.tokens_unknown).toContain('findings.not_a_field')
    // And it renders blank rather than failing the whole document — the rest
    // of the row still carries its data.
    const first = (ctx.walkthrough_findings as Array<{ severity: string }>)[0]
    expect(readRenderedText(r.buffer)).toContain(first.severity)
  })

  it('discoverTokens names sections in the form the assessor typed', async () => {
    const buf = await buildTemplate([
      '{{client.name}}', '{{#findings}}', '{{title}}', '{{/findings}}',
    ])
    const { found, unknown } = discoverTokens(buf)
    expect(found).toContain('client.name')
    expect(found).toContain('#findings')
    expect(unknown).toEqual([])
  })
})

describe('the qualitative-only marking survives into a template', () => {
  // CLAUDE.md's propagation rule: the flag reaches every rendered output of
  // the finding. The template path carried it nowhere.
  const ctxWith = (qualitative: boolean) =>
    ({
      walkthrough_findings: [
        {
          severity: 'high',
          title: 'Elevated CO2',
          location: 'Suite 300',
          zone_label: 'Suite 300',
          qualitative_only: qualitative,
        },
      ],
    }) as unknown as Record<string, unknown>

  it('exposes a printable note on a qualitative-only finding row', async () => {
    const buf = await buildTemplate(['{{#findings}}', '{{title}} — {{qualitative_note}}', '{{/findings}}'])
    const text = readRenderedText(renderTemplate(buf, ctxWith(true)).buffer)
    expect(text).toMatch(/not in the accuracy database/i)
  })

  it('says nothing when the finding is instrument-backed', async () => {
    const buf = await buildTemplate(['{{#findings}}', '{{title}} — {{qualitative_note}}', '{{/findings}}'])
    const text = readRenderedText(renderTemplate(buf, ctxWith(false)).buffer)
    expect(text).not.toMatch(/accuracy database/i)
    expect(text).toContain('Elevated CO2')
  })

  it('marks it in the flat bullet block too', async () => {
    const buf = await buildTemplate(['{{findings.summary_bullets}}'])
    const on = readRenderedText(renderTemplate(buf, ctxWith(true)).buffer)
    const off = readRenderedText(renderTemplate(buf, ctxWith(false)).buffer)
    expect(on).toContain('(qualitative observation)')
    expect(off).not.toContain('(qualitative observation)')
  })
})
