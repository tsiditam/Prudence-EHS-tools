/**
 * HTML escaping for the report exporters.
 *
 * Every exporter builds an HTML document by string interpolation from
 * values that came out of the AI model or from user input. escapeDeep()
 * is applied once at the top of each exporter so that every string in the
 * data tree is safe to interpolate into markup. Numbers, booleans, and
 * null pass through unchanged; keys are not escaped.
 *
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function escapeDeep(value, depth = 0) {
  if (depth > 20) return value;
  if (typeof value === "string") return escapeHtml(value);
  if (Array.isArray(value)) return value.map((v) => escapeDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = escapeDeep(value[key], depth + 1);
    return out;
  }
  return value;
}
