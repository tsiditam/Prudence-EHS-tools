/**
 * AtmosFlow DOCX Report — Re-survey Schedule section
 *
 * Renders a heading + rationale paragraph + 4-row summary table that
 * gives the client a concrete target date for the next IAQ
 * assessment. Sits between the Recommendations Register and the
 * Limitations + Professional Judgment section in the v2.1 consultant
 * pipeline (sections-v21client.js).
 *
 * Schedule logic lives in src/engines/resurveySchedule.js — this
 * file is pure rendering. Engine-sacred rule respected (logic in
 * src/engines/ plural, off-limits src/engine/ singular untouched).
 */

import { Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { FONTS, COLORS, SEV_COLORS } from './styles'
import { buildTable } from './tables'
import { computeResurveySchedule } from '../../engines/resurveySchedule.js'

import { p } from './paragraphs'

function tierColor(tier) {
  if (tier === 'critical') return SEV_COLORS.critical
  if (tier === 'high') return SEV_COLORS.high
  if (tier === 'medium') return SEV_COLORS.medium
  return COLORS.sub
}

/**
 * Build the Re-survey Schedule section.
 *
 * @param {object} opts
 * @param {object} [opts.recommendationsRegister] v2.1 shape from report.recommendationsRegister
 * @param {object} [opts.recs]                    legacy fallback (ctx.recs from DocxReport)
 * @param {string|Date} [opts.assessmentDate]     used to compute the absolute due date
 * @returns {Array} DOCX children (heading + rationale + table) — possibly empty
 */
export function buildResurveySchedule(opts = {}) {
  const recommendations = opts.recommendationsRegister || opts.recs || {}
  const schedule = computeResurveySchedule({ recommendations })
  // Re-survey timing is anchored to completion of corrective actions, not
  // a fixed calendar date: an absolute "target date" pinned to the
  // assessment date is prescriptive and usually wrong, because the right
  // trigger is when remediation is done. When there are no active actions,
  // fall back to a routine confirmation interval.
  const hasActions =
    schedule.counts.immediate + schedule.counts.shortTerm + schedule.counts.furtherEvaluation > 0
  const timingValue = hasActions
    ? `Approximately ${schedule.cadence.label} after completion of corrective actions`
    : `Within ${schedule.cadence.label} (routine confirmation)`
  return [
    p('Re-survey Schedule', { heading: HeadingLevel.HEADING_2 }),
    p(schedule.rationale, { size: 22, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 }),
    buildTable(
      [{ text: 'Item', width: 45 }, { text: 'Value', width: 55 }],
      [
        ['Recommended timing', { text: timingValue, bold: true, color: tierColor(schedule.cadence.tier) }],
        ['Immediate-priority items', `${schedule.counts.immediate}`],
        ['Short-term items', `${schedule.counts.shortTerm}`],
        ['Further-evaluation items', `${schedule.counts.furtherEvaluation}`],
        ['Long-term (optional) items', `${schedule.counts.longTermOptional}`],
      ],
    ),
    p(
      'The re-survey should be triggered by completion of the priority corrective actions rather than a fixed calendar date. A qualified industrial hygienist should adjust the interval based on remediation timelines, occupant complaints, seasonal factors, and any material change in building use or HVAC operation.',
      { size: 18, color: COLORS.muted, italics: true, after: 200 },
    ),
  ]
}
