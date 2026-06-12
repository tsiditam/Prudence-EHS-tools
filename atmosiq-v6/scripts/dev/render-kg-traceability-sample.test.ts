/**
 * KG §17 sample renderer — produces a CIH-reasoning DOCX containing the
 * Conceptual Site Model, Findings Confidence Register, and the new Evidence
 * Traceability Matrix, all from the spec "Test 1" fixture (CO2 ventilation
 * concern). Lets the report surface be eyeballed without finalizing a real
 * assessment.
 *
 * Gated on RENDER_KG_SAMPLE=1 so it never runs in the normal suite.
 * Invoked by `npm run render:kg-sample`. Writes /tmp/kg-cih-traceability-sample.docx.
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { Document, Packer, HeadingLevel } from 'docx'

// @ts-expect-error — plain JS docx modules, no types
import { DOCX_STYLES } from '../../src/components/docx/styles.js'
// @ts-expect-error — plain JS docx modules, no types
import { BODY_SECTION_PROPERTIES } from '../../src/components/docx/page-setup.js'
// @ts-expect-error — plain JS docx modules, no types
import { p } from '../../src/components/docx/paragraphs.js'
// @ts-expect-error — plain JS docx modules, no types
import { buildFindingsConfidenceRegister } from '../../src/components/docx/sections-cih-reasoning.js'
// @ts-expect-error — plain JS docx modules, no types
import { buildConceptualSiteModelSection } from '../../src/components/docx/sections-conceptual-model.js'
// @ts-expect-error — plain JS docx modules, no types
import { buildEvidenceTraceabilityMatrix } from '../../src/components/docx/sections-traceability.js'
import { buildGraphContext } from '../../lib/context/graphContext'

const FIXTURE = {
  zones: [{ id: 'confA', zn: 'Conference Room A', co2: '1800', rh: '58', od: 'Closed / minimum', sa: 'Weak / reduced', sy: ['Headache', 'Eye irritation'] }],
  zoneScores: [{
    zoneName: 'Conference Room A', confidence: 'Moderate',
    cats: [{ l: 'Ventilation', r: [
      { t: 'CO₂ 1,800 ppm (Δ1,385 ppm above outdoor) — ventilation rate appears inadequate for occupant load.', std: 'ASHRAE 62.1-2025', sev: 'high' },
      { t: 'CO₂ is a ventilation-adequacy indicator, not a contaminant measurement.', sev: 'info' },
    ] }],
  }],
  causalChains: [{ zone: 'Conference Room A', type: 'Ventilation Deficiency', rootCause: 'Inadequate ventilation rate for occupant load', evidence: ['CO₂ at 1800 ppm', 'OA damper: Closed / minimum'], confidence: 'Strong', std: 'ASHRAE 62.1-2025' }],
  recs: ['Verify outdoor-air delivery and rebalance to the ASHRAE 62.1 breathing-zone rate for the measured occupancy.'],
}

const OUT = '/tmp/kg-cih-traceability-sample.docx'

describe.skipIf(!process.env.RENDER_KG_SAMPLE)('KG CIH traceability sample', () => {
  it('renders the CIH reasoning sections including the Evidence Traceability Matrix', async () => {
    const sections = [
      buildConceptualSiteModelSection(FIXTURE.causalChains),
      buildFindingsConfidenceRegister(FIXTURE.zoneScores),
      buildEvidenceTraceabilityMatrix(buildGraphContext(FIXTURE)),
    ].filter(Boolean)

    const children: unknown[] = [
      p('AtmosFlow — Knowledge-Graph Report Traceability (sample, Test 1 fixture)', { heading: HeadingLevel.TITLE, bold: true, size: 32, after: 240 }),
    ]
    for (const s of sections as Array<{ title: string; children: unknown[] }>) {
      children.push(p(s.title, { heading: HeadingLevel.HEADING_1, bold: true, size: 26, after: 120 }))
      children.push(...s.children)
    }

    const doc = new Document({ styles: DOCX_STYLES, sections: [{ properties: BODY_SECTION_PROPERTIES, children }] })
    const buf = await Packer.toBuffer(doc)
    writeFileSync(OUT, buf)
    expect(buf.length).toBeGreaterThan(2000)
  })
})
