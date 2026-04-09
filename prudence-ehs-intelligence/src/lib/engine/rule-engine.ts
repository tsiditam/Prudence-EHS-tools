/**
 * Prudence EHS Intelligence Engine — Deterministic Rule Evaluation Engine
 *
 * This is the core of the system. It does NOT use LLM.
 * It takes extracted facts and a set of rules, evaluates trigger conditions,
 * checks required evidence, and produces findings with classification,
 * severity, citations, and escalation flags.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExtractedFact {
  factKey: string;
  factValue: string;
  factStatus: 'confirmed' | 'inferred' | 'not_found' | 'contradicted';
  sourceExcerpt?: string;
  sourcePage?: string;
  confidence: number;
}

export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'contains' | 'not_found' | 'exists' | 'contradicted' | 'any';
  value?: string;
}

export interface RuleDefinition {
  ruleCode: string;
  rulePackId: string;
  topic: string;
  description: string;
  triggerConditions: TriggerCondition[];
  requiredEvidence: string[];
  findingTitle: string;
  findingClassification: string;
  defaultSeverity: string;
  citationBundle: string[];
  outputTemplate: string;
  escalationThreshold?: number;
}

export interface ReviewContext {
  reviewId: string;
  projectName: string;
  documentType: string;
  standardTrack: string;
  reviewDate: string;
  reviewerNotes?: string;
}

export interface MissingEvidence {
  evidenceKey: string;
  status: 'missing' | 'insufficient' | 'contradicted';
  relatedFact?: ExtractedFact;
  explanation: string;
}

export interface RuleEvaluation {
  ruleCode: string;
  rulePackId: string;
  triggered: boolean;
  triggerConditionsMet: boolean;
  missingEvidence: MissingEvidence[];
  severity: string;
  findingTitle: string;
  findingClassification: string;
  citationBundle: string[];
  outputTemplate: string;
  escalate: boolean;
  escalationReason: string;
  evaluatedAt: string;
  factSnapshot: ExtractedFact[];
}

export interface RuleEngineResult {
  reviewId: string;
  evaluations: RuleEvaluation[];
  totalRulesEvaluated: number;
  totalFindings: number;
  totalEscalations: number;
  summary: RuleEngineSummary;
  executedAt: string;
}

export interface RuleEngineSummary {
  findingsBySeverity: Record<string, number>;
  findingsByClassification: Record<string, number>;
  escalationReasons: string[];
  coveragePercent: number;
}

// ---------------------------------------------------------------------------
// Constants — high-risk hazard keywords and escalation triggers
// ---------------------------------------------------------------------------

const HIGH_RISK_HAZARD_KEYWORDS = [
  'confined_space', 'permit_required', 'fall_protection', 'lockout_tagout',
  'respiratory_hazard', 'chemical_exposure', 'bloodborne_pathogen',
  'electrical_hazard', 'excavation', 'hot_work', 'process_safety',
];

const ACUTE_SYMPTOM_KEYWORDS = [
  'acute', 'immediate', 'emergency', 'life_threatening', 'toxic',
  'asphyxiation', 'anaphylaxis', 'chemical_burn', 'explosion',
];

const INFECTIOUS_AEROSOL_KEYWORDS = [
  'infectious', 'aerosol', 'airborne_infection', 'tuberculosis',
  'measles', 'covid', 'sars', 'legionella', 'healthcare',
];

const MOLD_COMBUSTION_KEYWORDS = [
  'mold', 'mould', 'fungal', 'combustible_dust', 'combustion',
  'flammable_vapor', 'explosive_atmosphere',
];

const UNUSUAL_EXPOSURE_KEYWORDS = [
  'unusual_exposure', 'unknown_substance', 'novel_chemical',
  'unidentified_hazard', 'mixed_exposure', 'synergistic',
];

// ---------------------------------------------------------------------------
// Core evaluation functions
// ---------------------------------------------------------------------------

/**
 * Evaluate whether all trigger conditions for a rule are met against the
 * extracted facts. ALL conditions must pass (logical AND).
 */
export function checkTriggerConditions(
  facts: ExtractedFact[],
  conditions: TriggerCondition[],
): boolean {
  if (conditions.length === 0) return false;

  for (const condition of conditions) {
    const matchingFact = facts.find((f) => f.factKey === condition.field);

    switch (condition.operator) {
      case 'exists':
        if (!matchingFact || matchingFact.factStatus === 'not_found') return false;
        break;

      case 'not_found':
        if (matchingFact && matchingFact.factStatus !== 'not_found') return false;
        break;

      case 'equals':
        if (!matchingFact) return false;
        if (matchingFact.factValue.toLowerCase() !== (condition.value ?? '').toLowerCase()) return false;
        break;

      case 'contains':
        if (!matchingFact) return false;
        if (!matchingFact.factValue.toLowerCase().includes((condition.value ?? '').toLowerCase())) return false;
        break;

      case 'contradicted':
        if (!matchingFact || matchingFact.factStatus !== 'contradicted') return false;
        break;

      case 'any':
        // 'any' always passes — used as a wildcard condition
        break;

      default:
        return false;
    }
  }

  return true;
}

/**
 * Identify which pieces of required evidence are missing or insufficient
 * in the extracted facts.
 */
export function assessMissingEvidence(
  facts: ExtractedFact[],
  requiredEvidence: string[],
): MissingEvidence[] {
  const missing: MissingEvidence[] = [];

  for (const evidenceKey of requiredEvidence) {
    const fact = facts.find((f) => f.factKey === evidenceKey);

    if (!fact) {
      missing.push({
        evidenceKey,
        status: 'missing',
        explanation: `No fact extracted for required evidence key "${evidenceKey}".`,
      });
    } else if (fact.factStatus === 'not_found') {
      missing.push({
        evidenceKey,
        status: 'missing',
        relatedFact: fact,
        explanation: `Evidence "${evidenceKey}" was searched for but not found in the document.`,
      });
    } else if (fact.factStatus === 'contradicted') {
      missing.push({
        evidenceKey,
        status: 'contradicted',
        relatedFact: fact,
        explanation: `Evidence "${evidenceKey}" contains contradictory information: "${fact.factValue}".`,
      });
    } else if (fact.confidence < 0.4) {
      missing.push({
        evidenceKey,
        status: 'insufficient',
        relatedFact: fact,
        explanation: `Evidence "${evidenceKey}" has low confidence (${fact.confidence.toFixed(2)}). Value: "${fact.factValue}".`,
      });
    }
  }

  return missing;
}

/**
 * Determine effective severity based on the rule default, missing evidence,
 * and fact context.
 */
export function determineSeverity(
  rule: RuleDefinition,
  missingEvidence: MissingEvidence[],
  facts: ExtractedFact[],
): string {
  const base = rule.defaultSeverity;

  // If contradicted evidence exists, always escalate to critical
  const hasContradiction = missingEvidence.some((m) => m.status === 'contradicted');
  if (hasContradiction) return 'critical';

  // Count how much required evidence is missing
  const missingCount = missingEvidence.length;
  const requiredCount = rule.requiredEvidence.length;
  const missingRatio = requiredCount > 0 ? missingCount / requiredCount : 0;

  // Check if any facts are high-risk hazard related
  const hasHighRisk = facts.some(
    (f) =>
      HIGH_RISK_HAZARD_KEYWORDS.some(
        (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw.replace(/_/g, ' ')),
      ) && f.factStatus !== 'not_found',
  );

  // Severity ladder
  if (missingRatio >= 0.75 && hasHighRisk) return 'critical';
  if (missingRatio >= 0.75) return 'high';
  if (missingRatio >= 0.5 && hasHighRisk) return 'high';
  if (missingRatio >= 0.5) return 'medium';
  if (missingRatio >= 0.25) return base === 'high' ? 'medium' : base;

  return base;
}

/**
 * Determine whether a rule evaluation should be escalated for expert review.
 */
export function shouldEscalate(
  evaluation: RuleEvaluation,
  facts: ExtractedFact[],
): { escalate: boolean; reason: string } {
  const reasons: string[] = [];

  // 1. Contradictory facts exist
  const contradictions = facts.filter((f) => f.factStatus === 'contradicted');
  if (contradictions.length > 0) {
    reasons.push(
      `Contradictory facts detected: ${contradictions.map((f) => f.factKey).join(', ')}.`,
    );
  }

  // 2. Major controls missing for high-risk hazards
  const highRiskFacts = facts.filter((f) =>
    HIGH_RISK_HAZARD_KEYWORDS.some(
      (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw.replace(/_/g, ' ')),
    ),
  );
  if (highRiskFacts.length > 0 && evaluation.missingEvidence.length > 0) {
    reasons.push(
      `Major controls may be missing for high-risk hazards: ${highRiskFacts.map((f) => f.factKey).join(', ')}.`,
    );
  }

  // 3. Engineering adequacy conclusion required
  const engineeringFacts = facts.filter(
    (f) =>
      f.factKey.includes('engineering') ||
      f.factKey.includes('ventilation') ||
      f.factKey.includes('equivalent_clean_airflow') ||
      f.factKey.includes('filtration'),
  );
  const engineeringInsufficient = engineeringFacts.some(
    (f) => f.factStatus === 'inferred' || f.confidence < 0.5,
  );
  if (engineeringInsufficient) {
    reasons.push(
      'Engineering adequacy conclusion required — relevant facts are inferred or low-confidence.',
    );
  }

  // 4. Healthcare-adjacent infectious aerosol issue
  const infectiousAerosol = facts.some((f) =>
    INFECTIOUS_AEROSOL_KEYWORDS.some(
      (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw.replace(/_/g, ' ')),
    ),
  );
  if (infectiousAerosol) {
    reasons.push('Healthcare-adjacent infectious aerosol issue identified.');
  }

  // 5. Mold, combustion, acute symptoms, unusual exposures
  const acuteSymptoms = facts.some((f) =>
    ACUTE_SYMPTOM_KEYWORDS.some(
      (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw),
    ),
  );
  const moldCombustion = facts.some((f) =>
    MOLD_COMBUSTION_KEYWORDS.some(
      (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw),
    ),
  );
  const unusualExposure = facts.some((f) =>
    UNUSUAL_EXPOSURE_KEYWORDS.some(
      (kw) => f.factKey.includes(kw) || f.factValue.toLowerCase().includes(kw.replace(/_/g, ' ')),
    ),
  );
  if (acuteSymptoms) reasons.push('Acute symptom indicators found in facts.');
  if (moldCombustion) reasons.push('Mold or combustion hazard indicators found in facts.');
  if (unusualExposure) reasons.push('Unusual or novel exposure indicators found in facts.');

  // 6. Reference support weak or incomplete
  const weakReferences =
    evaluation.citationBundle.length === 0 ||
    evaluation.citationBundle.every((c) => c.includes('No authoritative reference'));
  if (weakReferences) {
    reasons.push('Reference support is weak or incomplete for this finding.');
  }

  // 7. Escalation threshold check
  if (
    evaluation.missingEvidence.length > 0 &&
    evaluation.missingEvidence.length >= (evaluation.factSnapshot.length > 0 ? evaluation.factSnapshot.length : 1)
  ) {
    reasons.push(
      `Missing evidence count (${evaluation.missingEvidence.length}) meets or exceeds escalation threshold.`,
    );
  }

  const escalate = reasons.length > 0;
  return {
    escalate,
    reason: escalate ? reasons.join(' ') : 'No escalation required.',
  };
}

/**
 * Evaluate a single rule against the extracted facts.
 */
export function evaluateSingleRule(
  facts: ExtractedFact[],
  rule: RuleDefinition,
): RuleEvaluation {
  const triggerConditionsMet = checkTriggerConditions(facts, rule.triggerConditions);
  const missingEvidence = assessMissingEvidence(facts, rule.requiredEvidence);
  const severity = determineSeverity(rule, missingEvidence, facts);

  // A rule is "triggered" if its conditions are met OR if required evidence is missing
  const triggered = triggerConditionsMet || missingEvidence.length > 0;

  // Build relevant fact snapshot — facts that relate to this rule's required evidence or trigger fields
  const relevantKeys = new Set([
    ...rule.requiredEvidence,
    ...rule.triggerConditions.map((tc) => tc.field),
  ]);
  const factSnapshot = facts.filter((f) => relevantKeys.has(f.factKey));

  const evaluation: RuleEvaluation = {
    ruleCode: rule.ruleCode,
    rulePackId: rule.rulePackId,
    triggered,
    triggerConditionsMet,
    missingEvidence,
    severity,
    findingTitle: rule.findingTitle,
    findingClassification: rule.findingClassification,
    citationBundle: rule.citationBundle,
    outputTemplate: rule.outputTemplate,
    escalate: false,
    escalationReason: '',
    evaluatedAt: new Date().toISOString(),
    factSnapshot,
  };

  // Check escalation
  const escalationResult = shouldEscalate(evaluation, facts);
  evaluation.escalate = escalationResult.escalate;
  evaluation.escalationReason = escalationResult.reason;

  return evaluation;
}

/**
 * Evaluate all rules against extracted facts and produce a full result set.
 */
export function evaluateRules(
  facts: ExtractedFact[],
  rules: RuleDefinition[],
  context: ReviewContext,
): RuleEngineResult {
  const evaluations: RuleEvaluation[] = [];

  for (const rule of rules) {
    const evaluation = evaluateSingleRule(facts, rule);
    evaluations.push(evaluation);
  }

  // Build summary
  const triggered = evaluations.filter((e) => e.triggered);
  const escalated = evaluations.filter((e) => e.escalate);

  const findingsBySeverity: Record<string, number> = {};
  const findingsByClassification: Record<string, number> = {};

  for (const ev of triggered) {
    findingsBySeverity[ev.severity] = (findingsBySeverity[ev.severity] ?? 0) + 1;
    findingsByClassification[ev.findingClassification] =
      (findingsByClassification[ev.findingClassification] ?? 0) + 1;
  }

  // Coverage: percentage of rules that were fully satisfied (no missing evidence)
  const fullyCovered = evaluations.filter(
    (e) => e.triggerConditionsMet && e.missingEvidence.length === 0,
  ).length;
  const coveragePercent =
    evaluations.length > 0 ? Math.round((fullyCovered / evaluations.length) * 100) : 0;

  const summary: RuleEngineSummary = {
    findingsBySeverity,
    findingsByClassification,
    escalationReasons: escalated.map((e) => `[${e.ruleCode}] ${e.escalationReason}`),
    coveragePercent,
  };

  return {
    reviewId: context.reviewId,
    evaluations,
    totalRulesEvaluated: evaluations.length,
    totalFindings: triggered.length,
    totalEscalations: escalated.length,
    summary,
    executedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// RuleEngine class — primary public interface
// ---------------------------------------------------------------------------

export class RuleEngine {
  private facts: ExtractedFact[];
  private rules: RuleDefinition[];
  private context: ReviewContext;

  constructor(facts: ExtractedFact[], rules: RuleDefinition[], context: ReviewContext) {
    this.facts = facts;
    this.rules = rules;
    this.context = context;
  }

  /**
   * Run the full rule evaluation pipeline and return the result.
   */
  run(): RuleEngineResult {
    return evaluateRules(this.facts, this.rules, this.context);
  }

  /**
   * Evaluate a single rule by code.
   */
  evaluateRule(ruleCode: string): RuleEvaluation | null {
    const rule = this.rules.find((r) => r.ruleCode === ruleCode);
    if (!rule) return null;
    return evaluateSingleRule(this.facts, rule);
  }

  /**
   * Get all rules that would trigger against the current facts.
   */
  getTriggeredRules(): RuleEvaluation[] {
    return this.rules
      .map((rule) => evaluateSingleRule(this.facts, rule))
      .filter((ev) => ev.triggered);
  }

  /**
   * Get all evaluations that require escalation.
   */
  getEscalations(): RuleEvaluation[] {
    return this.rules
      .map((rule) => evaluateSingleRule(this.facts, rule))
      .filter((ev) => ev.escalate);
  }

  /**
   * Replace facts (e.g., after re-extraction).
   */
  updateFacts(facts: ExtractedFact[]): void {
    this.facts = facts;
  }

  /**
   * Replace rules (e.g., after loading a different rule pack).
   */
  updateRules(rules: RuleDefinition[]): void {
    this.rules = rules;
  }
}
