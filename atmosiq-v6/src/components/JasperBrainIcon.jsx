/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 *
 * JasperBrainIcon — the AtmosFlow AI identity mark.
 *
 * A neon-cyan brain whose grooves trace on in sequence — the same
 * motion as the chat's "thinking" indicator (ToolStatus in
 * FieldAssistant). Used as the AI's icon in the chat header, the
 * welcome/intro panel, and the bottom-nav AI tab.
 *
 * Self-contained: it injects the `jasperBrainTrace` keyframe (plus a
 * prefers-reduced-motion fallback that holds the brain fully lit and
 * steady) into <head> exactly once, so the trace animates anywhere it's
 * rendered — not only inside the FieldAssistant style scope.
 *
 * `glow` is OFF by default per design — flat neon strokes, no
 * drop-shadow halo. The thinking indicator keeps its own glow.
 */

const NEON = '#22E0F2'
const PATHS = [
  'M12 18V5',
  'M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4',
  'M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5',
  'M17.997 5.125a4 4 0 0 1 2.526 5.77',
  'M18 18a4 4 0 0 0 2-7.464',
  'M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517',
  'M6 18a4 4 0 0 1-2-7.464',
  'M6.003 5.125a4 4 0 0 0-2.526 5.77',
]

// Inject the trace keyframe once, globally, so the animation runs
// wherever the icon mounts (the bottom nav lives outside the chat's
// own <style> block).
if (typeof document !== 'undefined' && !document.getElementById('jasper-brain-kf')) {
  const s = document.createElement('style')
  s.id = 'jasper-brain-kf'
  s.textContent =
    '@keyframes jasperBrainTrace{0%{stroke-dashoffset:100;opacity:.35}45%{stroke-dashoffset:0;opacity:1}80%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:.15}}' +
    '@media (prefers-reduced-motion:reduce){.jasper-brain-trace path{animation:none!important;stroke-dashoffset:0!important;opacity:1!important}}'
  document.head.appendChild(s)
}

export default function JasperBrainIcon({ size = 22, glow = false, ariaLabel }) {
  return (
    <span
      aria-hidden={ariaLabel ? undefined : 'true'}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      style={{
        display: 'inline-flex', flexShrink: 0,
        ...(glow ? { filter: `drop-shadow(0 0 1.5px ${NEON})` } : null),
      }}>
      <svg
        width={size} height={size} viewBox="0 0 24 24" fill="none"
        stroke={NEON} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {/* Dim base — the unlit neon tube, always faintly visible. */}
        <g stroke={NEON} opacity={0.22}>
          {PATHS.map((d, i) => <path key={`b-${i}`} d={d} />)}
        </g>
        {/* Bright trace — neon races through each groove in sequence. */}
        <g className="jasper-brain-trace">
          {PATHS.map((d, i) => (
            <path
              key={`t-${i}`} d={d} pathLength="100"
              style={{
                strokeDasharray: 100, strokeDashoffset: 100,
                animation: 'jasperBrainTrace 2.6s ease-in-out infinite',
                animationDelay: `${i * 0.12}s`,
              }}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}
