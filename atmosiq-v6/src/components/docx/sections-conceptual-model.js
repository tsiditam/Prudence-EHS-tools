/**
 * AtmosFlow DOCX Report — Conceptual Site Model section.
 *
 * Renders each screening hypothesis as a source → pathway → receptor chain
 * with its supporting evidence and a confidence rating, so the reasoning —
 * not just the measurement — is on the record. This is the "CIH reasoning"
 * report-style add-on: a body section placed (like Standards Currency) after
 * Limitations / Professional Judgment and before the Signatory.
 *
 * Source of truth: `data.causalChains` (src/engines/causalChains.js), the
 * engine-adjacent root-cause output already produced for every assessment.
 * Each chain is { zone, type, rootCause, evidence[], confidence, refutableBy?,
 * std? }. This layer READS that output and presents it — it does not score,
 * synthesize prose, or make a compliance determination. No engine files
 * touched.
 *
 * Returns a body-section descriptor { title, children } (the consultant
 * pipeline renders the shared section heading and syncs the TOC), or null
 * when there are no chains to render.
 */

import { AlignmentType, HeadingLevel } from 'docx'
import { COLORS } from './styles'
import { p } from './paragraphs'
import { buildTable } from './tables'

// Map the engine's confidence phrasing to a tier color (screening tones).
function confidenceColor(confidence) {
  const c = String(confidence || '').toLowerCase()
  if (/strong|high/.test(c)) return '15803D'      // green
  if (/moderate|likely/.test(c)) return 'A16207'  // amber
  return COLORS.sub                                // possible / low / screening
}

export function buildConceptualSiteModelSection(causalChains) {
  const chains = (Array.isArray(causalChains) ? causalChains : []).filter(Boolean)
  if (chains.length === 0) return null

  const out = [
    p(
      'Each screening hypothesis below is expressed as a source → pathway → receptor chain with its supporting evidence and a confidence rating, following standard indoor-air-quality investigation logic. Confidence reflects the weight of available screening evidence — not a statistical probability — and no chain is a confirmed cause: each names what would change the conclusion. This section is interpretive context for the reviewing industrial hygienist and is not a regulatory exposure determination or compliance verdict.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
  ]

  chains.forEach((c, i) => {
    const heading = `${i + 1}. ${c.type || 'Screening hypothesis'}${c.zone ? ` — ${c.zone}` : ''}`
    out.push(p(heading, { heading: HeadingLevel.HEADING_3 }))

    const rows = [
      ['Identified pathway / concern', c.type || '—'],
      ['Receptor (location)', c.zone || '—'],
      ['Source & mechanism (screening hypothesis)', c.rootCause || '—'],
      ['Supporting evidence', Array.isArray(c.evidence) && c.evidence.length ? c.evidence.join('; ') : '—'],
    ]
    const confRow = { row: ['Confidence', c.confidence || '—'], color: confidenceColor(c.confidence) }
    if (c.refutableBy) rows.push(['Would be revised by', c.refutableBy])
    if (c.std) rows.push(['Reference basis', c.std])

    out.push(buildTable(
      [{ text: 'Element', width: 32 }, { text: 'Detail', width: 68 }],
      [
        ...rows.map(([k, v]) => [
          { text: k, bold: true, color: COLORS.sub, size: 20 },
          { text: v, size: 20 },
        ]),
        [
          { text: confRow.row[0], bold: true, color: COLORS.sub, size: 20 },
          { text: confRow.row[1], bold: true, color: confRow.color, size: 20 },
        ],
      ],
    ))
    out.push(p('', { after: 160 }))
  })

  return { title: 'Conceptual Site Model (Source → Pathway → Receptor)', children: out }
}
