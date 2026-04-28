/**
 * AtmosFlow Engine v2.1 — Narrative Validators
 * Banned terms fire ONLY when the corresponding permission flag is false.
 * When a banned term appears without permission, the validator THROWS —
 * it does NOT silently rewrite.
 */

import type { Finding } from '../types/domain'
import { evaluatePermissions } from './permissions'

interface ConditionalBan {
  readonly terms: ReadonlyArray<string>
  readonly requiredPermission: 'definitiveConclusionAllowed' | 'causationSupported' | 'regulatoryConclusionAllowed'
}

const CONDITIONAL_BANS: ReadonlyArray<ConditionalBan> = [
  {
    terms: ['confirmed', 'is present', 'demonstrates', 'has been verified'],
    requiredPermission: 'definitiveConclusionAllowed',
  },
  {
    terms: ['caused by', 'due to', 'resulting from', 'because of', 'root cause is'],
    requiredPermission: 'causationSupported',
  },
  {
    terms: ['noncompliant', 'violation', 'exceeds the PEL', 'above the limit', 'in violation of', 'regulatory breach'],
    requiredPermission: 'regulatoryConclusionAllowed',
  },
  {
    terms: ['toxic mold', 'black mold', 'Stachybotrys', 'mold exposure confirmed', 'mold contamination'],
    requiredPermission: 'definitiveConclusionAllowed',
  },
  {
    terms: ['unsafe', 'hazardous', 'dangerous'],
    requiredPermission: 'regulatoryConclusionAllowed',
  },
  {
    terms: ['high risk', 'elevated risk', 'critical risk'],
    requiredPermission: 'regulatoryConclusionAllowed',
  },
  {
    terms: ['ISO Class 8 confirmed', 'fails ISO 14644'],
    requiredPermission: 'definitiveConclusionAllowed',
  },
  {
    terms: ['G2 environment', 'G3 environment', 'corrosive atmosphere confirmed'],
    requiredPermission: 'definitiveConclusionAllowed',
  },
]

export class BannedTermViolation extends Error {
  constructor(
    public readonly term: string,
    public readonly requiredPermission: string,
    public readonly findingId: string,
  ) {
    super(`Banned term "${term}" used without permission '${requiredPermission}' on finding ${findingId}. Engine permission state is inconsistent with narrative template.`)
    this.name = 'BannedTermViolation'
  }
}

export function validateNarrativeForFinding(narrative: string, finding: Finding): void {
  const permissions = evaluatePermissions(finding)
  const lowerNarrative = narrative.toLowerCase()

  for (const ban of CONDITIONAL_BANS) {
    if (permissions[ban.requiredPermission]) continue

    for (const term of ban.terms) {
      if (lowerNarrative.includes(term.toLowerCase())) {
        throw new BannedTermViolation(term, ban.requiredPermission, finding.id)
      }
    }
  }
}

export function validateClientReport(report: { readonly [key: string]: unknown }, findings: ReadonlyArray<Finding>): void {
  // Recursive traversal — no internal fields in client output
  assertNoInternalFields(report)

  // Validate each finding's narrative against its permissions
  for (const finding of findings) {
    validateNarrativeForFinding(finding.approvedNarrativeIntent, finding)
  }
}

const INTERNAL_FIELD_NAMES = new Set([
  'severityInternal', 'titleInternal', 'observationInternal', 'deductionInternal',
  'rawScore', 'cappedScore', 'siteScore', 'siteTier', 'composite', 'tier',
  'confidenceValue', 'defensibilityFlags',
])

const SEVERITY_LABELS = new Set(['critical', 'high', 'medium', 'low', 'pass', 'info'])
const TIER_LABELS = new Set(['Critical', 'High Risk', 'Moderate', 'Low Risk'])

export function assertNoInternalFields(obj: unknown, path = ''): void {
  if (obj === null || obj === undefined) return
  if (typeof obj === 'string') {
    for (const tier of TIER_LABELS) {
      if (obj === tier) {
        throw new Error(`Internal tier label "${tier}" found at ${path} in client report`)
      }
    }
    return
  }
  if (typeof obj === 'number') return
  if (typeof obj === 'boolean') return
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => assertNoInternalFields(item, `${path}[${i}]`))
    return
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (INTERNAL_FIELD_NAMES.has(key)) {
        throw new Error(`Internal field "${key}" found at ${path}.${key} in client report`)
      }
      assertNoInternalFields(value, `${path}.${key}`)
    }
  }
}
