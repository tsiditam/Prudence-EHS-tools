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
  ObservedConditionRow,
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

  // Build zone sections (zone-scoped findings only). Data limitations
  // are NOT rendered per-zone — they consolidate up to the building
  // level so the same screening-methodology caveat doesn't repeat for
  // every zone (per user direction). Zone sections still carry the
  // dataLimitations field on the type contract but it is left empty.
  const zoneSections: ZoneSection[] = score.zones.map(z => {
    const findings = z.categories
      .flatMap(c => c.findings)
      .filter(f => f.scope === 'zone')
    const conditions = findings
      .filter(f => f.severityInternal !== 'pass' && f.severityInternal !== 'info')
      .map(f => f.approvedNarrativeIntent)
    const actions = dedupActions(findings.flatMap(f => f.recommendedActions))
    const interpretation = CONFIDENCE_TIER_LANGUAGE[z.confidence]

    return {
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      observedConditions: conditions.length > 0 ? conditions : ['No significant conditions identified within the stated limitations.'],
      interpretation,
      dataLimitations: [], // consolidated to building-level (see buildingConditions below)
      recommendedActions: actions,
      professionalOpinion: z.professionalOpinion,
    }
  })

  // v2.2 §12 — Building and System Conditions section. Data limitations
  // consolidate from EVERY finding (zone-scoped + building-scoped) into
  // a single deduplicated list so the report has one canonical
  // "Limitations" voice instead of repeating per zone.
  const buildingActiveFindings = buildingScopedFindings.filter(
    f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
  )
  const allLimitations = [
    ...allFindingsRaw.filter(f => f.scope === 'zone').flatMap(f => f.limitations),
    ...buildingScopedFindings.flatMap(f => f.limitations),
  ]
  const buildingConditions = {
    observedConditions: buildingActiveFindings.length > 0
      ? buildingActiveFindings.map(f => f.approvedNarrativeIntent)
      : ['No building or system conditions identified within the stated limitations.'],
    dataLimitations: [...new Set(allLimitations)],
    recommendedActions: dedupActions(buildingScopedFindings.flatMap(f => f.recommendedActions)),
  }

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

  const overview = significantFindings.length > 0
    ? `An indoor air quality evaluation was conducted at ${meta.siteName} on ${meta.assessmentDate}. ${significantFindings.length} condition${significantFindings.length !== 1 ? 's' : ''} warranting attention ${significantFindings.length !== 1 ? 'were' : 'was'} identified across ${score.zones.length} assessed zone${score.zones.length !== 1 ? 's' : ''}.`
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

  const scopeOfWork =
    `${meta.issuingFirm.name} performed an indoor air quality evaluation at ${meta.siteName} on ${meta.assessmentDate}. The assessment covered ${score.zones.length} zone${score.zones.length !== 1 ? 's' : ''} (${surveyArea}). Direct-reading instruments were used to measure indoor environmental parameters; observed building and system conditions were documented per generally accepted industrial hygiene practices. Detailed measurement ranges and per-zone results are presented in the Results section and supporting tables.`

  const resultsNarrative = significantFindings.length > 0
    ? `${OPINION_TIER_LANGUAGE[siteOpinion]} ${significantFindings.length} condition${significantFindings.length !== 1 ? 's' : ''} warrant${significantFindings.length !== 1 ? '' : 's'} attention across the assessed zones. Per-parameter results, including measurement ranges and comparisons against applicable regulatory standards and industry guidelines, are summarized in the Results section. Building-level conditions affecting the HVAC system are summarized in the Building and System Conditions section.`
    : `${OPINION_TIER_LANGUAGE[siteOpinion]} Per-parameter results indicating measurement ranges and comparisons against applicable regulatory standards and industry guidelines are summarized in the Results section.`

  // Observations: dedup the top significant findings to 3-6 entries by
  // distinct conditionType. Preserve order by first appearance. Uses
  // the engine-approved narrative intent (NOT titleInternal, which is
  // internal-only) truncated to the first sentence so the CTSI-style
  // observations list stays terse.
  const observationConditionTypes = new Set<string>()
  const observations: string[] = []
  for (const f of significantFindings) {
    if (observationConditionTypes.has(f.conditionType)) continue
    observationConditionTypes.add(f.conditionType)
    observations.push(firstSentence(f.approvedNarrativeIntent))
    if (observations.length >= 6) break
  }

  // Recommendations: top 3-6 from the deduped allActions, prioritized
  // immediate > short_term > further_evaluation > long_term.
  const priorityOrder: Record<string, number> = {
    immediate: 0, short_term: 1, further_evaluation: 2, long_term: 3,
  }
  const sortedActions = [...allActions].sort(
    (a, b) => (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99),
  )
  const execRecommendations = sortedActions.slice(0, 6)

  const executiveSummary: ExecutiveSummary = {
    metadataTable,
    scopeOfWork,
    resultsNarrative,
    observations,
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

  const report: ClientReport = {
    engineVersion: ENGINE_VERSION,
    generatedAt: Date.now(),
    meta,
    reviewStatus: meta.reviewStatus,
    cover,
    transmittal: TRANSMITTAL_PARAGRAPH,
    transmittalLetter,
    methodologyDisclosure: METHODOLOGY_DISCLOSURE_PARAGRAPH,
    executiveSummary,
    scopeAndMethodology: SCOPE_PARAGRAPH,
    samplingMethodology,
    buildingAndSystemContext: buildingContext,
    observedConditionsTable: [],
    buildingAndSystemConditions: buildingConditions,
    zoneSections,
    potentialContributingFactors,
    recommendationsRegister,
    limitationsAndProfessionalJudgment: limitationsText,
    signatoryBlock,
    appendix,
  }

  return { kind: 'report', report }
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
