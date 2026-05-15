/**
 * Vercel Serverless Function — /api/claude
 * Authenticated proxy to the Anthropic Messages API.
 *
 * Requires an Authorization: Bearer <supabase-jwt> header. Per-user rate
 * limited via the api_rate_limits table. Forwards the full Messages API
 * body shape so callers can use system prompts, tools, prompt caching
 * (cache_control blocks), etc.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const { requireAuthAndLimit } = require("./_lib/auth.js");

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4000;
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 500;

const FORWARDED_FIELDS = [
  "model",
  "max_tokens",
  "messages",
  "system",
  "tools",
  "tool_choice",
  "temperature",
  "top_p",
  "top_k",
  "stop_sequences",
  "metadata",
  "stream",
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server" });
  }

  const auth = await requireAuthAndLimit(req, res, {
    endpoint: "claude",
    maxPerMinute: RATE_LIMIT_PER_MINUTE,
    maxPerDay: RATE_LIMIT_PER_DAY,
  });
  if (!auth.ok) return;

  const incoming = req.body && typeof req.body === "object" ? req.body : {};
  if (!Array.isArray(incoming.messages) || incoming.messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  if (incoming.stream) {
    return res.status(400).json({ error: "Streaming is not supported by this proxy" });
  }

  const body = { model: DEFAULT_MODEL, max_tokens: DEFAULT_MAX_TOKENS };
  for (const field of FORWARDED_FIELDS) {
    if (incoming[field] !== undefined) body[field] = incoming[field];
  }
  body.stream = false;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Claude proxy error:", err);
    return res.status(502).json({ error: "Failed to reach Claude API" });
  }
};
