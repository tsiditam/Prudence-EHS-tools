/**
 * AtmosFlow Engine v2.1 — Client Report Renderer
 * CIH-defensible client deliverable. No scores, no severity labels,
 * no internal fields. Professional opinion backed by phrase library.
 */

import type { AssessmentScore, RecommendedAction } from '../types/domain'
import type {
  ClientReportResult, ClientReport, ClientRenderOptions,
  CoverPage, ExecutiveSummary, ZoneSection, ContributingFactor,
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
  COVER_METHODOLOGY_LINE,
} from './templates'

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

  // Build zone sections
  const zoneSections: ZoneSection[] = score.zones.map(z => {
    const findings = z.categories.flatMap(c => c.findings)
    const conditions = findings
      .filter(f => f.severityInternal !== 'pass' && f.severityInternal !== 'info')
      .map(f => f.approvedNarrativeIntent)
    const limitations = findings.flatMap(f => f.limitations)
    const actions = findings.flatMap(f => f.recommendedActions)
    const interpretation = CONFIDENCE_TIER_LANGUAGE[z.confidence]

    return {
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      observedConditions: conditions.length > 0 ? conditions : ['No significant conditions identified within the stated limitations.'],
      interpretation,
      dataLimitations: [...new Set(limitations)],
      recommendedActions: actions,
      professionalOpinion: z.professionalOpinion,
    }
  })

  // Executive summary
  const allFindings = score.zones.flatMap(z => z.categories.flatMap(c => c.findings))
  const significantFindings = allFindings.filter(f => f.severityInternal !== 'pass' && f.severityInternal !== 'info')
  const immediateActions = allFindings.flatMap(f => f.recommendedActions.filter(a => a.priority === 'immediate'))

  const overview = significantFindings.length > 0
    ? `An indoor air quality evaluation was conducted at ${meta.siteName} on ${meta.assessmentDate}. ${significantFindings.length} condition${significantFindings.length !== 1 ? 's' : ''} warranting attention ${significantFindings.length !== 1 ? 'were' : 'was'} identified across ${score.zones.length} assessed zone${score.zones.length !== 1 ? 's' : ''}.`
    : `An indoor air quality evaluation was conducted at ${meta.siteName} on ${meta.assessmentDate}. No significant conditions were identified within the stated limitations.`

  const executiveSummary: ExecutiveSummary = {
    overview,
    summaryOfFindings: significantFindings.map(f => f.approvedNarrativeIntent),
    overallProfessionalOpinion: siteOpinion,
    overallProfessionalOpinionLanguage: OPINION_TIER_LANGUAGE[siteOpinion],
    priorityActions: immediateActions,
  }

  // Contributing factors (from causal chains — use contributory language unless causation supported)
  const potentialContributingFactors: ContributingFactor[] = []

  // Recommendations register
  const allActions = allFindings.flatMap(f => f.recommendedActions)
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
    executiveSummary,
    scopeAndMethodology: SCOPE_PARAGRAPH,
    buildingAndSystemContext: buildingContext,
    observedConditionsTable: [],
    zoneSections,
    potentialContributingFactors,
    recommendationsRegister,
    limitationsAndProfessionalJudgment: limitationsText,
    signatoryBlock,
    appendix,
  }

  return { kind: 'report', report }
}
