/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Canonical {{token}} registry for user-uploaded DOCX templates.
 *
 * One source of truth: the upload-validator, the render endpoint, and
 * the Settings "Available tokens" reference list all import from here.
 * Adding or renaming a token is a single-file change.
 *
 * Hard rule (screening-only positioning):
 *   Every resolver returns LITERAL DATA from the assessment context.
 *   No resolver invokes the LLM, no resolver invents prose, no
 *   resolver makes a compliance determination. The render path
 *   substitutes strings; that's it. If a future token requires
 *   narrative synthesis, it lands in a separate "ai_*" namespace
 *   that the screening-only review gate covers explicitly.
 *
 * Missing data renders as empty string (NOT "null", NOT "undefined"),
 * so a template that references a field the assessor hasn't filled
 * in produces a blank — not visible noise. The render result reports
 * which tokens were "filled" vs "skipped" so the UI can warn.
 */

// The assessment context is freeform — the Jasper API already passes
// it as `Record<string, unknown>` and the engines treat it as a loose
// document. Resolvers walk it with optional-chain casts and return
// strings.
export type AssessmentContext = Record<string, unknown>

export interface TokenEntry {
  /** Dot-separated token name used inside `{{...}}` in user templates. */
  token: string
  /** Short human-facing description for the Settings reference list. */
  description: string
  /** Pure resolver. MUST return a string (empty if data is missing). */
  resolve: (ctx: AssessmentContext) => string
}

// ── Helpers ─────────────────────────────────────────────────────────

function s(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function get(ctx: AssessmentContext, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = ctx
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function firstString(ctx: AssessmentContext, paths: string[]): string {
  for (const p of paths) {
    const v = get(ctx, p)
    const str = s(v)
    if (str) return str
  }
  return ''
}

function arrayAt(ctx: AssessmentContext, path: string): unknown[] {
  const v = get(ctx, path)
  return Array.isArray(v) ? v : []
}

function fmtDate(v: unknown): string {
  const str = s(v)
  if (!str) return ''
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateIso(v: unknown): string {
  const str = s(v)
  if (!str) return ''
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function countBySeverity(findings: unknown[], severity: string): number {
  return findings.filter((f) => {
    const sev = s((f as Record<string, unknown>)?.severity).toLowerCase()
    return sev === severity
  }).length
}

function bulletJoin(items: string[]): string {
  return items.filter(Boolean).join('\n')
}

// ── Token registry ──────────────────────────────────────────────────
// Grouped by domain for readability; order here is also the order the
// Settings reference list will render.

export const TOKEN_REGISTRY: TokenEntry[] = [
  // Client / requester (sourced from the presurvey intake)
  {
    token: 'client.name',
    description: 'Recipient contact name (from presurvey ps_recipient_name).',
    resolve: (ctx) =>
      firstString(ctx, ['presurvey.ps_recipient_name', 'client.name', 'recipient.name']),
  },
  {
    token: 'client.firm',
    description: 'Recipient firm / organization.',
    resolve: (ctx) =>
      firstString(ctx, ['presurvey.ps_recipient_firm', 'client.firm', 'recipient.firm']),
  },
  {
    token: 'client.email',
    description: 'Recipient email address.',
    resolve: (ctx) =>
      firstString(ctx, ['presurvey.ps_recipient_email', 'client.email', 'recipient.email']),
  },
  {
    token: 'client.phone',
    description: 'Recipient phone number.',
    resolve: (ctx) =>
      firstString(ctx, ['presurvey.ps_recipient_phone', 'client.phone', 'recipient.phone']),
  },

  // Facility / site
  {
    token: 'facility.name',
    description: 'Facility or building name.',
    resolve: (ctx) =>
      firstString(ctx, ['buildingProfile.name', 'facility.name', 'site.name', 'presurvey.ps_site_name']),
  },
  {
    token: 'facility.address',
    description: 'Facility street address (single line).',
    resolve: (ctx) =>
      firstString(ctx, ['buildingProfile.address', 'facility.address', 'site.address', 'presurvey.ps_site_address']),
  },
  {
    token: 'facility.type',
    description: 'Facility type (office, school, healthcare, etc.).',
    resolve: (ctx) =>
      firstString(ctx, ['buildingProfile.type', 'facility.type', 'presurvey.ps_facility_type']),
  },
  {
    token: 'facility.sqft',
    description: 'Facility square footage (numeric, as text).',
    resolve: (ctx) =>
      firstString(ctx, ['buildingProfile.sqft', 'facility.sqft', 'presurvey.ps_sqft']),
  },

  // Assessor (from the profile attached to the active session)
  {
    token: 'assessor.name',
    description: 'Lead assessor full name.',
    resolve: (ctx) =>
      firstString(ctx, ['profile.name', 'assessor.name', 'meta.assessor_name']),
  },
  {
    token: 'assessor.title',
    description: 'Lead assessor job title.',
    resolve: (ctx) =>
      firstString(ctx, ['profile.title', 'assessor.title']),
  },
  {
    token: 'assessor.credentials',
    description: 'Lead assessor credentials (CIH, CSP, etc.).',
    resolve: (ctx) =>
      firstString(ctx, ['profile.credentials', 'assessor.credentials']),
  },
  {
    token: 'assessor.signature_date',
    description: "Today's date in the assessor's locale (long form).",
    resolve: () =>
      new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
  },

  // Report metadata
  {
    token: 'report.id',
    description: 'Internal report identifier.',
    resolve: (ctx) => firstString(ctx, ['report.id', 'meta.report_id', 'id']),
  },
  {
    token: 'report.title',
    description: 'Report title (defaults to "IAQ Screening Assessment").',
    resolve: (ctx) =>
      firstString(ctx, ['report.title', 'meta.report_title']) || 'IAQ Screening Assessment',
  },
  {
    token: 'report.date',
    description: 'Assessment date in long form (e.g. "May 28, 2026").',
    resolve: (ctx) => fmtDate(get(ctx, 'meta.assessment_date') ?? get(ctx, 'report.date')),
  },
  {
    token: 'report.date_iso',
    description: 'Assessment date in ISO form (YYYY-MM-DD).',
    resolve: (ctx) => fmtDateIso(get(ctx, 'meta.assessment_date') ?? get(ctx, 'report.date')),
  },
  {
    token: 'report.engine_version',
    description: 'Scoring engine version used to generate the data.',
    resolve: (ctx) => firstString(ctx, ['meta.engine_version', 'engine.version']),
  },

  // Counts (resolved against the array shapes the engine produces)
  {
    token: 'zones.count',
    description: 'Number of zones surveyed in this assessment.',
    resolve: (ctx) => String(arrayAt(ctx, 'zones').length),
  },
  {
    token: 'findings.critical_count',
    description: 'Number of Critical-severity findings.',
    resolve: (ctx) => String(countBySeverity(arrayAt(ctx, 'findings'), 'critical')),
  },
  {
    token: 'findings.high_count',
    description: 'Number of High-severity findings.',
    resolve: (ctx) => String(countBySeverity(arrayAt(ctx, 'findings'), 'high')),
  },
  {
    token: 'findings.medium_count',
    description: 'Number of Medium-severity findings.',
    resolve: (ctx) => String(countBySeverity(arrayAt(ctx, 'findings'), 'medium')),
  },
  {
    token: 'findings.total_count',
    description: 'Total number of findings (all severities).',
    resolve: (ctx) => String(arrayAt(ctx, 'findings').length),
  },
  {
    token: 'recommendations.immediate_count',
    description: 'Number of Immediate-priority recommendations.',
    resolve: (ctx) =>
      String(
        arrayAt(ctx, 'recommendations').filter(
          (r) => s((r as Record<string, unknown>)?.priority).toLowerCase() === 'immediate',
        ).length,
      ),
  },

  // Pre-rendered bullet blocks (drop into the template as one paragraph;
  // docxtemplater preserves newlines when the placeholder is on its own
  // line within a paragraph).
  {
    token: 'zones.list',
    description: 'Comma-separated list of zone labels with their use type.',
    resolve: (ctx) =>
      arrayAt(ctx, 'zones')
        .map((z) => {
          const label = s((z as Record<string, unknown>)?.label || (z as Record<string, unknown>)?.id)
          const use = s((z as Record<string, unknown>)?.use || (z as Record<string, unknown>)?.type)
          if (!label) return ''
          return use ? `${label} (${use})` : label
        })
        .filter(Boolean)
        .join(', '),
  },
  {
    token: 'findings.summary_bullets',
    description:
      'Newline-separated bullets: "• Severity — Title — Location" for each finding.',
    resolve: (ctx) =>
      bulletJoin(
        arrayAt(ctx, 'findings').map((f) => {
          const row = f as Record<string, unknown>
          const sev = s(row?.severity).toUpperCase()
          const title = s(row?.title || row?.label)
          const loc = s(row?.location || row?.zone_label)
          const parts = [sev, title].filter(Boolean)
          const head = parts.join(' — ')
          return loc ? `• ${head} — ${loc}` : `• ${head}`
        }),
      ),
  },
  {
    token: 'recommendations.immediate_bullets',
    description:
      'Newline-separated bullets for Immediate-priority recommendations only.',
    resolve: (ctx) =>
      bulletJoin(
        arrayAt(ctx, 'recommendations')
          .filter(
            (r) =>
              s((r as Record<string, unknown>)?.priority).toLowerCase() === 'immediate',
          )
          .map((r) => {
            const row = r as Record<string, unknown>
            const text = s(row?.text || row?.title || row?.description)
            const loc = s(row?.location || row?.zone_label)
            return loc ? `• ${text} — ${loc}` : `• ${text}`
          }),
      ),
  },
  {
    token: 'sampling_plan.summary',
    description:
      'Newline-separated bullets summarising the recommended sampling plan.',
    resolve: (ctx) => {
      const plan = arrayAt(ctx, 'sampling_plan')
      const items = plan.length > 0 ? plan : arrayAt(ctx, 'samplingPlan')
      return bulletJoin(
        items.map((p) => {
          const row = p as Record<string, unknown>
          const analyte = s(row?.analyte)
          const method = s(row?.method)
          const loc = s(row?.location || row?.zone_label)
          const head = [analyte, method].filter(Boolean).join(' — ')
          return loc ? `• ${head} (${loc})` : `• ${head}`
        }),
      )
    },
  },
]

/** Set of valid token names for quick `tokens_missing` computation. */
export const TOKEN_NAMES: ReadonlySet<string> = new Set(
  TOKEN_REGISTRY.map((t) => t.token),
)

/** Map for O(1) resolver lookup during render. */
export const TOKEN_RESOLVERS: ReadonlyMap<string, TokenEntry['resolve']> = new Map(
  TOKEN_REGISTRY.map((t) => [t.token, t.resolve]),
)
