/**
 * Atmosflow Technical Report Authoring Engine
 * Section-Writing Module Specifications
 *
 * Each module defines: purpose, inputs, allowed/prohibited claims,
 * style constraints, output format, max length, and validation rules.
 *
 * AI-assisted sections use constrained prompts that ONLY reference
 * data from the canonical reportPayload. No hallucination allowed.
 */

export const SECTION_SPECS = {

  coverPage: {
    id: 'cover',
    title: 'Cover Page',
    purpose: 'Professional title page with facility, assessor, and report metadata',
    aiAssisted: false,
    requiredInputs: ['meta', 'facility', 'assessor'],
    maxLength: null, // Template-driven, no prose
    outputFormat: 'html',
  },

  executiveSummary: {
    id: 'exec-summary',
    title: 'Executive Summary',
    purpose: 'Concise overview of assessment scope, key findings, and priority actions for decision-makers',
    aiAssisted: true,
    requiredInputs: ['meta', 'facility', 'scoring.composite', 'scoring.osha', 'analysis.recommendations', 'context'],
    maxLength: 400, // words
    outputFormat: 'prose',
    allowedClaims: [
      'Reference composite score and risk level',
      'Cite number of zones assessed',
      'Cite number of findings by severity',
      'Reference top-priority recommendations',
      'State confidence level from OSHA assessment',
    ],
    prohibitedClaims: [
      'Invent measurements not in payload',
      'Claim compliance or non-compliance with regulations',
      'State definitive causation (use "consistent with", "supports")',
      'Promise outcomes from corrective actions',
      'Reference standards not listed in payload.standards',
    ],
    styleConstraints: [
      'Tone: restrained, professional, consulting-grade',
      'Use "conditions observed suggest..." not "the building is..."',
      'Use "available evidence supports..." not "proves" or "confirms"',
      'Use "would warrant targeted follow-up" not "must be fixed immediately"',
      'Write in third person, past tense for observations',
    ],
    promptTemplate: `You are a senior certified industrial hygienist writing the executive summary for a technical IAQ assessment report.

RULES:
- Write 3-4 paragraphs summarizing scope, key findings, and recommended next steps.
- Reference ONLY the data provided below. Do not invent any measurements, scores, or findings.
- Use restrained, consulting-grade language. No hype, no absolutes.
- State the composite score and risk level factually.
- Summarize the top 2-3 findings by severity.
- Reference the primary concern pathway if one exists.
- Close with priority recommended actions.
- Do NOT claim compliance or non-compliance with any regulation.
- Do NOT use the word "proves", "confirms", "guarantees", or "unsafe".

DATA:
Facility: {facility.name}
Location: {facility.address}
Assessment date: {meta.assessmentDate}
Composite score: {scoring.composite.tot}/100 ({scoring.composite.risk})
Zone average: {scoring.composite.avg}, Worst zone: {scoring.composite.worst}
Zones assessed: {scoring.composite.count}
Confidence: {scoring.osha.conf}
OSHA flags: {scoring.osha.fl.length > 0 ? scoring.osha.fl.join('; ') : 'None'}
Top recommendations: {analysis.recommendations.imm.slice(0,2).join('; ')}
Assessment reason: {context.reason}

Write the executive summary now.`,
  },

  scopeMethodology: {
    id: 'scope',
    title: 'Scope and Methodology',
    purpose: 'Document assessment scope, activities, instruments, and applicable standards',
    aiAssisted: false, // Pure template + data
    requiredInputs: ['meta', 'facility', 'assessor', 'zoneData', 'standards'],
    maxLength: null,
    outputFormat: 'html',
  },

  buildingContext: {
    id: 'building-context',
    title: 'Building and Complaint Context',
    purpose: 'Contextualize facility characteristics, HVAC, and complaint history',
    aiAssisted: true,
    requiredInputs: ['facility', 'context'],
    maxLength: 200,
    outputFormat: 'prose',
    allowedClaims: [
      'Describe building type, age, HVAC system factually',
      'Summarize complaint history from context data',
      'Note moisture/water history if present',
    ],
    prohibitedClaims: [
      'Diagnose building problems',
      'Assign blame for conditions',
      'State that HVAC is "failing" (use "maintenance status suggests...")',
    ],
    promptTemplate: `Write a 2-3 sentence professional paragraph contextualizing this facility and complaint history for a technical IAQ report.

Facility: {facility.name}, a {facility.type} at {facility.address}
Year built: {facility.building.ba || 'Unknown'}
HVAC: {facility.building.ht}, last maintained {facility.building.hm}
Complaints: {context.complaintNarrative || 'None reported'}
Water history: {context.waterHistory || 'None reported'}

Write in restrained consulting tone. Do not diagnose — describe.`,
  },

  zoneInterpretation: {
    id: 'zone-interpretation',
    title: 'Zone Technical Findings',
    purpose: 'Interpret zone-level findings with measurements, observations, and contributing factors',
    aiAssisted: true,
    requiredInputs: ['scoring.zones[i]', 'zoneData[i]'],
    maxLength: 250, // per zone
    outputFormat: 'prose',
    allowedClaims: [
      'Reference measurements from zone data',
      'Cite category scores and findings',
      'Identify the worst-performing category',
      'Note contributing factors from findings',
    ],
    prohibitedClaims: [
      'Invent measurements not in zone data',
      'Claim definitive root cause',
      'State that conditions are "unsafe" without qualification',
      'Reference standards not in the payload',
    ],
    promptTemplate: `Write a 2-3 paragraph professional interpretation of this zone's IAQ conditions for a technical report.

Zone: {zone.zoneName}
Score: {zone.tot}/100 ({zone.risk})
Categories: {zone.cats.map(c => c.l + ': ' + c.s + '/' + c.mx).join(', ')}
Worst category: {worstCat.l} ({worstCat.s}/{worstCat.mx})
Key findings: {zone.cats.flatMap(c => c.r.filter(r => r.sev !== 'pass').map(r => r.t)).join('; ')}
Measurements: CO2={zoneData.co2 || '—'}, Temp={zoneData.tf || '—'}, RH={zoneData.rh || '—'}, PM2.5={zoneData.pm || '—'}

Use phrases like "conditions observed are consistent with..." and "findings support a concern for...". Do not overstate.`,
  },

  causalAnalysis: {
    id: 'causal-analysis',
    title: 'Causal Chain Analysis',
    purpose: 'Present evidence-weighted concern pathways with restrained causation language',
    aiAssisted: true,
    requiredInputs: ['analysis.causalChains'],
    maxLength: 200, // per chain
    outputFormat: 'prose',
    prohibitedClaims: [
      'State "proves" or "confirms" root cause',
      'Use "OSHA violation" language',
      'Assign liability or fault',
    ],
    promptTemplate: `Write a professional interpretation of this concern pathway for a technical IAQ report.

Pathway type: {chain.type}
Zone: {chain.zone}
Root cause hypothesis: {chain.rootCause}
Supporting evidence: {chain.evidence.join('; ')}
Confidence: {chain.confidence}

Use language like "available evidence supports..." and "findings are consistent with..." and "would warrant targeted follow-up to confirm contributing conditions." Do not overstate causation.`,
  },

  recommendations: {
    id: 'recommendations',
    title: 'Recommendations Register',
    purpose: 'Present tiered, actionable recommendations with priority and timing',
    aiAssisted: false, // Pure template + data from genRecs()
    requiredInputs: ['analysis.recommendations'],
    outputFormat: 'html-table',
  },

  samplingPlan: {
    id: 'sampling',
    title: 'Recommended Sampling Plan',
    purpose: 'Present hypothesis-driven sampling recommendations with methods and controls',
    aiAssisted: false, // Pure template + data from generateSamplingPlan()
    requiredInputs: ['analysis.samplingPlan'],
    outputFormat: 'html-table',
  },

  limitations: {
    id: 'limitations',
    title: 'Limitations and Professional Judgment',
    purpose: 'State assessment limitations, data gaps, and professional judgment caveats',
    aiAssisted: false, // Fixed boilerplate + dynamic data gaps
    requiredInputs: ['scoring.osha.gaps'],
    outputFormat: 'html',
  },

  appendices: {
    id: 'appendices',
    title: 'Appendices',
    purpose: 'Raw measurement snapshot and transparent scoring summary',
    aiAssisted: false,
    requiredInputs: ['zoneData', 'scoring.zones', 'scoring.composite'],
    outputFormat: 'html-table',
  },
}
