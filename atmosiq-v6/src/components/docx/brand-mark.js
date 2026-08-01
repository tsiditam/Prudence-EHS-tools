/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * The AtmosFlow mark, as a raster.
 *
 * Word cannot render the SVG the product uses on screen, and a document that
 * fetches its logo at open time would show a broken image to anyone reading
 * it offline or behind a mail gateway. So the mark ships INSIDE the file: a
 * 128 px PNG of the same path data, drawn at 22 pt in the masthead, which is
 * roughly 4x the displayed size and stays crisp on a 600 dpi print.
 *
 * Kept in its own module because a 4 KB string in the middle of a layout file
 * makes the layout unreadable. Regenerate by rasterizing the mark from
 * `atmosflow-landing.html` at 128 px if the identity ever changes.
 */

/** `data:image/png;base64,...` — the AtmosFlow wave mark, 128x128. */
export const BRAND_MARK_PNG =
  'data:image/png;base64,' +
  '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'
