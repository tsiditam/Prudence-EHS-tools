/**
 * AtmosFlow DOCX Report — Sampling Plan, Recommendations, Limitations
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS, SEV_COLORS } from './styles'
import { buildTable } from './tables'

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || COLORS.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

const bullet = (text) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: 20, color: COLORS.sub })],
  bullet: { level: 0 },
  spacing: { after: 60 },
})

const priorityColor = (pri) => {
  const p = (pri || '').toLowerCase()
  if (p === 'critical') return SEV_COLORS.critical
  if (p === 'high') return SEV_COLORS.high
  return SEV_COLORS.medium
}

export function buildSamplingPlan(ctx) {
  if (!ctx.samplingPlan?.plan?.length) return []

  const children = [
    p('Recommended Sampling Plan', { heading: HeadingLevel.HEADING_2 }),
    p('The following sampling recommendations are based on field observations and direct-reading instrument data obtained during this assessment. They are intended to support further investigation where indicated and should be reviewed by a qualified professional prior to implementation.', { size: 20, color: COLORS.sub, after: 160 }),
  ]

  const rows = ctx.samplingPlan.plan.map(sp => [
    { text: sp.type, bold: true },
    { text: sp.zone, color: COLORS.accent, mono: true, size: 18 },
    { text: (sp.priority || '').toUpperCase(), bold: true, color: priorityColor(sp.priority), size: 16 },
    sp.method,
    { text: sp.standard, mono: true, size: 16, color: COLORS.muted },
  ])

  children.push(buildTable(
    [{ text: 'Type', width: 18 }, { text: 'Zone', width: 15 }, { text: 'Priority', width: 10 }, { text: 'Method', width: 37 }, { text: 'Reference', width: 20 }],
    rows
  ))

  if (ctx.samplingPlan.outdoorGaps?.length > 0) {
    children.push(p('', { after: 80 }))
    children.push(p(`Outdoor control gaps identified: ${ctx.samplingPlan.outdoorGaps.join('; ')}. Outdoor baseline samples are recommended to establish indoor/outdoor ratios for defensible interpretation.`, { bold: true, size: 20, color: SEV_COLORS.critical }))
  }

  return children
}

/**
 * Parse a legacy genRecs() string into a structured location +
 * action pair. genRecs prefixes most zone-scoped recommendations
 * with "ZoneName: action text"; building-scoped recs (HVAC requests)
 * have no prefix. Returns { location, action } for the renderer.
 *
 * Engine v2.7 Fix 3 — location field on Recommendation. Every
 * Immediate-priority recommendation must populate at least one of
 * zone / system / surface_or_asset / free_text. The legacy renderer
 * derives location by parsing the prefixed string; the v2.x bridge
 * (src/engine/bridge/legacy.ts) propagates location structurally
 * onto RecommendedAction objects.
 */
export function parseRecLocation(text) {
  if (!text || typeof text !== 'string') return { location: 'Building-wide', action: text || '' }
  const m = text.match(/^([^:]{2,80}):\s+(.+)$/s)
  if (m) {
    const zone = m[1].trim()
    // Skip the prefix-extraction when the colon is part of an
    // abbreviation rather than a zone label (e.g. "29 CFR 1910.1048:
    // implement controls"). Citation-shaped pattern is "digits +
    // whitespace + uppercase abbrev" (matches "29 CFR", rejects
    // "3rd Floor East" because there's no whitespace after the digit).
    // All-caps prefix (≥3 chars) is also treated as a citation.
    const looksLikeCitation = /^\d+\s+[A-Z]{2,}/.test(zone) || /^[A-Z0-9 ]{3,}$/.test(zone)
    if (looksLikeCitation) {
      return { location: 'Building-wide', action: text }
    }
    return { location: zone, action: m[2].trim() }
  }
  // Building-scoped recommendation (no zone prefix). HVAC service
  // requests and similar fall here.
  if (/HVAC|filtration|ventilation|outdoor air|damper/i.test(text)) {
    return { location: 'HVAC system', action: text }
  }
  return { location: 'Building-wide', action: text }
}

export function buildRecommendations(ctx) {
  if (!ctx.recs) return []

  const children = [
    p('Recommendations Register', { heading: HeadingLevel.HEADING_2 }),
  ]

  const allRecs = []
  let idx = 0
  const add = (list, priority, category, timing, color) => {
    ;(list || []).forEach(r => {
      idx++
      const parsed = parseRecLocation(r)
      allRecs.push([
        { text: `R-${String(idx).padStart(2, '0')}`, mono: true, size: 18, color: COLORS.muted },
        { text: priority.toUpperCase(), bold: true, color, size: 16 },
        { text: category, size: 18, color: COLORS.sub },
        parsed.action,
        { text: parsed.location, size: 18, color: COLORS.sub, italics: true },
        { text: timing, mono: true, size: 18, color: COLORS.muted },
        // Owner / Due / Completion intentionally empty —
        // recipients fill them in. Column structure preserved in
        // both DOCX and PDF outputs.
        { text: '', size: 18, color: COLORS.muted },
        { text: '', size: 18, color: COLORS.muted },
        { text: '', size: 18, color: COLORS.muted },
      ])
    })
  }

  add(ctx.recs.imm, 'Immediate', 'Emergency', '0–48 hrs', SEV_COLORS.critical)
  add(ctx.recs.eng, 'High', 'Engineering', '1–4 weeks', COLORS.accent)
  add(ctx.recs.adm, 'Medium', 'Administrative', '1–3 months', SEV_COLORS.medium)
  add(ctx.recs.mon, 'Low', 'Monitoring', 'Ongoing', COLORS.sub)

  if (allRecs.length > 0) {
    children.push(buildTable(
      [
        { text: '#', width: 5 },
        { text: 'Priority', width: 9 },
        { text: 'Category', width: 11 },
        { text: 'Recommendation', width: 26 },
        { text: 'Location', width: 14 },
        { text: 'Timing', width: 11 },
        { text: 'Owner', width: 8 },
        { text: 'Due', width: 8 },
        { text: 'Completion', width: 8 },
      ],
      allRecs
    ))
  }

  return children
}

export function buildLimitations(ctx) {
  const children = [
    p('Limitations and Professional Judgment', { heading: HeadingLevel.HEADING_2 }),
    p('This report represents conditions observed during a single assessment event and may not reflect all temporal, seasonal, or operational variations in indoor air quality. The following limitations should be considered when interpreting findings:', { size: 22, color: COLORS.sub }),
  ]

  const items = [
    'Measurements were obtained using direct-reading instruments and represent point-in-time conditions at the locations sampled. Results are directional and may not represent worst-case or typical conditions.',
    'Areas not accessible during the assessment may present additional conditions not reflected in this report.',
    'HVAC system performance may vary with occupancy load, weather conditions, and operational changes. Ventilation adequacy should be confirmed under peak-occupancy conditions.',
    'Deterministic scoring is applied against published standards; professional judgment should be exercised in interpretation. Scores reflect a structured snapshot, not a comprehensive compliance determination.',
    'Causal pathways identified in this report are based on correlation of observed conditions and available evidence. They do not constitute confirmed root-cause determinations and would warrant targeted follow-up investigation where noted.',
  ]

  if (ctx.oshaResult?.gaps?.length > 0) {
    items.push(`Data gaps identified: ${ctx.oshaResult.gaps.join(', ')}. These gaps may affect the confidence of certain findings and should be addressed in follow-up assessment activities.`)
  }

  items.forEach(item => children.push(bullet(item)))

  children.push(p('Targeted follow-up assessment is recommended to confirm findings, evaluate the effectiveness of any corrective actions implemented, and address identified data gaps. This report is intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.', { size: 22, color: COLORS.sub, after: 200 }))

  return children
}
