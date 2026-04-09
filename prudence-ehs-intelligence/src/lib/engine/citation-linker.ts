/**
 * Citation Linker
 * Links findings to authoritative reference citations.
 * Falls back to safe language when no reference is available.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

export interface FindingForCitation {
  findingCode: string;
  citationBundle: string[];
  topic: string;
  evidenceBasis: string;
}

export interface ReferenceRecord {
  referenceId: string;
  authorityName: string;
  authorityType: string;
  title: string;
  sectionNumber: string;
  citationText: string;
  plainLanguageSummary: string;
  officialSourceUrl: string;
}

export interface CitationLink {
  findingCode: string;
  referenceId: string;
  shortCitation: string;
  sourceTitle: string;
  authorityName: string;
  plainLanguageSummary: string;
  supportingExcerpt: string;
  officialSourceUrl: string;
}

const NO_REFERENCE_MESSAGE =
  'No authoritative reference identified in the approved library.';

/**
 * Link findings to their referenced citations.
 */
export function linkCitations(
  findings: FindingForCitation[],
  references: ReferenceRecord[]
): CitationLink[] {
  const refMap = new Map<string, ReferenceRecord>();
  for (const ref of references) {
    refMap.set(ref.referenceId, ref);
  }

  const links: CitationLink[] = [];

  for (const finding of findings) {
    if (!finding.citationBundle || finding.citationBundle.length === 0) {
      links.push({
        findingCode: finding.findingCode,
        referenceId: '',
        shortCitation: NO_REFERENCE_MESSAGE,
        sourceTitle: '',
        authorityName: '',
        plainLanguageSummary: NO_REFERENCE_MESSAGE,
        supportingExcerpt: '',
        officialSourceUrl: '',
      });
      continue;
    }

    for (const citationId of finding.citationBundle) {
      const ref = refMap.get(citationId);
      if (ref) {
        links.push({
          findingCode: finding.findingCode,
          referenceId: ref.referenceId,
          shortCitation: `${ref.authorityName} ${ref.sectionNumber}`,
          sourceTitle: ref.title,
          authorityName: ref.authorityName,
          plainLanguageSummary: ref.plainLanguageSummary,
          supportingExcerpt: ref.citationText,
          officialSourceUrl: ref.officialSourceUrl,
        });
      } else {
        links.push({
          findingCode: finding.findingCode,
          referenceId: citationId,
          shortCitation: citationId,
          sourceTitle: '',
          authorityName: '',
          plainLanguageSummary:
            'Reference exists in citation bundle but was not found in the approved library.',
          supportingExcerpt: '',
          officialSourceUrl: '',
        });
      }
    }
  }

  return links;
}

/**
 * Get citation coverage percentage for a set of findings.
 */
export function getCitationCoverage(
  findings: FindingForCitation[],
  references: ReferenceRecord[]
): number {
  if (findings.length === 0) return 100;

  const refIds = new Set(references.map((r) => r.referenceId));
  let covered = 0;

  for (const finding of findings) {
    const hasCitation =
      finding.citationBundle &&
      finding.citationBundle.some((id) => refIds.has(id));
    if (hasCitation) covered++;
  }

  return Math.round((covered / findings.length) * 100);
}
