/**
 * AtmosFlow DOCX Report — Core Sections
 * Cover, Transparency, Executive Summary, Scope, Building Context, Findings Dashboard
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, SectionType, PageBreak, ImageRun } from 'docx'
import { FONTS, COLORS, SEV_COLORS, scoreColor, riskLabel } from './styles'
import { buildTable, kvTable, borderlessLayoutTable, dataCell, headerCell } from './tables'
import { base64ToUint8Array } from './images'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

const bullet = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: 20, color: opts.color || COLORS.sub })],
  bullet: { level: 0 },
  spacing: { after: 60 },
})

const numbered = (text, idx) => new Paragraph({
  children: [new TextRun({ text: `${idx + 1}. ${text}`, font: FONTS.body, size: 20, color: COLORS.sub })],
  spacing: { after: 60 },
})

export function buildCoverPage(ctx) {
  return {
    properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      p('', { after: 2400 }),
      p('Prudence Safety & Environmental Consulting, LLC', { align: AlignmentType.CENTER, size: 24, bold: true, color: COLORS.text, after: 120 }),
      p('Germantown, Maryland', { align: AlignmentType.CENTER, size: 20, color: COLORS.sub, after: 400 }),
      p('Indoor Air Quality', { align: AlignmentType.CENTER, size: 44, bold: true, color: COLORS.text, after: 40 }),
      p('Assessment Report', { align: AlignmentType.CENTER, size: 44, bold: true, color: COLORS.text, after: 400 }),
      p(`Site: ${ctx.facilityName}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Location: ${ctx.address}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Assessment Date: ${ctx.assessDate}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Report Date: ${ctx.reportDate}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Assessor: ${ctx.assessor}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p(`Report ID: ${ctx.reportId}`, { align: AlignmentType.CENTER, size: 22, color: COLORS.sub, after: 60 }),
      p('Version: 1.0  |  Status: Draft — Pending Professional Review', { align: AlignmentType.CENTER, size: 20, color: COLORS.muted, after: 600 }),
      p('CONFIDENTIAL — FOR CLIENT USE ONLY', { align: AlignmentType.CENTER, size: 18, bold: true, color: COLORS.muted, after: 0 }),
    ],
  }
}

export function buildTransparencyPanel(ctx) {
  return [
    p('Assessment Transparency', { bold: true, size: 20, color: '334155', after: 80 }),
    kvTable([
      ['Workflow version', `AtmosFlow v${ctx.version}`],
      ['Standards referenced', ctx.standardsManifest ? Object.entries(ctx.standardsManifest).filter(([k]) => k !== 'engineVersion' && k !== 'manifestUpdated').map(([k, v]) => `${k} ${v}`).join(', ') : 'See standards manifest'],
      ['Calibration recorded', ctx.calibration],
      ['Professional review', 'Draft — requires IH review before distribution'],
      ['Confidence level', ctx.confidence],
      ['Completeness', `${ctx.completeness}% — ${ctx.zoneCount} zone${ctx.zoneCount !== 1 ? 's' : ''} assessed`],
    ]),
  ]
}

export function buildExecutiveSummary(ctx) {
  const children = [
    p('Executive Summary', { heading: HeadingLevel.HEADING_2 }),
  ]

  if (ctx.comp) {
    // Score summary table
    children.push(buildTable(
      [{ text: 'Metric', width: 50 }, { text: 'Value', width: 50 }],
      [
        ['Composite score', { text: `${ctx.comp.tot}/100`, bold: true, color: scoreColor(ctx.comp.tot) }],
        ['Average zone score', `${ctx.comp.avg}/100`],
        ['Worst zone score', { text: `${ctx.comp.worst}/100`, color: scoreColor(ctx.comp.worst) }],
        ['Zones assessed', `${ctx.comp.count}`],
        ['Confidence', ctx.confidence],
      ]
    ))
    children.push(p('', { after: 120 }))
  }

  // Narrative
  if (ctx.narrative) {
    children.push(p(ctx.narrative, { size: 22, color: COLORS.sub, after: 120 }))
    children.push(p('This narrative was generated from deterministic scoring output and requires professional review before client distribution.', { italics: true, size: 18, color: COLORS.light, after: 120 }))
  } else if (ctx.comp) {
    const worst = ctx.zoneScores?.reduce((a, b) => a.tot < b.tot ? a : b, ctx.zoneScores[0])
    const worstCat = worst?.cats?.reduce((a, b) => (a.s / a.mx) < (b.s / b.mx) ? a : b)

    const hasGate5 = ctx.zoneScores?.some(zs => zs.cats?.some(c => c.gate5))
    const hasSynergistic = ctx.zoneScores?.some(zs => zs.cats?.some(c => c.synergistic))
    const criticalPrefix = hasGate5 ? 'CRITICAL SYSTEM FAILURE: Active moisture/filtration breach detected in HVAC system. ' : hasSynergistic ? 'CRITICAL TOXICITY ALERT: Multiple Tier 1 contaminants exceed OSHA Permissible Exposure Limits. ' : ''

    const p1 = `${criticalPrefix}An indoor air quality assessment was conducted at ${ctx.facilityName} on ${ctx.assessDate}, encompassing ${ctx.zoneCount} zone${ctx.zoneCount !== 1 ? 's' : ''}${ctx.reason ? ` in response to ${ctx.reason.toLowerCase()}` : ''}. The assessment included direct-reading instrument measurements, visual inspection, HVAC system evaluation, and occupant complaint documentation.`

    const riskDesc = ctx.comp.tot >= 70
      ? 'Available evidence supports that conditions observed during the assessment window are broadly consistent with applicable occupancy standards, with localized areas warranting targeted follow-up as noted in the zone findings below.'
      : ctx.comp.tot >= 50
        ? `Conditions observed during the assessment window suggest moderate indoor air quality concerns. The composite score of ${ctx.comp.tot}/100 reflects a weighted evaluation across five categories, with ${worstCat ? `${worstCat.l} (${worstCat.s}/${worstCat.mx}) identified as the primary area of concern` : 'multiple categories showing room for improvement'}.`
        : `Conditions observed during the assessment window indicate significant indoor air quality concerns that would warrant prioritized remediation. The composite score of ${ctx.comp.tot}/100 reflects deficiencies across multiple evaluation categories${worstCat ? `, with ${worstCat.l} (${worstCat.s}/${worstCat.mx}) representing the most acute concern` : ''}.`

    const immRecs = ctx.recs?.imm || []
    const p3 = immRecs.length > 0
      ? `Priority actions include: ${immRecs.slice(0, 3).join('; ')}. Additional engineering and administrative recommendations are detailed in the Recommendations Register.`
      : 'Recommended next steps are detailed in the Recommendations Register and Sampling Plan sections of this report.'

    children.push(p(p1, { size: 22, color: COLORS.sub }))
    children.push(p(riskDesc, { size: 22, color: COLORS.sub }))
    children.push(p(p3, { size: 22, color: COLORS.sub }))
  }

  // Priority actions
  if (ctx.recs) {
    children.push(p('Priority Actions', { heading: HeadingLevel.HEADING_3 }))
    const rows = []
    ;(ctx.recs.imm || []).forEach(r => rows.push([{ text: 'IMMEDIATE', bold: true, color: SEV_COLORS.critical, size: 18 }, r]))
    ;(ctx.recs.eng || []).slice(0, 3).forEach(r => rows.push([{ text: 'ENGINEERING', bold: true, color: COLORS.accent, size: 18 }, r]))
    ;(ctx.recs.adm || []).slice(0, 2).forEach(r => rows.push([{ text: 'ADMINISTRATIVE', bold: true, color: SEV_COLORS.medium, size: 18 }, r]))
    if (rows.length > 0) {
      children.push(buildTable([{ text: 'Priority', width: 20 }, { text: 'Action', width: 80 }], rows))
    }
  }

  return children
}

export function buildScopeMethodology(ctx) {
  const children = [
    p('Scope and Methodology', { heading: HeadingLevel.HEADING_2 }),
    p(`Purpose: This assessment was conducted to evaluate indoor air quality conditions${ctx.reason ? ` in response to ${ctx.reason.toLowerCase()}` : ''} at ${ctx.facilityName}.`, { size: 22, color: COLORS.sub }),
    p(`Areas assessed: ${ctx.zoneNames.join(', ') || 'See zone findings below'}.`, { size: 22, color: COLORS.sub }),
    p('Assessment activities: Visual inspection, real-time direct-reading instrument measurements, occupant complaint documentation, HVAC system evaluation, and moisture/mold screening.', { size: 22, color: COLORS.sub }),
    p('Instrumentation', { heading: HeadingLevel.HEADING_3 }),
  ]

  const instRows = [[ctx.instrument || 'IAQ meter', ctx.instrumentSerial || '—', ctx.calibration]]
  if (ctx.pidMeter) instRows.push([ctx.pidMeter, '—', ctx.pidCal || '—'])
  children.push(buildTable(
    [{ text: 'Instrument', width: 40 }, { text: 'Identifier', width: 30 }, { text: 'Calibration', width: 30 }],
    instRows
  ))

  children.push(p('Standards and References', { heading: HeadingLevel.HEADING_3 }))
  const stdsText = ctx.standardsManifest ? Object.entries(ctx.standardsManifest).filter(([k]) => k !== 'engineVersion' && k !== 'manifestUpdated').map(([k, v]) => `${k} (${v})`).join(', ') : 'ASHRAE 62.1, ASHRAE 55, OSHA PELs, EPA NAAQS, WHO Air Quality Guidelines'
  children.push(p(stdsText + '.', { size: 20, color: COLORS.sub }))

  children.push(p('Limitations', { heading: HeadingLevel.HEADING_3 }))
  children.push(p('This assessment represents conditions observed at the time of the site visit and may not reflect all temporal, seasonal, or operational variations. Findings are based on direct-reading instrumentation and visual observations. Laboratory analysis was not performed unless specifically noted.', { size: 20, color: COLORS.sub }))

  return children
}

export function buildBuildingContext(ctx) {
  const bldg = ctx.building
  const pre = ctx.presurvey
  const children = [
    p('Building and Complaint Context', { heading: HeadingLevel.HEADING_2 }),
    p(`${ctx.facilityName} is a ${(bldg.ft || 'commercial').toLowerCase()} facility${bldg.ba ? ` constructed in approximately ${bldg.ba}` : ''}${bldg.rn ? `, with renovations reported ${bldg.rn.toLowerCase()}` : ''}. The building is served by ${bldg.ht ? `a ${bldg.ht.toLowerCase()} system` : 'mechanical ventilation'}${bldg.hm ? `, with last reported HVAC maintenance ${bldg.hm.toLowerCase()}` : ''}. ${pre?.ps_complaint_narrative ? 'Occupant concerns were reported prior to this assessment, as summarized below.' : 'No formal occupant complaints were reported prior to this assessment.'}`, { size: 22, color: COLORS.sub }),
  ]

  const pairs = [
    ['Building type', bldg.ft || '—'],
    ['Year built / renovated', `${bldg.ba || '—'}${bldg.rn ? ` (last renovated: ${bldg.rn})` : ''}`],
    ['HVAC system', bldg.ht || '—'],
    ['Last HVAC maintenance', bldg.hm || '—'],
    ['Filter type / condition', `${bldg.fm || '—'} / ${bldg.fc || '—'}`],
    ['Outside air damper', bldg.od || '—'],
    ['Supply airflow', bldg.sa || '—'],
    ['Building pressure', bldg.bld_pressure || '—'],
  ]
  if (pre?.ps_complaint_narrative) pairs.push(['Reported concerns', pre.ps_complaint_narrative])
  if (pre?.ps_water_history === 'Yes — recurring') pairs.push(['Water/moisture history', pre.ps_water_detail || 'Recurring water intrusion reported'])
  children.push(kvTable(pairs))

  return children
}

export function buildFindingsDashboard(ctx) {
  if (!ctx.comp) return []
  const children = [
    p('Overall Findings Dashboard', { heading: HeadingLevel.HEADING_2 }),
  ]

  // Score cards as table
  children.push(buildTable(
    [{ text: 'Composite', align: AlignmentType.CENTER }, { text: 'Average', align: AlignmentType.CENTER }, { text: 'Worst Zone', align: AlignmentType.CENTER }],
    [[
      { text: `${ctx.comp.tot}`, bold: true, size: 36, color: scoreColor(ctx.comp.tot), align: AlignmentType.CENTER },
      { text: `${ctx.comp.avg}`, bold: true, size: 36, color: scoreColor(ctx.comp.avg), align: AlignmentType.CENTER },
      { text: `${ctx.comp.worst}`, bold: true, size: 36, color: scoreColor(ctx.comp.worst), align: AlignmentType.CENTER },
    ]]
  ))

  const desc = ctx.comp.tot >= 70
    ? 'overall acceptable indoor air quality, with localized areas that may warrant targeted follow-up as detailed in the zone sections below.'
    : ctx.comp.tot >= 50
      ? 'moderate indoor air quality concerns across one or more zones. Targeted investigation and corrective action would be warranted in the areas identified below.'
      : 'significant indoor air quality concerns that would warrant prioritized remediation as detailed in the zone sections and recommendations register below.'

  children.push(p(`Conditions observed during the assessment window suggest ${desc} The composite score of ${ctx.comp.tot}/100 reflects a weighted evaluation across ventilation, contaminant levels, HVAC system conditions, occupant complaints, and environmental factors.`, { size: 22, color: COLORS.sub }))

  return children
}

export function buildTransmittalLetter(ctx) {
  return [
    p(ctx.reportDate, { size: 22, color: COLORS.body, after: 200 }),
    p(ctx.facilityName, { size: 22, bold: true, color: COLORS.text, after: 40 }),
    p(ctx.address, { size: 22, color: COLORS.body, after: 200 }),
    p('Re: Indoor Air Quality Assessment Report', { size: 22, bold: true, color: COLORS.text, after: 200 }),
    p(`Prudence Safety & Environmental Consulting, LLC ("PSEC") was retained to conduct an indoor air quality assessment at ${ctx.facilityName}. This report presents the findings, analysis, and recommendations resulting from our assessment conducted on ${ctx.assessDate}.`, { size: 22, color: COLORS.body }),
    p('The assessment was performed using direct-reading instrumentation, visual inspection, and structured data collection following our deterministic scoring methodology. Findings are referenced against published ASHRAE, OSHA, NIOSH, EPA, and WHO standards as applicable.', { size: 22, color: COLORS.body }),
    p('This report is intended for the sole use of the addressee and should not be distributed to third parties without written authorization from PSEC. The conclusions and recommendations contained herein are based on conditions observed at the time of assessment and should be interpreted in context with professional judgment.', { size: 22, color: COLORS.body }),
    p('Please do not hesitate to contact our office should you have questions regarding this report or require additional consultation.', { size: 22, color: COLORS.body, after: 300 }),
    p('Respectfully submitted,', { size: 22, color: COLORS.body, after: 200 }),
    p('Tsidi Tamakloe, CSP', { size: 22, bold: true, color: COLORS.text, after: 40 }),
    p('BCSP #38426', { size: 20, color: COLORS.sub, after: 40 }),
    p('NYSDOL Mold Assessor | NYSDOL Asbestos Inspector', { size: 20, color: COLORS.sub, after: 40 }),
    p('Prudence Safety & Environmental Consulting, LLC', { size: 20, color: COLORS.sub, after: 40 }),
    p('support@prudenceehs.com | 1-(301)-541-8362', { size: 20, color: COLORS.sub }),
  ]
}

export function buildTableOfContents(ctx) {
  const sections = [
    'Executive Summary',
    'Scope and Methodology',
    'Building and Complaint Context',
    'Overall Findings Dashboard',
    'Zone-by-Zone Findings',
  ]
  if (ctx.causalChains?.length > 0) sections.push('Causal Chain Analysis')
  if (ctx.samplingPlan?.plan?.length > 0) sections.push('Recommended Sampling Plan')
  sections.push('Recommendations Register')
  sections.push('Limitations and Professional Judgment')
  sections.push('Appendix A — Raw Measurement Snapshot')
  sections.push('Appendix B — Transparent Scoring Summary')

  const children = [
    p('Table of Contents', { heading: HeadingLevel.HEADING_2 }),
  ]
  sections.forEach((s, i) => {
    children.push(p(`${i + 1}.  ${s}`, { size: 22, color: COLORS.body, after: 60 }))
  })
  return children
}
