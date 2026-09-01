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
 *
 * ── Every resolver reads the CANONICAL context first ──────────────
 *
 * These resolvers were authored against the hand-built `context = {...}`
 * literal MobileApp.jsx used to pass Jasper — a flat object with `findings`,
 * `recommendations` and `sampling_plan` at the top level. Jasper was then
 * migrated onto `buildAssessmentContext`, where those live at
 * `walkthrough_findings` and under `engine_outputs`, and the render path
 * inherited the new shape without the resolvers being repointed.
 *
 * Thirteen of twenty-seven tokens went dead at that moment, including EVERY
 * finding, recommendation, sampling and report-identity token. `firstString`
 * walks a path list and returns '' when none hit, and a missing token renders
 * blank by design — so the failure had no symptom except a client-facing
 * report that came out as letterhead with nothing under it. Repaired 2026-09.
 *
 * Two rules follow, and both are now tested:
 *
 *   1. The canonical `AssessmentContext` path is FIRST in every path list.
 *      Legacy paths stay behind it as fallbacks — `buildJasperContext`
 *      aliases `presurvey` and `bldg` onto the payload and older saved
 *      records still carry them — but the normalized shape is the source of
 *      truth, per the connectivity-layer rule in CLAUDE.md.
 *   2. A resolver is proven against a REAL context, never a fixture shaped
 *      to match the resolver. `report-template-render.test.ts` renders
 *      against `buildJasperContext` output built from app state; a
 *      hand-written `{ findings: [...] }` fixture is what let this survive,
 *      because it agreed with the resolvers and with nothing else.
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

/** One row of a repeating section. Every value is a string, never null. */
export type SectionRow = Record<string, string>

/**
 * A repeating section — `{{#findings}} … {{/findings}}` in the template.
 *
 * Flat tokens can only ever emit ONE value, so a per-zone or per-finding table
 * had to be pre-joined into a single bullet blob (`findings.summary_bullets`)
 * and dropped into one paragraph. That is not the shape an IAQ report template
 * actually is: it is a table with a row per finding, and the firm's own styling
 * on that row.
 *
 * `renderTemplate` already passes `paragraphLoop: true` to docxtemplater, so
 * the engine supported this the whole time — what was missing was array DATA.
 * A section tag resolved through `TOKEN_RESOLVERS`, missed, and was handed the
 * empty string, which docxtemplater reads as a falsy section and renders zero
 * times. Loops did not fail; they silently produced nothing.
 *
 * Same hard rule as the flat registry: rows are LITERAL DATA. No resolver
 * invokes the model, none invents prose, none makes a determination.
 */
export interface ListEntry {
  /** Section name used as `{{#section}} … {{/section}}`. */
  section: string
  /** Short human-facing description for the Settings reference list. */
  description: string
  /** The fields available on each row, for the Settings reference list. */
  fields: ReadonlyArray<{ name: string; description: string }>
  /** Pure resolver. MUST return an array of all-string rows (possibly empty). */
  resolve: (ctx: AssessmentContext) => SectionRow[]
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

/**
 * Findings, from wherever this context keeps them.
 *
 * `walkthrough_findings` is the canonical `AssessmentContext` field. `findings`
 * is the legacy top-level name from the pre-migration Jasper literal.
 */
function findingsOf(ctx: AssessmentContext): unknown[] {
  const canonical = arrayAt(ctx, 'walkthrough_findings')
  return canonical.length ? canonical : arrayAt(ctx, 'findings')
}

/**
 * Recommendations in one priority bucket.
 *
 * `genRecs` returns `{ imm, eng, adm, mon }` — the BUCKET is the priority, and
 * the rows carry no `priority` field at all. The old resolver filtered a flat
 * array on `r.priority === 'immediate'`, which matched nothing even when the
 * array was found, so this needed repointing AND reshaping.
 */
const REC_BUCKETS: Record<string, string> = {
  immediate: 'imm',
  engineering: 'eng',
  administrative: 'adm',
  monitoring: 'mon',
}

function recsIn(ctx: AssessmentContext, priority: string): unknown[] {
  const bucket = REC_BUCKETS[priority] || priority
  const fromEngine = arrayAt(ctx, `engine_outputs.recommendations.${bucket}`)
  if (fromEngine.length) return fromEngine
  const legacyBucket = arrayAt(ctx, `recommendations.${bucket}`)
  if (legacyBucket.length) return legacyBucket
  // Oldest shape: a flat array tagged with an explicit priority.
  return arrayAt(ctx, 'recommendations').filter(
    (r) => s((r as Record<string, unknown>)?.priority).toLowerCase() === priority,
  )
}

/** The sampling plan's entries — `generateSamplingPlan` returns `{ plan, outdoorGaps }`. */
function samplingEntries(ctx: AssessmentContext): unknown[] {
  const canonical = arrayAt(ctx, 'engine_outputs.sampling_plan.plan')
  if (canonical.length) return canonical
  const legacyNested = arrayAt(ctx, 'sampling_plan.plan')
  if (legacyNested.length) return legacyNested
  const flat = arrayAt(ctx, 'sampling_plan')
  return flat.length ? flat : arrayAt(ctx, 'samplingPlan')
}

/**
 * The qualitative-only marking, as a sentence a template can print.
 *
 * CLAUDE.md's defensibility primitive: a finding derived from an instrument
 * outside the accuracy database carries `qualitative_only: true`, and that flag
 * "propagates to every rendered output of that finding". The template path
 * carried it nowhere — `buildAssessmentContext` sets it on every finding and no
 * token surfaced it, so a user template rendered a qualitative-only finding
 * indistinguishable from an instrument-backed one. Empty when the flag is
 * false, so a template that prints it unconditionally stays clean.
 */
const QUALITATIVE_NOTE =
  'Qualitative observation — the instrument used is not in the accuracy database, so this finding is not quantitatively supported.'

function qualitativeNote(row: Record<string, unknown> | undefined): string {
  if (!row) return ''
  return row.qualitative_only === true || row.qualitativeOnly === true
    ? QUALITATIVE_NOTE
    : ''
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
      firstString(ctx, [
        'project.recipient.name',
        'presurvey.ps_recipient_name', 'client.name', 'recipient.name',
      ]),
  },
  {
    token: 'client.firm',
    description: 'Recipient firm / organization.',
    resolve: (ctx) =>
      firstString(ctx, [
        'project.recipient.firm', 'project.client',
        'presurvey.ps_recipient_firm', 'client.firm', 'recipient.firm',
      ]),
  },
  {
    token: 'client.email',
    description: 'Recipient email address.',
    resolve: (ctx) =>
      firstString(ctx, [
        'project.recipient.email',
        'presurvey.ps_recipient_email', 'client.email', 'recipient.email',
      ]),
  },
  {
    token: 'client.phone',
    description: 'Recipient phone number.',
    resolve: (ctx) =>
      firstString(ctx, [
        'project.recipient.phone',
        'presurvey.ps_recipient_phone', 'client.phone', 'recipient.phone',
      ]),
  },

  // Facility / site
  {
    token: 'facility.name',
    description: 'Facility or building name.',
    resolve: (ctx) =>
      firstString(ctx, [
        'building.name',
        'buildingProfile.name', 'facility.name', 'site.name', 'presurvey.ps_site_name',
      ]),
  },
  {
    token: 'facility.address',
    description: 'Facility street address (single line).',
    resolve: (ctx) =>
      firstString(ctx, [
        'building.address',
        'buildingProfile.address', 'facility.address', 'site.address', 'presurvey.ps_site_address',
      ]),
  },
  {
    token: 'facility.type',
    description: 'Facility type (office, school, healthcare, etc.).',
    resolve: (ctx) =>
      firstString(ctx, [
        'building.type',
        'buildingProfile.type', 'facility.type', 'presurvey.ps_facility_type',
      ]),
  },
  {
    token: 'facility.sqft',
    description: 'Facility square footage (numeric, as text).',
    resolve: (ctx) =>
      firstString(ctx, [
        'building.sqft',
        'buildingProfile.sqft', 'facility.sqft', 'presurvey.ps_sqft',
      ]),
  },

  // Assessor (from the profile attached to the active session)
  {
    token: 'assessor.name',
    // `ps_assessor` is one required text field — "Assessor name and
    // credentials", placeholder "e.g. J. Smith, CIH, CSP" — so name and
    // credentials are not separable in the intake. The token resolves the
    // whole string rather than guessing where the name ends.
    description: 'Lead assessor, as entered on the presurvey (name and credentials).',
    resolve: (ctx) =>
      firstString(ctx, [
        'presurvey.ps_assessor',
        'calibration_acknowledgement.assessor_name',
        'profile.name', 'assessor.name', 'meta.assessor_name',
      ]),
  },
  // `assessor.title` was removed in 2026-09. It read `profile.title` /
  // `assessor.title`, and the app has no job-title field anywhere — no
  // presurvey question, no profile key — so it could never resolve to
  // anything. A registry entry that cannot fill is worse than no entry: the
  // Settings panel advertised it, a template that used it rendered blank, and
  // nothing reported a problem. Dropped rather than wired, because inventing
  // an intake field to satisfy a token is the wrong direction. Templates
  // still using it now report it as an unknown token, which is the feedback
  // that was missing.
  {
    token: 'assessor.credentials',
    description: 'Certifications and licenses recorded on the presurvey (CIH, CSP, …).',
    resolve: (ctx) => {
      const certs = get(ctx, 'presurvey.ps_assessor_certs')
      if (Array.isArray(certs)) return certs.map(s).filter(Boolean).join(', ')
      return firstString(ctx, [
        'presurvey.ps_assessor_certs',
        'calibration_acknowledgement.assessor_credentials',
        'profile.credentials', 'assessor.credentials',
      ])
    },
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
    resolve: (ctx) => firstString(ctx, ['meta.id', 'meta.draft_id', 'report.id', 'meta.report_id', 'id']),
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
    // `ps_survey_date` is the required "Date of survey" intake field — the
    // date the work was done, which is what a report is dated by. `meta` has
    // only `generated_at`, which is when the file was rendered; using it would
    // silently re-date an old assessment to today on every re-render.
    resolve: (ctx) =>
      fmtDate(
        get(ctx, 'presurvey.ps_survey_date')
          ?? get(ctx, 'meta.assessment_date')
          ?? get(ctx, 'report.date'),
      ),
  },
  {
    token: 'report.date_iso',
    description: 'Assessment date in ISO form (YYYY-MM-DD).',
    resolve: (ctx) =>
      fmtDateIso(
        get(ctx, 'presurvey.ps_survey_date')
          ?? get(ctx, 'meta.assessment_date')
          ?? get(ctx, 'report.date'),
      ),
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
    resolve: (ctx) => String(countBySeverity(findingsOf(ctx), 'critical')),
  },
  {
    token: 'findings.high_count',
    description: 'Number of High-severity findings.',
    resolve: (ctx) => String(countBySeverity(findingsOf(ctx), 'high')),
  },
  {
    token: 'findings.medium_count',
    description: 'Number of Medium-severity findings.',
    resolve: (ctx) => String(countBySeverity(findingsOf(ctx), 'medium')),
  },
  {
    token: 'findings.total_count',
    description: 'Total number of findings (all severities).',
    resolve: (ctx) => String(findingsOf(ctx).length),
  },
  {
    token: 'recommendations.immediate_count',
    description: 'Number of Immediate-priority recommendations.',
    resolve: (ctx) => String(recsIn(ctx, 'immediate').length),
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
        findingsOf(ctx).map((f) => {
          const row = f as Record<string, unknown>
          const sev = s(row?.severity).toUpperCase()
          const title = s(row?.title || row?.label)
          const loc = s(row?.location || row?.zone_label)
          const head = [sev, title].filter(Boolean).join(' — ')
          const line = loc ? `• ${head} — ${loc}` : `• ${head}`
          // The qualitative-only marking travels with the finding, per the
          // propagation rule. It was dropped on this path entirely.
          return qualitativeNote(row) ? `${line} (qualitative observation)` : line
        }),
      ),
  },
  {
    token: 'recommendations.immediate_bullets',
    description:
      'Newline-separated bullets for Immediate-priority recommendations only.',
    resolve: (ctx) =>
      bulletJoin(
        recsIn(ctx, 'immediate').map((r) => {
          const row = r as Record<string, unknown>
          const text = s(row?.text || row?.title || row?.description)
          if (!text) return ''
          // `genRecs` names the place `zoneName`; the older shapes used
          // `location` / `zone_label`. A building-scope recommendation has
          // none of them and correctly renders without a location.
          const loc = s(row?.zoneName || row?.location || row?.zone_label)
          return loc ? `• ${text} — ${loc}` : `• ${text}`
        }),
      ),
  },
  {
    token: 'sampling_plan.summary',
    description:
      'Newline-separated bullets summarising the recommended sampling plan.',
    resolve: (ctx) =>
      bulletJoin(
        samplingEntries(ctx).map((p) => {
          const row = p as Record<string, unknown>
          // `generateSamplingPlan` emits { zone, type, priority, hypothesis,
          // method, controls, standard }. `analyte` and `location` were the
          // old literal's names and match nothing the engine produces.
          const what = s(row?.type || row?.analyte)
          const method = s(row?.method)
          const loc = s(row?.zone || row?.location || row?.zone_label)
          const head = [what, method].filter(Boolean).join(' — ')
          if (!head) return ''
          return loc ? `• ${head} (${loc})` : `• ${head}`
        }),
      ),
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

// ── Repeating sections ──────────────────────────────────────────────

export const LIST_REGISTRY: ListEntry[] = [
  {
    section: 'zones',
    description: 'One row per zone surveyed.',
    fields: [
      { name: 'index', description: '1-based position in the survey order.' },
      { name: 'label', description: 'Zone name as the assessor entered it.' },
      { name: 'use', description: 'Space use type (office, classroom, …).' },
      { name: 'notes', description: "The assessor's own note for this zone." },
    ],
    resolve: (ctx) =>
      arrayAt(ctx, 'zones').map((z, i) => {
        const row = z as Record<string, unknown>
        return {
          index: String(s(row?.index) || i + 1),
          label: s(row?.label || row?.zn || row?.id),
          use: s(row?.use || row?.su || row?.type),
          notes: s(row?.notes || row?.znt),
        }
      }),
  },
  {
    section: 'findings',
    description: 'One row per finding, worst first as the engine ordered them.',
    fields: [
      { name: 'severity', description: 'Critical / High / Medium / Low.' },
      { name: 'title', description: 'The finding sentence.' },
      { name: 'location', description: 'Where it was observed, when recorded.' },
      { name: 'zone_label', description: 'The zone the finding belongs to.' },
      {
        name: 'qualitative_note',
        description:
          'Non-empty ONLY when the finding is qualitative-only. Print it beside the finding — it is the disclosure that the instrument behind it is not in the accuracy database.',
      },
    ],
    resolve: (ctx) =>
      findingsOf(ctx).map((f) => {
        const row = f as Record<string, unknown>
        return {
          severity: s(row?.severity),
          title: s(row?.title || row?.label || row?.t),
          location: s(row?.location),
          zone_label: s(row?.zone_label || row?.zoneName),
          qualitative_note: qualitativeNote(row),
        }
      }),
  },
  {
    section: 'recommendations',
    description:
      'One row per recommendation across all four priority buckets, immediate first.',
    fields: [
      { name: 'priority', description: 'Immediate / Engineering / Administrative / Monitoring.' },
      { name: 'text', description: 'The recommended action.' },
      { name: 'scope', description: '"zone" or "building".' },
      { name: 'location', description: 'The zone it applies to; empty for building scope.' },
      { name: 'control_tier', description: 'Where the action sits in the hierarchy of controls.' },
    ],
    resolve: (ctx) => {
      const out: SectionRow[] = []
      for (const [label, key] of [
        ['Immediate', 'immediate'],
        ['Engineering', 'engineering'],
        ['Administrative', 'administrative'],
        ['Monitoring', 'monitoring'],
      ] as const) {
        for (const r of recsIn(ctx, key)) {
          const row = r as Record<string, unknown>
          const text = s(row?.text || row?.title || row?.description)
          if (!text) continue
          out.push({
            priority: label,
            text,
            scope: s(row?.scope),
            location: s(row?.zoneName || row?.location || row?.zone_label),
            control_tier: s(row?.controlTier || row?.control_tier),
          })
        }
      }
      return out
    },
  },
  {
    section: 'sampling_plan',
    description: 'One row per recommended sample.',
    fields: [
      { name: 'type', description: 'What is being sampled (Bioaerosol, Formaldehyde, …).' },
      { name: 'zone', description: 'Where the sample is to be collected.' },
      { name: 'priority', description: 'critical / high / medium.' },
      { name: 'method', description: 'The analytical method to order.' },
      { name: 'controls', description: 'Required control samples.' },
      { name: 'standard', description: 'The method or guidance the plan cites.' },
      { name: 'hypothesis', description: 'What the sample would establish.' },
    ],
    resolve: (ctx) =>
      samplingEntries(ctx).map((p) => {
        const row = p as Record<string, unknown>
        return {
          type: s(row?.type || row?.analyte),
          zone: s(row?.zone || row?.location || row?.zone_label),
          priority: s(row?.priority),
          method: s(row?.method),
          controls: s(row?.controls),
          standard: s(row?.standard),
          hypothesis: s(row?.hypothesis),
        }
      }),
  },
]

/** Section names, for quick membership tests during token discovery. */
export const SECTION_NAMES: ReadonlySet<string> = new Set(
  LIST_REGISTRY.map((e) => e.section),
)

export const SECTION_RESOLVERS: ReadonlyMap<string, ListEntry['resolve']> = new Map(
  LIST_REGISTRY.map((e) => [e.section, e.resolve]),
)

/** Field names valid inside a given section, for nested-tag validation. */
export const SECTION_FIELDS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  LIST_REGISTRY.map((e) => [e.section, new Set(e.fields.map((f) => f.name))]),
)
