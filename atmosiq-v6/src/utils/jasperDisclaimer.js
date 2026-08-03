/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Split a Jasper answer into its body and the trailing AI-assistance
 * disclaimer line, so the chat renderer can style the disclaimer
 * separately (italic + smaller) without mutating the stored message.
 *
 * The disclaimer is a WHO-WROTE-IT label the model appends to every
 * answer (enforced by api/_jasper-lint.js). We peel it off only when the
 * content actually ends with it — mid-stream, or on the rare answer that
 * lacks it, the whole thing renders as body.
 */

/**
 * @param {string} content   Full assistant message text (unchanged upstream).
 * @param {string} disclaimer The exact disclaimer literal (AI_DISCLAIMER_LINE).
 * @returns {{ body: string, disclaimer: string|null }}
 *   `body` is the answer minus the trailing disclaimer (and its trailing
 *   whitespace); `disclaimer` is the peeled line, or null when absent.
 */
export function splitTrailingDisclaimer(content, disclaimer) {
  if (typeof content !== 'string' || typeof disclaimer !== 'string' || !disclaimer) {
    return { body: content, disclaimer: null }
  }
  const trimmed = content.replace(/\s+$/, '')
  if (!trimmed.endsWith(disclaimer)) {
    return { body: content, disclaimer: null }
  }
  const body = trimmed.slice(0, trimmed.length - disclaimer.length).replace(/\s+$/, '')
  return { body, disclaimer }
}
