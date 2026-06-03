/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Citation tracker — every standard referenced in a finding registers here,
 * and the report bibliography (Phase 4, Appendix) lists ONLY registered,
 * manifest-backed sources. No automated standards dump: a citation that does
 * not map to a STANDARDS_MANIFEST source is rejected.
 */

import { STANDARDS_MANIFEST, isManifestStandard } from '../constants/standards.js'
import type { Finding } from '../types/engine'

// Standard family (as it appears in a finding's `std`) → manifest source id.
const FAMILY_TO_SOURCE: Array<[string, string]> = [
  ['EPA PFAS NPDWR', 'pfas'],
  ['EPA Action Level', 'lcrr'],
  ['EPA RTCR', 'rtcr'],
  ['EPA MRDL', 'dbpr'],
  ['EPA SMCL', 'nsdwr'],
  ['EPA Health Advisory', 'epa_ha'],
  ['EPA Advisory', 'epa_ha'],
  ['WHO Guideline', 'who'],
  ['State Standard', 'state'],
  ['EPA MCLG', 'sdwa'],
  ['EPA MCL', 'sdwa'],
]

function sourceIdFor(stdLabel: string): string | null {
  for (const [family, sourceId] of FAMILY_TO_SOURCE) {
    if (stdLabel.includes(family)) return sourceId
  }
  return null
}

export interface CitationTracker {
  register(stdLabel: string): boolean
  registeredSourceIds(): string[]
  bibliography(): Array<{ id: string; title: string; citation: string }>
}

/** Create a fresh tracker. Registration is idempotent and manifest-gated. */
export function createCitationTracker(): CitationTracker {
  const ids = new Set<string>()
  return {
    register(stdLabel: string): boolean {
      if (!isManifestStandard(stdLabel)) return false
      const id = sourceIdFor(stdLabel)
      if (!id) return false
      ids.add(id)
      return true
    },
    registeredSourceIds(): string[] {
      return [...ids]
    },
    bibliography() {
      // Preserve manifest order; include only registered sources.
      return STANDARDS_MANIFEST.sources.filter((s: any) => ids.has(s.id))
    },
  }
}

/** Pull every standard label referenced across a finding set. */
export function extractCitations(findings: Finding[]): string[] {
  const labels = new Set<string>()
  for (const f of findings || []) {
    for (const v of f.violations || []) labels.add(v.std)
    for (const a of f.advisories || []) labels.add(a.std)
  }
  return [...labels]
}

/** Build the manifest-gated bibliography for a finding set in one call. */
export function bibliographyFor(findings: Finding[]) {
  const tracker = createCitationTracker()
  for (const label of extractCitations(findings)) tracker.register(label)
  return tracker.bibliography()
}
