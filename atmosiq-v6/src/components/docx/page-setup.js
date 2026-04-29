/**
 * v2.5.1 — Shared page-setup constants for the DOCX renderer.
 *
 * Every section in every AtmosFlow client deliverable (cover page,
 * main body, technical report) uses US Letter portrait with 1-inch
 * margins. With 1-inch left/right margins on US Letter the printable
 * content area is 6.5 inches wide = 9360 TWIPs, which is the working
 * width referenced by every Table in the renderer (TOTAL_WIDTH_DXA).
 *
 * Setting page.size explicitly (rather than relying on the docx
 * library or downstream Word default) prevents the report from
 * rendering on A4 — which would squeeze the body and produce the
 * narrow-page artifact this module exists to eliminate.
 */

import { PageOrientation, convertInchesToTwip, SectionType } from 'docx'

export const PAGE_SIZE_LETTER = {
  width: convertInchesToTwip(8.5),
  height: convertInchesToTwip(11),
  orientation: PageOrientation.PORTRAIT,
}

/**
 * 1-inch margins all around for body sections. Header/footer 0.5".
 * Content area = 8.5 - 1 - 1 = 6.5 inches = 9360 TWIPs.
 */
export const LETTER_BODY_PAGE = {
  size: PAGE_SIZE_LETTER,
  margin: {
    top: convertInchesToTwip(1),
    right: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1),
    header: convertInchesToTwip(0.5),
    footer: convertInchesToTwip(0.5),
  },
}

/**
 * Cover-page page setup. The cover page uses a slightly larger top
 * margin (1.5") so the centered firm name + title sit visually
 * weighted on the page rather than crammed against the top edge.
 * Left/right/bottom match body so the content area is identical.
 */
export const LETTER_COVER_PAGE = {
  size: PAGE_SIZE_LETTER,
  margin: {
    top: convertInchesToTwip(1.5),
    right: convertInchesToTwip(1),
    bottom: convertInchesToTwip(1),
    left: convertInchesToTwip(1),
    header: convertInchesToTwip(0.5),
    footer: convertInchesToTwip(0.5),
  },
}

/**
 * Working content width in TWIPs (8.5 in − 1 in left − 1 in right
 * = 6.5 in × 1440 TWIPs/in = 9360 TWIPs). Mirrored as
 * TOTAL_WIDTH_DXA inside sections-v21client.js for back-compat.
 */
export const CONTENT_WIDTH_DXA = 9360

/**
 * Section properties helper — convenience wrapper for body sections
 * that always start on a new page with Letter portrait + 1-inch
 * margins. Callers spread the result into a Document section object.
 */
export const BODY_SECTION_PROPERTIES = {
  type: SectionType.NEXT_PAGE,
  page: LETTER_BODY_PAGE,
}
