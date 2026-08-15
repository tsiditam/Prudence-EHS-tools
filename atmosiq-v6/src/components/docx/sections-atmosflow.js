/**
 * AtmosFlow DOCX — Indoor Air Quality Assessment Report.
 *
 * A consultant-facing ASSESSMENT deliverable rendered in the Logger Studio /
 * monitoring report's visual system. It reuses the exact design builders from
 * `sections-monitoring.js` (Open Sans document defaults, the numbered section
 * heading, the meta grid, the KPI summary strip, the insights panel, the data
 * table, the accent callout) so it reads as a sibling of the monitoring
 * report — but the CONTENT is the engine ClientReport model (the same model the
 * consultant DOCX renders), not logger data.
 *
 * This module decides only how the assessment report looks. WHAT it says —
 * every observation, finding, recommendation and limitation — is authored by
 * the engine and arrives here as the ClientReport `report` object. This file
 * never rewords engine prose; it only places it.
 *
 * Editorial suppressions (human-approved cuts from the editorial-review pass)
 * are honored exactly as `sections-v21client.js` honors them: a suppressed
 * finding, recommendation or results subsection is omitted from the render.
 */

import { Paragraph, TextRun } from 'docx'
import {
  buildCoverSection,
  sectionHeading,
  dataTable,
  summaryStripTable,
  insightsPanel,
  metaGrid,
  calloutPanel,
  p,
  INK,
  BODY,
  MUTED,
  ACCENT,
  TYPE,
  FONT_SANS,
} from './sections-monitoring'
import { makeSuppressionIndex } from '../../utils/editorialSuppressions'

const PRIORITY_LABEL = {
  immediate: 'Immediate',
  short_term: 'Short term',
  further_evaluation: 'Further evaluation',
  long_term: 'Long term',
}

/**
 * Format an ISO date (YYYY-MM-DD) as long-form English. Returns the input
 * unchanged if it does not parse — same tolerant behaviour as the consultant
 * builder, so the two agree on how a date reads.
 */
function formatLongDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** One-line action label: "Immediate (24h): Do the thing — Standard §x". */
function actionLine(action) {
  const priority = PRIORITY_LABEL[action.priority] || action.priority
  const std = action.standardReference ? ` — ${action.standardReference}` : ''
  return `${priority} (${action.timeframe}): ${action.action}${std}`
}

/**
 * A sub-heading inside a numbered section (a results parameter, a zone name).
 * Set in the ink colour and SemiBold-ish weight, a step below `sectionHeading`,
 * so the section's internal structure reads without another numbered rule.
 */
function subHeading(text) {
  return p(text, { bold: true, size: TYPE.paramName, color: INK, after: 80, keepNext: true, keepLines: true })
}

/** A short "Label: value" run — the observed-value line under a finding. */
function labelledLine(label, value) {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label} `, bold: true, size: TYPE.small, color: INK, font: FONT_SANS }),
      new TextRun({ text: String(value ?? ''), size: TYPE.small, color: BODY, font: FONT_SANS }),
    ],
    spacing: { after: 90, line: Math.round(1.22 * 240) },
  })
}

// ── Cover ──────────────────────────────────────────────────────────────────

/**
 * The cover. Reuses the monitoring `buildCoverSection` for the hero — the
 * accent rule, the "INDOOR AIR QUALITY" eyebrow, the big title, and the
 * property line — so the assessment report opens on exactly the monitoring
 * look. The cover model is passed WITHOUT the monitoring meta facts
 * (preparedFor / reportDate / parameters), so `buildCoverSection` renders no
 * meta grid of its own; the assessment's own labelled facts follow in the body
 * (`coverMetaGrid`), giving the assessment-specific labels the monitoring
 * cover's fixed set cannot express (Assessment date, Assessor, Report ID).
 */
function coverModel(report) {
  const cov = report.cover || {}
  const meta = report.meta || {}
  return {
    title: 'Indoor Air Quality Assessment Report',
    cover: {
      site: cov.facility || meta.siteName || '',
      address: cov.location || meta.siteAddress || '',
    },
  }
}

/** Report ID — mirrors the consultant Document-Control derivation. */
function reportId(report) {
  return `RPT-${Number(report.generatedAt || Date.now()).toString(36).toUpperCase()}`
}

/** Assessor display line: name + credentials. */
function assessorLine(report) {
  const sig = report.signatoryBlock || {}
  const meta = report.meta || {}
  if (sig.preparedBy && sig.preparedBy.name) {
    return sig.preparedBy.credentials
      ? `${sig.preparedBy.name}, ${sig.preparedBy.credentials}`
      : sig.preparedBy.name
  }
  const pa = meta.preparingAssessor
  if (pa && pa.fullName) {
    const creds = Array.isArray(pa.credentials) ? pa.credentials.join(', ') : pa.credentials
    return creds ? `${pa.fullName}, ${creds}` : pa.fullName
  }
  return '—'
}

/** Client / recipient display line. */
function preparedForLine(report) {
  const meta = report.meta || {}
  const r = meta.transmittalRecipient || {}
  return r.organization || r.fullName || report.cover?.facility || meta.siteName || '—'
}

/**
 * The cover's meta grid, in the assessment's own labels: Assessment date /
 * Assessor / Report ID / Prepared for. Built with the monitoring `metaGrid`
 * primitive so it matches the monitoring cover's label/value treatment exactly.
 */
function coverMetaGrid(report) {
  const meta = report.meta || {}
  const facts = [
    { label: 'Assessment date', value: formatLongDate(meta.assessmentDate) || report.cover?.date },
    { label: 'Assessor', value: assessorLine(report) },
    { label: 'Report ID', value: reportId(report) },
    { label: 'Prepared for', value: preparedForLine(report) },
  ].filter((f) => f.value)
  const grid = metaGrid(facts, 2)
  return grid ? [grid, p('', { after: 60 })] : []
}

// ── Sections ─────────────────────────────────────────────────────────────────

/** Executive summary: opinion callout, key observations, top recommendations. */
function buildExecutiveSummary(report, num, suppress) {
  const summary = report.executiveSummary || {}
  const out = [sectionHeading(num, 'Executive Summary')]

  if (summary.overallProfessionalOpinionLanguage) {
    const callout = calloutPanel(summary.overallProfessionalOpinionLanguage)
    if (callout) {
      out.push(callout)
      out.push(p('', { after: 100 }))
    }
  }

  // Key observations render through the monitoring insights panel (accent left
  // rule, "KEY OBSERVATIONS" eyebrow). Prefer the consolidated summaryOfFindings
  // when present; fall back to the plain observations list.
  const obsSource = (summary.summaryOfFindings && summary.summaryOfFindings.length > 0)
    ? summary.summaryOfFindings
    : (summary.observations || [])
  const items = obsSource.map((text) => ({ text: String(text || '') })).filter((i) => i.text)
  const panel = insightsPanel(items)
  if (panel) {
    out.push(panel)
    out.push(p('', { after: 100 }))
  }

  // Top recommendations — honour editorial cuts on the highlight list, exactly
  // as the consultant exec summary does.
  const recs = (summary.recommendations || []).filter(
    (a) => !(suppress && suppress.has({ kind: 'recommendation', priority: a.priority, action: a.action })),
  )
  if (recs.length > 0) {
    out.push(p('Priority recommendations', { bold: true, size: TYPE.small, color: INK, after: 70 }))
    for (const a of recs.slice(0, 6)) {
      out.push(new Paragraph({
        children: [
          new TextRun({ text: '▪  ', bold: true, size: TYPE.label, color: ACCENT, font: FONT_SANS }),
          new TextRun({ text: actionLine(a), size: TYPE.small, color: BODY, font: FONT_SANS }),
        ],
        indent: { left: 260, hanging: 260 },
        spacing: { after: 80 },
      }))
    }
  }
  return out
}

/** A KPI strip of headline assessment metrics, derived from the model. */
function buildKpiStrip(report, num, suppress) {
  const zones = report.zoneSections || []
  const visibleZones = zones.filter((z) => !(suppress && suppress.has({ kind: 'zone', zoneId: z.zoneId })))
  const findingCount = visibleZones.reduce((n, z) => {
    const fs = (z.findings || []).filter(
      (f) => !(suppress && suppress.has({ kind: 'finding', findingId: f.findingId })),
    )
    return n + fs.length
  }, 0)
  const parameters = (report.resultsSection?.subsections || []).filter(
    (s) => !(suppress && suppress.has({ kind: 'resultsSubsection', heading: s.heading })),
  ).length

  const tiles = [
    { label: 'Zones assessed', value: String(visibleZones.length) },
    { label: 'Findings', value: String(findingCount) },
    { label: 'Parameters measured', value: String(parameters) },
  ]
  const strip = summaryStripTable(tiles, { bottomBorder: false })
  if (!strip) return null
  return [sectionHeading(num, 'Assessment at a glance'), strip, p('', { after: 120 })]
}

/** Results — per-parameter standards-anchored measurement summaries. */
function buildResults(report, num, suppress) {
  const r = report.resultsSection
  const subs = (r && Array.isArray(r.subsections)) ? r.subsections : []
  if (subs.length === 0) return null
  const body = []
  for (const sub of subs) {
    if (suppress && suppress.has({ kind: 'resultsSubsection', heading: sub.heading })) continue
    body.push(subHeading(sub.heading))
    if (sub.measurementSummary) body.push(p(sub.measurementSummary, { size: TYPE.small, after: 120 }))
  }
  if (body.length === 0) return null
  return [sectionHeading(num, r.title || 'Results'), ...body]
}

/** Findings & interpretation — per zone. */
function buildFindings(report, num, suppress) {
  const zones = report.zoneSections || []
  if (zones.length === 0) return null
  const body = []
  let rendered = 0
  for (const zone of zones) {
    if (suppress && suppress.has({ kind: 'zone', zoneId: zone.zoneId })) continue
    rendered += 1
    body.push(subHeading(zone.zoneName))
    if (zone.zoneDescription) body.push(p(zone.zoneDescription, { size: TYPE.small, after: 80 }))
    if (zone.samplingSummary) body.push(p(zone.samplingSummary, { italics: true, size: TYPE.fine, color: MUTED, after: 100 }))

    const findings = (zone.findings || []).filter(
      (f) => !(suppress && suppress.has({ kind: 'finding', findingId: f.findingId })),
    )
    if (findings.length === 0) {
      body.push(p(
        'No conditions warranting elevated concern were identified in this zone within the stated limitations.',
        { size: TYPE.small, after: 120 },
      ))
      continue
    }
    for (const f of findings) {
      if (f.narrative) body.push(p(f.narrative, { size: TYPE.small, after: f.observedValue ? 60 : 120 }))
      if (f.observedValue) body.push(labelledLine('Observed:', f.observedValue))
    }
    if (zone.interpretation) {
      body.push(p('Interpretation', { bold: true, size: TYPE.fine, color: MUTED, after: 50 }))
      body.push(p(zone.interpretation, { size: TYPE.small, after: 140 }))
    }
  }
  if (rendered === 0) return null
  return [sectionHeading(num, 'Findings & Interpretation'), ...body]
}

/** Recommendations — a flat data table of the register (Priority/Timeframe/Action). */
function buildRecommendations(report, num, suppress) {
  const reg = report.recommendationsRegister || {}
  const groups = [
    ['immediate', reg.immediate],
    ['short_term', reg.shortTerm],
    ['further_evaluation', reg.furtherEvaluation],
    ['long_term', reg.longTermOptional],
  ]
  const rows = []
  for (const [priority, list] of groups) {
    for (const a of list || []) {
      if (suppress && suppress.has({ kind: 'recommendation', priority: a.priority, action: a.action })) continue
      rows.push([
        { text: PRIORITY_LABEL[a.priority] || a.priority, bold: true },
        { text: a.timeframe || '—' },
        { text: a.action || '—' },
        { text: a.standardReference || '—', muted: true },
      ])
    }
  }
  if (rows.length === 0) return null
  return [
    sectionHeading(num, 'Recommendations'),
    dataTable(['Priority', 'Timeframe', 'Recommended action', 'Reference'], rows, [16, 16, 48, 20]),
    p('', { after: 120 }),
  ]
}

/** Limitations — the engine's professional-judgment prose, verbatim. */
function buildLimitations(report, num) {
  const text = report.limitationsAndProfessionalJudgment
  if (!text) return null
  return [sectionHeading(num, 'Limitations'), p(text, { size: TYPE.small, after: 120 })]
}

/** Signatory — prepared by / reviewed by, in the monitoring meta-grid look. */
function buildSignatory(report, num) {
  const sig = report.signatoryBlock
  if (!sig) return null
  const facts = [
    { label: 'Prepared by', value: assessorLine(report) },
    { label: 'Firm', value: sig.preparedBy?.firm || report.meta?.issuingFirm?.name || '' },
    { label: 'Contact', value: sig.preparedBy?.contact || '' },
  ]
  if (sig.reviewedBy && sig.reviewedBy.name) {
    facts.push({
      label: 'Reviewed by',
      value: sig.reviewedBy.credentials ? `${sig.reviewedBy.name}, ${sig.reviewedBy.credentials}` : sig.reviewedBy.name,
    })
  }
  const grid = metaGrid(facts.filter((f) => f.value), 2)
  const out = [sectionHeading(num, 'Signatory')]
  if (grid) out.push(grid)
  if (sig.status) out.push(p(`Status: ${sig.status}`, { italics: true, size: TYPE.fine, color: MUTED, before: 80 }))
  return out
}

/**
 * The whole assessment report, flattened into the paragraph/table list a
 * Document section consumes. Cover first (unnumbered), then the body sections
 * numbered AFTER omission so the sequence is always unbroken.
 *
 * @param {object} report  the engine ClientReport `report` object
 * @param {object} [options]
 * @param {object} [options.editorialSuppressions] human-approved cuts to honor
 * @returns {import('docx').Paragraph[]} the section children
 */
export function atmosFlowReportChildren(report, options = {}) {
  if (!report) return []
  const suppress = makeSuppressionIndex(options.editorialSuppressions)

  const out = []
  // Cover — reuse the monitoring hero, then the assessment's own meta grid.
  const cover = buildCoverSection(coverModel(report))
  out.push(...(cover.children || []))
  out.push(...coverMetaGrid(report))

  // Numbered body sections. Deferred so a number is consumed only by a section
  // that actually renders content.
  const builders = [
    (n) => buildExecutiveSummary(report, n, suppress),
    (n) => buildKpiStrip(report, n, suppress),
    (n) => buildResults(report, n, suppress),
    (n) => buildFindings(report, n, suppress),
    (n) => buildRecommendations(report, n, suppress),
    (n) => buildLimitations(report, n),
    (n) => buildSignatory(report, n),
  ]

  let num = 0
  for (const make of builders) {
    const children = make(num + 1)
    if (children && children.length) {
      num += 1
      out.push(...children)
    }
  }
  return out
}
