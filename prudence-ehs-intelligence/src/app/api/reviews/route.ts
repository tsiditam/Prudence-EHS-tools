/**
 * Reviews API Route
 * Handles creating and listing document reviews.
 *
 * POST /api/reviews — Create a new review (upload + run engine)
 * GET /api/reviews — List all reviews
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseDocument, getFileExtension } from '@/lib/parsers';
import { RuleEngine } from '@/lib/engine/rule-engine';
import { extractFacts } from '@/lib/engine/fact-extractor';
import { classifyFinding, assessSeverity } from '@/lib/engine/finding-classifier';
import { linkCitations } from '@/lib/engine/citation-linker';
import { oshaRulePacks } from '@/data/rules/osha-rules';
import { ashraeRulePacks } from '@/data/rules/ashrae-rules';
import { oshaReferences } from '@/data/references/osha-references';
import { ashraeReferences } from '@/data/references/ashrae-references';

// Map track identifiers to rule pack IDs
const TRACK_TO_PACKS: Record<string, string[]> = {
  'hazcom': ['osha-hazcom'],
  'loto': ['osha-loto'],
  'eap': ['osha-eap'],
  'respiratory': ['osha-resppro'],
  'ashrae-62.1': ['ashrae-62.1'],
  'ashrae-62.2': ['ashrae-62.2'],
  'ashrae-55': ['ashrae-55'],
  'ashrae-241': ['ashrae-241'],
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const standardTrack = formData.get('standardTrack') as string;
    const documentType = formData.get('documentType') as string;
    const outputMode = formData.get('outputMode') as string | null;
    const readingLevel = formData.get('readingLevel') as string | null;

    if (!file || !standardTrack || !documentType) {
      return NextResponse.json(
        { error: 'Missing required fields: file, standardTrack, documentType' },
        { status: 400 }
      );
    }

    // 1. Parse document
    const ext = getFileExtension(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument(buffer, file.name, ext);

    // 2. Extract facts
    const facts = extractFacts(parsed.fullText, documentType, standardTrack);

    // 3. Resolve applicable rule packs
    const packIds = TRACK_TO_PACKS[standardTrack] || [];
    const allPacks = [...oshaRulePacks, ...ashraeRulePacks];
    const applicablePacks = allPacks.filter((p) => packIds.includes(p.packId));
    const rules = applicablePacks.flatMap((p) =>
      p.rules.map((r) => ({ ...r, rulePackId: p.packId }))
    );

    // 4. Run rule engine
    const engine = new RuleEngine();
    const engineResult = engine.run(facts, rules, {
      documentType,
      standardTrack,
      applicableRulePacks: packIds,
    });

    // 5. Link citations
    const allReferences = [...oshaReferences, ...ashraeReferences];
    const citations = linkCitations(engineResult.findings, allReferences);

    // 6. Compute overall score
    const totalRules = rules.length;
    const passedRules = totalRules - engineResult.findings.length;
    const overallScore =
      totalRules > 0 ? Math.round((passedRules / totalRules) * 100) : 0;

    // 7. Build review result
    const reviewResult = {
      reviewId: crypto.randomUUID(),
      fileName: file.name,
      fileType: ext,
      documentType,
      standardTrack,
      applicableRulePacks: packIds,
      status: 'completed' as const,
      overallScore,
      extractedFacts: facts,
      findings: engineResult.findings.map((f, i) => ({
        ...f,
        citations: citations.filter((c) => c.findingCode === f.findingCode),
      })),
      escalations: engineResult.escalations,
      expertReviewFlag: engineResult.escalations.length > 0,
      outputMode: outputMode || 'technical_professional',
      readingLevel: readingLevel || 'technical_professional',
      overallSummary: generateSummary(engineResult.findings, facts, standardTrack),
      reviewCompletedAt: new Date().toISOString(),
    };

    return NextResponse.json(reviewResult);
  } catch (error) {
    console.error('Review creation error:', error);
    return NextResponse.json(
      { error: 'Failed to process review. Please try again.' },
      { status: 500 }
    );
  }
}

function generateSummary(
  findings: Array<{ findingCode: string; title: string; severity: string; classification: string }>,
  facts: Array<{ factKey: string; factStatus: string }>,
  standardTrack: string
): string {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const regulatory = findings.filter(
    (f) => f.classification === 'regulatory_deficiency'
  ).length;
  const benchmark = findings.filter(
    (f) => f.classification === 'technical_benchmark_gap'
  ).length;
  const confirmed = facts.filter((f) => f.factStatus === 'confirmed').length;
  const notFound = facts.filter((f) => f.factStatus === 'not_found').length;

  const parts: string[] = [];

  parts.push(
    `Based on the materials reviewed, the intelligence engine identified ${findings.length} finding(s) across the ${standardTrack} review track.`
  );

  if (critical > 0 || high > 0) {
    parts.push(
      `Of these, ${critical} are classified as critical severity and ${high} as high severity.`
    );
  }

  if (regulatory > 0) {
    parts.push(
      `${regulatory} finding(s) relate to potential regulatory deficiencies that may warrant review by a qualified EHS professional.`
    );
  }

  if (benchmark > 0) {
    parts.push(
      `${benchmark} finding(s) represent technical benchmark gaps relative to applicable consensus standards.`
    );
  }

  parts.push(
    `The review extracted ${facts.length} fact(s) from the submitted document, of which ${confirmed} were confirmed and ${notFound} were not identified in the materials provided.`
  );

  parts.push(
    'This analysis is reference-backed and does not constitute a compliance determination or legal conclusion.'
  );

  return parts.join(' ');
}

export async function GET() {
  // In production, this would query the database
  // For MVP, return empty array
  return NextResponse.json([]);
}
