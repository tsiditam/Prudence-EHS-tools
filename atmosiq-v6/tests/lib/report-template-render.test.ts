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
