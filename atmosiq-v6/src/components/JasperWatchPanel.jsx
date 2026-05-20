/**
 * JasperWatchPanel — Play 3a live advisor surface.
 *
 * Renders a small panel of deterministic real-time advisories
 * beside the sensor entry inputs. As the assessor types readings,
 * evaluateLive() re-runs and surfaces threshold-vs-reading flags
 * ("CO₂ at 1,400 ppm — likely under-ventilated", "CO at 50 ppm —
 * at OSHA PEL, evacuate or ventilate") with the relevant standards
 * reference.
 *
 * Three render states:
 *   • No data entered yet → hidden entirely (no chrome pollution)
 *   • Data entered but no advisories → hidden (silence is fine)
 *   • Advisories present → render sorted by severity, color-coded
 *
 * Advisory framing: every entry is observational ("X reading is
 * at Y") + suggestion ("consider Z"), never authoritative. The
 * deterministic scoring engine still runs after the walkthrough
 * and produces the actual findings; these are just early signals
 * to act on while still on-site.
 */

import { useMemo } from 'react'
import { evaluateLive } from '../engines/liveAdvisor'

const CARD = 'var(--card)'
const BORDER = 'var(--border)'
const TEXT = 'var(--text)'
const SUB = 'var(--sub)'
const DIM = 'var(--dim)'

const SEV_COLOR = {
  critical: '#B91C1C',
  warn: '#D97706',
  info: '#0E7490',
}
const SEV_BG = {
  critical: 'rgba(185, 28, 28, 0.08)',
  warn: 'rgba(217, 119, 6, 0.08)',
  info: 'rgba(14, 116, 144, 0.08)',
}
const SEV_LABEL = {
  critical: 'CRITICAL',
  warn: 'WARN',
  info: 'INFO',
}

export default function JasperWatchPanel({ data, context }) {
  // Re-evaluate on every data change. The advisor is pure +
  // tiny — cost of re-computation is well under 1 ms even with
  // every sensor field populated, so memoization is precautionary
  // not performance-critical.
  const advisories = useMemo(() => evaluateLive(data || {}, context), [data, context])
  if (advisories.length === 0) return null

  return (
    <div
      data-testid="jasper-watch-panel"
      style={{
        background: CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: 14,
        marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, letterSpacing: '0.3px' }}>
          JASPER WATCH
        </div>
        <div style={{ fontSize: 9, color: DIM, fontFamily: 'var(--font-mono)' }}>
          Advisory — not a finding
        </div>
      </div>
      <div style={{ fontSize: 10, color: SUB, marginBottom: 10, lineHeight: 1.5 }}>
        Live signals from your current readings against the standards manifest.
        Deterministic — no AI judgment. The full scoring engine still runs at finalization.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {advisories.map(adv => (
          <div
            key={adv.id}
            style={{
              padding: '8px 10px',
              borderLeft: `3px solid ${SEV_COLOR[adv.severity] || DIM}`,
              background: SEV_BG[adv.severity] || 'transparent',
              borderRadius: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: SEV_COLOR[adv.severity] || DIM,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.4px',
                }}
              >
                {SEV_LABEL[adv.severity] || adv.severity}
              </span>
              <span style={{ fontSize: 12, color: TEXT, lineHeight: 1.5 }}>
                {adv.observation}
              </span>
            </div>
            <div style={{ fontSize: 11, color: SUB, lineHeight: 1.55, marginLeft: 0 }}>
              {adv.suggestion}
            </div>
            {adv.reference && (
              <div style={{ fontSize: 9, color: DIM, marginTop: 4, fontStyle: 'italic' }}>
                Ref: {adv.reference}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
