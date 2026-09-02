/**
 * Vercel Serverless Function — /api/stripe-webhook
 * Grants credits when a Stripe Checkout session completes.
 *
 * Point the Stripe webhook endpoint at /api/stripe-webhook and set
 * STRIPE_WEBHOOK_SECRET. Only checkout.session.completed is handled.
 *
 * Idempotent: the event id is claimed in stripe_webhook_events before any
 * credit is granted, so Stripe's retries never double-grant.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const { serviceRpc, serviceRest, envReady } = require("./_lib/auth.js");

let _stripeClient = null;
function getStripe() {
  if (_stripeClient) return _stripeClient;
  const stripeLib = require("stripe");
  _stripeClient = stripeLib(process.env.STRIPE_SECRET_KEY);
  return _stripeClient;
}

async function readRawBody(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** Returns true if this call claimed the event, false if already processed. */
async function claimEvent(eventId, eventType) {
  try {
    await serviceRest("stripe_webhook_events", "POST", { event_id: eventId, event_type: eventType }, { Prefer: "return=minimal" });
    return true;
  } catch (err) {
    if (String(err.message).includes("409") || /duplicate key/i.test(String(err.message))) return false;
    throw err;
  }
}

async function releaseClaim(eventId) {
  try {
    await serviceRest(`stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, "DELETE", null, { Prefer: "return=minimal" });
  } catch (err) {
    console.error("[stripe-webhook] failed to release claim", eventId, err.message);
  }
}

async function recordResult(eventId, result) {
  try {
    await serviceRest(`stripe_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, "PATCH", { result }, { Prefer: "return=minimal" });
  } catch (err) {
    console.error("[stripe-webhook] failed to record result", eventId, err.message);
  }
}

async function processCheckoutCompleted(session) {
  if (session.payment_status && session.payment_status !== "paid") {
    return { status: "skipped", reason: `payment_status=${session.payment_status}` };
  }
  const userId = session.metadata?.user_id || session.client_reference_id;
  const credits = parseInt(session.metadata?.credits || "0", 10);
  const creditType = session.metadata?.credit_type === "citation" ? "citation" : "review";

  if (!userId || !credits) {
    console.error("[stripe-webhook] missing metadata on session", session.id);
    return { status: "skipped", reason: "missing metadata" };
  }

  const grant = await serviceRpc("grant_credits", { p_user_id: userId, p_type: creditType, p_amount: credits });
  if (!grant?.ok) {
    throw new Error(`grant_credits refused: ${grant?.reason || "unknown"}`);
  }

  await serviceRest("purchases", "POST", {
    user_id: userId,
    tier: session.metadata?.tier || null,
    amount: (session.amount_total || 0) / 100,
    amount_cents: session.amount_total || null,
    credits,
    credit_type: creditType,
    status: "completed",
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent || null,
  }, { Prefer: "return=minimal" });

  return { status: "success", user_id: userId, credits, credit_type: creditType, balance: grant.balance };
}

async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret || !process.env.STRIPE_SECRET_KEY) {
    return res.status(400).json({ error: "Webhook not configured" });
  }
  if (!envReady()) return res.status(500).json({ error: "Supabase service role not configured" });

  let event;
  try {
    const raw = await readRawBody(req);
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true, status: "ignored", event_type: event.type });
  }

  let claimed;
  try {
    claimed = await claimEvent(event.id, event.type);
  } catch (err) {
    console.error("[stripe-webhook] claim failed:", err.message);
    return res.status(500).json({ error: "idempotency check failed" });
  }
  if (!claimed) return res.status(200).json({ received: true, status: "already_processed" });

  let result;
  try {
    result = await processCheckoutCompleted(event.data.object);
  } catch (err) {
    console.error("[stripe-webhook] processing failed:", err.message);
    await releaseClaim(event.id);
    return res.status(500).json({ error: "webhook processing failed" });
  }

  await recordResult(event.id, result);
  return res.status(200).json({ received: true, status: result.status });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports.__test = {
  processCheckoutCompleted,
  setStripe(mock) { _stripeClient = mock; },
  resetStripe() { _stripeClient = null; },
};
