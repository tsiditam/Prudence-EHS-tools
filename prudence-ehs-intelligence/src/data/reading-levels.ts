/**
 * Reading Level Templates
 * Defines reading level configurations for the output engine.
 *
 * Copyright (c) 2024 Prudence EHS Intelligence Engine
 */

export const READING_LEVELS = [
  {
    levelKey: 'grade_5_6',
    label: 'Grade 5-6',
    gradeLevel: 5,
    description: 'Simple language suitable for general public awareness materials.',
    promptInstructions:
      'Rewrite for a 5th-6th grade reading level. Use simple, everyday words. Keep sentences very short (under 12 words). Explain any safety concept as if to someone with no industry background. Avoid abbreviations, acronyms, and regulatory jargon. Use active voice. If a regulatory citation must be mentioned, explain it in plain terms (e.g., "a federal safety rule requires...").',
  },
  {
    levelKey: 'grade_8',
    label: 'Grade 8',
    gradeLevel: 8,
    description: 'Clear language suitable for workplace safety notices and employee bulletins.',
    promptInstructions:
      'Rewrite for an 8th grade reading level. Use clear, direct language. Sentences should average 15 words. You may use common safety terms (PPE, SDS, training) but define them on first use. Avoid dense regulatory citations — reference them briefly. Use active voice and concrete examples where helpful.',
  },
  {
    levelKey: 'high_school',
    label: 'High School',
    gradeLevel: 10,
    description: 'Standard language for safety committees, supervisors, and informed workers.',
    promptInstructions:
      'Rewrite for a high school reading level (grade 10). Use standard workplace language. Technical terms are acceptable if commonly used in safety settings. You may reference regulatory citations by number. Keep paragraphs focused. Aim for clear, professional tone without being overly formal or overly casual.',
  },
  {
    levelKey: 'technical_professional',
    label: 'Technical Professional',
    gradeLevel: 14,
    description: 'Full technical language for EHS professionals, CIH, CSP, and consultants.',
    promptInstructions:
      'Write at a technical professional level for EHS practitioners (CSP, CIH, CHMM). Use standard EHS/IH terminology without defining well-known terms. Include full regulatory citations (e.g., 29 CFR 1910.1200(e)(1)). Reference applicable standards precisely. Maintain technical precision and avoid hedging beyond what is factually appropriate. This is the default output level.',
  },
  {
    levelKey: 'executive_concise',
    label: 'Executive Concise',
    gradeLevel: 12,
    description: 'Brief, action-oriented language for C-suite and operations leadership.',
    promptInstructions:
      'Rewrite for executive leadership. Be extremely concise — use bullet points, not paragraphs. Lead with the business risk or liability exposure. Quantify where possible. Skip detailed regulatory analysis — summarize as "regulatory gap" or "consensus standard gap." End with a clear action item and recommended priority (immediate, near-term, planned). Maximum 3-4 sentences per finding.',
  },
  {
    levelKey: 'regulator_formal',
    label: 'Regulator Formal',
    gradeLevel: 16,
    description: 'Formal language suitable for regulatory submissions and legal documentation.',
    promptInstructions:
      'Rewrite in formal regulatory language suitable for submission to OSHA, EPA, or a regulatory body. Use precise legal and regulatory terminology. Reference applicable standards by full citation. Maintain objective, third-person tone. Use qualifying language appropriately (e.g., "appears to," "does not appear to address"). Do not make definitive compliance or noncompliance determinations. Structure as: observation, applicable requirement, gap identified, recommended corrective action.',
  },
];
