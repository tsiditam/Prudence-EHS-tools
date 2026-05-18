/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Field-assistant agent — tool definitions.
 *
 * Schemas conform to Anthropic's tool-use schema. All tools in this set
 * are READ-ONLY. Write tools (e.g. "save drafted section into report")
 * are deferred to a later phase pending additional review of the
 * defensibility implications of letting an agent mutate report state.
 */

export const FIELD_ASSISTANT_TOOLS = [
  {
    name: 'get_assessment',
    description:
      'Fetch the structured data for a specific assessment by its ID. Use this when the assessor refers to a past or saved assessment by name or id, or when you need facility/zone/score context that was not provided in the current request context. Returns building info, zones, scores, recommendations, and sampling plan. Returns null if the assessment does not exist or does not belong to the current user.',
    input_schema: {
      type: 'object',
      properties: {
        assessment_id: {
          type: 'string',
          description: 'UUID or string ID of the assessment to fetch.',
        },
      },
      required: ['assessment_id'],
    },
  },
  {
    name: 'get_zone_readings',
    description:
      'Fetch the instrument readings, observations, symptoms, and photo count for a specific zone within an assessment. Use this when the assessor asks a zone-specific question and you need the actual measurements (CO2, temp, RH, PM2.5, TVOC, HCHO, occupant count, etc.). Returns null if the zone or assessment cannot be found.',
    input_schema: {
      type: 'object',
      properties: {
        assessment_id: { type: 'string', description: 'Assessment containing the zone.' },
        zone_index: { type: 'number', description: 'Zero-based index of the zone within the assessment.' },
      },
      required: ['assessment_id', 'zone_index'],
    },
  },
  {
    name: 'lookup_standard',
    description:
      'Look up the relevant slice of the AtmosFlow standards manifest by name (e.g. "ASHRAE 62.1", "ASHRAE 55", "EPA NAAQS", "OSHA Z-1 PELs"). Returns the version year, applicable thresholds, and reference label. Use this when the assessor asks about a specific standard not already covered in the cached corpus, or when you need the exact threshold number to cite. Returns null if the standard name is not in the manifest.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Standard name as it appears in the manifest, e.g. "ASHRAE 62.1".',
        },
      },
      required: ['name'],
    },
  },
]

// Max number of tool round-trips per user message. Guards against
// runaway tool loops that would burn tokens and frustrate the user.
export const MAX_TOOL_ROUNDS = 5

// Section-draft directives — used by the UI "Draft section" picker to
// compose a structured user message that nudges Claude to use the
// tools and write the requested section. These are not tools; they are
// prompt fragments the UI prepends to the user's message.
export const SECTION_DRAFT_PROMPTS = {
  transmittal:
    'Draft a one-page transmittal letter for this assessment. Use get_assessment to fetch the building, scope, and key findings. Address it to the site contact, sign it on behalf of the assessor and firm, and keep the tone professional and concise. Do not invent client names or addresses; use placeholders like [Client Name] if not present in the data.',
  scope:
    'Draft the "Scope and Limitations" section for this assessment. Pull the building type, date range, zone count, and instrument list from get_assessment. State what AtmosFlow assessed and explicitly what it did not — this is a screening-only assessment, not a compliance certification.',
  exec_summary:
    'Draft a brief executive summary (3–5 short paragraphs) for this assessment. Use get_assessment to fetch the composite score, risk band, top three findings, and the most urgent recommendation. Lead with the headline finding; close with the next step the building owner should take.',
  rec_justification:
    'Draft a justification paragraph for the specified recommendation. Use get_assessment to fetch the underlying findings and standards that drove the recommendation. Explain in plain language why this action is recommended now, citing the relevant standard.',
}
