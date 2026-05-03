/**
 * AtmosFlow Engine v2.5 §5 — Appendix C Photo Documentation
 *
 * Deterministic logic replacing the v2.4 hedging-both-ways
 * narrative. The renderer either says "no photos collected" or it
 * lists the photos by zone with "Photo N: <zone or Building> —
 * <caption>" captions. Building-level photos (zoneId === null)
 * sort first, then zone-scoped photos by zone name, then by
 * captureOrder.
 */

import type { AppendixC, AppendixCPhoto } from './types'

export interface AssessmentPhoto {
  /** Free-form caption written at capture time. */
  readonly caption: string
  /** null for building-level photos; zone name for zone-scoped photos. */
  readonly zoneName: string | null
  /** Optional relative path or filename for cross-reference. */
  readonly relativePath?: string
  /** Optional capture order or timestamp for stable sort within a zone. */
  readonly capturedAt?: string
}

const NO_PHOTOS_NARRATIVE =
  'No photo documentation was collected during this assessment. Where photographs would have informed an observation, the corresponding finding includes a textual description of the observed condition; field photographs may be requested from the assessor under separate cover.'

/**
 * Build the Appendix C content from the photo set. Empty input
 * produces a single deterministic sentence; non-empty input
 * produces a captioned list with the building-level photos first
 * and zone-scoped photos grouped by zone name.
 */
export function buildAppendixC(
  photos: ReadonlyArray<AssessmentPhoto>,
): AppendixC {
  if (!photos || photos.length === 0) {
    return {
      title: 'APPENDIX C — Photo Documentation',
      description: NO_PHOTOS_NARRATIVE,
      photos: [],
    }
  }

  const sorted = [...photos].sort((a, b) => {
    const aIsBldg = a.zoneName === null
    const bIsBldg = b.zoneName === null
    if (aIsBldg !== bIsBldg) return aIsBldg ? -1 : 1
    if (a.zoneName && b.zoneName && a.zoneName !== b.zoneName) {
      return a.zoneName.localeCompare(b.zoneName)
    }
    const aTs = a.capturedAt ?? ''
    const bTs = b.capturedAt ?? ''
    return aTs.localeCompare(bTs)
  })

  const captionedPhotos: AppendixCPhoto[] = sorted.map((photo, idx) => {
    const n = idx + 1
    const zoneLabel = photo.zoneName ?? 'Building'
    return {
      caption: `Photo ${n}: ${zoneLabel} — ${photo.caption}`,
      zoneName: zoneLabel,
      relativePath: photo.relativePath ?? `(image: ${photo.relativePath ?? `photo-${n}.jpg`})`,
    }
  })

  const description =
    `${photos.length} photograph${photos.length === 1 ? ' was' : 's were'} documented during the assessment, organized below by zone. Building-level photographs appear first, followed by zone-scoped photographs in alphabetical order. Where image embedding is not available, captions cross-reference the field photo set delivered separately.`

  return {
    title: 'APPENDIX C — Photo Documentation',
    description,
    photos: captionedPhotos,
  }
}
