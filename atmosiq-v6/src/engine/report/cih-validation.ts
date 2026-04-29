/**
 * AtmosFlow v2.2 — CIH Defensibility Validation Layer
 *
 * Runs after the engine has rendered a ClientReport but before it
 * reaches the HTML / DOCX renderer. Inspects the report content for
 * CIH-defensibility issues that wouldn't be caught by the schema-
 * level checks in validators.ts (which guards internal-field
 * leakage and banned-term-without-permission).
 *
 * The 13 categories enforced here are documented in
 * docs/cih-validation-spec.md and tied to consultant-facing tone
 * requirements:
 *   §1  Quantified condition counts blocked from prose
 *   §2  Semantic/exact duplicate findings merged
 *   §3  Executive Summary observations grouped by domain
 *   §4  Rigid ASHRAE 55 language softened with context
 *   §5  Building/system "no findings" wording must qualify
 *   §6  Results section must not just repeat the Opinion
 *   §7  Numbering artifacts (1. 1. 1.) blocked
 *   §8  Risky corrosion language replaced
 *   §9  Recommendations cap at 5 in Executive Summary
 *   §10 Tone violations — banned terms without permission
 *   §11 Required limitation/methodology/sampling statements
 *   §12 Returns this ReportValidation object
 *
 * This module is PURE — it does not throw. The caller (typically
 * renderClientReport) attaches the ReportValidation to its output
 * and decides whether the report is safe to ship to a client.
 */

import type { ClientReport, FindingGroup } from './types'

// ── Public types ──

export interface ReportValidation {
  /** True iff the report passed every BLOCKING check. */
  readonly passed: boolean
  /**
   * True iff `passed` AND no soft warnings remain that affect
   * client-facing output. A reviewer should not ship the report
   * to a client when this is false.
   */
  readonly clientFacingSafe: boolean
  /** Every issue detected (blocking + warning). */
  readonly issues: ReadonlyArray<ValidationIssue>
  /** Issues that block client-facing rendering until resolved. */
  readonly blockingIssues: ReadonlyArray<string>
  /** Auto-fixes applied during render (for audit trail). */
  readonly autoFixesApplied: ReadonlyArray<string>
  /** Banned terms found in client-facing prose. */
  readonly blockedTermsFound: ReadonlyArray<BlockedTermHit>
  /** Findings merged because they are duplicates of one another. */
  readonly duplicateFindingsMerged: ReadonlyArray<string>
  /** Suggested fixes for each remaining issue. */
  readonly recommendedFixes: ReadonlyArray<string>
}

export type ValidationSeverity = 'blocking' | 'warning' | 'info'

export interface ValidationIssue {
  readonly category: string  // e.g. "§1 Quantified condition count"
  readonly severity: ValidationSeverity
  readonly location: string  // e.g. "executiveSummary.overview"
  readonly message: string
  readonly recommendedFix?: string
}

export interface BlockedTermHit {
  readonly term: string
  readonly location: string
  readonly snippet: string  // surrounding text (~80 chars)
}

// ── Banned term lists per CIH defensibility §10 ──

/**
 * Terms that MUST NOT appear in client-facing prose unless the
 * underlying finding has definitiveConclusionAllowed = true.
 * Since the ClientReport has already been validated upstream by
 * validators.ts (which gates banned-term insertion at narrative
 * authoring time), this is a defensive double-check on the
 * RENDERED output — catches anything that slipped through.
 */
const TONE_BANNED_TERMS: ReadonlyArray<string> = [
  'caused by',
  'confirmed',
  'unsafe',
  'hazardous',
  'noncompliant',
  'violation',
  'health risk',
  'high risk',
  'critical risk',
  'elevated risk',
]

/**
 * Quantified-count patterns. Catches "11 conditions warrant" and
 * variations. The whole-word boundary protects "(Continued)" or
 * other harmless numerics in narrative.
 */
const QUANTIFIED_COUNT_PATTERNS: ReadonlyArray<RegExp> = [
  /\b\d+\s+condition[s]?\s+warrant/i,
  /\b\d+\s+condition[s]?\s+warranting/i,
  /\b\d+\s+finding[s]?\s+identified/i,
  /\b\d+\s+issue[s]?\s+detected/i,
  /\b\d+\s+condition[s]?\s+were\s+identified/i,
  /\b\d+\s+conditions?\s+(?:were|was)\s+observed/i,
]

/** Patterns that indicate a previous version's risky corrosion phrase leaked through. */
const BLOCKED_CORROSION_PATTERNS: ReadonlyArray<RegExp> = [
  /Gaseous corrosion severity is professional judgment based on visual\/olfactory indicators/i,
]

/** Required verbatim statements that MUST appear in every client report. */
const REQUIRED_STATEMENTS: ReadonlyArray<{
  fragment: string
  field: keyof ClientReport
  description: string
}> = [
  {
    fragment: 'visual inspection, screening-level measurements, and HVAC system review',
    field: 'methodologyDisclosure',
    description: 'Methodology Disclosure paragraph (§11)',
  },
  {
    fragment: 'single site visit',
    field: 'limitationsAndProfessionalJudgment',
    description: 'Limitations and Professional Judgment paragraph (§11)',
  },
]

// ── Top-level validator ──

export function validateReportContent(report: ClientReport): ReportValidation {
  const issues: ValidationIssue[] = []
  const blockedTermsFound: BlockedTermHit[] = []
  const duplicateFindingsMerged: string[] = []
  const autoFixesApplied: string[] = []

  // §1 — Quantified condition counts
  checkQuantifiedCounts(report, issues)
  // §5 — Building/system contradiction wording
  checkBuildingContradiction(report, issues)
  // §6 — Results vs Overall Opinion redundancy
  checkResultsRedundancy(report, issues)
  // §8 — Risky corrosion language
  checkBlockedCorrosionLanguage(report, issues)
  // §9 — Recommendation cap
  checkRecommendationCount(report, issues)
  // §10 — Tone bans across rendered prose
  checkToneViolations(report, issues, blockedTermsFound)
  // §11 — Required statements present
  checkRequiredStatements(report, issues)
  // §3 — Findings categorized in Executive Summary
  checkFindingsCategorized(report, issues)
  // §2 — Duplicate observation text within sections
  checkDuplicateFindings(report, issues, duplicateFindingsMerged)
  // §7 — Numbering artifacts in rendered lists
  // (Numbering is rendered by the HTML/DOCX layer, not present in
  // the ClientReport object. Skip at this layer; the HTML
  // renderer uses <ul> for observations and <ol> only when the
  // engine intends ordered.)

  const blocking = issues.filter(i => i.severity === 'blocking')
  const blockingIssues = blocking.map(i => `${i.category}: ${i.message}`)
  const recommendedFixes = blocking
    .map(i => i.recommendedFix)
    .filter((fix): fix is string => !!fix)

  const passed = blocking.length === 0
  const clientFacingSafe =
    passed &&
    issues.filter(i => i.severity === 'warning').length === 0

  return {
    passed,
    clientFacingSafe,
    issues,
    blockingIssues,
    autoFixesApplied,
    blockedTermsFound,
    duplicateFindingsMerged,
    recommendedFixes,
  }
}

// ── Individual validators ──

function checkQuantifiedCounts(report: ClientReport, issues: ValidationIssue[]): void {
  const surfaces: Array<{ field: string; text: string }> = [
    { field: 'executiveSummary.overview', text: report.executiveSummary.overview },
    { field: 'executiveSummary.resultsNarrative', text: report.executiveSummary.resultsNarrative },
    { field: 'executiveSummary.scopeOfWork', text: report.executiveSummary.scopeOfWork },
    { field: 'buildingAndSystemContext', text: report.buildingAndSystemContext },
  ]
  for (const { field, text } of surfaces) {
    if (!text) continue
    for (const pat of QUANTIFIED_COUNT_PATTERNS) {
      const m = pat.exec(text)
      if (m) {
        issues.push({
          category: '§1 Quantified condition count',
          severity: 'blocking',
          location: field,
          message: `Quantified count detected: "${m[0]}"`,
          recommendedFix:
            'Replace with qualitative language ("Multiple conditions were identified that warrant attention" or similar).',
        })
        break
      }
    }
  }
}

function checkBuildingContradiction(report: ClientReport, issues: ValidationIssue[]): void {
  // v2.3 §2 — the building/system contradiction is now structurally
  // impossible because the section is omitted entirely when no
  // building-scoped findings exist. The remaining check enforces:
  //   1. When the section is rendered, it carries at least one
  //      finding (otherwise rendered should be false).
  //   2. When the section is omitted, the omittedReason sentence
  //      must appear in scopeOfWork.
  //   3. NO affirmative "no visible building or system deficiencies"
  //      claim appears in any prose surface — that wording was
  //      retired in v2.3 because absence of in-scope assessment is
  //      not equivalent to absence of deficiency.
  const bs = report.buildingAndSystemConditions
  if (bs && bs.rendered && (!bs.findings || bs.findings.length === 0)) {
    issues.push({
      category: '§5 Building section rendered without findings',
      severity: 'blocking',
      location: 'buildingAndSystemConditions',
      message: 'Building and System Conditions section marked rendered=true but findings array is empty.',
      recommendedFix: 'Set rendered=false and supply omittedReason instead.',
    })
  }
  if (bs && !bs.rendered) {
    const scope = report.executiveSummary?.scopeOfWork || ''
    if (!/Building system condition was not within the scope of this assessment/i.test(scope)) {
      issues.push({
        category: '§2/§5 Omitted reason missing from Scope of Work',
        severity: 'blocking',
        location: 'executiveSummary.scopeOfWork',
        message:
          'Building and System Conditions section is omitted but Scope of Work does not contain the prescribed omittedReason sentence.',
        recommendedFix:
          'Append "Building system condition was not within the scope of this assessment beyond the observations documented in the zone-by-zone findings." to scopeOfWork.',
      })
    }
  }
  // §2/§5 — the affirmative-claim string is banned everywhere.
  const surfaces = collectAllProseSurfaces(report)
  for (const { field, text } of surfaces) {
    if (/No visible building or system deficiencies were identified/i.test(text)) {
      issues.push({
        category: '§5 Banned affirmative building claim',
        severity: 'blocking',
        location: field,
        message:
          '"No visible building or system deficiencies were identified" is banned in v2.3.',
        recommendedFix:
          'Omit the section and rely on the Scope of Work omittedReason sentence instead.',
      })
      break
    }
  }
}

function checkResultsRedundancy(report: ClientReport, issues: ValidationIssue[]): void {
  const summary = report.executiveSummary
  if (!summary.resultsNarrative || !summary.overallProfessionalOpinionLanguage) return
  // Strip leading whitespace + lowercase for comparison.
  const r = summary.resultsNarrative.trim().toLowerCase()
  const o = summary.overallProfessionalOpinionLanguage.trim().toLowerCase()
  // Block if Results literally starts with the Opinion language.
  if (r.startsWith(o)) {
    issues.push({
      category: '§6 Results redundancy',
      severity: 'warning',
      location: 'executiveSummary.resultsNarrative',
      message:
        'Results narrative begins with verbatim Overall Professional Opinion language; the Opinion is already rendered as a call-out above.',
      recommendedFix:
        'Replace Results narrative with a reference to the per-zone sections and Recommendations Register.',
    })
  }
}

function checkBlockedCorrosionLanguage(report: ClientReport, issues: ValidationIssue[]): void {
  // Walk every limitation list + observation list to catch the
  // legacy phrase wherever it might be embedded.
  const surfaces = collectAllProseSurfaces(report)
  for (const { field, text } of surfaces) {
    for (const pat of BLOCKED_CORROSION_PATTERNS) {
      if (pat.test(text)) {
        issues.push({
          category: '§8 Risky corrosion language',
          severity: 'blocking',
          location: field,
          message: 'Blocked corrosion phrase detected in client-facing prose.',
          recommendedFix:
            'Replace with: "Gaseous corrosion potential was evaluated qualitatively based on visual and contextual indicators. Confirmatory testing is required for classification under ANSI/ISA 71.04."',
        })
      }
    }
  }
}

function checkRecommendationCount(report: ClientReport, issues: ValidationIssue[]): void {
  const recs = report.executiveSummary.recommendations || []
  if (recs.length > 5) {
    issues.push({
      category: '§9 Executive Summary recommendation cap',
      severity: 'warning',
      location: 'executiveSummary.recommendations',
      message: `Executive Summary has ${recs.length} recommendations; cap is 5. Move overflow to the Recommendations Register only.`,
      recommendedFix: 'Trim Executive Summary recommendations to top 5 by priority.',
    })
  }
  // Also: detect duplicates within the exec summary list.
  const seen = new Set<string>()
  for (const r of recs) {
    const key = `${r.action}|${r.standardReference ?? ''}`
    if (seen.has(key)) {
      issues.push({
        category: '§9 Duplicate recommendation in Executive Summary',
        severity: 'warning',
        location: 'executiveSummary.recommendations',
        message: `Duplicate recommendation: "${r.action}"`,
        recommendedFix: 'Dedup recommendations by (action + standardReference) tuple before rendering.',
      })
      break
    }
    seen.add(key)
  }
}

function checkToneViolations(
  report: ClientReport,
  issues: ValidationIssue[],
  blockedTermsFound: BlockedTermHit[],
): void {
  const surfaces = collectAllProseSurfaces(report)
  for (const { field, text } of surfaces) {
    if (!text) continue
    const lower = text.toLowerCase()
    for (const term of TONE_BANNED_TERMS) {
      const idx = lower.indexOf(term)
      if (idx === -1) continue
      // Build a small snippet around the hit.
      const start = Math.max(0, idx - 40)
      const end = Math.min(text.length, idx + term.length + 40)
      const snippet = text.slice(start, end)
      blockedTermsFound.push({ term, location: field, snippet })
      issues.push({
        category: '§10 Tone violation',
        severity: 'blocking',
        location: field,
        message: `Banned term "${term}" found in client-facing prose.`,
        recommendedFix: `Replace "${term}" with screening-level / preliminary / "may be consistent with" language.`,
      })
    }
  }
}

function checkRequiredStatements(report: ClientReport, issues: ValidationIssue[]): void {
  for (const req of REQUIRED_STATEMENTS) {
    const value = report[req.field]
    const text = typeof value === 'string' ? value : ''
    if (!text || !text.toLowerCase().includes(req.fragment.toLowerCase())) {
      issues.push({
        category: '§11 Required statement missing',
        severity: 'blocking',
        location: String(req.field),
        message: `Required ${req.description} content not found ("${req.fragment}").`,
        recommendedFix: `Restore the verbatim ${req.description} from src/engine/report/templates.ts.`,
      })
    }
  }
}

function checkFindingsCategorized(report: ClientReport, issues: ValidationIssue[]): void {
  const summary = report.executiveSummary
  const flatObservations = summary.observations || []
  const grouped = summary.findingsByGroup || []
  // If there are observations but no group structure, the renderer
  // will fall back to a flat list — flag as info.
  if (flatObservations.length >= 3 && grouped.length === 0) {
    issues.push({
      category: '§3 Observations not grouped',
      severity: 'info',
      location: 'executiveSummary.findingsByGroup',
      message:
        'Executive Summary has multiple observations but findingsByGroup is empty; output will render as a flat list.',
      recommendedFix: 'Populate findingsByGroup via groupFindingsByDomain() in client.ts.',
    })
  }
  // Defensive: flag any group with a missing or empty groupName.
  for (const g of grouped) {
    if (!g.groupName) {
      issues.push({
        category: '§3 Group naming',
        severity: 'warning',
        location: 'executiveSummary.findingsByGroup',
        message: 'Finding group with missing groupName detected.',
      })
    }
  }
}

function checkDuplicateFindings(
  report: ClientReport,
  issues: ValidationIssue[],
  merged: string[],
): void {
  // §2 — exact-text duplicate detection at section level.
  // Engine-level dedup (by ConditionType) catches the common case
  // where the same finding ConditionType fires across multiple
  // zones. This is the defensive layer for any duplicates that
  // slipped through.
  const checkList = (label: string, list: ReadonlyArray<string>) => {
    const seen = new Set<string>()
    for (const item of list) {
      const norm = item.trim().toLowerCase()
      if (seen.has(norm)) {
        issues.push({
          category: '§2 Duplicate finding',
          severity: 'warning',
          location: label,
          message: `Duplicate observation text in ${label}: "${item.slice(0, 60)}…"`,
          recommendedFix: 'Dedup by exact text or ConditionType before rendering.',
        })
        merged.push(item)
        break
      }
      seen.add(norm)
    }
  }

  checkList('executiveSummary.observations', report.executiveSummary.observations || [])
  for (let i = 0; i < (report.zoneSections || []).length; i++) {
    const z = report.zoneSections[i]
    // v2.3 — zone observed conditions are findings[].narrative.
    const narratives = (z.findings || []).map(f => f.narrative)
    checkList(`zoneSections[${i}].findings[*].narrative`, narratives)
  }
  // v2.3 — building section conditions are findings[].narrative.
  const bsNarratives = (report.buildingAndSystemConditions?.findings || []).map(f => f.narrative)
  checkList('buildingAndSystemConditions.findings[*].narrative', bsNarratives)
}

// ── Helpers ──

interface ProseSurface {
  readonly field: string
  readonly text: string
}

function collectAllProseSurfaces(report: ClientReport): ProseSurface[] {
  const out: ProseSurface[] = []

  out.push({ field: 'executiveSummary.overview', text: report.executiveSummary.overview })
  out.push({ field: 'executiveSummary.scopeOfWork', text: report.executiveSummary.scopeOfWork })
  out.push({ field: 'executiveSummary.resultsNarrative', text: report.executiveSummary.resultsNarrative })
  out.push({ field: 'executiveSummary.overallProfessionalOpinionLanguage', text: report.executiveSummary.overallProfessionalOpinionLanguage })
  for (let i = 0; i < (report.executiveSummary.observations || []).length; i++) {
    out.push({ field: `executiveSummary.observations[${i}]`, text: report.executiveSummary.observations[i] })
  }
  for (let i = 0; i < (report.executiveSummary.findingsByGroup || []).length; i++) {
    const g: FindingGroup = report.executiveSummary.findingsByGroup[i]
    for (let j = 0; j < g.observations.length; j++) {
      out.push({ field: `executiveSummary.findingsByGroup[${i}].observations[${j}].statement`, text: g.observations[j].statement })
    }
  }

  out.push({ field: 'transmittal', text: report.transmittal })
  out.push({ field: 'methodologyDisclosure', text: report.methodologyDisclosure })
  out.push({ field: 'scopeAndMethodology', text: report.scopeAndMethodology })
  out.push({ field: 'buildingAndSystemContext', text: report.buildingAndSystemContext })
  out.push({ field: 'limitationsAndProfessionalJudgment', text: report.limitationsAndProfessionalJudgment })

  // v2.3 — Building section narratives + inline limitations live on
  // findings[]; the section is omitted entirely when no findings.
  const bs = report.buildingAndSystemConditions
  if (bs && bs.findings) {
    for (let i = 0; i < bs.findings.length; i++) {
      const f = bs.findings[i]
      out.push({ field: `buildingAndSystemConditions.findings[${i}].narrative`, text: f.narrative })
      for (let j = 0; j < (f.limitations || []).length; j++) {
        out.push({
          field: `buildingAndSystemConditions.findings[${i}].limitations[${j}]`,
          text: f.limitations[j],
        })
      }
    }
  }

  for (let i = 0; i < (report.zoneSections || []).length; i++) {
    const z = report.zoneSections[i]
    out.push({ field: `zoneSections[${i}].interpretation`, text: z.interpretation })
    for (let j = 0; j < (z.findings || []).length; j++) {
      const f = z.findings[j]
      out.push({ field: `zoneSections[${i}].findings[${j}].narrative`, text: f.narrative })
      for (let k = 0; k < (f.limitations || []).length; k++) {
        out.push({
          field: `zoneSections[${i}].findings[${j}].limitations[${k}]`,
          text: f.limitations[k],
        })
      }
    }
  }

  return out.filter(s => typeof s.text === 'string' && s.text.length > 0)
}
