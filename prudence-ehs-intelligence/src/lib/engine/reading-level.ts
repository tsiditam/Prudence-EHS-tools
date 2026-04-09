/**
 * Reading Level Rewrite Engine
 * Generates structured prompts for AI-assisted rewriting at different levels.
 * This layer ONLY rewrites approved findings — it MUST NOT create new facts.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 * Contact: tsidi@prudenceehs.com
 */

export type ReadingLevel =
  | 'grade_5_6'
  | 'grade_8'
  | 'high_school'
  | 'technical_professional'
  | 'executive_concise'
  | 'regulator_formal';

export type OutputMode =
  | 'technical_review'
  | 'executive_summary'
  | 'worker_explanation'
  | 'supervisor_guidance'
  | 'regulator_formal'
  | 'redline_suggestion';

export interface FindingOutput {
  findingCode: string;
  title: string;
  classification: string;
  severity: string;
  evidenceBasis: string;
  whyItMatters: string;
  recommendedAction: string;
  citations: string[];
}

export interface RewrittenFinding {
  findingCode: string;
  originalTitle: string;
  rewrittenTitle: string;
  rewrittenEvidenceBasis: string;
  rewrittenWhyItMatters: string;
  rewrittenRecommendedAction: string;
  readingLevel: ReadingLevel;
  outputMode: OutputMode;
}

// --- Safe Phrase Templates By Level ---

const SAFE_PHRASES: Record<ReadingLevel, string[]> = {
  grade_5_6: [
    'We looked at the safety papers and found...',
    'The papers did not clearly show...',
    'A safety expert should check this.',
    'This is something that should be fixed to help keep people safe.',
  ],
  grade_8: [
    'Based on what we reviewed...',
    'The document did not include clear information about...',
    'This should be reviewed by a safety professional.',
    'This gap could create a safety concern.',
  ],
  high_school: [
    'Based on the materials reviewed...',
    'No evidence was identified for...',
    'This may warrant review by a qualified EHS professional.',
    'The following required element was not clearly defined in the submitted materials.',
  ],
  technical_professional: [
    'Based on the materials reviewed...',
    'No evidence was identified for...',
    'The following required element was not clearly defined...',
    'Unable to determine from the submitted materials...',
    'This may warrant review by a qualified EHS professional.',
  ],
  executive_concise: [
    'Review identified...',
    'Gap in...',
    'Action recommended:',
    'Professional review advised.',
  ],
  regulator_formal: [
    'Upon review of the submitted documentation...',
    'The submitted program documentation does not appear to address...',
    'No evidence was identified in the submitted materials to substantiate...',
    'It is recommended that the responsible party engage a qualified professional to evaluate...',
  ],
};

// --- Rewrite Prompt Generation ---

const LEVEL_INSTRUCTIONS: Record<ReadingLevel, string> = {
  grade_5_6:
    'Rewrite this finding for a 5th-6th grade reading level. Use simple words, short sentences. Explain safety concepts in everyday language. Do not use technical jargon or regulatory citations. Do not create new facts or change the finding.',
  grade_8:
    'Rewrite this finding for an 8th grade reading level. Use clear, straightforward language. Briefly explain any technical terms. Keep sentences moderate length. Do not create new facts or change the finding.',
  high_school:
    'Rewrite this finding for a high school reading level. Use clear language with limited technical terms. Include brief explanations of regulatory concepts. Do not create new facts or change the finding.',
  technical_professional:
    'Present this finding at a technical professional level. Use standard EHS terminology. Include full regulatory references. Maintain precision and accuracy. Do not create new facts or change the finding.',
  executive_concise:
    'Rewrite this finding for executive leadership. Be concise — use bullet points. Focus on business risk, liability exposure, and recommended action priority. Do not create new facts or change the finding.',
  regulator_formal:
    'Rewrite this finding in formal regulatory language suitable for submission to a regulatory body. Use precise legal and regulatory terminology. Reference applicable standards. Do not create new facts or change the finding.',
};

const MODE_INSTRUCTIONS: Record<OutputMode, string> = {
  technical_review:
    'Format as a technical review finding with evidence basis, analysis, and recommendation.',
  executive_summary:
    'Format as an executive summary bullet point with risk level, business impact, and action item.',
  worker_explanation:
    'Format as a worker-friendly explanation of what was found and what it means for their safety.',
  supervisor_guidance:
    'Format as supervisor guidance with what was found, why it matters for their team, and what to do next.',
  regulator_formal:
    'Format as a formal regulatory finding with citation, evidence, and corrective action language.',
  redline_suggestion:
    'Generate suggested replacement language for the program document. Show what the document should say instead.',
};

/**
 * Generate a rewrite prompt for a finding at a specific reading level.
 * This produces the prompt — the AI layer executes it.
 */
export function generateRewritePrompt(
  finding: FindingOutput,
  level: ReadingLevel,
  mode: OutputMode
): string {
  const levelInstr = LEVEL_INSTRUCTIONS[level];
  const modeInstr = MODE_INSTRUCTIONS[mode];
  const safePhrases = SAFE_PHRASES[level];

  return `You are a citation-bound EHS/IAQ drafting engine. You may only rewrite the following approved finding. You MUST NOT create new facts, invent citations, or change the classification or severity.

FINDING:
- Code: ${finding.findingCode}
- Title: ${finding.title}
- Classification: ${finding.classification}
- Severity: ${finding.severity}
- Evidence Basis: ${finding.evidenceBasis}
- Why It Matters: ${finding.whyItMatters}
- Recommended Action: ${finding.recommendedAction}
- Citations: ${finding.citations.join(', ')}

READING LEVEL INSTRUCTIONS:
${levelInstr}

OUTPUT MODE INSTRUCTIONS:
${modeInstr}

SAFE PHRASE TEMPLATES TO USE:
${safePhrases.map((p) => `- "${p}"`).join('\n')}

CONSTRAINTS:
- Do not state that a facility is legally compliant or noncompliant
- Do not invent new citations or thresholds
- Do not add information not present in the original finding
- Use safe, qualified language throughout
- Every statement must be traceable to the original finding above

Rewrite the finding now:`;
}

/**
 * Generate a redline suggestion for a finding.
 */
export function generateRedlinePrompt(finding: FindingOutput): string {
  return `You are a citation-bound EHS/IAQ drafting engine. Based on the following finding, generate suggested replacement language that could be inserted into the program document to address the identified gap.

FINDING:
- Code: ${finding.findingCode}
- Title: ${finding.title}
- Evidence Basis: ${finding.evidenceBasis}
- Recommended Action: ${finding.recommendedAction}
- Citations: ${finding.citations.join(', ')}

INSTRUCTIONS:
- Generate one or two paragraphs of suggested program language
- Use brackets [like this] for site-specific items that must be filled in
- Do not claim compliance or make legal determinations
- Reference the applicable standard where appropriate
- The language should be suitable for direct insertion into a written program

Generate the redline suggestion now:`;
}

/**
 * Get safe phrases for a reading level.
 */
export function getSafePhrases(level: ReadingLevel): string[] {
  return SAFE_PHRASES[level] || SAFE_PHRASES.technical_professional;
}
