/**
 * AtmosFlow Engine v2.1 — Client Report Renderer
 * CIH-defensible client deliverable. No scores, no severity labels,
 * no internal fields. Professional opinion backed by phrase library.
 */

import type { AssessmentScore, Finding, RecommendedAction } from '../types/domain'
import type {
  ClientReportResult, ClientReport, ClientRenderOptions,
  CoverPage, ExecutiveSummary, ExecSummaryMetadata, ZoneSection, ContributingFactor,
  RecommendationsRegister, SignatoryBlock, ClientReportAppendix,
  ObservedConditionRow, TableOfContents, TocEntry,
  RenderedFinding, BuildingAndSystemConditionsSection,
} from './types'
import { ENGINE_VERSION } from '../types/citation'
import { evaluateSiteOpinion, OPINION_TIER_LANGUAGE, CONFIDENCE_TIER_LANGUAGE } from './professional-opinion'
import { shouldRefuseToIssue, buildPreAssessmentMemo } from './pre-assessment-memo'
import {
  TRANSMITTAL_PARAGRAPH, SCOPE_PARAGRAPH, LIMITATIONS_PARAGRAPH,
  DATA_CENTER_CONTEXT_PARAGRAPH, ASSESSMENT_INDEX_DISCLAIMER,
  CIH_REQUIRED_LIMITATION, DRAFT_WATERMARK, DRAFT_COVER_NOTICE,
  COVER_METHODOLOGY_LINE, METHODOLOGY_DISCLOSURE_PARAGRAPH,
  buildTransmittalBody, buildTransmittalSubject, buildTransmittalSalutation,
} from './templates'
import { buildSamplingMethodology } from './methodology-narrative'
import { groupFindingsByDomain } from './finding-groups'
import { validateReportContent } from './cih-validation'
import type { TransmittalLetter, SignatoryLine } from '../types/domain'

export function renderClientReport(
  score: AssessmentScore,
  options: ClientRenderOptions = {},
): ClientReportResult {
  // Check refusal-to-issue first
  const refusal = shouldRefuseToIssue(score)
  if (refusal.refuse) {
    return {
      kind: 'pre_assessment_memo',
      memo: buildPreAssessmentMemo(score, refusal.reasons),
      reasons: refusal.reasons,
    }
  }

  const meta = score.meta
  const siteOpinion = evaluateSiteOpinion(score.zones)
  const isDraft = meta.reviewStatus === 'draft_pending_professional_review'
  const showWatermark = options.draftWatermark ?? isDraft

  // Validate final-issued requirements
  if (meta.reviewStatus === 'final_issued_to_client') {
    if (!meta.reviewingProfessional) {
      throw new Error('final_issued_to_client requires a reviewingProfessional')
    }
    if (!meta.reviewingProfessional.signatureDate) {
      throw new Error('final_issued_to_client requires reviewingProfessional.signatureDate')
    }
  }

  if (meta.reviewStatus === 'reviewed_by_qualified_professional' && !meta.reviewingProfessional) {
    throw new Error('reviewed_by_qualified_professional requires a reviewingProfessional')
  }

  // Cover page
  const cover: CoverPage = {
    title: 'Indoor Air Quality Evaluation',
    facility: meta.siteName,
    location: meta.siteAddress,
    date: meta.assessmentDate,
    preparedBy: `${meta.preparingAssessor.fullName}, ${meta.preparingAssessor.credentials.join(', ')} — ${meta.issuingFirm.name}`,
    status: meta.reviewStatus,
    methodologyLine: COVER_METHODOLOGY_LINE,
    draftNotice: showWatermark ? DRAFT_COVER_NOTICE : undefined,
  }

  // v2.2 §3 — letter-format transmittal
  const preparingSignatory: SignatoryLine = {
    fullName: meta.preparingAssessor.fullName,
    credentials: meta.preparingAssessor.credentials,
    title: 'Preparing Assessor',
  }
  const reviewerSignatory: SignatoryLine | undefined = meta.reviewingProfessional
    ? {
        fullName: meta.reviewingProfessional.fullName,
        credentials: meta.reviewingProfessional.credentials.slice(),
        title: 'Reviewing Qualified Professional',
        licenseNumbers: meta.reviewingProfessional.licenseNumbers,
      }
    : undefined
  const transmittalLetter: TransmittalLetter = {
    date: meta.assessmentDate,
    recipient: meta.transmittalRecipient,
    projectNumber: meta.projectNumber,
    subjectLine: buildTransmittalSubject(meta),
    salutation: buildTransmittalSalutation(meta.transmittalRecipient),
    bodyParagraphs: buildTransmittalBody({ meta }),
    closing: 'Sincerely,',
    signatoryFirm: meta.issuingFirm.name.toUpperCase(),
    preparedBy: reviewerSignatory ? [preparingSignatory, reviewerSignatory] : [preparingSignatory],
  }

  // v2.2 §7 — Sampling Methodology section
  const samplingMethodology = buildSamplingMethodology(meta.instrumentsUsed)

  // v2.2 §1b — partition findings by scope before rendering. Building-
  // scoped findings (HVAC, water management) render once in the
  // dedicated Building and System Conditions section. Zone-scoped
  // findings render per-zone.
  const allFindingsRaw = score.zones.flatMap(z => z.categories.flatMap(c => c.findings))
  const buildingScopedFindings = dedupBuildingFindings(
    allFindingsRaw.filter(f => f.scope === 'building' || f.scope === 'hvac_system'),
  )

  // v2.3 §5 — Build zone sections. Each zone's findings render as
  // self-contained RenderedFinding blocks (narrative + observed
  // value + inline limitations + recommended actions). Per-zone
  // dedup of inline limitations runs after construction.
  const zoneSections: ZoneSection[] = score.zones.map(z => {
    const zoneFindings = z.categories
      .flatMap(c => c.findings)
      .filter(f => f.scope === 'zone')
    const significantZoneFindings = zoneFindings.filter(
      f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
    )
    const renderedFindings = dedupZoneLimitations(
      significantZoneFindings.map(toRenderedFinding),
    )
    const actions = dedupActions(zoneFindings.flatMap(f => f.recommendedActions))
    const interpretation = CONFIDENCE_TIER_LANGUAGE[z.confidence]
    const opinionLanguage = OPINION_TIER_LANGUAGE[z.professionalOpinion]

    return {
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      zoneDescription: '', // optional; renderer omits when empty
      samplingSummary: '', // optional; renderer omits when empty
      findings: renderedFindings,
      interpretation,
      recommendedActions: actions,
      professionalOpinion: z.professionalOpinion,
      professionalOpinionLanguage: opinionLanguage,
    }
  })

  // v2.3 §2 — Building and System Conditions section is OMITTED
  // entirely (header + TOC entry) when no building-scoped findings
  // exist. We do NOT render an affirmative "no deficiencies"
  // placeholder — absence of in-scope assessment is not equivalent
  // to absence of deficiency. The omittedReason is appended to
  // Scope of Work instead.
  const buildingActiveFindings = buildingScopedFindings.filter(
    f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
  )
  const buildingConditions: BuildingAndSystemConditionsSection =
    buildingActiveFindings.length > 0
      ? {
          rendered: true,
          findings: buildingActiveFindings.map(toRenderedFinding),
        }
      : {
          rendered: false,
          findings: [],
          omittedReason: 'no building-scoped findings produced by this assessment',
        }
  const buildingSectionRendered = buildingConditions.rendered

  // Executive summary
  // Building-scoped findings already deduplicated; merge with zone-scoped
  // for site-level summary aggregations.
  const zoneScopedFindings = allFindingsRaw.filter(f => f.scope === 'zone')
  const allFindings = [...zoneScopedFindings, ...buildingScopedFindings]
  const significantFindings = allFindings.filter(f => f.severityInternal !== 'pass' && f.severityInternal !== 'info')
  const immediateActions = dedupActions(
    allFindings.flatMap(f => f.recommendedActions.filter(a => a.priority === 'immediate')),
  )
  // v2.2 §1c — Recommendations register deduplicated by (action+ref)
  // tuple. Preserves order by first appearance. Computed up here so
  // the executive summary can reference the same deduped list.
  const allActions = dedupActions(allFindings.flatMap(f => f.recommendedActions))

  // CIH defensibility §1 — overview MUST NOT include quantified
  // condition counts. "11 conditions warranting attention" reads as
  // a dashboard, not a consultant report. Use qualitative language
  // and let the per-finding sections carry the detail.
  const overview = significantFindings.length > 0
    ? `An indoor air quality evaluation was conducted at ${meta.siteName} on ${meta.assessmentDate}. Multiple conditions were identified that warrant attention; per-zone detail and recommendations follow.`
    : `An indoor air quality evaluation was conducted at ${meta.siteName} on ${meta.assessmentDate}. No significant conditions were identified within the stated limitations.`

  // v2.2 §6 — Executive Summary restructure: 4-row metadata table +
  // four narrative blocks. The 29-bullet "summaryOfFindings" exhaust
  // dump from v2.1 is removed from rendered exec summary content but
  // preserved on the type for backward compat.
  const reportDateFormatted = new Date().toISOString().slice(0, 10)
  const surveyArea = score.zones.length > 0
    ? score.zones.map(z => z.zoneName).join(', ')
    : 'Not specified'
  const metadataTable: ExecSummaryMetadata = {
    clientName: meta.transmittalRecipient.fullName,
    reportDate: reportDateFormatted,
    projectNumber: meta.projectNumber,
    surveyDate: meta.assessmentDate,
    projectAddress: meta.siteAddress,
    surveyArea,
    requestedBy: meta.transmittalRecipient.organization,
    siteContact: meta.transmittalRecipient.fullName,
  }

  // v2.3 §2 — when the Building and System Conditions section is
  // omitted (no building-scoped findings), the Scope of Work
  // narrative gains an explicit sentence acknowledging that
  // building system condition was not within the assessment scope
  // beyond what was documented in zone-by-zone findings.
  const scopeOfWorkBase =
    `${meta.issuingFirm.name} performed an indoor air quality evaluation at ${meta.siteName} on ${meta.assessmentDate}. The assessment covered ${score.zones.length} zone${score.zones.length !== 1 ? 's' : ''} (${surveyArea}). Direct-reading instruments were used to measure indoor environmental parameters; observed building and system conditions were documented per generally accepted industrial hygiene practices. Detailed measurement ranges and per-zone results are presented in the Results section and supporting tables.`
  const scopeOfWork = buildingActiveFindings.length === 0
    ? `${scopeOfWorkBase} Building system condition was not within the scope of this assessment beyond the observations documented in the zone-by-zone findings.`
    : scopeOfWorkBase

  // CIH defensibility §6 — Results must NOT just repeat the Overall
  // Professional Opinion (which is rendered immediately above as a
  // call-out). Reference the per-zone and Recommendations Register
  // sections instead. Also no quantified counts here per §1.
  // v2.3 §2 — only mention the Building and System Conditions section
  // when it actually renders; otherwise the no-building fixture's
  // narrative would name a section it doesn't have.
  const resultsNarrative = significantFindings.length > 0
    ? (buildingActiveFindings.length > 0
        ? `Screening-level observations identified conditions that warrant further evaluation. Detailed findings are presented in the zone-specific sections and the Recommendations Register. Per-parameter measurement ranges and comparisons against applicable regulatory standards and industry guidelines are summarized in the Results section. Building-level conditions affecting the HVAC system are summarized in the Building and System Conditions section.`
        : `Screening-level observations identified conditions that warrant further evaluation. Detailed findings are presented in the zone-specific sections and the Recommendations Register. Per-parameter measurement ranges and comparisons against applicable regulatory standards and industry guidelines are summarized in the Results section.`)
    : `Screening-level observations did not identify conditions warranting further evaluation within the stated limitations. Per-parameter measurement ranges are summarized in the Results section.`

  // Observations: dedup the top significant findings to 3-6 entries by
  // distinct conditionType. Preserve order by first appearance. Uses
  // the engine-approved narrative intent (NOT titleInternal, which is
  // internal-only) truncated to the first sentence so the CTSI-style
  // observations list stays terse.
  // CIH defensibility §9 — cap observations at 5 distinct
  // ConditionTypes; the full list lives in the per-zone sections.
  const observationConditionTypes = new Set<string>()
  const observations: string[] = []
  for (const f of significantFindings) {
    if (observationConditionTypes.has(f.conditionType)) continue
    observationConditionTypes.add(f.conditionType)
    observations.push(firstSentence(f.approvedNarrativeIntent))
    if (observations.length >= 5) break
  }

  // Recommendations: top 3-6 from the deduped allActions, prioritized
  // immediate > short_term > further_evaluation > long_term.
  const priorityOrder: Record<string, number> = {
    immediate: 0, short_term: 1, further_evaluation: 2, long_term: 3,
  }
  const sortedActions = [...allActions].sort(
    (a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99),
  )
  // CIH defensibility §9 — Executive Summary recommendations capped
  // at 5 priority items. The full deduped list lives in the
  // Recommendations Register.
  const execRecommendations = sortedActions.slice(0, 5)

  // v2.2 visual upgrade — group significant findings by reader-
  // friendly domain. Empty groups are omitted.
  const findingsByGroup = groupFindingsByDomain(significantFindings)

  const executiveSummary: ExecutiveSummary = {
    metadataTable,
    scopeOfWork,
    resultsNarrative,
    observations,
    findingsByGroup,
    recommendations: execRecommendations,
    overallProfessionalOpinion: siteOpinion,
    overallProfessionalOpinionLanguage: OPINION_TIER_LANGUAGE[siteOpinion],
    // Backward-compat fields preserved on the type.
    overview,
    summaryOfFindings: significantFindings.map(f => f.approvedNarrativeIntent),
    priorityActions: immediateActions,
  }

  // Contributing factors (from causal chains — use contributory language unless causation supported)
  const potentialContributingFactors: ContributingFactor[] = []

  const recommendationsRegister: RecommendationsRegister = {
    immediate: allActions.filter(a => a.priority === 'immediate'),
    shortTerm: allActions.filter(a => a.priority === 'short_term'),
    furtherEvaluation: allActions.filter(a => a.priority === 'further_evaluation'),
    longTermOptional: allActions.filter(a => a.priority === 'long_term'),
  }

  // Signatory block
  const signatoryBlock: SignatoryBlock = {
    preparedBy: {
      name: meta.preparingAssessor.fullName,
      credentials: meta.preparingAssessor.credentials.join(', '),
      firm: meta.issuingFirm.name,
      contact: [meta.issuingFirm.contact?.email, meta.issuingFirm.contact?.phone].filter(Boolean).join(' | '),
    },
    reviewedBy: meta.reviewingProfessional ? {
      name: meta.reviewingProfessional.fullName,
      credentials: meta.reviewingProfessional.credentials.join(', '),
      licenseNumbers: (meta.reviewingProfessional.licenseNumbers || []).join(', '),
    } : null,
    status: meta.reviewStatus,
    draftWatermark: showWatermark,
  }

  // CIH-required limitation check
  const hasCIHRequiredFindings = allFindings.some(f =>
    f.conditionType === 'possible_corrosive_environment' ||
    f.conditionType === 'particle_screening_only' ||
    f.conditionType === 'apparent_microbial_growth' ||
    f.definitiveConclusionAllowed
  )
  const reviewerIsCIH = meta.reviewingProfessional?.credentials.includes('CIH')
  let limitationsText = LIMITATIONS_PARAGRAPH
  if (hasCIHRequiredFindings && !reviewerIsCIH) {
    limitationsText += ' ' + CIH_REQUIRED_LIMITATION
  }

  // Building context — include data center paragraph if applicable
  let buildingContext = `Assessment conducted at ${meta.siteName}, ${meta.siteAddress}.`

  // Appendix
  const appendix: ClientReportAppendix = {
    standardsManifest: [],
  }

  if (options.includeAssessmentIndexAppendix) {
    appendix.assessmentIndexInformationalOnly = {
      disclaimer: ASSESSMENT_INDEX_DISCLAIMER,
      siteScore: score.siteScore ?? 0,
      siteTier: score.siteTier ?? 'N/A',
      zoneScores: score.zones.map(z => ({
        zoneName: z.zoneName,
        composite: z.composite ?? 0,
        tier: z.tier ?? 'N/A',
      })),
    }
  }

  // v2.2 §5 — Table of Contents enumerating every body section that
  // will render. Order matches the rendered HTML/DOCX output.
  // Per-zone entries are NOT individually enumerated — the parent
  // "Zone Findings" section covers them; otherwise a 12-zone
  // assessment would produce a 24-line TOC.
  // v2.3 §2 — Building and System Conditions TOC entry is omitted
  // when no building-scoped findings exist (matches body rendering).
  const tocEntries: TocEntry[] = [
    { anchorId: 'methodology-disclosure', title: 'Methodology Disclosure', level: 1 },
    { anchorId: 'executive-summary', title: 'Executive Summary', level: 1 },
    { anchorId: 'scope-and-methodology', title: 'Scope and Methodology', level: 1 },
    { anchorId: 'sampling-methodology', title: 'Sampling Methodology', level: 1 },
    { anchorId: 'building-and-system-context', title: 'Building and System Context', level: 1 },
    ...(buildingSectionRendered
      ? [{ anchorId: 'building-and-system-conditions', title: 'Building and System Conditions', level: 1 as const }]
      : []),
    { anchorId: 'zone-findings', title: 'Zone Findings', level: 1 },
    { anchorId: 'recommendations-register', title: 'Recommendations Register', level: 1 },
    { anchorId: 'limitations-and-professional-judgment', title: 'Limitations and Professional Judgment', level: 1 },
  ]
  if (options.includeAssessmentIndexAppendix) {
    tocEntries.push({
      anchorId: 'appendix-assessment-index',
      title: 'Appendix — Assessment Index (Informational Only)',
      level: 1,
    })
  }
  const tableOfContents: TableOfContents = {
    title: 'Table of Contents',
    entries: tocEntries,
  }

  const report: ClientReport = {
    engineVersion: ENGINE_VERSION,
    generatedAt: Date.now(),
    meta,
    reviewStatus: meta.reviewStatus,
    cover,
    transmittal: TRANSMITTAL_PARAGRAPH,
    transmittalLetter,
    methodologyDisclosure: METHODOLOGY_DISCLOSURE_PARAGRAPH,
    tableOfContents,
    executiveSummary,
    scopeAndMethodology: SCOPE_PARAGRAPH,
    samplingMethodology,
    buildingAndSystemContext: buildingContext,
    observedConditionsTable: [],
    // v2.3 §2 — buildingAndSystemConditions is undefined when there are
    // no building-scoped findings; the section header and TOC entry are
    // suppressed downstream.
    buildingAndSystemConditions: buildingSectionRendered ? buildingConditions : undefined,
    zoneSections,
    potentialContributingFactors,
    recommendationsRegister,
    limitationsAndProfessionalJudgment: limitationsText,
    signatoryBlock,
    appendix,
  }

  // CIH defensibility §12 — run the validation layer over the
  // assembled report. The validation result is attached to the
  // result envelope so downstream renderers (PrintReport, DocxReport)
  // can choose to block client-facing rendering when
  // clientFacingSafe is false.
  const validation = validateReportContent(report)

  return { kind: 'report', report, validation }
}

// ── v2.2 §6 — first-sentence helper for CTSI-style observations ──

function firstSentence(text: string): string {
  // Match first sentence ending in . ! ? followed by space or end.
  const m = /^[^.!?]*[.!?](?=\s|$)/.exec(text)
  if (m) return m[0].trim()
  return text.length <= 120 ? text : text.slice(0, 117).trimEnd() + '…'
}

// ── v2.2 §1b/§1c — dedup helpers ──

/**
 * Dedup building-scoped findings by conditionType. Different zones may
 * produce findings with the same conditionType (e.g., the legacy
 * scoreZone(zone, bldg) reads HVAC fields off the building data on
 * every per-zone call). The first appearance wins to preserve order.
 */
function dedupBuildingFindings(findings: ReadonlyArray<Finding>): ReadonlyArray<Finding> {
  const seen = new Set<string>()
  const out: Finding[] = []
  for (const f of findings) {
    if (seen.has(f.conditionType)) continue
    seen.add(f.conditionType)
    out.push(f)
  }
  return out
}

/**
 * Dedup recommended actions by (action text + standardReference) tuple.
 * Preserves order by first appearance.
 */
function dedupActions(actions: ReadonlyArray<RecommendedAction>): ReadonlyArray<RecommendedAction> {
  const seen = new Set<string>()
  const out: RecommendedAction[] = []
  for (const a of actions) {
    const key = `${a.action} ${a.standardReference ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

// ── v2.3 §3 / §6 — RenderedFinding + per-zone limitations dedup ──

/**
 * Transform an engine Finding into a self-contained RenderedFinding
 * for the renderer. The narrative comes from the engine-approved
 * intent template; observed value, limitations, and recommended
 * actions are pulled directly off the Finding.
 */
function toRenderedFinding(f: Finding): RenderedFinding {
  return {
    findingId: f.id,
    conditionType: f.conditionType,
    narrative: f.approvedNarrativeIntent,
    observedValue: f.observedValue,
    limitations: f.limitations,
    recommendedActions: f.recommendedActions,
    confidenceTierLanguage: CONFIDENCE_TIER_LANGUAGE[f.confidenceTier],
  }
}

/**
 * v2.3 §6 — Per-zone dedup of inline limitations. When the same
 * limitation string appears on multiple findings in the same zone,
 * it renders only beneath the first finding it appears on. Cross-
 * zone dedup is NOT applied.
 */
function dedupZoneLimitations(findings: ReadonlyArray<RenderedFinding>): ReadonlyArray<RenderedFinding> {
  const seen = new Set<string>()
  return findings.map(f => ({
    ...f,
    limitations: f.limitations.filter(l => {
      if (seen.has(l)) return false
      seen.add(l)
      return true
    }),
  }))
}
