/**
 * Subscription state — pure helper for the Home header exception
 * banner.
 *
 * Returns null when status is healthy (the chip renders nothing —
 * absence is the signal). Returns a state object only when the user
 * needs to know about a billing condition before starting an
 * assessment.
 *
 * Mirrors the calibration-banner pattern in
 * src/utils/instrumentRegistry.js (see getCalibrationBannerState).
 *
 * TODO(billing-architecture):
 * Phase 1 (this file) only handles the in-product surface. Today's
 * mode is "beta" — the helper returns null on every input, the
 * header chip stays quiet, and no billing chrome appears anywhere
 * in the product. The shape of the returned state object is
 * intentional: it is the same shape Phase 2+ will use when real
 * subscription data lands, so call sites in MobileApp.jsx never need
 * to change once Stripe webhooks are wired.
 *
 * The full target state — Solo / Firm / Enterprise tiers, Single
 * Assessment License entitlements, Stripe Customer Portal handoff,
 * and the public marketing pricing page — is described in the
 * "AtmosFlow Pricing Architecture Prompt — Subscription Model & UI
 * Implications" reference. The Phase-2+ subscription state will
 * source from `profile.subscription_*` fields populated via Stripe
 * webhook handlers (`api/webhook.js` →
 * `customer.subscription.updated` / `.deleted` /
 * `invoice.payment_failed` / `checkout.session.completed`) and the
 * helper will branch on `subscription.status`, `subscription.tier`,
 * `subscription.currentPeriodEnd`, etc.
 *
 * Until Phase 2 lands the helper deliberately returns null —
 * preserving the "quiet by default" rule.
 */

// ── Beta-end gates ────────────────────────────────────────────────
//
// The beta-to-live transition is gate-driven, not calendar-driven.
// All four milestones below must be production-ready (built, deployed,
// AND verified in production) before BILLING_MODE flips and
// BETA_END_DATE gets set to a concrete ISO date. Each gate's
// completion should be documented in docs/GO_LIVE.md with the commit
// or PR that closed it.
//
// Beta-end gates (all four required):
//
//   1. White paper shipped — methodology document published, with at
//      least one external-CIH peer-review signoff on the record. Lives
//      in atmosiq-v6/docs/white-paper/ once final.
//
//   2. Calibration warnings live in production — the days-to-expiry
//      banner (CAL_VALIDITY_DAYS / CAL_WARN_DAYS in
//      src/utils/instrumentRegistry.js) deployed AND observed firing
//      on a real expired-instrument case at least once. The presence
//      of the helper isn't enough; we need a real-world hit on the
//      banner before flipping.
//
//   3. Post-finalization versioning in production — the REVISED-badge
//      and recipient-notification registry referenced by the v2.8.0
//      engine spec §6 (still flagged TODO in CHANGELOG.md). Without
//      this, re-running the engine after edits silently overwrites
//      reports already in recipients' hands; the "report is
//      defensible" claim depends on this being done.
//
//   4. CIH peer review findings remediated — every Critical and High
//      finding from the most recent CIH peer review closed, with the
//      remediation commit/PR recorded against each. Outstanding
//      findings are tracked in docs/CIH_REVIEW.md (TBD).
//
// Procedure when all four gates clear:
//   a. Set BETA_END_DATE to an ISO date ~30 days out (beta partners
//      get a scheduled wind-down, not a sudden cutover).
//   b. Flip VITE_BILLING_MODE to 'live' in the production Vercel env.
//   c. Land Phase 2 (Stripe products + webhooks + schema), Phase 4
//      (marketing pricing page), then Phase 3 (Single Assessment
//      License) per the rollout sequence in PR #146's description.
//   d. Send the beta-partner wind-down email through the Resend
//      sequence (lib/email-sequences.ts) referencing the new tier
//      they should subscribe to.
//
// Until then, BETA_END_DATE stays null and the chip stays quiet.
export const BETA_END_DATE = null

// Billing mode flag. 'beta' (default when env var is unset) means no
// billing chrome anywhere in the product. Phase 2 flips this to
// 'live' once the four beta-end gates above are cleared and Stripe
// products + webhooks are wired.
//
// TODO(billing-architecture): when Phase 2 ships the live subscription
// model, the gating check becomes `mode === 'live'` and the helper
// branches on profile.subscription_* fields written by the webhook
// handler. Keep the env-flag indirection so QA can flip a single
// build flag to test the full UX before flipping it on for everyone.
//
// Do NOT flip this without all four BETA_END_DATE gates above —
// flipping early surfaces billing UI to beta partners under their
// signed beta agreement, which is a contract violation.
export const BILLING_MODE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BILLING_MODE) || 'beta'

/**
 * @param {object} profile - the AtmosFlow user profile (from Storage.getProfile)
 * @param {Date}   [now]   - injectable clock for testing
 * @returns {null | { tone: 'warn'|'danger', kind: string, message: string }}
 */
export function getSubscriptionBannerState(profile, now = new Date()) {
  // Beta mode: render nothing, ever. The chip is invisible.
  if (BILLING_MODE === 'beta') return null

  // Phase 2+ branches go here. Stub left in place so call sites have
  // a stable signature; do not enable until Stripe state is wired.
  // eslint-disable-next-line no-unused-vars
  const _profile = profile, _now = now
  return null
}

/**
 * Convenience wrapper: the Settings → Manage Subscription row's
 * subtitle copy. Today returns the beta-state line; Phase 2 replaces
 * the body with subscription-specific lines (Solo $149/mo · renews
 * Jun 3, etc.).
 *
 * Kept as a separate function rather than inlined in SettingsScreen
 * so the canonical billing-state strings live in one file.
 */
export function getSubscriptionRowSubtitle(profile) {
  if (BILLING_MODE === 'beta') return 'Beta · all access'
  // TODO(billing-architecture): Phase 2 returns one of
  //   `Solo · $149/mo · renews Jun 3`
  //   `Firm · 4 of 5 seats · annual`
  //   `Single Assessment · 1 used of 1`
  // sourced from profile.subscription_*.
  return 'Beta · all access'
}
