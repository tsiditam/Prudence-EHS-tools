/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * ReportStatusBadge — where a report is in its lifecycle, in one chip.
 *
 * Every surface that shows report state (dashboard, history, project
 * lists, the result header) renders this rather than composing its own
 * chip. Before the lifecycle existed there was no shared component and
 * each surface hardcoded its own string, which is how "IH Review
 * Required" ended up meaning three different things in three places.
 *
 * Labels and tones come from src/constants/reportLifecycle.js — this
 * file decides only how a tone maps to the palette, never what a status
 * is called.
 */

import { statusLabel, statusTone, profileLabel } from '../../constants/reportLifecycle'

/**
 * Tone → palette. Tokens rather than literals so the badge follows the
 * theme, including the light/dark switch.
 */
const TONE_STYLE = {
  // Final: settled, unremarkable. Deliberately quiet — a finished report
  // should not shout at the person who finished it.
  ok: { fg: 'var(--ok, #16A34A)', bg: 'color-mix(in srgb, var(--ok, #16A34A) 12%, transparent)' },
  // Professionally reviewed: the one state worth drawing the eye.
  accent: { fg: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 14%, transparent)' },
  // In review: in motion, needs nothing from the viewer right now.
  notice: { fg: 'var(--warn, #D97706)', bg: 'color-mix(in srgb, var(--warn, #D97706) 14%, transparent)' },
  // Draft: neutral. A draft is normal, not a problem.
  muted: { fg: 'var(--sub)', bg: 'color-mix(in srgb, var(--sub) 12%, transparent)' },
}

/**
 * @param {object} props
 * @param {string} props.status  a REPORT_STATUS value
 * @param {string} [props.profile] a REPORT_PROFILES value — changes the
 *   draft label, since only professional work is "pending review"
 * @param {boolean} [props.showProfile] append the profile name, for
 *   surfaces that mix report types in one list
 * @param {'sm'|'md'} [props.size]
 */
export default function ReportStatusBadge({ status, profile, showProfile = false, size = 'md', style }) {
  const tone = TONE_STYLE[statusTone(status)] || TONE_STYLE.muted
  const label = statusLabel(profile, status)
  const sm = size === 'sm'

  return (
    <span
      data-testid="report-status-badge"
      data-status={status}
      data-profile={profile}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: sm ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.fg,
        fontSize: sm ? 10.5 : 11.5,
        fontWeight: 700,
        letterSpacing: '0.2px',
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        ...style,
      }}
      title={showProfile ? undefined : profileLabel(profile)}
    >
      <span
        aria-hidden="true"
        style={{ width: 6, height: 6, borderRadius: 3, background: tone.fg, flexShrink: 0 }}
      />
      {label}
      {showProfile && (
        <span style={{ opacity: 0.7, fontWeight: 600 }}>· {profileLabel(profile)}</span>
      )}
    </span>
  )
}
