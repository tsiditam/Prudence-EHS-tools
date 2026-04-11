/**
 * AtmosFlow Technical Report Authoring Engine
 * Locked Template Render System — Component Map
 *
 * CRITICAL: This is a DETERMINISTIC renderer.
 * Section order, heading hierarchy, table structure, and chart placement
 * are FIXED. The AI cannot change the document architecture.
 *
 * The renderer accepts approved SectionOutput objects and slots them
 * into a locked HTML template with professional consulting typography.
 */

// ─── Fixed Section Order (never changes) ───
export const SECTION_ORDER = [
  'cover',
  'exec-summary',
  'scope',
  'building-context',
  'findings-dashboard',
  'zone-interpretation',  // Repeats per zone
  'causal-analysis',
  'sampling',
  'recommendations',
  'limitations',
  'appendix-a',           // Raw measurements
  'appendix-b',           // Scoring summary
]

// ─── Typography System ───
export const TYPOGRAPHY = {
  reportTitle: { fontSize: '20px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.3px' },
  sectionHeading: { fontSize: '13px', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '6px', marginTop: '28px', marginBottom: '10px' },
  subsectionHeading: { fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '14px', marginBottom: '6px' },
  bodyText: { fontSize: '12px', color: '#1E293B', lineHeight: 1.7 },
  metaText: { fontSize: '11px', color: '#475569', lineHeight: 1.6 },
  tableHeader: { fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' },
  tableCell: { fontSize: '11px', color: '#1E293B', borderBottom: '1px solid #F1F5F9', padding: '8px 10px' },
  captionText: { fontSize: '9px', color: '#94A3B8', fontStyle: 'italic' },
  accentColor: '#0E7490',
  dangerColor: '#B91C1C',
  warningColor: '#A16207',
  successColor: '#15803D',
}

// ─── Template Slots ───
export const TEMPLATE_SLOTS = {
  cover: {
    component: 'CoverPage',
    allowsAI: false,
    fields: ['reportTitle', 'subtitle', 'facilityName', 'address', 'assessmentDate', 'reportDate', 'assessor', 'reportId', 'version', 'status', 'preparedBy'],
  },
  'exec-summary': {
    component: 'ExecutiveSummary',
    allowsAI: true,
    fields: ['scoreCard', 'riskBadge', 'metricsRow', 'narrativeProse', 'priorityActionsTable'],
    maxAIContent: 400, // words
  },
  scope: {
    component: 'ScopeMethodology',
    allowsAI: false,
    fields: ['purposeParagraph', 'zoneListTable', 'instrumentTable', 'standardsReferences', 'limitationsLine'],
  },
  'building-context': {
    component: 'BuildingContext',
    allowsAI: true,
    fields: ['contextParagraph', 'buildingAttributeTable'],
    maxAIContent: 200,
  },
  'findings-dashboard': {
    component: 'FindingsDashboard',
    allowsAI: false,
    fields: ['scoreCards', 'categoryContribution', 'interpretationParagraph'],
  },
  'zone-interpretation': {
    component: 'ZoneSection',
    allowsAI: true,
    repeatable: true, // One per zone
    fields: ['zoneHeader', 'observationBullets', 'measurementTable', 'categoryTable', 'interpretationProse', 'contributingFactors', 'findingsTable', 'confidencePanel', 'missingDataPanel'],
    maxAIContent: 250,
  },
  'causal-analysis': {
    component: 'CausalAnalysis',
    allowsAI: true,
    fields: ['introDisclaimer', 'chainCards'],
    maxAIContent: 200, // per chain
  },
  sampling: {
    component: 'SamplingPlan',
    allowsAI: false,
    fields: ['introDisclaimer', 'samplingTable', 'outdoorGapsNote'],
  },
  recommendations: {
    component: 'RecommendationsRegister',
    allowsAI: false,
    fields: ['numberedTable'], // ID, Priority, Category, Recommendation, Timing
  },
  limitations: {
    component: 'Limitations',
    allowsAI: false,
    fields: ['standardBoilerplate', 'dynamicDataGaps', 'followUpRecommendation'],
  },
  'appendix-a': {
    component: 'AppendixMeasurements',
    allowsAI: false,
    fields: ['measurementTable', 'referenceThresholds'],
  },
  'appendix-b': {
    component: 'AppendixScoring',
    allowsAI: false,
    fields: ['methodologyTable', 'zoneScoreTable', 'compositeSummary', 'scoreBands'],
  },
}

// ─── Pagination Rules ───
export const PAGINATION = {
  coverPage: 'always-own-page',
  sectionHeading: 'page-break-after-avoid',
  zoneCard: 'page-break-inside-avoid',
  chainCard: 'page-break-inside-avoid',
  tables: 'page-break-inside-avoid',
  appendix: 'page-break-before-always',
}

// ─── Chart Containers (future) ───
export const CHART_SLOTS = {
  compositeScoreRing: { width: 140, height: 140, type: 'svg-ring' },
  categoryBarChart: { width: '100%', height: 200, type: 'horizontal-bars' },
  zoneTrendLine: { width: '100%', height: 120, type: 'line-chart' },
}
