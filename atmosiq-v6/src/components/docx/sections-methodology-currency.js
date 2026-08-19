/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AtmosFlow DOCX Report — "Additional Criteria Considered".
 *
 * Back-matter section naming the published criteria a reader could
 * reasonably expect to see applied to this data but which were not the
 * basis of any finding, each with the reason and with what would make it
 * worth evaluating. It sits after Limitations, before the signatory and
 * appendices — where a reviewer looks for reference material.
 *
 * Source of truth: `src/engines/contextualStandards.js`. Each entry
 * contributes a sub-heading + citation line + rationale paragraph.
 *
 * Title history: this rendered as "Standards Currency" until 2026-08.
 * The name described the maintenance concern (are our references
 * current?) rather than the reader's question (why this criterion and
 * not that one?), and the section's prose described AtmosFlow's own
 * scoring internals — which is why it was pulled from the deliverable
 * in commit 048f6d4. Both are fixed: the prose is now criteria-selection
 * rationale addressed to the reader, and the heading says what the
 * section is. The builder keeps its original export name because the
 * acceptance gate and the module path pin it.
 */

import { HeadingLevel, AlignmentType } from 'docx'
import { COLORS } from './styles'
import { getContextualStandards } from '../../engines/contextualStandards.js'

import { p } from './paragraphs'

/** Section heading, rendered by the supplemental pipeline (not here). */
export const ADDITIONAL_CRITERIA_TITLE = 'Additional Criteria Considered'

/**
 * Build the Additional Criteria Considered section.
 *
 * @param {{parameters?: Set<string>|Array<string>}} [ctx]  measured-parameter
 *   scope, forwarded to getContextualStandards. Omit to render the full
 *   reference set (see that function for the scoping rule).
 * @returns {{title: string, children: Array}|null} body-section descriptor —
 *   no heading of its own; the consultant pipeline renders the shared
 *   section heading and places it after Limitations. Null when the
 *   assessment engages none of the entries, so nothing is rendered, no
 *   TOC entry is created, and no empty heading is left behind.
 */
export function buildMethodologyCurrency(ctx) {
  const entries = getContextualStandards(ctx)
  if (!entries || entries.length === 0) return null

  const out = [
    p(
      'The criteria used for each parameter are identified with the corresponding result and listed in Appendix D. The published criteria below were considered and are not the basis of any finding in this report. They are recorded here with the reason, so that the choice of criterion is visible rather than implicit, and so a reviewer can see what a different scope of work would have compared against.',
      { size: 20, color: COLORS.sub, align: AlignmentType.JUSTIFIED, after: 200 },
    ),
  ]

  for (const entry of entries) {
    out.push(p(entry.summary, { heading: HeadingLevel.HEADING_3 }))
    out.push(p(entry.citation, { size: 18, color: COLORS.muted, italics: true, after: 80 }))
    out.push(p(entry.rationale, { size: 20, color: COLORS.body, align: AlignmentType.JUSTIFIED, after: 160 }))
  }

  return { title: ADDITIONAL_CRITERIA_TITLE, children: out }
}
