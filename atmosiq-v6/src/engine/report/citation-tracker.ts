/**
 * AtmosFlow Engine v2.7 — Citation Tracker
 *
 * Stops the automated standards dump in Appendix D. Every body-text
 * reference to a standard registers with the tracker; the bibliography
 * generator then filters the master STANDARDS_MANIFEST to only those
 * IDs the tracker has seen.
 *
 * Standards mentioned only in unexecuted sampling-plan recommendations
 * do NOT count as body-text references — sampling plans describe
 * future work, not work performed. Those entries are still surfaced,
 * but in a clearly-labeled "Future-method references" subsection at
 * the bottom of Appendix D.
 *
 * Two access paths:
 *
 *   1. **Per-citation registration** (programmatic): construct a
 *      CitationTracker and call register(id) at every site that
 *      cites a standard in body text. This is the long-term path
 *      and the right shape for new code paths.
 *
 *   2. **Inference from rendered context** (legacy bridge): pass an
 *      already-built ctx to inferCitationsFromContext(ctx). The
 *      function walks ctx text content and registers standards by
 *      pattern match. This is the path used today by sections-core.js
 *      to retrofit existing renderers without touching every cite
 *      site.
 *
 * Why both: per-citation registration is more accurate but requires
 * instrumenting every cite site (~30 places). The inference path
 * gets us 95% of the value with a single touch point, and the two
 * coexist — code that registers explicitly always wins over what
 * inference would have detected.
 */

export interface CitationRegistration {
  readonly inBody: ReadonlySet<string>
  readonly futureMethodOnly: ReadonlySet<string>
}

export class CitationTracker {
  private body = new Set<string>()
  private futureMethod = new Set<string>()

  /** Register a standard ID as referenced in the body of the report. */
  register(id: string): void {
    this.body.add(id)
    // If we previously saw this only in a sampling plan, the body
    // reference promotes it — drop the future-method entry.
    this.futureMethod.delete(id)
  }

  /**
   * Register a standard ID as referenced only in a sampling-plan
   * recommendation (future work, not work performed). If the same ID
   * was already registered as in-body, this is a no-op.
   */
  registerFutureMethod(id: string): void {
    if (!this.body.has(id)) this.futureMethod.add(id)
  }

  getRegistration(): CitationRegistration {
    return { inBody: new Set(this.body), futureMethodOnly: new Set(this.futureMethod) }
  }
}

/**
 * Detection patterns for each STANDARDS_MANIFEST key. Patterns must
 * match the canonical name as it appears in body-text references —
 * NOT the bibliographic citation form. A pattern that matches in
 * sampling-plan-only context registers as future-method-only.
 *
 * Keys MUST exactly match keys in STANDARDS_MANIFEST (src/constants/
 * standards.js); the filter in sections-core.js compares by key.
 */
const STANDARD_DETECTION_PATTERNS: ReadonlyArray<readonly [string, ReadonlyArray<RegExp>]> = [
  ['ASHRAE 62.1', [/ASHRAE[\s-]*(?:Standard\s*)?62\.1/i]],
  ['ASHRAE 55', [/ASHRAE[\s-]*(?:Standard\s*)?55(?!\d)/i]],
  ['OSHA Z-1 PELs', [/OSHA\b/i, /29\s*CFR\s*1910\.1000/i, /Permissible\s*Exposure\s*Limit/i, /\bPEL\b/i]],
  ['WHO Air Quality Guidelines', [/WHO[\s-]*(?:Global\s*)?(?:Air\s*Quality\s*)?Guidelines?/i]],
  ['IICRC S520', [/IICRC[\s-]*S520/i]],
  ['NIOSH Pocket Guide RELs', [/NIOSH/i, /\bREL\b/i]],
  ['EPA NAAQS', [/EPA[\s-]*NAAQS/i, /National\s*Ambient\s*Air\s*Quality\s*Standards/i]],
  ['Molhave TVOC tiers', [/M[øo]lhave/i, /TVOC[\s-]*tiers?/i]],
  ['ANSI/ISA 71.04', [/(?:ANSI\/)?ISA[\s-]*71\.04/i]],
  ['ISO 14644-1', [/ISO[\s-]*14644(?:-1)?/i]],
  ['ASHRAE TC 9.9', [/ASHRAE[\s-]*TC[\s-]*9\.9/i, /Thermal\s*Guidelines\s*for\s*Data\s*Processing/i]],
  ['IEEE 1635 / ASHRAE Guideline 21', [/IEEE[\s-]*1635/i, /ASHRAE[\s-]*Guideline[\s-]*21/i]],
  ['NFPA 855', [/NFPA[\s-]*855/i]],
]

/**
 * Walk a rendered ctx and register each standard whose detection
 * pattern matches body text. Standards that match only in the
 * samplingPlan node are registered as future-method-only.
 *
 * Body fields scanned: zoneScores (findings text), recs (the four
 * priority arrays), causalChains, oshaResult, narrative,
 * standardsManifest (NOT scanned — that's the universe to filter).
 *
 * Sampling-only field scanned: samplingPlan.
 */
export function inferCitationsFromContext(ctx: unknown): CitationRegistration {
  const tracker = new CitationTracker()
  const c = (ctx as Record<string, unknown>) || {}
  const stringify = (v: unknown): string => {
    try { return JSON.stringify(v) } catch { return '' }
  }
  const bodyText = [
    stringify(c.zoneScores),
    stringify(c.recs),
    stringify(c.causalChains),
    stringify(c.oshaResult),
    stringify(c.narrative),
  ].join(' ')
  const samplingText = stringify(c.samplingPlan)
  for (const [id, patterns] of STANDARD_DETECTION_PATTERNS) {
    if (patterns.some(p => p.test(bodyText))) {
      tracker.register(id)
    } else if (patterns.some(p => p.test(samplingText))) {
      tracker.registerFutureMethod(id)
    }
  }
  return tracker.getRegistration()
}

/**
 * Filter a STANDARDS_MANIFEST object by a CitationRegistration,
 * returning two object subsets:
 *   bodyManifest          — entries to render in the main bibliography
 *   futureMethodManifest  — entries to render in the "Future-method"
 *                           subsection (deferred references from
 *                           sampling-plan recommendations)
 *
 * Metadata keys (engineVersion, manifestUpdated) are stripped from
 * both.
 */
export function filterManifestByRegistration(
  manifest: Record<string, unknown>,
  registration: CitationRegistration,
): { bodyManifest: Record<string, unknown>; futureMethodManifest: Record<string, unknown> } {
  const bodyManifest: Record<string, unknown> = {}
  const futureMethodManifest: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(manifest)) {
    if (k === 'engineVersion' || k === 'manifestUpdated') continue
    if (registration.inBody.has(k)) bodyManifest[k] = v
    else if (registration.futureMethodOnly.has(k)) futureMethodManifest[k] = v
    // else: not registered → not rendered (the entire point of the tracker)
  }
  return { bodyManifest, futureMethodManifest }
}
