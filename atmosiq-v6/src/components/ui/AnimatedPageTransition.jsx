/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AnimatedPageTransition — Notion-style page transitions for the main
 * view content. Calm, iOS-like: pages fade + slide + scale subtly into
 * place. Used to wrap the view-content region; pass `pageKey` (the
 * current view id) so a change remounts the inner node and replays the
 * enter animation, and `mode` for direction:
 *
 *   mode="forward"  new page slides in from the right (drill-in)
 *   mode="back"     new page slides in from the left  (going back)
 *   mode="tab"      soft fade + slight scale (top-level dock tabs)
 *   mode="up"       fade + subtle upward motion (default / unknown)
 *
 * Implementation notes (why CSS, not Framer Motion):
 *  - Framer Motion isn't a dependency here and the codebase is pure
 *    inline-style + CSS transitions; a keyframe-driven enter animation
 *    matches the idiom and stays lightweight (transform + opacity only,
 *    compositor-friendly / 60fps).
 *  - The enter runs via `animation` with `animation-fill-mode: backwards`
 *    (NOT forwards). That means once the animation ends the element
 *    reverts to its base style — `transform: none` — so it never leaves
 *    a lingering identity transform that would turn this wrapper into the
 *    containing block for any `position: fixed` descendant (modals,
 *    bottom sheets). The transform only exists for the ~260ms it runs.
 *  - prefers-reduced-motion disables the animation entirely.
 *  - No layout shift: transforms/opacity don't reflow; the node keeps its
 *    place in normal flow.
 */

if (typeof document !== 'undefined' && !document.getElementById('affp-style')) {
  const s = document.createElement('style')
  s.id = 'affp-style'
  s.textContent = `
.affp { animation-duration: 280ms; animation-timing-function: cubic-bezier(0.22,1,0.36,1); animation-fill-mode: backwards; will-change: transform, opacity; }
.affp-forward { animation-name: affpForward; }
.affp-back { animation-name: affpBack; }
.affp-tab { animation-name: affpTab; animation-duration: 240ms; }
.affp-up { animation-name: affpUp; animation-duration: 240ms; }
@keyframes affpForward { from { opacity: 0; transform: translate3d(16px,0,0) scale(0.985); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
@keyframes affpBack { from { opacity: 0; transform: translate3d(-16px,0,0) scale(0.99); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }
@keyframes affpTab { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }
@keyframes affpUp { from { opacity: 0; transform: translate3d(0,8px,0); } to { opacity: 1; transform: translate3d(0,0,0); } }
@media (prefers-reduced-motion: reduce) { .affp { animation: none !important; } }
`
  document.head.appendChild(s)
}

const MODES = new Set(['forward', 'back', 'tab', 'up'])

export default function AnimatedPageTransition({ pageKey, mode = 'up', children, style }) {
  const m = MODES.has(mode) ? mode : 'up'
  // Keying the inner node by pageKey is what replays the enter animation:
  // a new key remounts the node, and a freshly-mounted element runs its
  // CSS animation once. (No AnimatePresence/exit pass — keeping the old
  // node mounted to animate it out isn't worth the weight here; the enter
  // alone reads as the Notion-style transition.)
  return (
    <div key={pageKey} className={`affp affp-${m}`} style={style}>
      {children}
    </div>
  )
}
