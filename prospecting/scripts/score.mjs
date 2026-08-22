/**
 * Deterministic lead scoring for the AtmosFlow prospector.
 *
 * The agent does the research; this file does the judging. Every point a
 * lead scores traces to a named signal that carries a URL the reviewer can
 * open. Nothing here reads the model's prose, and no signal can be invented
 * at scoring time — an unknown key is an error, not a zero.
 *
 * Same order of operations the product itself uses: deterministic logic
 * first, AI second, your review always.
 */

/**
 * The signal catalogue. `prospecting/icp.md` documents these in prose and
 * `signal-catalog-parity.test.mjs` fails if the two drift apart.
 *
 * group  — what kind of question the signal answers
 * points — added to the running total when the signal is present
 * note   — what the agent must actually have seen to record it
 */
export const SIGNALS = {
  // --- Practice evidence: do they run IAQ investigations at all? ---
  iaq_service_page: { group: 'practice', points: 10, note: 'A live service page offering IAQ / indoor air quality investigation.' },
  iaq_report_sample_published: { group: 'practice', points: 6, note: 'A published sample IAQ report or case study with their name on it.' },
  mold_moisture_services: { group: 'practice', points: 4, note: 'Mold, moisture intrusion, or post-remediation verification offered.' },
  instrument_ownership_evidence: { group: 'practice', points: 5, note: 'They name their own meters, loggers, or pumps — they own the field kit.' },

  // --- Credentials: does the buyer clear the professional bar? ---
  cih_on_staff: { group: 'credential', points: 12, note: 'A named CIH on staff or principal, on their site or a board registry.' },
  csp_on_staff: { group: 'credential', points: 5, note: 'A named CSP on staff or principal.' },
  aiha_member: { group: 'credential', points: 4, note: 'Listed in AIHA membership, a consultant listing, or a local section.' },
  assp_member: { group: 'credential', points: 4, note: 'Listed in ASSP membership or a chapter roster.' },

  // --- Pain: is report turnaround visibly costing them? ---
  hiring_report_writer: { group: 'pain', points: 8, note: 'An open role whose duties centre on writing or reviewing reports.' },
  job_posting_iaq_staff: { group: 'pain', points: 6, note: 'An open IAQ / IH field role — they are capacity constrained.' },
  states_report_turnaround: { group: 'pain', points: 8, note: 'They publicly state a report turnaround time or complain about one.' },
  manual_template_evidence: { group: 'pain', points: 5, note: 'A downloadable Word/PDF report template — the workflow AtmosFlow replaces.' },

  // --- Size: which tier does their assessment volume land on? ---
  size_solo: { group: 'size', points: 6, note: 'One practitioner. Solo tier.' },
  size_2_10: { group: 'size', points: 10, note: '2–10 staff. Pro tier — the densest part of the market.' },
  size_11_50: { group: 'size', points: 8, note: '11–50 staff. Practice tier.' },
  size_50_plus: { group: 'size', points: 4, note: '50+ staff. Real budget, long procurement.' },

  // --- Reachability: can a human actually start a conversation? ---
  public_contact_email: { group: 'reach', points: 6, note: 'A published business contact address. Never a guessed or pattern-built one.' },
  named_decision_maker: { group: 'reach', points: 8, note: 'A named principal, owner, or practice lead, with the page that names them.' },
  warm_path: { group: 'reach', points: 10, note: 'A real introduction route: shared association, conference, or mutual contact.' },

  // --- Timing: is something happening right now? ---
  recent_iaq_rfp: { group: 'timing', points: 8, note: 'An open or recently closed IAQ solicitation they bid or could bid.' },
  conference_attendee: { group: 'timing', points: 5, note: 'Speaking at or exhibiting at an AIHA / ASSP / IFMA / BOMA event.' },
  expansion_signal: { group: 'timing', points: 3, note: 'New office, acquisition, or announced practice-area expansion.' },
}

/**
 * Negative signals. These reduce the score without ending the lead —
 * a hard stop is a disqualifier (below), not a penalty.
 */
export const PENALTIES = {
  non_us_primary_market: { points: -10, note: 'Practice sits outside the OSHA / ASHRAE / AIHA standards context the engine cites.' },
  no_web_presence: { points: -8, note: 'Nothing to verify against beyond a directory stub.' },
  stale_evidence: { points: -6, note: 'The most recent evidence is over 24 months old.' },
  no_named_humans: { points: -5, note: 'No individual is identifiable — outreach would have no addressee.' },
}

/**
 * Hard stops. A lead carrying any of these scores 0 and is filed as
 * disqualified, whatever else is true about it.
 */
export const DISQUALIFIERS = {
  competitor: 'Builds or resells competing IAQ assessment software.',
  no_iaq_practice: 'No evidence of indoor air quality work of any kind.',
  do_not_contact: 'Asked not to be contacted, or the source forbids this use.',
  existing_customer: 'Already an AtmosFlow account.',
  unverifiable: 'Nothing could be confirmed from a primary source.',
}

/**
 * Segment base scores. Straight from the white paper's audience ranking:
 * credentialed IH consultancies first, EHS directors and FM behind them.
 */
export const SEGMENTS = {
  ih_consultancy: { points: 30, label: 'Credentialed IH / EHS consultancy (primary)' },
  ehs_multi_site: { points: 22, label: 'EHS director, multi-site employer (tertiary)' },
  fm_property_manager: { points: 18, label: 'Facility / property manager (secondary)' },
  restoration_remediation: { points: 15, label: 'Restoration or remediation contractor (adjacent)' },
  unknown: { points: 0, label: 'Segment not yet established' },
}

export const TIERS = [
  { tier: 'A', min: 70, action: 'Work now. Evidence is strong enough to open a conversation today.' },
  { tier: 'B', min: 50, action: 'Worth a round of deeper research to find the missing signal.' },
  { tier: 'C', min: 30, action: 'Park. Revisit when a timing signal appears.' },
  { tier: 'D', min: 0, action: 'Not a fit on current evidence.' },
]

/** Which tier a total lands in. */
export function tierFor(total) {
  return TIERS.find(t => total >= t.min) ?? TIERS[TIERS.length - 1]
}

/**
 * Signals must carry evidence. This is the rule that keeps the pipeline
 * honest: a signal without a source URL is not a weak signal, it is a
 * claim nobody can check, and it does not score.
 */
export function evidenceIsUsable(signal) {
  const url = signal?.evidence?.url
  return typeof url === 'string' && /^https?:\/\/\S+$/.test(url)
}

/**
 * Score a lead record. Pure: same record in, same score out.
 *
 * Returns { total, tier, action, breakdown, rejected } where `rejected`
 * lists signals that were dropped for missing evidence — surfaced rather
 * than silently ignored, so a thin lead reads as thin.
 */
export function scoreLead(lead) {
  const breakdown = []
  const rejected = []

  if (lead.disqualified) {
    const reason = DISQUALIFIERS[lead.disqualified.reason]
    if (!reason) throw new Error(`Unknown disqualifier: ${lead.disqualified.reason}`)
    return {
      total: 0,
      tier: 'X',
      action: `Disqualified — ${reason}`,
      breakdown: [{ key: `disqualified:${lead.disqualified.reason}`, group: 'disqualifier', points: 0 }],
      rejected: [],
    }
  }

  const segment = SEGMENTS[lead.segment ?? 'unknown']
  if (!segment) throw new Error(`Unknown segment: ${lead.segment}`)
  breakdown.push({ key: `segment:${lead.segment ?? 'unknown'}`, group: 'segment', points: segment.points })

  const seen = new Set()
  for (const signal of lead.signals ?? []) {
    const def = SIGNALS[signal.key]
    if (!def) throw new Error(`Unknown signal: ${signal.key}`)
    if (seen.has(signal.key)) continue // a signal counts once, however often it was observed
    if (!evidenceIsUsable(signal)) {
      rejected.push({ key: signal.key, why: 'no verifiable source URL' })
      continue
    }
    seen.add(signal.key)
    breakdown.push({ key: signal.key, group: def.group, points: def.points })
  }

  for (const key of lead.penalties ?? []) {
    const def = PENALTIES[key]
    if (!def) throw new Error(`Unknown penalty: ${key}`)
    breakdown.push({ key, group: 'penalty', points: def.points })
  }

  const raw = breakdown.reduce((sum, row) => sum + row.points, 0)
  const total = Math.max(0, Math.min(100, raw))
  const { tier, action } = tierFor(total)

  return { total, tier, action, breakdown, rejected }
}

/**
 * The gap report for a single lead: which groups have contributed nothing
 * yet. This is what turns "keep going" into a specific next search rather
 * than another lap around the same pages.
 */
export function missingGroups(lead) {
  const { breakdown } = scoreLead(lead)
  const present = new Set(breakdown.filter(r => r.points > 0).map(r => r.group))
  return ['practice', 'credential', 'pain', 'size', 'reach', 'timing'].filter(g => !present.has(g))
}
