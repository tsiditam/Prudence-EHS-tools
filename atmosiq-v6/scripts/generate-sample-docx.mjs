/**
 * Standalone DOCX generator — runs in Node to produce a sample report.
 * Usage: node --experimental-vm-modules scripts/generate-sample-docx.mjs
 */

import { Document, Packer, SectionType, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx'
import { writeFileSync } from 'fs'

// Inline design tokens (matches styles.js after spec update)
const FONTS = { body: 'Cambria', mono: 'Consolas' }
const C = { text: '1B2A41', body: '2D3A4A', sub: '5C6F7E', muted: '7A8A97', light: '94A3B8', border: 'D1D5DB', bgLight: 'F3F4F6', accent: '1B2A41', white: 'FFFFFF' }

const p = (text, opts = {}) => new Paragraph({
  children: [new TextRun({ text, font: FONTS.body, size: opts.size || 22, color: opts.color || C.body, bold: opts.bold, italics: opts.italics })],
  alignment: opts.align || AlignmentType.LEFT,
  spacing: { after: opts.after !== undefined ? opts.after : 120 },
  ...(opts.heading ? { heading: opts.heading } : {}),
})

const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const reportId = `PSEC-IAQ-${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${Date.now().toString(36).toUpperCase().slice(-3)}`

const doc = new Document({
  creator: 'Prudence Safety & Environmental Consulting, LLC',
  title: 'IAQ Assessment Report — Meridian Commerce Tower',
  styles: { default: { document: { run: { font: FONTS.body, size: 22, color: C.body }, paragraph: { spacing: { after: 120, line: 276 } } } } },
  sections: [
    // Cover
    { properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      p('', { after: 2400 }),
      p('Prudence Safety & Environmental Consulting, LLC', { align: AlignmentType.CENTER, size: 24, bold: true, color: C.text, after: 120 }),
      p('Germantown, Maryland', { align: AlignmentType.CENTER, size: 20, color: C.sub, after: 400 }),
      p('Indoor Air Quality', { align: AlignmentType.CENTER, size: 44, bold: true, color: C.text, after: 40 }),
      p('Assessment Report', { align: AlignmentType.CENTER, size: 44, bold: true, color: C.text, after: 400 }),
      p('Site: Meridian Commerce Tower', { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p('Location: 450 Commerce Blvd, Suite 300, Hartford, CT 06103', { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p(`Assessment Date: ${now}`, { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p(`Report Date: ${now}`, { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p('Assessor: J. Smith, CIH, CSP', { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p(`Report ID: ${reportId}`, { align: AlignmentType.CENTER, size: 22, color: C.sub, after: 60 }),
      p('Version: 1.0  |  Status: Draft — Pending Professional Review', { align: AlignmentType.CENTER, size: 20, color: C.muted, after: 600 }),
      p('CONFIDENTIAL — FOR CLIENT USE ONLY', { align: AlignmentType.CENTER, size: 18, bold: true, color: C.muted }),
    ]},
    // Body
    { properties: { type: SectionType.NEXT_PAGE, page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      // Transmittal
      p(now, { size: 22, color: C.body, after: 200 }),
      p('Meridian Commerce Tower', { size: 22, bold: true, color: C.text, after: 40 }),
      p('450 Commerce Blvd, Suite 300, Hartford, CT 06103', { size: 22, color: C.body, after: 200 }),
      p('Re: Indoor Air Quality Assessment Report', { size: 22, bold: true, color: C.text, after: 200 }),
      p('Prudence Safety & Environmental Consulting, LLC ("PSEC") was retained to conduct an indoor air quality assessment at Meridian Commerce Tower. This report presents the findings, analysis, and recommendations resulting from our assessment.', { size: 22, color: C.body }),
      p('The assessment was performed using direct-reading instrumentation, visual inspection, and structured data collection following our deterministic scoring methodology.', { size: 22, color: C.body }),
      p('This report is intended for the sole use of the addressee and should not be distributed to third parties without written authorization from PSEC.', { size: 22, color: C.body }),
      p('Please do not hesitate to contact our office should you have questions regarding this report.', { size: 22, color: C.body, after: 300 }),
      p('Respectfully submitted,', { size: 22, color: C.body, after: 200 }),
      p('Tsidi Tamakloe, CSP', { size: 22, bold: true, color: C.text, after: 40 }),
      p('BCSP #38426', { size: 20, color: C.sub, after: 40 }),
      p('NYSDOL Mold Assessor | NYSDOL Asbestos Inspector', { size: 20, color: C.sub, after: 40 }),
      p('Prudence Safety & Environmental Consulting, LLC', { size: 20, color: C.sub, after: 40 }),
      p('support@prudenceehs.com | 1-(301)-541-8362', { size: 20, color: C.sub, after: 300 }),
      // TOC
      p('Table of Contents', { heading: HeadingLevel.HEADING_2 }),
      ...['Executive Summary','Scope and Methodology','Building and Complaint Context','Overall Findings Dashboard','Zone-by-Zone Findings','Causal Chain Analysis','Recommendations Register','Limitations and Professional Judgment','Appendix A — Raw Measurement Snapshot','Appendix B — Transparent Scoring Summary'].map((s,i) => p(`${i+1}.  ${s}`, { size: 22, color: C.body, after: 60 })),
      // Exec Summary
      p('Executive Summary', { heading: HeadingLevel.HEADING_2 }),
      p('An indoor air quality assessment was conducted at Meridian Commerce Tower on ' + now + ', encompassing 3 zones in response to occupant complaints. The assessment included direct-reading instrument measurements, visual inspection, HVAC system evaluation, and occupant complaint documentation.', { size: 22, color: C.sub }),
      p('Conditions observed during the assessment window suggest moderate indoor air quality concerns. The composite score of 62/100 reflects a weighted evaluation across five categories, with Ventilation (10/25) identified as the primary area of concern.', { size: 22, color: C.sub }),
      p('Priority actions include: Evaluate outdoor air delivery rate and verify OA damper position. Additional engineering and administrative recommendations are detailed in the Recommendations Register.', { size: 22, color: C.sub }),
      // Scope
      p('Scope and Methodology', { heading: HeadingLevel.HEADING_2 }),
      p('Purpose: This assessment was conducted to evaluate indoor air quality conditions in response to occupant complaints at Meridian Commerce Tower.', { size: 22, color: C.sub }),
      p('Areas assessed: 3rd Floor Open Office, Conference Room B, Break Room.', { size: 22, color: C.sub }),
      p('Assessment activities: Visual inspection, real-time direct-reading instrument measurements, occupant complaint documentation, HVAC system evaluation, and moisture/mold screening.', { size: 22, color: C.sub }),
      p('Standards referenced per AIHA exposure assessment strategy (Ignacio & Bullock, 2015). Standards versions per embedded manifest.', { size: 22, color: C.sub }),
      // Limitations
      p('Limitations and Professional Judgment', { heading: HeadingLevel.HEADING_2 }),
      p('This report represents conditions observed during a single assessment event and may not reflect all temporal, seasonal, or operational variations in indoor air quality.', { size: 22, color: C.sub }),
      p('This report is intended to support — not replace — professional judgment by a qualified industrial hygienist or EHS professional.', { size: 22, color: C.sub }),
      // Footer
      p(`Prudence Safety & Environmental Consulting, LLC  |  Report ID: ${reportId}  |  ${now}`, { align: AlignmentType.CENTER, size: 14, color: C.light, after: 40 }),
      p('Confidential — This report is intended for the client identified above and should not be distributed to third parties without authorization.', { align: AlignmentType.CENTER, size: 14, color: C.light, italics: true }),
    ]},
  ],
})

const buffer = await Packer.toBuffer(doc)
const outPath = '/home/user/Prudence-EHS-tools/sample-report.docx'
writeFileSync(outPath, buffer)
console.log('Sample DOCX written to: ' + outPath)
