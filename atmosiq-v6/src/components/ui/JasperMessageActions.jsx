/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * JasperMessageActions — Copy / Share row rendered under each settled
 * assistant turn in the AtmosFlow AI sheet, alongside the feedback
 * thumbs. Lucide icons (NOT emoji) so the look matches the rest of the
 * assistant chrome.
 *
 * Copy  → writes the response text to the clipboard (navigator.clipboard
 *         with a legacy execCommand fallback for older WebViews). The
 *         button flips to a check glyph + "Copied" for ~1.6s.
 * Share → prefers the Web Share API (navigator.share) so iOS / Android
 *         users land in the native share sheet (Messages, Mail, Notes).
 *         When share() is unavailable (most desktop browsers) the button
 *         falls back to a clipboard copy so the action is never a dead
 *         end. A cancelled share sheet is a no-op, not an error.
 *
 * Style mirrors JasperFeedbackRow's btnStyle so the two rows read as one
 * action cluster.
 */

import { useState } from 'react'
import { I } from '../Icons'
import { mix } from '../../utils/theme'

const ACCENT = 'var(--accent)'
const DIM = 'var(--dim)'

// Copy text to the clipboard with a graceful fallback. Returns true on
// success so the caller can decide whether to show confirmation.
async function copyText(text) {
  if (!text) return false
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Clipboard API can reject (permissions, insecure context) — fall
    // through to the legacy path rather than surfacing an error.
  }
  try {
    if (typeof document === 'undefined') return false
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

export default function JasperMessageActions({ text, shareTitle = 'AtmosFlow AI' }) {
  const [copied, setCopied] = useState(false)

  const flashCopied = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const onCopy = async () => {
    const ok = await copyText(text)
    if (ok) flashCopied()
  }

  const onShare = async () => {
    if (!text) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text })
        return
      } catch (err) {
        // User dismissed the native sheet — leave it be.
        if (err && err.name === 'AbortError') return
        // Any other share failure falls through to a clipboard copy so
        // the user still gets something actionable.
      }
    }
    const ok = await copyText(text)
    if (ok) flashCopied()
  }

  const btnStyle = (active) => ({
    height: 30, borderRadius: 8, padding: '0 8px', gap: 5,
    background: active ? mix('accent', 14) : 'transparent',
    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: active ? ACCENT : DIM,
    opacity: active ? 1 : 0.6,
    fontSize: 12, fontWeight: 600,
    transition: 'background 160ms ease, opacity 160ms ease, color 160ms ease',
    WebkitTapHighlightColor: 'transparent',
  })

  return (
    <div data-testid="jasper-message-actions" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy response'}
        title={copied ? 'Copied' : 'Copy'}
        style={btnStyle(copied)}>
        <I n={copied ? 'check' : 'copy'} s={15} c="currentColor" w={1.8} />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <button
        type="button"
        onClick={onShare}
        aria-label="Share response"
        title="Share"
        style={btnStyle(false)}>
        <I n="share" s={15} c="currentColor" w={1.8} />
        <span>Share</span>
      </button>
    </div>
  )
}
