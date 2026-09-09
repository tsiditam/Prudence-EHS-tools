/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * resolveDraftResumeView — which walkthrough screen a resumed draft should
 * open on.
 *
 * The walkthrough has three phases before a zone is ever scored —
 * quickstart (building intake), equipment (HVAC units), zone (per-zone
 * Q&A) — and this reads the same two signals the phases themselves gate
 * on: whether building intake finished (`bldg.fn`, or the legacy
 * `building.fn` key some stored drafts still carry) and whether the
 * FIRST zone question (`zn`, the zone name — required, always question 1
 * of Q_ZONE) has been answered.
 *
 * The equipment phase used to be unreachable on resume: with only two
 * branches (quickstart / zone), a draft closed on the equipment screen —
 * bldg.fn set, no zone named yet — fell through to 'quickstart' and
 * reopened the already-finished intake instead of the equipment list the
 * assessor was actually on. Any equipment already added there was
 * invisible on the resumed screen regardless, because MobileApp's
 * autosave effect only persisted while `view` was 'quickstart' | 'zone' |
 * 'details' — silently excluding 'equipment', so anything entered there
 * was lost the moment the app backgrounded or closed. Both halves are
 * fixed together: this function names the third destination, and the
 * autosave whitelist now includes it.
 *
 * @param {object} d  A stored draft body: { bldg, building, zones }.
 * @returns {'quickstart'|'equipment'|'zone'}
 */
export function resolveDraftResumeView(d) {
  if (!d) return 'quickstart'
  if (!d.bldg?.fn && !d.building?.fn) return 'quickstart'
  if (d.zones?.length > 0 && d.zones[0]?.zn) return 'zone'
  return 'equipment'
}
