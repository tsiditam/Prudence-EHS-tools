/**
 * AtmosFlow DOCX Report — Zone Sections
 * Zone-by-zone findings with observations, photos, parameters, interpretation
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } from 'docx'
import { FONTS, COLORS, SEV_COLORS, scoreColor } from './styles'
import { buildTable, headerCell, dataCell } from './tables'
import { base64ToUint8Array } from './images'

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

// Rotate opening phrases to avoid repetition across zones
const INTERP_OPENERS = [
  (risk, score) => `Conditions observed in this zone are consistent with a ${risk.toLowerCase()} assessment (${score}/100).`,
  (risk, score) => `Assessment of this zone indicates a ${risk.toLowerCase()} condition, with a composite zone score of ${score}/100.`,
  (risk, score) => `Field observations and measurements in this zone reflect ${risk.toLowerCase()} indoor air quality conditions (${score}/100).`,
  (risk, score) => `The evaluation of this zone yields a score of ${score}/100, characteristic of ${risk.toLowerCase()} conditions.`,
  (risk, score) => `Conditions documented during the walkthrough of this zone are consistent with a ${risk.toLowerCase()} classification (${score}/100).`,
]

const CONTRIB_PHRASES = [
  (cat, s, mx, pct) => `The primary contributing category is ${cat} (${s}/${mx}, ${pct}%),`,
  (cat, s, mx, pct) => `${cat} (${s}/${mx}, ${pct}%) is the most significant contributing factor,`,
  (cat, s, mx, pct) => `The category of greatest concern is ${cat}, scoring ${s}/${mx} (${pct}%),`,
  (cat, s, mx, pct) => `${cat} represents the primary area of concern at ${s}/${mx} (${pct}%),`,
]

export function buildZoneHeader(ctx) {
  return [p('Zone-by-Zone Findings', { heading: HeadingLevel.HEADING_2 })]
}

export function buildZoneSection(ctx, zi) {
  const zs = ctx.zoneScores[zi]
  const z = ctx.zones[zi] || {}
  if (!zs) return []

  const children = []

  // Zone title + score
  children.push(new Paragraph({
    children: [
      new TextRun({ text: zs.zoneName || `Zone ${zi + 1}`, font: FONTS.body, size: 28, bold: true, color: COLORS.text }),
      new TextRun({ text: zs.tot !== null ? `    ${zs.tot}/100 — ${zs.risk}` : '    Not scored — insufficient data', font: FONTS.body, size: 22, bold: true, color: zs.tot !== null ? scoreColor(zs.tot) : COLORS.muted }),
    ],
    spacing: { before: 300, after: 60 },
  }))

  // Zone metadata
  const meta = [z.zt, z.zo ? `${z.zo} occupants` : '', z.za ? `${z.za} sq ft` : ''].filter(Boolean).join(' · ')
  if (meta) children.push(p(meta, { size: 18, color: COLORS.muted, after: 160 }))

  // Observations
  const obs = []
  if (z.zc === 'Yes') obs.push(`Occupant complaints reported${z.zca ? ` (${z.zca} affected)` : ''}${z.zcs ? `: ${Array.isArray(z.zcs) ? z.zcs.join(', ') : z.zcs}` : ''}`)
  if (z.wd && z.wd !== 'None observed' && z.wd !== 'None') obs.push(`Water damage observed: ${z.wd}${z.wdl ? ` (${z.wdl})` : ''}`)
  if (z.mi && z.mi !== 'None observed' && z.mi !== 'None') obs.push(`Mold indicators: ${z.mi}${z.mie ? ` — ${z.mie}` : ''}`)
  if (z.od && z.od !== 'None') obs.push(`Odor noted: ${z.od}${z.odi ? ` (${z.odi})` : ''}`)
  if (z.src_int) obs.push(`Interior sources identified: ${Array.isArray(z.src_int) ? z.src_int.join(', ') : z.src_int}`)

  if (obs.length > 0) {
    children.push(p('Observations', { heading: HeadingLevel.HEADING_3 }))
    obs.forEach(o => children.push(bullet(o)))
  }

  // Photos
  const zonePhotos = []
  if (ctx.photos) {
    Object.keys(ctx.photos).forEach(key => {
      if (key.startsWith(`z${zi}-`)) {
        const fieldId = key.replace(`z${zi}-`, '')
        const fieldLabels = { dp: 'Condensate drain pan', wd: 'Water damage', mi: 'Mold indicators' }
        ;(ctx.photos[key] || []).forEach(ph => {
          if (ph && ph.src) zonePhotos.push({ src: ph.src, label: fieldLabels[fieldId] || fieldId, ts: ph.ts })
        })
      }
    })
  }

  if (zonePhotos.length > 0) {
    children.push(p('Photo Documentation', { heading: HeadingLevel.HEADING_3 }))
    zonePhotos.forEach(ph => {
      try {
        const imgData = base64ToUint8Array(ph.src)
        children.push(new Paragraph({
          children: [new ImageRun({ data: imgData, transformation: { width: 180, height: 130 }, type: 'jpg' })],
          spacing: { after: 40 },
        }))
        children.push(p(`${ph.label}${ph.ts ? ` · ${new Date(ph.ts).toLocaleTimeString()}` : ''}`, { size: 16, color: COLORS.muted, after: 120 }))
      } catch (e) {
        children.push(p(`[Photo: ${ph.label}]`, { size: 18, color: COLORS.muted, italics: true }))
      }
    })
  }

  // Parameter results
  const hasData = z.co2 || z.tf || z.rh || z.pm || z.co || z.tv || z.hc || z.gaseous_corrosion || z.dp_temp || z.iso_class || z.h2_monitoring || z.exhaust_cfm_sqft
  if (hasData) {
    children.push(p('Parameter Results', { heading: HeadingLevel.HEADING_3 }))
    const paramRows = []
    if (z.co2) paramRows.push(['CO₂', { text: `${z.co2} ppm`, mono: true }, { text: `${z.co2o || '—'} ppm`, mono: true, color: COLORS.muted }, 'Δ700 ppm (ASHRAE 62.1)'])
    if (z.tf) paramRows.push(['Temperature', { text: `${z.tf}°F`, mono: true }, { text: `${z.tfo || '—'}°F`, mono: true, color: COLORS.muted }, '68–79°F (ASHRAE 55)'])
    if (z.rh) paramRows.push(['Relative Humidity', { text: `${z.rh}%`, mono: true }, { text: `${z.rho || '—'}%`, mono: true, color: COLORS.muted }, '30–60%'])
    if (z.pm) paramRows.push(['PM2.5', { text: `${z.pm} µg/m³`, mono: true }, { text: `${z.pmo || '—'} µg/m³`, mono: true, color: COLORS.muted }, '<35 µg/m³ (EPA 24-hr)'])
    if (z.co) paramRows.push(['Carbon Monoxide', { text: `${z.co} ppm`, mono: true }, { text: '—', mono: true, color: COLORS.muted }, '<35 ppm (NIOSH REL)'])
    if (z.tv) paramRows.push(['Total VOCs', { text: `${z.tv} µg/m³`, mono: true }, { text: `${z.tvo || '—'} µg/m³`, mono: true, color: COLORS.muted }, '<500 µg/m³ (concern)'])
    if (z.hc) paramRows.push(['Formaldehyde', { text: `${z.hc} ppm`, mono: true }, { text: '—', mono: true, color: COLORS.muted }, '<0.016 ppm (NIOSH REL)'])
    // Data center additional fields
    if (z.gaseous_corrosion) paramRows.push(['Gaseous Corrosion (ANSI/ISA 71.04-2013)', { text: z.gaseous_corrosion, mono: true }, { text: '—', color: COLORS.muted }, 'G1 Mild → GX Severe'])
    if (z.dp_temp) paramRows.push(['Dew Point', { text: `${z.dp_temp} °F`, mono: true }, { text: '—', color: COLORS.muted }, '41.9–59°F (ASHRAE TC 9.9)'])
    if (z.iso_class) paramRows.push(['Cleanliness Class (ISO 14644-1)', { text: z.iso_class, mono: true }, { text: '—', color: COLORS.muted }, 'ISO 14644-1:2015'])
    if (z.h2_monitoring) paramRows.push(['Hydrogen Monitoring', { text: z.h2_monitoring, mono: true }, { text: '—', color: COLORS.muted }, 'NFPA 1'])
    if (z.exhaust_cfm_sqft) paramRows.push(['Battery Room Exhaust', { text: `${z.exhaust_cfm_sqft} cfm/sq ft`, mono: true }, { text: '—', color: COLORS.muted }, '≥1 cfm/sq ft (NFPA 1)'])

    children.push(buildTable(
      [{ text: 'Parameter', width: 25 }, { text: 'Indoor', width: 20, align: AlignmentType.CENTER }, { text: 'Outdoor', width: 20, align: AlignmentType.CENTER }, { text: 'Reference', width: 35 }],
      paramRows
    ))
  }

  // Category assessment
  children.push(p('Category Assessment', { heading: HeadingLevel.HEADING_3 }))
  const catRows = zs.cats.filter(cat => cat.s !== null && cat.s !== undefined && cat.status !== 'SUPPRESSED').map(cat => {
    const pct = cat.mx > 0 ? Math.round((cat.s / cat.mx) * 100) : 0
    return [
      { text: cat.l, bold: true },
      { text: `${cat.s}/${cat.mx}`, mono: true, align: AlignmentType.CENTER },
      { text: pct >= 70 ? 'Within range' : pct >= 50 ? 'Moderate concern' : 'Critical concern', color: scoreColor(pct >= 70 ? 70 : pct >= 50 ? 55 : 30), size: 18 },
      { text: `${pct}%`, mono: true, align: AlignmentType.RIGHT },
    ]
  })
  // Categories with no data
  zs.cats.filter(cat => cat.s === null || cat.status === 'INSUFFICIENT' || cat.status === 'DATA_GAP' || cat.status === 'SUPPRESSED').forEach(cat => {
    catRows.push([
      { text: cat.l, bold: true },
      { text: 'Not assessed', italics: true, color: COLORS.muted, align: AlignmentType.CENTER },
      { text: cat.status === 'SUPPRESSED' ? 'Suppressed for zone type' : cat.status === 'DATA_GAP' ? 'No data collected' : 'Insufficient data', italics: true, color: COLORS.muted, size: 18 },
      { text: '—', color: COLORS.muted, align: AlignmentType.RIGHT },
    ])
  })
  children.push(buildTable(
    [{ text: 'Category', width: 30 }, { text: 'Score', width: 15, align: AlignmentType.CENTER }, { text: 'Performance', width: 35 }, { text: '%', width: 20, align: AlignmentType.RIGHT }],
    catRows
  ))

  // Interpretation — varied language (guard against null categories)
  const scored = zs.cats.filter(c => c.s !== null && c.status !== 'SUPPRESSED')
  children.push(p('Interpretation', { heading: HeadingLevel.HEADING_3 }))
  if (!scored.length) {
    children.push(p('Insufficient data for interpretation. Additional measurements are recommended.', { size: 22, color: COLORS.muted, italics: true }))
  } else {
    const worst = scored.reduce((a, b) => ((a.s / a.mx) < (b.s / b.mx) ? a : b))
    const worstPct = Math.round((worst.s / worst.mx) * 100)
    const opener = INTERP_OPENERS[zi % INTERP_OPENERS.length](zs.risk, zs.tot)
    const contrib = CONTRIB_PHRASES[zi % CONTRIB_PHRASES.length](worst.l, worst.s, worst.mx, worstPct)
    const qualifier = worstPct < 50
      ? ' which represents a significant concern and would warrant prioritized attention.'
      : worstPct < 70
        ? ' which suggests conditions that may benefit from targeted corrective action.'
        : ' which is performing within an acceptable range.'
    const multiLow = scored.filter(c => (c.s / c.mx) < 0.5).length > 1
      ? ' Multiple categories scored below 50%, suggesting interrelated contributing factors.'
      : ''
    const dataGapNote = (zs.insufficientCats?.length)
      ? ` Note: ${zs.insufficientCats.join(', ')} ${zs.insufficientCats.length === 1 ? 'was' : 'were'} not scored due to insufficient data; confidence is reduced accordingly.`
      : ''
    children.push(p(`${opener} ${contrib}${qualifier}${multiLow}${dataGapNote}`, { size: 22, color: COLORS.sub }))
  }

  // Contributing factors
  const factors = zs.cats
    .filter(c => c.r.filter(r => r.sev === 'critical' || r.sev === 'high').length > 0)
    .flatMap(c => c.r.filter(r => r.sev === 'critical' || r.sev === 'high').map(r => r.t))

  if (factors.length > 0) {
    children.push(p('Likely Contributing Factors', { heading: HeadingLevel.HEADING_3 }))
    factors.forEach((f, i) => children.push(new Paragraph({
      children: [new TextRun({ text: `${i + 1}. ${f}`, font: FONTS.body, size: 20, color: COLORS.sub })],
      spacing: { after: 60 },
    })))
  }

  // Findings detail — exclude pass, show message if only INFO remains
  children.push(p('Findings Detail', { heading: HeadingLevel.HEADING_3 }))
  const findingRows = []
  zs.cats.forEach(cat => {
    cat.r.forEach(r => {
      if (r.sev !== 'pass' && r.sev !== 'info') {
        findingRows.push([
          { text: r.sev.toUpperCase(), bold: true, color: SEV_COLORS[r.sev] || COLORS.sub, size: 16 },
          cat.l,
          r.t,
          { text: r.std || '—', size: 16, color: COLORS.muted, mono: true },
        ])
      }
    })
  })
  if (findingRows.length > 0) {
    children.push(buildTable(
      [{ text: 'Severity', width: 12 }, { text: 'Category', width: 18 }, { text: 'Finding', width: 50 }, { text: 'Reference', width: 20 }],
      findingRows
    ))
  } else {
    children.push(p('No findings of medium or higher severity were identified during this assessment.', { size: 20, color: COLORS.muted, italics: true }))
  }

  // Confidence and missing data
  children.push(p(`Confidence: ${ctx.confidence}${zs.tot < 40 ? ' — findings are directional pending follow-up' : ''}`, { size: 18, color: COLORS.muted, bold: true, after: 40 }))
  const gaps = ctx.oshaResult?.gaps || []
  children.push(p(`Missing data: ${gaps.length > 0 ? gaps.join(', ') : 'No significant data gaps identified for this zone'}`, { size: 18, color: COLORS.muted, after: 200 }))

  return children
}
