/**
 * Vercel Serverless Function — /api/checkout
 * Creates a Stripe Checkout session (one-time payment) for review or
 * citation credits.
 *
 * Body: { tier: 1|2|3|4, returnUrl?: string }
 * The buyer is taken from the verified Supabase JWT, never from the body.
 *
 * Tiers:
 *   1 — Single Review        $49   (1 review credit)
 *   2 — 5 Reviews            $199  (5 review credits)
 *   3 — 15 Reviews           $499  (15 review credits)
 *   4 — Citation Response    $149  (1 citation credit)
 *
 * Credits are granted by /api/stripe-webhook on checkout.session.completed,
 * never here, so a user who closes the tab before paying gets nothing.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const { requireAuthAndLimit } = require("./_lib/auth.js");

const TIERS = {
  1: { name: "RegLens — Single Compliance Review", amountCents: 4900, credits: 1, creditType: "review", priceEnv: "STRIPE_PRICE_TIER_1" },
  2: { name: "RegLens — 5 Compliance Reviews", amountCents: 19900, credits: 5, creditType: "review", priceEnv: "STRIPE_PRICE_TIER_2" },
  3: { name: "RegLens — 15 Compliance Reviews", amountCents: 49900, credits: 15, creditType: "review", priceEnv: "STRIPE_PRICE_TIER_3" },
  4: { name: "RegLens — Citation Response Worksheet", amountCents: 14900, credits: 1, creditType: "citation", priceEnv: "STRIPE_PRICE_TIER_4" },
};

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const stripeLib = require("stripe");
  _stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY);
  return _stripeClient;
}

function resolveReturnUrl(req, bodyUrl) {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof bodyUrl === "string" && /^https:\/\//.test(bodyUrl)) return bodyUrl.replace(/\/$/, "");
  const host = req.headers?.["x-forwarded-host"] || req.headers?.host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  return host ? `${proto}://${host}` : "https://reglens.prudenceehs.com";
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Payments are not configured yet. Contact info@prudencesafety.com." });

  const auth = await requireAuthAndLimit(req, res, { endpoint: "checkout", maxPerMinute: 10, maxPerDay: 50 });
  if (!auth.ok) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const tier = TIERS[Number(body.tier)];
  if (!tier) return res.status(400).json({ error: "Invalid tier" });

  const returnUrl = resolveReturnUrl(req, body.returnUrl);
  const priceId = process.env[tier.priceEnv];
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: tier.amountCents,
          product_data: { name: tier.name },
        },
      };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: auth.user.email || undefined,
      client_reference_id: auth.userId,
      line_items: [lineItem],
      metadata: {
        user_id: auth.userId,
        tier: String(body.tier),
        credits: String(tier.credits),
        credit_type: tier.creditType,
      },
      success_url: `${returnUrl}/?checkout=success&tier=${Number(body.tier)}`,
      cancel_url: `${returnUrl}/?checkout=cancelled`,
    });
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
}

module.exports = handler;
module.exports.__test = {
  TIERS,
  setStripe(mock) { _stripeClient = mock; },
  resetStripe() { _stripeClient = null; },
};
