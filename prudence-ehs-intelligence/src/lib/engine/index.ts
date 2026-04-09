/**
 * Engine Module Barrel Export
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 */

export { RuleEngine } from './rule-engine';
export { extractFacts, extractOSHAFacts, extractASHRAEFacts } from './fact-extractor';
export type { ExtractedFact } from './fact-extractor';
export { classifyFinding, assessSeverity } from './finding-classifier';
export type { FindingClassification, FindingSeverity, MissingEvidence } from './finding-classifier';
export { linkCitations, getCitationCoverage } from './citation-linker';
export type { CitationLink, FindingForCitation, ReferenceRecord } from './citation-linker';
export { generateRewritePrompt, generateRedlinePrompt, getSafePhrases } from './reading-level';
export type { ReadingLevel, OutputMode, FindingOutput, RewrittenFinding } from './reading-level';
