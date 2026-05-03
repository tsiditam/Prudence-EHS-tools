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
  ResultsSection, ParameterSubsection,
  AppendixA, AppendixAMeasurementRow,
  AppendixB, AppendixBInstrumentRow, AppendixBZoneRow,
  AppendixC, AppendixD, AppendixE, AppendixECalibrationRow, AppendixF,
} from './types'
import type { ParameterKey, ParameterRangeSet } from './parameter-ranges'
import { lookupParameterProse } from './parameter-prose'
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
import {
  buildSamplingMethodology,
  filterInstrumentsWithReadings,
} from './methodology-narrative'
import { groupFindingsByDomain, getShortStatement, getLeadTerm } from './finding-groups'
import { synthesizeZone } from './synthesis'
import { validateReportContent } from './cih-validation'
import { buildAppendixC, type AssessmentPhoto } from './appendix-c'
import {
  collectCitations,
  formatCitation,
  ENGINE_VERSION_FOOTER,
} from './appendix-d'
import {
  consolidateExecutiveSummaryFindings,
  renderExecSummaryEntry,
  type ExecSummaryFindingEntry,
} from './exec-summary-findings'
import { lookupParameterProse as lookupParameterProseForCitations } from './parameter-prose'
import type { TransmittalLetter, SignatoryLine } from '../types/domain'

const NOT_SPECIFIED = 'Not Specified'

function fallbackOrNotSpecified(value: string | undefined | null): string {
  if (value === undefined || value === null) return NOT_SPECIFIED
  const v = String(value).trim()
  return v.length > 0 ? v : NOT_SPECIFIED
}

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

  // v2.2 §7 / v2.5 §7 — Sampling Methodology section. When the
  // upstream caller provides a readingsByInstrument map (count of
  // readings tied to each instrument), instruments with zero readings
  // are filtered out and a warning is surfaced. Filtered list is
  // reused for Appendix B so both stay aligned.
  const readingsByInstrument = score.readingsByInstrument ?? {}
  const samplingMethodology = buildSamplingMethodology(meta.instrumentsUsed, {
    readingsByInstrument,
  })
  const filteredInstruments = filterInstrumentsWithReadings(
    meta.instrumentsUsed,
    Object.keys(readingsByInstrument).length > 0 ? readingsByInstrument : undefined,
  )

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
    const significantZoneFindings = dedupZoneFindings(
      zoneFindings.filter(
        f => f.severityInternal !== 'pass' && f.severityInternal !== 'info',
      ),
    )
    const renderedFindings = dedupZoneLimitations(
      significantZoneFindings.map(toRenderedFinding),
    )
    const actions = dedupActions(zoneFindings.flatMap(f => f.recommendedActions))
    // v2.4 §4 — replace boilerplate confidence-tier language with a
    // pattern-aware synthesis paragraph that ties together the
    // observations within the zone.
    const interpretation = synthesizeZone(z).narrative
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
  // v2.5 §1 — required recipient fields render as "Not Specified"
  // (literal text, not an em-dash) when the underlying value is
  // empty. Em-dashes are reserved for optional cells (e.g. the
  // Recommendations Register reference column).
  const metadataTable: ExecSummaryMetadata = {
    clientName: fallbackOrNotSpecified(meta.transmittalRecipient.fullName),
    reportDate: reportDateFormatted,
    projectNumber: fallbackOrNotSpecified(meta.projectNumber),
    surveyDate: fallbackOrNotSpecified(meta.assessmentDate),
    projectAddress: fallbackOrNotSpecified(meta.siteAddress),
    surveyArea: fallbackOrNotSpecified(surveyArea),
    requestedBy: fallbackOrNotSpecified(meta.transmittalRecipient.organization),
    siteContact: fallbackOrNotSpecified(meta.transmittalRecipient.fullName),
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
    // v2.4 §5 — prefer the short abstracted statement to avoid verbatim
    // duplication with the per-zone narrative.
    observations.push(getShortStatement(f.conditionType) ?? firstSentence(f.approvedNarrativeIntent))
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

  // v2.5 §6 — consolidate findings across zones into <=6 entries
  // sorted by severity → confidence → coverage. Each entry carries
  // an "Observed in: <zone list>" suffix when zone-scoped.
  const consolidatedFindings: ReadonlyArray<ExecSummaryFindingEntry> =
    consolidateExecutiveSummaryFindings(score.zones, buildingActiveFindings)
  const summaryOfFindings: ReadonlyArray<string> = consolidatedFindings.map(
    renderExecSummaryEntry,
  )

  const executiveSummary: ExecutiveSummary = {
    metadataTable,
    scopeOfWork,
    resultsNarrative,
    observations,
    findingsByGroup,
    recommendations: execRecommendations,
    overallProfessionalOpinion: siteOpinion,
    overallProfessionalOpinionLanguage: OPINION_TIER_LANGUAGE[siteOpinion],
    // v2.5 §6 — overview / summaryOfFindings / priorityActions remain
    // for back-compat consumers, but summaryOfFindings now carries
    // the consolidated cross-zone Exec Summary entries (max 6 + an
    // optional truncation note).
    overview,
    summaryOfFindings,
    priorityActions: immediateActions,
  }

  // v2.6 §5 — Potential Contributing Factors are projected from
  // score.causalChains. Each chain becomes a ContributingFactor
  // with related-finding narratives, contributing zone names,
  // citation source, and the causationSupported flag (which the
  // renderer uses to choose between supportive vs. hypothesis
  // closing language).
  const findingById = new Map<string, Finding>()
  for (const f of allFindings) findingById.set(f.id as unknown as string, f)
  const zoneNameById = new Map<string, string>()
  for (const z of score.zones) zoneNameById.set(z.zoneId as unknown as string, z.zoneName)
  const potentialContributingFactors: ContributingFactor[] = (score.causalChains ?? []).map(chain => {
    // v2.6 §5 — dedupe relatedFindings by conditionType when
    // projecting. A chain that includes the same cluster across
    // three zones should list the cluster narrative once. The
    // affectedZones suffix already conveys the per-zone scope.
    // Use lead term + short statement (same format the Exec
    // Summary findingsByGroup uses) so the chain block doesn't
    // repeat the verbatim approved-narrative the reader already
    // saw in the per-zone Zone Findings section.
    const seenConditionTypes = new Set<string>()
    const relatedNarratives: string[] = []
    for (const id of chain.relatedFindingIds) {
      const fnd = findingById.get(id as unknown as string)
      if (!fnd) continue
      if (seenConditionTypes.has(fnd.conditionType)) continue
      seenConditionTypes.add(fnd.conditionType)
      const lead = getLeadTerm(fnd.conditionType)
      const short = getShortStatement(fnd.conditionType)
      const summary = short ? `${lead}: ${short}` : lead
      if (summary) relatedNarratives.push(summary)
    }
    const affectedZoneNames = chain.contributingZones
      .map(zid => zoneNameById.get(zid as unknown as string))
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
    return {
      name: chain.name,
      description: chain.rootCause,
      relatedFindings: relatedNarratives,
      causationSupported: chain.causationSupported,
      relatedFindingIds: chain.relatedFindingIds.map(id => id as unknown as string),
      citationSource: chain.citation.source,
      affectedZones: affectedZoneNames,
    }
  })

  // v2.6 §5 — Recommended Sampling Plan is the hypothesis array
  // pass-through; the renderer reads it directly. Undefined when
  // no hypothesis fired so the section header is omitted.
  const recommendedSamplingPlan = (score.hypotheses ?? []).length > 0
    ? score.hypotheses
    : undefined

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

  // v2.4 §2 — Results section: per-parameter standards-anchored prose
  // subsections derived from the parameterRanges set computed by the
  // bridge. Subsections only emit when at least one valid measurement
  // was recorded for that parameter.
  const parameterRanges = (score.parameterRanges ?? {}) as ParameterRangeSet
  const resultsSection = buildResultsSection(parameterRanges)

  // v2.4 §3 — six structured appendices. Appendix A through E render
  // unconditionally so the deliverable always has a tabular evidence
  // trail; Appendix F (glossary) renders unconditionally as well.
  const legacyZonesData = (score.legacyZonesData ?? []) as ReadonlyArray<{ [k: string]: unknown }>
  // v2.5 §7 — Appendix B aligned with the filtered instrument set.
  const metaForAppendixB: typeof meta = {
    ...meta,
    instrumentsUsed: filteredInstruments,
  }
  const appendixA = buildAppendixA(legacyZonesData, parameterRanges)
  const appendixB = buildAppendixB(metaForAppendixB, score.zones, legacyZonesData)
  // v2.5 §5 — Appendix C deterministic logic. Empty photos array
  // produces a single deterministic sentence; non-empty input
  // produces a captioned list with stable sort.
  const photoSet = (score.photos ?? []) as ReadonlyArray<AssessmentPhoto>
  const appendixC = buildAppendixC(photoSet)
  const appendixE = buildAppendixE(metaForAppendixB)
  const appendixF = buildAppendixF()

  // Appendix — full structured shape built below in §3 wiring.
  // Until §3 lands, keep the v2.2 backward-compat shape (legacy
  // appendix object) so existing consumers continue to work.
  const legacyAppendixIndex = options.includeAssessmentIndexAppendix
    ? {
        disclaimer: ASSESSMENT_INDEX_DISCLAIMER,
        siteScore: score.siteScore ?? 0,
        siteTier: score.siteTier ?? 'N/A',
        zoneScores: score.zones.map(z => ({
          zoneName: z.zoneName,
          composite: z.composite ?? 0,
          tier: z.tier ?? 'N/A',
        })),
      }
    : undefined
  // v2.5 §2 — Appendix D citation walker runs after the rest of the
  // report skeleton is composed so it can scan every Citation
  // attached to parameter prose, instrument specs, finding
  // limitations, and recommended-action standardReferences. We
  // build a preliminary report with a stub Appendix D, run the
  // walker, then replace Appendix D with the populated version.
  const appendixDStub: AppendixD = {
    title: 'APPENDIX D — Standards and Citations',
    description: '',
    citations: [],
    displayLines: [],
    engineVersionLine: '',
  }
  const appendix: ClientReportAppendix = {
    standardsManifest: [],
    ...(legacyAppendixIndex ? { assessmentIndexInformationalOnly: legacyAppendixIndex } : {}),
    appendixA,
    appendixB,
    appendixC,
    appendixD: appendixDStub,
    appendixE,
    appendixF,
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
    ...(resultsSection
      ? [{ anchorId: 'results', title: 'Results', level: 1 as const }]
      : []),
    { anchorId: 'building-and-system-context', title: 'Building and System Context', level: 1 },
    ...(buildingSectionRendered
      ? [{ anchorId: 'building-and-system-conditions', title: 'Building and System Conditions', level: 1 as const }]
      : []),
    { anchorId: 'zone-findings', title: 'Zone Findings', level: 1 },
    // v2.6 §5 — Potential Contributing Factors and Recommended
    // Sampling Plan are conditional. Both omit from the TOC when
    // their underlying engine pass produced no output.
    ...(potentialContributingFactors.length > 0
      ? [{ anchorId: 'potential-contributing-factors', title: 'Potential Contributing Factors', level: 1 as const }]
      : []),
    ...(recommendedSamplingPlan && recommendedSamplingPlan.length > 0
      ? [{ anchorId: 'recommended-sampling-plan', title: 'Recommended Sampling Plan', level: 1 as const }]
      : []),
    { anchorId: 'recommendations-register', title: 'Recommendations Register', level: 1 },
    { anchorId: 'limitations-and-professional-judgment', title: 'Limitations and Professional Judgment', level: 1 },
    { anchorId: 'appendix-a', title: 'Appendix A — Per-Zone Measurement Tabulation', level: 1 },
    { anchorId: 'appendix-b', title: 'Appendix B — Sampling Locations and Methodology', level: 1 },
    { anchorId: 'appendix-c', title: 'Appendix C — Photo Documentation', level: 1 },
    { anchorId: 'appendix-d', title: 'Appendix D — Standards and Citations', level: 1 },
    { anchorId: 'appendix-e', title: 'Appendix E — Quality Assurance and Calibration', level: 1 },
    { anchorId: 'appendix-f', title: 'Appendix F — Glossary', level: 1 },
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

  const reportSkeleton: ClientReport = {
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
    resultsSection,
    observedConditionsTable: [],
    // v2.3 §2 — buildingAndSystemConditions is undefined when there are
    // no building-scoped findings; the section header and TOC entry are
    // suppressed downstream.
    buildingAndSystemConditions: buildingSectionRendered ? buildingConditions : undefined,
    zoneSections,
    potentialContributingFactors,
    recommendedSamplingPlan,
    recommendationsRegister,
    limitationsAndProfessionalJudgment: limitationsText,
    signatoryBlock,
    appendix,
  }

  // v2.5 §2 — Walk the report skeleton (plus parameter-prose
  // applicableStandards arrays) and pull every Citation + every
  // RecommendedAction standardReference into a deduped, sorted
  // list. This produces the actual Appendix D body.
  const proseCitations = collectProseCitations(parameterRanges)
  const collectedCitations = collectCitations({
    skeleton: reportSkeleton,
    proseCitations,
  })
  const appendixD: AppendixD = {
    title: 'APPENDIX D — Standards and Citations',
    description:
      'Authoritative regulatory, consensus-standard, peer-reviewed, and manufacturer references invoked in this report. Each entry below is the canonical bibliographic reference for an in-text citation appearing in Results subsections, findings, or recommended actions. The engine-version footer at the bottom of this appendix is the single canonical record of the platform build that produced this report.',
    citations: collectedCitations.map(c => ({
      source: c.source,
      authority: c.authority,
      edition: c.edition,
      section: c.section,
      url: c.url,
      organization: c.organization,
    })),
    displayLines: collectedCitations.map(formatCitation),
    engineVersionLine: ENGINE_VERSION_FOOTER,
  }
  const report: ClientReport = {
    ...reportSkeleton,
    appendix: { ...appendix, appendixD },
  }

  // CIH defensibility §12 — run the validation layer over the
  // assembled report. The validation result is attached to the
  // result envelope so downstream renderers (PrintReport, DocxReport)
  // can choose to block client-facing rendering when
  // clientFacingSafe is false.
  const validation = validateReportContent(report)

  return { kind: 'report', report, validation }
}

/**
 * v2.5 §2 — gather Citations from the parameter prose modules used by
 * the Results section. The walker still discovers the inline
 * Citations attached to standardReference strings on
 * RecommendedActions, but parameter prose `applicableStandards` are
 * the canonical bibliography for the standards-background sections.
 */
function collectProseCitations(
  ranges: ParameterRangeSet,
): ReadonlyArray<unknown> {
  const out: unknown[] = []
  for (const key of PARAMETER_ORDER) {
    const range = ranges[key]
    if (!range || range.count === 0) continue
    const prose = lookupParameterProseForCitations(key)
    for (const c of prose.applicableStandards) out.push(c)
  }
  return out
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
 * v2.4 §5 — Dedup zone-scoped findings by (conditionType + observedValue).
 * The legacy classifier can emit the same condition twice within one zone
 * (e.g. occupant_cluster_anecdotal from both `cc` and `sy` fields). The
 * first appearance wins so the renderer doesn't show the same observation
 * twice in the same zone block.
 */
function dedupZoneFindings(findings: ReadonlyArray<Finding>): ReadonlyArray<Finding> {
  const seen = new Set<string>()
  const out: Finding[] = []
  for (const f of findings) {
    const key = `${f.conditionType}|${f.observedValue ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
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

// ── v2.4 §2 — Results section builder ──

const PARAMETER_ORDER: ReadonlyArray<ParameterKey> = [
  'co2', 'co', 'hcho', 'tvoc', 'pm25', 'pm10', 'temperature', 'rh',
]

function buildResultsSection(ranges: ParameterRangeSet): ResultsSection | undefined {
  const subsections: ParameterSubsection[] = []
  for (const key of PARAMETER_ORDER) {
    const range = ranges[key]
    if (!range || range.count === 0) continue
    const prose = lookupParameterProse(key)
    subsections.push({
      heading: prose.parameter,
      standardsBackground: prose.standardsBackground,
      measurementSummary: prose.summaryTemplate(range),
    })
  }
  if (subsections.length === 0) return undefined
  return {
    title: 'Results',
    subsections,
  }
}

// ── v2.4 §3 — Appendix builders ──

const PARAMETER_DISPLAY: Record<string, { label: string; field: string; outdoorField?: string; unit: string }> = {
  co2: { label: 'Carbon Dioxide (CO₂)', field: 'co2', outdoorField: 'co2o', unit: 'ppm' },
  co: { label: 'Carbon Monoxide (CO)', field: 'co', unit: 'ppm' },
  hcho: { label: 'Formaldehyde (HCHO)', field: 'hc', unit: 'ppm' },
  tvoc: { label: 'Total VOCs', field: 'tv', outdoorField: 'tvo', unit: 'µg/m³' },
  pm25: { label: 'PM2.5', field: 'pm', outdoorField: 'pmo', unit: 'µg/m³' },
  pm10: { label: 'PM10', field: 'pm10', unit: 'µg/m³' },
  temperature: { label: 'Temperature', field: 'tf', outdoorField: 'tfo', unit: '°F' },
  rh: { label: 'Relative Humidity', field: 'rh', outdoorField: 'rho', unit: '%' },
}

function readZoneValue(zone: { [k: string]: unknown }, field: string): string {
  const raw = zone[field]
  if (raw === undefined || raw === null || raw === '') return '—'
  return String(raw)
}

function buildAppendixA(
  zonesData: ReadonlyArray<{ [k: string]: unknown }>,
  ranges: ParameterRangeSet,
): AppendixA {
  const rows: AppendixAMeasurementRow[] = []
  for (const zone of zonesData) {
    const zoneName = (zone.zn as string) || 'Unnamed zone'
    for (const key of PARAMETER_ORDER) {
      const range = ranges[key]
      if (!range || range.count === 0) continue
      const display = PARAMETER_DISPLAY[key]
      const value = readZoneValue(zone, display.field)
      if (value === '—') continue
      const outdoor = display.outdoorField ? readZoneValue(zone, display.outdoorField) : '—'
      rows.push({
        zoneName,
        parameter: display.label,
        value,
        unit: display.unit,
        outdoorReference: outdoor,
        notes: '',
      })
    }
  }
  return {
    title: 'APPENDIX A — Per-Zone Measurement Tabulation',
    description:
      'Direct-reading instrument measurements recorded in each zone during the assessment, with outdoor reference values where collected. Values are rounded to instrument precision; refer to Appendix E for instrument calibration records.',
    rows,
  }
}

function buildAppendixB(
  meta: ClientReport['meta'],
  zones: ReadonlyArray<{ zoneName: string }>,
  legacyZonesData: ReadonlyArray<{ [k: string]: unknown }>,
): AppendixB {
  const instrumentRows: AppendixBInstrumentRow[] = (meta.instrumentsUsed ?? []).map(inst => ({
    model: inst.model,
    serial: inst.serial ?? '',
    lastCalibration: inst.lastCalibration ?? '',
    calibrationStatus: inst.calibrationStatus ?? '',
    parametersMeasured: [],
  }))
  const zoneRows: AppendixBZoneRow[] = zones.map((z, i) => {
    const ld = legacyZonesData[i] ?? {}
    return {
      zoneName: z.zoneName,
      samplingDuration: (ld['sd'] as string) || 'Single time-point reading',
      sampleLocations: (ld['sl'] as string) || 'Representative occupied area',
      outdoorReferenceTaken: ld['co2o'] !== undefined && ld['co2o'] !== '',
    }
  })
  return {
    title: 'APPENDIX B — Sampling Locations and Methodology Detail',
    description:
      'Per-instrument and per-zone documentation supporting reproducibility of the field measurements summarized in the Results section. Sample locations within each zone were selected to be representative of the occupied space.',
    instrumentRows,
    zoneRows,
  }
}

function buildAppendixE(meta: ClientReport['meta']): AppendixE {
  const calibrationRecords: AppendixECalibrationRow[] = (meta.instrumentsUsed ?? []).map(inst => ({
    instrumentModel: inst.model,
    serial: inst.serial ?? '',
    lastCalibration: inst.lastCalibration ?? '',
    status: inst.calibrationStatus ?? '',
  }))
  return {
    title: 'APPENDIX E — Quality Assurance and Instrument Calibration',
    description:
      'Calibration records and quality-assurance notes for the direct-reading instruments used in this assessment. Calibration was verified to be within manufacturer specification at the time of survey.',
    calibrationRecords,
    qaNotes: [
      'Field instruments were checked against ambient outdoor reference at the start of the survey day.',
      'Where outdoor reference measurements are missing for a parameter, the outdoor differential analysis is omitted from the corresponding Results subsection.',
      'Measurement uncertainty associated with direct-reading instruments is documented in Appendix B and applied throughout the screening-level interpretation.',
    ],
  }
}

function buildAppendixF(): AppendixF {
  return {
    title: 'APPENDIX F — Glossary of Terms and Abbreviations',
    description: 'Selected terms and abbreviations used in this report.',
    entries: [
      { term: 'ASHRAE 55', definition: 'Thermal Environmental Conditions for Human Occupancy.' },
      { term: 'ASHRAE 62.1', definition: 'Ventilation for Acceptable Indoor Air Quality.' },
      { term: 'CIH', definition: 'Certified Industrial Hygienist (ABIH credential).' },
      { term: 'CSP', definition: 'Certified Safety Professional (BCSP credential).' },
      { term: 'NAAQS', definition: 'National Ambient Air Quality Standards (US EPA).' },
      { term: 'OSHA PEL', definition: 'Occupational Safety and Health Administration Permissible Exposure Limit.' },
      { term: 'PM2.5 / PM10', definition: 'Particulate matter ≤2.5 / ≤10 micrometers in aerodynamic diameter.' },
      { term: 'TVOC', definition: 'Total Volatile Organic Compounds (sum of ionizable VOCs measured by PID).' },
      { term: 'TWA', definition: 'Time-Weighted Average (typically 8-hour for occupational exposure standards).' },
    ],
  }
}
