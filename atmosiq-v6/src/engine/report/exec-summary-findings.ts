/**
 * AtmosFlow Engine v2.5 §6 — Executive Summary findings consolidation
 *
 * The Executive Summary "Summary of Findings" cell currently
 * renders one entry per finding, producing a 17-bullet exhaust
 * dump. A senior CIH summary is 3–6 substantive findings
 * prioritized by severity and confidence.
 *
 * This module consolidates findings across zones by conditionType,
 * sorts the resulting groups by severity → confidence → coverage,
 * and caps the rendered output at six entries with a tail note
 * when truncation occurred.
 */

import type {
  Finding, ZoneScore, Severity, CIHConfidenceTier,
} from '../types/domain'
import { getLeadTerm, getShortStatement } from './finding-groups'

export interface ExecSummaryFindingEntry {
  /** Bolded label rendered before the colon. */
  readonly label: string
  /** Short narrative consequence statement. */
  readonly summary: string
  /** Zones in which this conditionType was observed (sorted, deduped). */
  readonly zonesObserved: ReadonlyArray<string>
  /**
   * Pseudo-flag identifying the "truncation note" entry that the
   * renderer appends when more than 6 finding groups exist. The
   * label/summary/zonesObserved fields encode the note's display.
   */
  readonly isTruncationNote?: boolean
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
  pass: 5,
}

const CONFIDENCE_RANK: Record<CIHConfidenceTier, number> = {
  validated_defensible: 0,
  provisional_screening_level: 1,
  qualitative_only: 2,
  insufficient_data: 3,
}

const MAX_ENTRIES = 6

const TRUNCATION_NOTE = 'Additional findings of lower priority are detailed in the Zone Findings and Building and System Conditions sections.'

/**
 * Consolidate zone-scoped + building-scoped findings into a small
 * number of Executive Summary entries grouped by conditionType.
 *
 * Sort order:
 *   1. severityInternal (critical > high > medium > low)
 *   2. confidenceTier (validated_defensible > provisional > ...)
 *   3. number of zones affected (descending)
 *
 * Returns at most MAX_ENTRIES + 1 (the +1 is the truncation note).
 */
export function consolidateExecutiveSummaryFindings(
  zones: ReadonlyArray<ZoneScore>,
  buildingFindings: ReadonlyArray<Finding>,
): ReadonlyArray<ExecSummaryFindingEntry> {
  type Group = {
    conditionType: string
    findings: Finding[]
    zoneNames: Set<string>
    worstSeverity: Severity
    bestConfidence: CIHConfidenceTier
  }
  const groups = new Map<string, Group>()

  const ingest = (f: Finding, zoneName: string | null): void => {
    if (f.severityInternal === 'pass' || f.severityInternal === 'info') return
    const key = f.conditionType
    const existing = groups.get(key)
    if (existing) {
      existing.findings.push(f)
      if (zoneName) existing.zoneNames.add(zoneName)
      if (SEVERITY_RANK[f.severityInternal] < SEVERITY_RANK[existing.worstSeverity]) {
        existing.worstSeverity = f.severityInternal
      }
      if (CONFIDENCE_RANK[f.confidenceTier] < CONFIDENCE_RANK[existing.bestConfidence]) {
        existing.bestConfidence = f.confidenceTier
      }
    } else {
      groups.set(key, {
        conditionType: key,
        findings: [f],
        zoneNames: new Set(zoneName ? [zoneName] : []),
        worstSeverity: f.severityInternal,
        bestConfidence: f.confidenceTier,
      })
    }
  }

  for (const z of zones) {
    for (const cat of z.categories) {
      for (const f of cat.findings) {
        if (f.scope === 'zone') ingest(f, z.zoneName)
      }
    }
  }
  for (const f of buildingFindings) {
    if (f.severityInternal === 'pass' || f.severityInternal === 'info') continue
    ingest(f, null)
  }

  const sortedGroups = [...groups.values()].sort((a, b) => {
    const sev = SEVERITY_RANK[a.worstSeverity] - SEVERITY_RANK[b.worstSeverity]
    if (sev !== 0) return sev
    const conf = CONFIDENCE_RANK[a.bestConfidence] - CONFIDENCE_RANK[b.bestConfidence]
    if (conf !== 0) return conf
    return b.zoneNames.size - a.zoneNames.size
  })

  const entries: ExecSummaryFindingEntry[] = []
  for (const g of sortedGroups.slice(0, MAX_ENTRIES)) {
    const sample = g.findings[0]
    entries.push({
      label: getLeadTerm(sample.conditionType),
      summary: getShortStatement(sample.conditionType) ?? firstSentence(sample.approvedNarrativeIntent),
      zonesObserved: [...g.zoneNames].sort((a, b) => a.localeCompare(b)),
    })
  }

  if (sortedGroups.length > MAX_ENTRIES) {
    entries.push({
      label: 'Additional findings',
      summary: TRUNCATION_NOTE,
      zonesObserved: [],
      isTruncationNote: true,
    })
  }

  return entries
}

/**
 * Render an Exec Summary entry as the inline string consumed by
 * the renderer. Format (per spec §6):
 *
 *   "[label]: [summary]. Observed in: [zones]."
 *
 * When zonesObserved is a single building-scope finding (no zones)
 * the suffix is "Observed at: building level." Truncation notes
 * are rendered as their summary text only.
 */
export function renderExecSummaryEntry(entry: ExecSummaryFindingEntry): string {
  if (entry.isTruncationNote) return entry.summary
  const baseSummary = entry.summary.replace(/\s+$/g, '').replace(/[.]$/, '')
  if (entry.zonesObserved.length === 0) {
    return `${entry.label}: ${baseSummary}. Observed at: building level.`
  }
  return `${entry.label}: ${baseSummary}. Observed in: ${entry.zonesObserved.join(', ')}.`
}

function firstSentence(text: string): string {
  if (!text) return ''
  const m = /^[^.!?]*[.!?](?=\s|$)/.exec(text)
  if (m) return m[0].trim()
  return text
}
