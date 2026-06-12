/**
 * Evidence Traceability Matrix — CIH-reasoning DOCX section (KG stage 4, §17).
 *
 * Pins the pure data seam (traceabilityRows) and the section wrapper:
 *   • Each finding traces to its supporting/conflicting evidence + standards.
 *   • A standard framed is_health_limit=false is annotated as a screening
 *     reference, never a limit (CO2 / ASHRAE 62.1).
 *   • Confidence is the engine's categorical value, surfaced verbatim.
 *   • Empty / pre-engine input renders nothing (null).
 */
import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain JS docx section module, no types
import { traceabilityRows, buildEvidenceTraceabilityMatrix } from '../../src/components/docx/sections-traceability.js'
import { buildGraphContext } from '../../lib/context/graphContext'

const engineState = {
  id: 'rpt-trace-1',
  zones: [{ id: 'z1', zn: 'Conference Room A' }],
  zoneScores: [{
    zoneName: 'Conference Room A',
    cats: [{ l: 'Ventilation', r: [
      { t: 'CO2 1,800 ppm — ventilation rate appears inadequate', std: 'ASHRAE 62.1-2025', sev: 'high' },
      { t: 'CO2 is a ventilation indicator', std: 'ASHRAE 62.1-2025', sev: 'info' },
    ] }],
  }],
  causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', evidence: [], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
  recs: ['Verify outdoor air delivery and HVAC operation'],
}

describe('traceabilityRows', () => {
  const ctx = buildGraphContext(engineState)
  const rows = traceabilityRows(ctx)

  it('emits one row per flagged finding', () => {
    expect(rows.length).toBe(1)
    expect(rows[0].finding).toMatch(/ventilation rate appears inadequate/)
  })

  it('annotates a framed standard as a screening reference, not a limit', () => {
    expect(rows[0].standards).toMatch(/ASHRAE 62\.1-2025 \(screening reference — not a health limit\)/)
  })

  it('surfaces the engine confidence verbatim and a dash when no conflict', () => {
    expect(['Validated', 'Provisional', 'Qualitative']).toContain(rows[0].confidence)
    expect(rows[0].conflicting).toBe('—')
  })
})

describe('buildEvidenceTraceabilityMatrix', () => {
  it('returns a titled section with children when findings exist', () => {
    const section = buildEvidenceTraceabilityMatrix(buildGraphContext(engineState))
    expect(section).not.toBeNull()
    expect(section.title).toBe('Evidence Traceability Matrix')
    expect(Array.isArray(section.children)).toBe(true)
    expect(section.children.length).toBeGreaterThan(0)
  })

  it('renders nothing on a pre-engine draft', () => {
    expect(buildEvidenceTraceabilityMatrix(buildGraphContext({ zones: [{ id: 'z1' }] }))).toBeNull()
    expect(buildEvidenceTraceabilityMatrix(null)).toBeNull()
  })
})
