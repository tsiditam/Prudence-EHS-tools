/**
 * Supplemental report sections — placement, lettering, and TOC sync.
 *
 * Regression for the "report structure getting out of hand" review: the
 * lab-results / sensor-graph appendices and the Standards Currency note used
 * to be appended after buildClientDocx ran — so they were missing from the
 * Table of Contents, mis-lettered (or unlettered), and rendered after the
 * footer. These pin the corrected behavior.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import { assembleSupplementalSections, mergeSupplementalTocEntries } from '../../src/components/docx/sections-supplemental.js'
import { buildClientDocx } from '../../src/components/docx/sections-v21client.js'
import { buildLabResultsAppendix } from '../../src/components/docx/sections-lab-results.js'
import { buildSensorGraphsAppendix } from '../../src/components/docx/sections-sensor.js'
import { buildMethodologyCurrency } from '../../src/components/docx/sections-methodology-currency.js'
import { renderClientReport } from '../../src/engine/report/client.ts'
import { legacyToAssessmentScore } from '../../src/engine/bridge/legacy.ts'
import { scoreZone, compositeScore } from '../../src/engines/scoring.js'

const H = (t) => ({ __heading: t })

function flatten(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  let acc = ''
  if (node.options && typeof node.options.text === 'string') acc += node.options.text + ' '
  if (Array.isArray(node.root)) for (const c of node.root) acc += flatten(c)
  return acc
}

describe('assembleSupplementalSections', () => {
  it('is a no-op for empty/missing input', () => {
    const e = assembleSupplementalSections(null, { headingFn: H })
    expect(e.bodyChildren).toEqual([])
    expect(e.appendixChildren).toEqual([])
    expect(e.bodyTocEntries).toEqual([])
    expect(e.appendixTocEntries).toEqual([])
  })

  it('letters supplemental appendices continuously after the last engine appendix (G, H)', () => {
    const supp = assembleSupplementalSections(
      {
        bodySections: [{ title: 'Standards Currency', children: ['intro'] }],
        appendices: [
          { title: 'Laboratory Analytical Results', children: ['lab'] },
          { title: 'Environmental Evidence Graphs', children: ['graph'] },
        ],
      },
      { headingFn: H, engineTocEntries: [{ title: 'Appendix F — Glossary', level: 1 }] },
    )
    expect(supp.appendixChildren[0]).toEqual({ __heading: 'Appendix G — Laboratory Analytical Results' })
    expect(supp.appendixChildren[2]).toEqual({ __heading: 'Appendix H — Environmental Evidence Graphs' })
    expect(supp.appendixTocEntries.map((e) => e.title)).toEqual([
      'Appendix G — Laboratory Analytical Results',
      'Appendix H — Environmental Evidence Graphs',
    ])
    expect(supp.bodyChildren[0]).toEqual({ __heading: 'Standards Currency' })
    expect(supp.bodyTocEntries[0].title).toBe('Standards Currency')
  })

  it('skips sections that have no children (so absent data consumes no letter)', () => {
    const supp = assembleSupplementalSections(
      { bodySections: [{ title: 'Empty', children: [] }], appendices: [{ title: 'Empty Apx', children: [] }] },
      { headingFn: H, engineTocEntries: [{ title: 'Appendix F — Glossary', level: 1 }] },
    )
    expect(supp.bodyChildren).toEqual([])
    expect(supp.appendixChildren).toEqual([])
  })

  it('only the present appendix gets the first free letter (sensor alone → G)', () => {
    const supp = assembleSupplementalSections(
      { appendices: [{ title: 'Environmental Evidence Graphs', children: ['graph'] }] },
      { headingFn: H, engineTocEntries: [{ title: 'Appendix F — Glossary', level: 1 }] },
    )
    expect(supp.appendixChildren[0]).toEqual({ __heading: 'Appendix G — Environmental Evidence Graphs' })
  })
})

describe('mergeSupplementalTocEntries', () => {
  const ENGINE = [
    { title: 'Executive Summary', level: 1 },
    { title: 'Limitations and Professional Judgment', level: 1 },
    { title: 'Appendix A — Per-Zone Measurement Tabulation', level: 1 },
    { title: 'Appendix F — Glossary', level: 1 },
  ]

  it('inserts body entries after Limitations and appendix entries after the last appendix', () => {
    const supp = {
      bodyTocEntries: [{ title: 'Standards Currency', level: 1 }],
      appendixTocEntries: [{ title: 'Appendix G — Laboratory Analytical Results', level: 1 }],
    }
    expect(mergeSupplementalTocEntries(ENGINE, supp).map((e) => e.title)).toEqual([
      'Executive Summary',
      'Limitations and Professional Judgment',
      'Standards Currency',
      'Appendix A — Per-Zone Measurement Tabulation',
      'Appendix F — Glossary',
      'Appendix G — Laboratory Analytical Results',
    ])
  })

  it('returns engine entries unchanged when there is nothing supplemental', () => {
    expect(mergeSupplementalTocEntries(ENGINE, { bodyTocEntries: [], appendixTocEntries: [] })).toEqual(ENGINE)
  })
})

describe('buildClientDocx end-to-end with supplemental sections', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  function buildReport() {
    const META = { siteName: 'S', siteAddress: 'A', assessmentDate: '2026-04-28', preparingAssessor: { fullName: 'J', credentials: ['CIH'] }, reviewStatus: 'draft_pending_professional_review', issuingFirm: { name: 'PSEC' }, projectNumber: 'P-1', transmittalRecipient: { fullName: 'R', organization: 'O' } }
    const PRESURVEY = { ps_assessor: 'J. Smith', ps_inst_iaq: 'TSI Q-Trak 7575', ps_inst_iaq_cal: '2026-01-15', ps_inst_iaq_cal_status: 'Calibrated' }
    const zone = { zn: 'Z1', su: 'office', co2: '1300', co2o: '420', tf: '79', rh: '68', pm: '12' }
    const lz = scoreZone(zone, {})
    const cs = compositeScore([lz])
    const score = legacyToAssessmentScore([lz], cs, [zone], { meta: META, presurvey: PRESURVEY })
    return renderClientReport(score, { includeAssessmentIndexAppendix: false })
  }

  const labResults = {
    laboratory: 'EMSL Analytical, Inc.', importedAt: '2026-05-19T10:00:00.000Z', importedFromFilename: 'emsl.csv',
    rows: [{ sampleId: 'AC-001', location: 'Zone A', collectedAt: '2026-05-15', analyte: 'Aspergillus', result: '1200', units: 'spores/m³', detectionLimit: '13' }],
  }
  const sensorData = { fileName: 'qtrak.csv', summary: { count: 100, start: Date.now() - 3600000, end: Date.now() }, graphs: { co2: { include: true, imageDataUrl: PNG, title: 'CO₂ Over Time', series: ['CO₂'] } } }

  it('lists Standards Currency + Appendix G/H in the TOC and renders them in the body', async () => {
    const result = buildReport()
    const supplemental = {
      bodySections: [buildMethodologyCurrency()].filter(Boolean),
      appendices: [buildLabResultsAppendix(labResults), buildSensorGraphsAppendix(sensorData)].filter(Boolean),
    }
    const { main } = buildClientDocx(result, { supplemental })
    const text = main.map(flatten).join(' ')

    // Each appears at least twice: once in the TOC, once as the section heading.
    expect((text.match(/Standards Currency/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((text.match(/Appendix G — Laboratory Analytical Results/g) || []).length).toBeGreaterThanOrEqual(2)
    expect((text.match(/Appendix H — Environmental Evidence Graphs/g) || []).length).toBeGreaterThanOrEqual(2)

    // Ordering: Standards Currency precedes Appendix G which precedes Appendix H.
    expect(text.lastIndexOf('Standards Currency')).toBeLessThan(text.lastIndexOf('Appendix G — Laboratory Analytical Results'))
    expect(text.lastIndexOf('Appendix G — Laboratory Analytical Results')).toBeLessThan(text.lastIndexOf('Appendix H — Environmental Evidence Graphs'))
  })

  it('omits supplemental sections entirely when no data is attached', () => {
    const { main } = buildClientDocx(buildReport(), { supplemental: { bodySections: [], appendices: [] } })
    const text = main.map(flatten).join(' ')
    expect(text).not.toMatch(/Standards Currency/)
    expect(text).not.toMatch(/Laboratory Analytical Results/)
    expect(text).not.toMatch(/Environmental Evidence Graphs/)
  })

  it('still packs to a valid docx blob with supplemental sections', async () => {
    const result = buildReport()
    const supplemental = {
      bodySections: [buildMethodologyCurrency()].filter(Boolean),
      appendices: [buildLabResultsAppendix(labResults), buildSensorGraphsAppendix(sensorData)].filter(Boolean),
    }
    const { cover, main } = buildClientDocx(result, { supplemental })
    const { Document } = await import('docx')
    const doc = new Document({ sections: [{ ...cover }, { children: main }] })
    const blob = await Packer.toBlob(doc)
    expect(blob).toBeTruthy()
  })
})
