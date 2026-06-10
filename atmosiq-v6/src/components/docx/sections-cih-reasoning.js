/**
 * AtmosFlow DOCX Report — CIH-reasoning report-style sections (slice 2).
 *
 * Three body sections rendered ONLY for the "Consultant — CIH Reasoning"
 * report style (data.reportStyle === 'cih'), companions to the Conceptual
 * Site Model (sections-conceptual-model.js):
 *
 *   1. Understanding the Measurements — plain-language "what it is and why
 *      it is measured" explainers for the parameters actually captured.
 *      Static educational copy gated on which fields hold data; makes no
 *      claim about THIS site's results.
 *   2. Reported Concerns & Exposure Pathways — occupant concerns from the
 *      presurvey trigger + per-zone complaint capture, each mapped to the
 *      zone's flagged screening categories (or explicitly "no corroborating
 *      screening flag"). Literal data only.
 *   3. Findings Confidence Register — every flagged screening finding with
 *      its severity, cited reference, and the zone's ENGINE-COMPUTED data
 *      confidence (zoneScores[].confidence, derived from data sufficiency).
 *      This layer copies that value; it does not score or re-rate.
 *
 * Engine-sacred audit: reads zones / presurvey / zoneScores output only.
 * No scoring logic, no thresholds, no compliance determinations.
 * Each builder returns a body-section descriptor { title, children } or
 * null when it has nothing to render.
 */

import { AlignmentType, HeadingLevel } from 'docx'
import { COLORS, SEV_COLORS } from './styles'
import { p } from './paragraphs'
import { buildTable } from './tables'

// ── 1. Understanding the Measurements ───────────────────────────────

// Explainer copy per zone-measurement key. Educational context only —
// the per-parameter interpretation of THIS site's data stays in the
// engine-rendered Results section.
const PARAM_EXPLAINERS = [
  { keys: ['co2'], label: 'Carbon dioxide (CO2)', text: 'Carbon dioxide is produced by people as they breathe and accumulates indoors when outdoor-air supply does not keep pace with occupancy. At typical office concentrations it is not itself a health hazard; it is used as a practical real-time indicator of ventilation adequacy relative to occupant load.' },
  { keys: ['co'], label: 'Carbon monoxide (CO)', text: 'Carbon monoxide is a colorless, odorless gas produced by incomplete combustion (vehicle exhaust, gas-fired appliances, generators). Because it is an acute hazard, even low indoor readings are screened to rule out combustion sources migrating into occupied space.' },
  { keys: ['tf', 'rh'], label: 'Temperature & relative humidity', text: 'Temperature and relative humidity together define the thermal environment — the most common driver of occupant comfort complaints. Sustained high humidity can also support microbial growth, while very low humidity contributes to dryness and irritation. Both are screened against the ASHRAE 55 comfort envelope.' },
  { keys: ['pm'], label: 'Fine particulate (PM2.5)', text: 'PM2.5 refers to airborne particles 2.5 micrometers and smaller — fine enough to be inhaled deep into the lungs. Indoor sources include cooking, printing, and outdoor particles drawn in through ventilation. It is measured as an indicator of particulate exposure and filtration performance.' },
  { keys: ['tvoc'], label: 'Total volatile organic compounds (TVOC)', text: 'TVOC is a combined, non-specific measure of the many gas-phase chemicals that off-gas from furnishings, finishes, adhesives, cleaning products, and office equipment. It does not identify individual compounds or indicate health risk by itself; elevated readings point to a source worth investigating.' },
]

const hasValue = (v) => v !== undefined && v !== null && String(v).trim() !== ''

export function buildParameterExplainers(zones) {
  const zs = Array.isArray(zones) ? zones : []
  const measured = PARAM_EXPLAINERS.filter(e => zs.some(z => z && e.keys.some(k => hasValue(z[k]))))
  if (measured.length === 0) return null

  const out = [
    p(
      'For the non-specialist reader, this section explains what each measured parameter is and why it is screened. The site-specific interpretation of the readings appears in the Results section; nothing here is a finding about this building.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
  ]
  for (const e of measured) {
    out.push(p(e.label, { heading: HeadingLevel.HEADING_3 }))
    out.push(p(e.text, { size: 20, color: COLORS.body, align: AlignmentType.JUSTIFIED, after: 160 }))
  }
  return { title: 'Understanding the Measurements', children: out }
}

// ── 2. Reported Concerns & Exposure Pathways ────────────────────────

const FLAG_SEVS = new Set(['critical', 'high', 'medium'])

// Category labels in this zone's score with at least one flagged finding.
function flaggedCategories(zoneScore) {
  if (!zoneScore || !Array.isArray(zoneScore.cats)) return []
  return zoneScore.cats
    .filter(c => Array.isArray(c.r) && c.r.some(f => FLAG_SEVS.has(f.sev)))
    .map(c => c.l)
}

export function buildReportedConcernsSection(presurvey, zones, zoneScores) {
  const ps = presurvey || {}
  const zs = Array.isArray(zones) ? zones : []
  const scores = Array.isArray(zoneScores) ? zoneScores : []
  const rows = []

  // Site-level trigger concerns from the presurvey.
  if (ps.ps_reason === 'Occupant complaint(s)') {
    const detail = [ps.ps_complaint_severity, ps.ps_complaint_timeline, ps.ps_affected_areas ? `areas: ${ps.ps_affected_areas}` : null].filter(Boolean).join(' · ')
    rows.push({
      concern: `Occupant complaint(s) triggered this assessment${ps.ps_complaint_narrative ? ` — "${String(ps.ps_complaint_narrative).slice(0, 160)}"` : ''}`,
      where: detail || 'Site-wide (see Trigger Event)',
      evidence: scores.some(s => flaggedCategories(s).length) ? 'See flagged zones below and the Results section' : 'No screening category flagged site-wide',
    })
  }
  if (ps.ps_reason === 'Odor event') {
    rows.push({
      concern: `Odor event triggered this assessment${ps.ps_odor_describe ? ` — "${String(ps.ps_odor_describe).slice(0, 160)}"` : ''}`,
      where: ps.ps_odor_pattern || 'Pattern not recorded',
      evidence: scores.some(s => flaggedCategories(s).length) ? 'See flagged zones below and the Results section' : 'No screening category flagged site-wide',
    })
  }

  // Per-zone complaint capture.
  zs.forEach((z, i) => {
    if (!z || z.cx !== 'Yes — complaints reported') return
    const symptoms = Array.isArray(z.sy) ? z.sy.join(', ') : (z.sy || 'Symptoms not itemized')
    const cats = flaggedCategories(scores[i])
    rows.push({
      concern: `${symptoms}${z.ac ? ` (${z.ac} affected)` : ''}`,
      where: scores[i]?.zoneName || z.zn || `Zone ${i + 1}`,
      evidence: cats.length ? `Flagged screening categories: ${cats.join(', ')}` : 'No corroborating screening flag in this zone',
    })
  })

  if (rows.length === 0) return null

  const out = [
    p(
      'Occupant-reported concerns are mapped to the screening evidence that does — or does not — corroborate them. Reports are subjective and direct measurement; they are not findings in themselves, and an unsupported concern is recorded as such rather than dismissed.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
    buildTable(
      [
        { text: 'Reported concern', width: 40 },
        { text: 'Where / context', width: 24 },
        { text: 'Screening evidence', width: 36 },
      ],
      rows.map(r => [
        { text: r.concern, size: 20 },
        { text: r.where, size: 20 },
        { text: r.evidence, size: 20, color: /No corroborating|No screening/.test(r.evidence) ? COLORS.sub : COLORS.body },
      ]),
    ),
  ]
  return { title: 'Reported Concerns & Exposure Pathways', children: out }
}

// ── 3. Findings Confidence Register ─────────────────────────────────

const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium' }

export function buildFindingsConfidenceRegister(zoneScores) {
  const scores = Array.isArray(zoneScores) ? zoneScores : []
  const rows = []
  for (const zs of scores) {
    if (!zs || !Array.isArray(zs.cats)) continue
    for (const cat of zs.cats) {
      for (const f of (cat.r || [])) {
        if (!FLAG_SEVS.has(f.sev)) continue
        rows.push({
          zone: zs.zoneName || 'Zone',
          finding: String(f.t || '').slice(0, 180),
          sev: f.sev,
          std: f.std || '—',
          confidence: zs.confidence || '—',
        })
      }
    }
  }
  if (rows.length === 0) return null

  const out = [
    p(
      'Every flagged screening finding is listed with its severity, the reference cited, and the data-sufficiency confidence the scoring engine assigned to its zone (High / Medium / Low — driven by how complete the underlying measurements were, not by the severity of the finding). Findings in lower-confidence zones warrant verification before remedial investment.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
    buildTable(
      [
        { text: 'Zone', width: 14 },
        { text: 'Screening finding', width: 44 },
        { text: 'Severity', width: 12 },
        { text: 'Reference', width: 18 },
        { text: 'Zone data confidence', width: 12 },
      ],
      rows.map(r => [
        { text: r.zone, size: 18 },
        { text: r.finding, size: 18 },
        { text: SEV_LABEL[r.sev] || r.sev, size: 18, bold: true, color: SEV_COLORS[r.sev] || COLORS.body },
        { text: r.std, size: 18, color: COLORS.sub },
        { text: r.confidence, size: 18, bold: true },
      ]),
    ),
  ]
  return { title: 'Findings Confidence Register', children: out }
}
