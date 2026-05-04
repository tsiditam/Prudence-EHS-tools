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

// Billing mode flag. 'beta' (default when env var is unset) means no
// billing chrome anywhere in the product. Phase 2 flips this to
// 'live' once Stripe products + webhooks are wired.
//
// TODO(billing-architecture): when Phase 2 ships the live subscription
// model, the gating check becomes `mode === 'live'` and the helper
// branches on profile.subscription_* fields written by the webhook
// handler. Keep the env-flag indirection so QA can flip a single
// build flag to test the full UX before flipping it on for everyone.
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
