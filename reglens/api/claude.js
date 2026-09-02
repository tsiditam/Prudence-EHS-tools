/**
 * Vercel Serverless Function — /api/claude
 * Authenticated proxy to the Anthropic Messages API.
 *
 * Requires an Authorization: Bearer <supabase-jwt> header. Per-user rate
 * limited via the api_rate_limits table.
 *
 * The proxy pins the model server-side and caps max_tokens so a caller
 * cannot pick a more expensive model or a 128K output on this key. It
 * forwards system, messages, tools, and output_config (structured
 * outputs) so callers can enforce JSON schemas. Sampling parameters are
 * not forwarded: current models reject them with a 400.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const { requireAuthAndLimit } = require("./_lib/auth.js");

// Override with CLAUDE_MODEL in Vercel env to move the whole app to a new model.
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
const ALLOWED_MODELS = new Set([
  DEFAULT_MODEL,
  "claude-sonnet-4-6",
  "claude-sonnet-5",
  "claude-haiku-4-5",
]);
const DEFAULT_MAX_TOKENS = 4000;
const MAX_TOKENS_CAP = 8192;
const MAX_INPUT_CHARS = 600000; // ~150k tokens; well inside the context window
const RATE_LIMIT_PER_MINUTE = 30;
const RATE_LIMIT_PER_DAY = 500;
const UPSTREAM_TIMEOUT_MS = 55000;

const FORWARDED_FIELDS = [
  "messages",
  "system",
  "tools",
  "tool_choice",
  "stop_sequences",
  "metadata",
  "output_config",
];

async function handler(req, res) {
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

  const model = ALLOWED_MODELS.has(incoming.model) ? incoming.model : DEFAULT_MODEL;
  const requested = Number(incoming.max_tokens);
  const maxTokens = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.floor(requested), MAX_TOKENS_CAP)
    : DEFAULT_MAX_TOKENS;

  const body = { model, max_tokens: maxTokens, stream: false };
  for (const field of FORWARDED_FIELDS) {
    if (incoming[field] !== undefined) body[field] = incoming[field];
  }

  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_INPUT_CHARS) {
    return res.status(413).json({ error: "Request too large. Shorten the document and try again." });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: serialized,
      signal: controller.signal,
    });

    const data = await upstream.json().catch(() => ({ error: { message: "Upstream returned a non-JSON body" } }));
    return res.status(upstream.status).json(data);
  } catch (err) {
    if (err?.name === "AbortError") {
      console.error("Claude proxy timeout");
      return res.status(504).json({ error: "The AI request timed out. Try a shorter document." });
    }
    console.error("Claude proxy error:", err);
    return res.status(502).json({ error: "Failed to reach Claude API" });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = handler;
// Vercel: allow long reviews to finish. The default is 10s; 60s is the
// Hobby-plan ceiling. Raise to 300 on Pro if long documents time out.
module.exports.config = { maxDuration: 60 };
