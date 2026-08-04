/**
 * Mold Screening Report — DOCX layer.
 *
 * Content is tested at the pure row level (conditionRows / findingRows /
 * sporeRows over the demo result, plus the no-health-verdict guard); packaging
 * is tested by confirming the built document packs to a real .docx (PK zip).
 * Mirrors how the monitoring report separates model content from docx packing.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import { conditionRows, findingRows, sporeRows, moldReportChildren, zoneLabel } from '../../src/components/docx/sections-mold.js'
import { buildMoldReportDocument, moldReportFileName } from '../../src/components/docx/mold-report.js'
import { assessMold } from '../../src/engines/mold/index.js'
import { buildMoldInput } from '../../src/engines/mold/buildInput.js'
import { DEMO_MOLD } from '../../src/constants/demoDataMold.js'

const input = buildMoldInput(DEMO_MOLD)
const result = assessMold(input)
const zones = input.zones
const BANNED = /\b(safe|unsafe|toxic|hazardous|dangerous|compliant|non-compliant)\b/i
const flat = (rows: unknown[][]) => rows.flat().map(String).join(' | ')

describe('mold report rows', () => {
  it('conditionRows — one per zone, with S520 Condition + area labels', () => {
    const rows = conditionRows(result, zones)
    expect(rows.length).toBe(result.conditions.length)
    expect(flat(rows)).toMatch(/Condition 3/)
    expect(flat(rows)).toMatch(/Break Room/)
  })
  it('findingRows — categorical severities + summaries, no health-verdict language', () => {
    const rows = findingRows(result, zones)
    expect(rows.length).toBe(result.findings.length)
    expect(flat(rows)).toMatch(/Elevated indicator|Screening indicator/)
    expect(flat(rows)).not.toMatch(BANNED)
  })
  it('sporeRows — comparative outcomes', () => {
    expect(flat(sporeRows(result, zones))).toMatch(/amplification|normal ecology/i)
  })
  it('zoneLabel — maps system, resolves labels, falls back to id', () => {
    expect(zoneLabel(zones, 'system')).toBe('Building systems')
    expect(zoneLabel(zones, 'z-breakroom')).toBe('Break Room')
    expect(zoneLabel(zones, 'nope')).toBe('nope')
  })
})

describe('mold report document', () => {
  it('moldReportChildren returns a populated body', () => {
    expect(moldReportChildren(result, { zones }).length).toBeGreaterThan(5)
  })
  it('packs a real .docx (PK zip)', async () => {
    const buf = await Packer.toBuffer(buildMoldReportDocument(result, { site: 'Demo Site', zones }))
    expect(buf[0]).toBe(0x50) // 'P'
    expect(buf[1]).toBe(0x4b) // 'K'
    expect(buf.length).toBeGreaterThan(1000)
  })
  it('builds defensively even from an empty result', async () => {
    const buf = await Packer.toBuffer(buildMoldReportDocument({ findings: [], version: '0.1.0' } as never, {}))
    expect(buf[0]).toBe(0x50)
  })
  it('file name is filesystem-safe', () => {
    expect(moldReportFileName({ site: 'Break Room / A' })).toBe('AtmosFlow-Mold-Screening-Report-Break-Room-A.docx')
  })
})
