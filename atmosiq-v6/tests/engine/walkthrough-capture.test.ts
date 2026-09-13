/**
 * Walkthrough capture — the structured records and the report sentences
 * that read them (docs/WALKTHROUGH_CAPTURE.md).
 *
 * Pins, per record: the wizard declares the field (so the registry derives
 * it), the renderer prints it in the named report place, the sentence carries
 * no verdict (modelConsistency's rule reads it), and a report without the
 * record reads exactly as it did before.
 */
import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import JSZip from 'jszip'
// @ts-expect-error — JS module without types
import { Q_PRESURVEY, Q_DETAILS, Q_ZONE } from '../../src/constants/questions.js'
// @ts-expect-error — JS module without types
import { getField, SCOPE_ZONE, SCOPE_PRESURVEY } from '../../src/constants/field-registry.js'
import {
  siteHistoryParagraphs, sourceDetailLines, checksPerformedLines, airflowLines, loggerDeploymentLines,
  loggerEventLines, interviewLines, comparisonRow, checksRow, continuousMonitoringRows, airflowInstrumentRow,
  autoLoggerCaption, buildSamplingSection, zoneRoleLabel,
// @ts-expect-error — JS module without types
} from '../../src/report/captureRender.js'
// @ts-expect-error — JS module without types
import { assembleRenderModel, zoneObservations, zoneOccupantReports, REPORT_PARAMETERS } from '../../src/report/reportModel.js'
// @ts-expect-error — JS module without types
import { checkRenderModel } from '../../src/report/modelConsistency.js'
// @ts-expect-error — JS module without types
import { scoreZone, summarizeAssessment, genRecs } from '../../src/engines/scoring.js'
// @ts-expect-error — JS module without types
import { generateSamplingPlan } from '../../src/engines/sampling.js'
// @ts-expect-error — JS module without types
import { buildCausalChains } from '../../src/engines/causalChains.js'
// @ts-expect-error — JS module without types
import { buildAtmosFlowDocument } from '../../src/components/DocxReport'
import {
  DEMO_HCHO_BUILDING, DEMO_HCHO_ZONES, DEMO_HCHO_PRESURVEY, DEMO_HCHO_EQUIPMENT, buildDemoHchoSensorData,
// @ts-expect-error — JS module without types
} from '../../src/constants/demoDataHcho.js'

const VERDICT = /\b(ASHRAE|NIOSH|OSHA|WHO|EPA)\b|\b(Priority|Elevated|Advisory|Acceptable)\b|inadequate|exceeds|non-?compliant/

function demoData(overrides: Record<string, unknown> = {}) {
  const bldg = { ...DEMO_HCHO_BUILDING, assessmentDate: DEMO_HCHO_PRESURVEY.ps_survey_date }
  const zones = DEMO_HCHO_ZONES
  const zoneScores = zones.map((z: any) => scoreZone(z, bldg))
  return {
    id: 'PSEC-IAQ-TEST', building: DEMO_HCHO_BUILDING, presurvey: DEMO_HCHO_PRESURVEY, zones, equipment: DEMO_HCHO_EQUIPMENT,
    zoneScores, comp: summarizeAssessment(zoneScores), recs: genRecs(zoneScores, bldg, { zones, equipment: DEMO_HCHO_EQUIPMENT }),
    samplingPlan: generateSamplingPlan(zones, bldg), causalChains: buildCausalChains(zones, bldg, zoneScores),
    profile: { name: 'A. Rivera, CIH, CSP' }, photos: {}, ts: '2026-06-01T20:00:00Z',
    ...overrides,
  }
}

describe('the wizard declares every capture field, in the scope the report reads it from', () => {
  it('zone records', () => {
    for (const id of ['zone_role', 'src_detail', 'zone_checks', 'logger_deployment', 'oa_flow_cfm', 'sy_onset', 'sy_time', 'sy_days', 'sy_where', 'sy_relief']) {
      expect(Q_ZONE.some((q: any) => q.id === id), id).toBe(true)
      expect(getField(id)?.scope, id).toBe(SCOPE_ZONE)
    }
  })
  it('presurvey records, on both the desktop pre-survey and the mobile details path', () => {
    for (const id of ['ps_timeline', 'ps_reno_materials', 'ps_reno_reoccupied', 'ps_reno_flushout', 'ps_complaint_pattern', 'ps_inst_flow']) {
      expect(Q_PRESURVEY.some((q: any) => q.id === id), id).toBe(true)
      expect(Q_DETAILS.some((q: any) => q.id === id), id).toBe(true)
      expect(getField(id)?.scope, id).toBe(SCOPE_PRESURVEY)
    }
  })
  it('the records that need an editor carry their control type', () => {
    const t = (id: string) => Q_ZONE.concat(Q_DETAILS).find((q: any) => q.id === id)?.t
    expect(t('ps_timeline')).toBe('timeline')
    expect(t('src_detail')).toBe('sourcecards')
    expect(t('zone_checks')).toBe('checks')
    expect(t('logger_deployment')).toBe('logger')
  })
})

describe('site history — section 1 reads the trigger card and the timeline as a sequence', () => {
  it('renovation card, complaint card, and a dated timeline in date order', () => {
    const paras = siteHistoryParagraphs({
      ps_reno_scope: ['Flooring replacement'], ps_reno_materials: ['Particleboard / MDF furniture'], ps_reno_completion: '1-4 weeks ago',
      ps_reno_reoccupied: '2026-05-18', ps_reno_flushout: 'No',
      ps_complaint_timeline: 'Within 1 month', ps_complaint_pattern: 'Evening / night',
      ps_timeline: [
        { id: 'b', date: '2026-05-20', kind: 'complaints_began', description: 'First complaints' },
        { id: 'a', date: '2026-05-13', kind: 'materials_installed', description: 'Wardrobes installed' },
      ],
    })
    expect(paras[0]).toContain('particleboard / MDF furniture')
    expect(paras[0]).toContain('re-occupied on May 18, 2026')
    expect(paras[0]).toContain('No flush-out ventilation')
    expect(paras[1]).toBe('Complaints began within 1 month and are reported as worst in the evening or night.')
    expect(paras[2]).toMatch(/^Sequence of events as recorded: May 13, 2026 — Wardrobes installed \(materials installed\); May 20, 2026 — First complaints/)
  })
  it('is empty when nothing dated was recorded', () => {
    expect(siteHistoryParagraphs({ ps_reason: 'Routine / scheduled assessment' })).toEqual([])
    expect(siteHistoryParagraphs({})).toEqual([])
  })
})

describe('zone sentences — each record prints, none carries a verdict, and absence prints nothing', () => {
  const zone = DEMO_HCHO_ZONES[0]
  it('source detail cards', () => {
    const lines = sourceDetailLines(zone)
    expect(lines.length).toBe(3)
    expect(lines[0]).toMatch(/^New furniture \/ carpet \/ paint: Particleboard wardrobe/)
    expect(lines[0]).toContain('installed or began May 13, 2026')
    // A ticked source with no card prints nothing.
    expect(sourceDetailLines({ src_internal: ['Space heaters'] })).toEqual([])
  })
  it('checks performed, airflow, logger deployment and its events', () => {
    expect(checksPerformedLines(zone)[0]).toContain('door smoke test: neutral / indeterminate (smoke pencil)')
    expect(airflowLines({ oa_flow_cfm: '85', oc: '2' })).toEqual(['Measured supply / outdoor-air flow: 85 cfm (42.5 cfm per occupant at the recorded count).'])
    expect(airflowLines(zone)).toEqual([])
    const dep = loggerDeploymentLines(zone)[0]
    expect(dep).toContain('S/N LG-2026-0412')
    expect(dep).toContain('at desk / work surface, 1.1 m')
    expect(dep).toContain('from May 25, 2026 00:00 to June 1, 2026 09:30, hourly averages')
    expect(loggerEventLines(zone)[0]).toMatch(/^Events during the logging period: May 25, 2026 18:00 — Kitchenette/)
    expect(loggerDeploymentLines({ logger_deployment: { instrument: 'x' } })).toEqual([])
  })
  it('the interview', () => {
    expect(interviewLines(zone)).toEqual([
      'Onset: within the past month.',
      'Pattern: worst in the evening or night; every day.',
      'Reported at: Throughout the room; strongest near the wardrobe.',
      'Relieved by: leaving the building, opening a window.',
    ])
    expect(interviewLines({ cx: 'No complaints', sy_time: 'Morning' })).toEqual([])
  })
  it('the lines reach zoneObservations / zoneOccupantReports and carry no verdict', () => {
    const obs = zoneObservations(zone)
    const occ = zoneOccupantReports(zone)
    expect(obs.some((l: string) => l.startsWith('Continuous logger:'))).toBe(true)
    expect(obs.some((l: string) => l.startsWith('Checks performed:'))).toBe(true)
    expect(occ.some((l: string) => l.startsWith('Pattern:'))).toBe(true)
    for (const l of [...obs, ...occ]) expect(l, l).not.toMatch(VERDICT)
  })
  it('the role', () => {
    expect(zoneRoleLabel(DEMO_HCHO_ZONES[0])).toBe('Affected area')
    expect(zoneRoleLabel(DEMO_HCHO_ZONES[1])).toBe('Comparison area')
    expect(zoneRoleLabel({})).toBeNull()
  })
})

describe('the render model — where each record lands', () => {
  const model = assembleRenderModel(demoData())

  it('is consistent with itself', () => {
    expect(checkRenderModel(model)).toEqual([])
  })
  it('section 1 carries the site history', () => {
    expect(model.scope.paras.some((p: string) => p.startsWith('Sequence of events as recorded:'))).toBe(true)
    expect(model.scope.paras.some((p: string) => p.includes('re-occupied on May 18, 2026'))).toBe(true)
  })
  it('observations name the role; the results table labels the comparison row', () => {
    expect(model.observations.zones.map((z: any) => z.role)).toEqual(['Affected area', 'Comparison area'])
    const rows = model.results.rows
    expect(rows.find((r: any) => r.id === DEMO_HCHO_ZONES[1].zn).role).toBe('Comparison area')
    expect(rows.find((r: any) => r.id === 'Site mean').role).toBeFalsy()
  })
  it('the conceptual site model states the comparison area and the checks made', () => {
    const rows = model.conceptualModel.rows.map((r: any) => r[0])
    expect(rows).toContain('Comparison area')
    expect(rows).toContain('Checks performed')
    const cmp = model.conceptualModel.rows.find((r: any) => r[0] === 'Comparison area')[1]
    expect(cmp).toContain('Formaldehyde 0.011 ppm')
    expect(cmp).not.toMatch(VERDICT)
    // The comparison row sits before Status, so the status line still closes the table.
    expect(rows.indexOf('Comparison area')).toBeLessThan(rows.indexOf('Status'))
  })
  it('QA/QC carries the logger as an instrument, under its own label', () => {
    const row = model.qaQc.find((q: string) => q.startsWith('Continuous monitoring:'))
    expect(row).toContain('S/N LG-2026-0412')
    expect(model.qaQc.find((q: string) => q.startsWith('Formaldehyde meter:'))).not.toContain('logger')
  })
  it('the sampling plan prints as section 6.1', () => {
    expect(model.sampling.rows.map((r: any) => r.type)).toEqual(['Formaldehyde', 'VOC Speciation'])
    expect(model.sampling.rows[0].method).toMatch(/NIOSH 2016/)
  })
  it('a measured outdoor-air rate removes the ventilation-inferred limitation', () => {
    expect(model.limitations.some((l: string) => /No quantified ventilation-rate/.test(l))).toBe(false)
    const without = assembleRenderModel(demoData({ zones: DEMO_HCHO_ZONES.map((z: any) => ({ ...z, cfm_person: undefined })) }))
    expect(without.limitations.some((l: string) => /No quantified ventilation-rate/.test(l))).toBe(true)
  })
  it('a report without the records reads as before', () => {
    const bare = DEMO_HCHO_ZONES.map((z: any) => {
      const { zone_role, src_detail, zone_checks, logger_deployment, sy_onset, sy_time, sy_days, sy_where, sy_relief, ...rest } = z
      return rest
    })
    const { ps_timeline, ps_reno_materials, ps_reno_reoccupied, ps_reno_flushout, ...ps } = DEMO_HCHO_PRESURVEY
    const m = assembleRenderModel(demoData({ zones: bare, presurvey: ps, samplingPlan: null }))
    expect(m.observations.zones.every((z: any) => z.role === null)).toBe(true)
    expect(m.conceptualModel.rows.map((r: any) => r[0])).not.toContain('Comparison area')
    expect(m.qaQc.some((q: string) => q.startsWith('Continuous monitoring:'))).toBe(false)
    expect(m.sampling).toBeNull()
    expect(m.scope.paras.some((p: string) => p.startsWith('Sequence of events'))).toBe(false)
  })
})

describe('logger captions', () => {
  it('a caption the assessor wrote wins; a missing one is derived from the dataset and the deployment record', () => {
    const sd = buildDemoHchoSensorData()
    const png = 'data:image/png;base64,AAAA'
    sd.graphs.hcho = { ...sd.graphs.hcho, imageDataUrl: png }
    sd.graphs.co2 = { include: true, imageDataUrl: png }
    const model = assembleRenderModel(demoData({ sensorData: sd }))
    const [hcho, co2] = model.loggerImages.images
    expect(hcho.caption).toBe(sd.graphs.hcho.caption)
    expect(co2.caption).toMatch(/^Room 214 \(refurnished — logger location\): 168 hourly readings from May 25, 2026 to May 31, 2026\. CO₂ median 621 ppm, range 510–896 ppm\./)
    expect(co2.caption).toContain('Events during the logging period')
    expect(co2.caption).not.toMatch(VERDICT)
  })
  it('the derived caption names the dataset when no zone records a deployment', () => {
    const sd = buildDemoHchoSensorData()
    const cap = autoLoggerCaption('tvoc', sd, [])
    expect(cap).toMatch(/^Room 214 — indoor: 168 hourly readings/)
    expect(cap).toContain('TVOC median 153 ppb')
    expect(autoLoggerCaption('co', sd, [])).toBeNull()
  })
})

describe('row builders', () => {
  it('comparison and checks rows', () => {
    expect(comparisonRow(DEMO_HCHO_ZONES, REPORT_PARAMETERS)![0]).toBe('Comparison area')
    expect(comparisonRow([DEMO_HCHO_ZONES[0]], REPORT_PARAMETERS)).toBeNull()
    expect(checksRow(DEMO_HCHO_ZONES, DEMO_HCHO_ZONES[0].zn)![1]).toMatch(/^Door smoke test/)
    expect(checksRow(DEMO_HCHO_ZONES, 'nowhere')).toBeNull()
  })
  it('QA/QC rows', () => {
    expect(continuousMonitoringRows(DEMO_HCHO_ZONES)).toHaveLength(1)
    expect(airflowInstrumentRow({}, DEMO_HCHO_ZONES)).toBeNull()
    expect(airflowInstrumentRow({ ps_inst_flow: 'TSI AccuBalance 8380' }, [{ oa_flow_cfm: '90' }])).toEqual({ label: 'Airflow instrument', value: 'TSI AccuBalance 8380' })
    expect(airflowInstrumentRow({}, [{ oa_flow_cfm: '90' }])!.value).toMatch(/no instrument for it is documented/)
  })
  it('sampling section', () => {
    expect(buildSamplingSection(null)).toBeNull()
    expect(buildSamplingSection({ plan: [] })).toBeNull()
    expect(buildSamplingSection({ plan: [{ zone: 'Z', type: 'Formaldehyde', priority: 'high', method: 'NIOSH 2016' }], outdoorGaps: ['x'] })).toMatchObject({ rows: [{ priority: 'High' }], outdoorGaps: ['x'] })
  })
})

describe('the DOCX', () => {
  it('renders the role, the site history, the checks and the confirmatory sampling table', async () => {
    const doc = await buildAtmosFlowDocument(demoData())
    const buf = await Packer.toBuffer(doc)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('6.1 Confirmatory sampling')
    expect(xml).toContain('NIOSH 2016')
    expect(xml).toContain('(comparison area)')
    expect(xml).toContain('Sequence of events as recorded')
    expect(xml).toContain('Continuous monitoring')
    expect(xml).toContain('Checks performed')
  })
})
