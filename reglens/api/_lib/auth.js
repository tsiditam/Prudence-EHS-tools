/**
 * Shared auth + rate limit helper for RegLens serverless functions.
 *
 * Verifies a Supabase JWT from the Authorization header against the Supabase
 * Auth API, then atomically increments a per-user/per-endpoint counter via
 * the public.check_rate_limit RPC. The check uses the service role key, so
 * RLS on api_rate_limits is bypassed by design.
 *
 * Vercel ignores files under api/_lib/ for routing because of the leading
 * underscore, so this module is import-only.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function envReady() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function verifyUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return user?.id ? user : null;
}

async function callRateLimit(userId, endpoint, maxPerMinute, maxPerDay) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_endpoint: endpoint,
      p_max_per_minute: maxPerMinute,
      p_max_per_day: maxPerDay,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`rate limit RPC failed (${res.status}): ${detail}`);
  }
  return await res.json();
}

/**
 * Authenticate the request and enforce rate limits.
 *
 * On success, returns { ok: true, userId, verdict } and writes
 * X-RateLimit-* headers to res. On failure, writes the JSON error
 * response to res itself and returns { ok: false }.
 */
async function requireAuthAndLimit(req, res, { endpoint, maxPerMinute, maxPerDay }) {
  if (!envReady()) {
    res.status(500).json({ error: "Auth not configured on server" });
    return { ok: false };
  }

  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Authorization header" });
    return { ok: false };
  }

  const user = await verifyUser(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return { ok: false };
  }

  let verdict;
  try {
    verdict = await callRateLimit(user.id, endpoint, maxPerMinute, maxPerDay);
  } catch (err) {
    console.error("rate limit check failed:", err);
    res.status(503).json({ error: "Rate limiter unavailable" });
    return { ok: false };
  }

  const remainingMinute = Math.max(0, (verdict.limit_minute ?? maxPerMinute) - (verdict.minute_count ?? 0));
  res.setHeader("X-RateLimit-Limit-Minute", String(verdict.limit_minute ?? maxPerMinute));
  res.setHeader("X-RateLimit-Remaining-Minute", String(remainingMinute));
  if (verdict.limit_day != null) {
    const remainingDay = Math.max(0, verdict.limit_day - (verdict.day_count ?? 0));
    res.setHeader("X-RateLimit-Limit-Day", String(verdict.limit_day));
    res.setHeader("X-RateLimit-Remaining-Day", String(remainingDay));
  }

  if (!verdict.allowed) {
    res.setHeader("Retry-After", verdict.reason === "day_limit" ? "3600" : "60");
    res.status(429).json({
      error: verdict.reason === "day_limit"
        ? "Daily request limit reached. Try again tomorrow."
        : "Too many requests. Slow down and try again in a minute.",
      reason: verdict.reason,
    });
    return { ok: false };
  }

  return { ok: true, userId: user.id, verdict };
}

module.exports = { requireAuthAndLimit };
