/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AnimatedPageTransition — Notion-style page transitions for the main
 * view content. Calm, iOS-like: pages glide (fade + slide + scale) into
 * place, and — crucially — the OUTGOING page eases out at the same time
 * the incoming one eases in (a crossfade), which is what makes Notion's
 * transitions feel continuous rather than an abrupt swap.
 *
 *   mode="forward"  new slides in from the right; old eases out to left
 *   mode="back"     new slides in from the left;  old eases out to right
 *   mode="tab"      soft fade + slight scale (top-level dock tabs)
 *   mode="up"       fade + subtle upward motion (default / unknown)
 *
 * How the crossfade works without Framer Motion / AnimatePresence:
 *  - We always render the live `children` (current view) as the incoming
 *    layer, keyed by pageKey so it remounts and replays its enter anim.
 *  - On a pageKey change we snapshot the PREVIOUS render (held in a ref)
 *    and mount it as an absolutely-positioned outgoing layer that plays
 *    an exit animation, then drop it after the run. The snapshot is
 *    frozen — fine, the old page is leaving and needn't stay interactive.
 *  - useLayoutEffect commits the outgoing overlay before paint, so the
 *    new page never flashes in alone.
 *
 * Safety / polish:
 *  - Enter uses animation-fill-mode: backwards and exit uses forwards,
 *    but BOTH layers carry a transform only while animating; the incoming
 *    layer reverts to transform:none when done, so this wrapper never
 *    becomes a lingering containing block for fixed modals/sheets. (The
 *    dock + app-shell overlays render outside this wrapper anyway.)
 *  - The outgoing layer is position:absolute / inset:0 / pointer-events
 *    none, so there's no layout shift and it can't steal taps.
 *  - prefers-reduced-motion disables all of it.
 */
import { useState, useRef, useLayoutEffect } from 'react'

const ENTER_MS = 300
const EXIT_MS = 260

if (typeof document !== 'undefined' && !document.getElementById('affp-style')) {
  const s = document.createElement('style')
  s.id = 'affp-style'
  s.textContent = `
.affp-in, .affp-out { animation-timing-function: cubic-bezier(0.22,1,0.36,1); will-change: transform, opacity; }
.affp-in  { animation-duration: ${ENTER_MS}ms; animation-fill-mode: backwards; }
.affp-out { animation-duration: ${EXIT_MS}ms; animation-fill-mode: forwards; position: absolute; inset: 0; pointer-events: none; }

.affp-in.affp-forward { animation-name: affpInForward; }
.affp-in.affp-back    { animation-name: affpInBack; }
.affp-in.affp-tab     { animation-name: affpInTab; animation-duration: 260ms; }
.affp-in.affp-up      { animation-name: affpInUp; animation-duration: 260ms; }

.affp-out.affp-forward { animation-name: affpOutForward; }
.affp-out.affp-back    { animation-name: affpOutBack; }
.affp-out.affp-tab     { animation-name: affpOutTab; }
.affp-out.affp-up      { animation-name: affpOutUp; }

@keyframes affpInForward { from { opacity: 0; transform: translate3d(22px,0,0) scale(0.985); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
@keyframes affpInBack    { from { opacity: 0; transform: translate3d(-22px,0,0) scale(0.985); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
@keyframes affpInTab     { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }
@keyframes affpInUp      { from { opacity: 0; transform: translate3d(0,10px,0); } to { opacity: 1; transform: translate3d(0,0,0); } }

@keyframes affpOutForward { from { opacity: 1; transform: translate3d(0,0,0) scale(1); } to { opacity: 0; transform: translate3d(-16px,0,0) scale(0.99); } }
@keyframes affpOutBack    { from { opacity: 1; transform: translate3d(0,0,0) scale(1); } to { opacity: 0; transform: translate3d(16px,0,0) scale(0.99); } }
@keyframes affpOutTab     { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.99); } }
@keyframes affpOutUp      { from { opacity: 1; transform: translate3d(0,0,0); } to { opacity: 0; transform: translate3d(0,-6px,0); } }

@media (prefers-reduced-motion: reduce) {
  .affp-in, .affp-out { animation: none !important; }
  .affp-out { display: none !important; }
}
`
  document.head.appendChild(s)
}

const MODES = new Set(['forward', 'back', 'tab', 'up'])

export default function AnimatedPageTransition({ pageKey, mode = 'up', children, style }) {
  const m = MODES.has(mode) ? mode : 'up'
  // Last committed render, snapshotted so it can play out as the outgoing
  // layer on the next page change.
  const last = useRef({ key: pageKey, node: children })
  const [outgoing, setOutgoing] = useState(null)
  const timerRef = useRef(null)

  useLayoutEffect(() => {
    if (last.current.key !== pageKey) {
      // Mount the previous render as the exit layer, then drop it.
      setOutgoing({ key: last.current.key, node: last.current.node, mode: m })
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setOutgoing(null), EXIT_MS + 30)
    }
    last.current = { key: pageKey, node: children }
    // children intentionally excluded: we only re-snapshot/animate on a
    // pageKey change, not on every in-page re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  return (
    <div style={{ position: 'relative', ...style }}>
      {outgoing && (
        <div key={`out-${outgoing.key}`} className={`affp-out affp-${outgoing.mode}`} aria-hidden="true">
          {outgoing.node}
        </div>
      )}
      <div key={`in-${pageKey}`} className={`affp-in affp-${m}`}>
        {children}
      </div>
    </div>
  )
}
