/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * DrawnCheck — a check mark that draws itself.
 *
 *   <DrawnCheck />                 20px, success tone
 *   <DrawnCheck size={72} />       the milestone overlay
 *
 * A ring and a tick, each a stroked path whose dash offset runs from its
 * full length to zero: the ring closes first, the tick follows. It is the
 * feedback for the moments that end a piece of work — a zone completed, an
 * assessment finalized, a report exported, a file attached — and it is
 * drawn rather than shown because a mark that appears at the moment of the
 * action is what tells the hand it landed (Saffer's micro-interaction
 * rule: feedback at the trigger). Under reduced motion both paths render
 * complete; the mark still appears, it just does not animate.
 */
const RING_LEN = 2 * Math.PI * 10   // r=10 on a 24 grid
const TICK_LEN = 14                 // the tick's path length, rounded up

if (typeof document !== 'undefined' && !document.getElementById('afdc-style')) {
  const s = document.createElement('style')
  s.id = 'afdc-style'
  s.textContent = `
    @keyframes afdcDraw { to { stroke-dashoffset: 0; } }
    .af-check-ring { stroke-dasharray: ${RING_LEN}; stroke-dashoffset: ${RING_LEN}; animation: afdcDraw var(--dur-sheet) var(--ease-out) forwards; }
    .af-check-tick { stroke-dasharray: ${TICK_LEN}; stroke-dashoffset: ${TICK_LEN}; animation: afdcDraw var(--dur-enter) var(--ease-out) calc(var(--dur-sheet) * 0.6) forwards; }
    @media (prefers-reduced-motion: reduce) { .af-check-ring, .af-check-tick { animation: none; stroke-dashoffset: 0; } }
  `
  document.head.appendChild(s)
}

export default function DrawnCheck({ size = 20, tone = 'var(--success)', strokeWidth = 2, style }) {
  return (
    <svg
      className="af-drawn-check"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tone}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0, ...style }}>
      <circle className="af-check-ring" cx="12" cy="12" r="10" transform="rotate(-90 12 12)" />
      <path className="af-check-tick" d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  )
}
