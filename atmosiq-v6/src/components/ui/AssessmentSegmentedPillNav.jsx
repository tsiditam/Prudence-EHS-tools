/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * AssessmentSegmentedPillNav — the section tabs for the assessment result
 * screen (and the project workspace / mold screening, which pass the same
 * shape). Restraint pass (2026-09): text tabs, every one labelled, the
 * active one in the primary ink with a rule beneath it — the same row the
 * Projects screen uses for its status filters. The icon-only capsules it
 * replaced left five of six destinations unnamed on a phone.
 *
 *   <AssessmentSegmentedPillNav
 *     tabs={[{ id, icon, label }]}   // icon accepted, no longer drawn
 *     active={rTab}
 *     onChange={(id) => setRTab(id)}
 *   />
 */
import { useLayoutEffect, useRef } from 'react'
import * as V3 from '../../styles/tokens'
import { useScrollEdges } from '../../hooks/useScrollEdges'

if (typeof document !== 'undefined' && !document.getElementById('aspn-style')) {
  const s = document.createElement('style')
  s.id = 'aspn-style'
  s.textContent =
    '.aspn-scroll::-webkit-scrollbar{display:none}' +
    // The rule under the active tab is one element that glides between
    // tabs (left/width from the CSS vars the effect below publishes), not
    // a border each tab draws for itself. Same ease as the dock's selector
    // bubble, so the two strips on a screen move the same way.
    '.aspn-rule{position:absolute;bottom:0;height:2px;border-radius:1px;background:var(--text);pointer-events:none;left:var(--aspn-x,0px);width:var(--aspn-w,0px);transition:left 260ms cubic-bezier(.22,1,.36,1),width 260ms cubic-bezier(.22,1,.36,1)}' +
    '@media (prefers-reduced-motion: reduce){.aspn-rule{transition:none}}'
  document.head.appendChild(s)
}

export default function AssessmentSegmentedPillNav({
  tabs,
  active,
  onChange,
  id,
  style,
  ariaLabel = 'Assessment sections',
  // Kept for callers; every tab is labelled now.
  showLabels = true, // eslint-disable-line no-unused-vars
}) {
  // The strip scrolls past a phone frame and the scrollbar is hidden, so
  // it fades on whichever side still has tabs instead of cutting a word.
  const scroll = useScrollEdges()

  // Drive the gliding rule. The active tab is measured with offsetLeft /
  // offsetWidth (layout-box metrics, in the strip's own scroll space, so
  // the rule scrolls with the tabs) and published as CSS vars the
  // `.aspn-rule` style reads. The first placement snaps without a
  // transition — no glide in from zero on mount; every later move
  // animates. A ResizeObserver on the strip re-places when a label or a
  // badge changes width. Same mechanism as the dock's selector bubble.
  const placedRef = useRef(false)
  const tabKey = (tabs || []).map((t) => `${t.id}:${t.label}:${t.badge ?? ''}`).join('|')
  useLayoutEffect(() => {
    const el = scroll.ref.current
    if (!el || typeof window === 'undefined') return undefined
    const place = () => {
      const rule = el.querySelector('.aspn-rule')
      if (!rule) return
      const on = el.querySelector('[role="tab"][aria-selected="true"]')
      if (!on) { rule.style.opacity = '0'; return }
      const snap = !placedRef.current
      if (snap) rule.style.transition = 'none'
      el.style.setProperty('--aspn-x', on.offsetLeft + 'px')
      el.style.setProperty('--aspn-w', on.offsetWidth + 'px')
      rule.style.opacity = '1'
      if (snap) { void rule.offsetWidth; rule.style.transition = ''; placedRef.current = true }
    }
    place()
    let ro
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(place); ro.observe(el) }
    window.addEventListener('resize', place)
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', place) }
  }, [active, tabKey, scroll.ref])

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      className="aspn-scroll"
      ref={scroll.ref}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        gap: 22,
        overflowX: 'auto',
        overflowY: 'hidden',
        margin: '0 0 16px',
        borderBottom: `1px solid ${V3.BORDER_SUBTLE}`,
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
        ...scroll.maskStyle,
        ...style,
      }}
    >
      {(tabs || []).map((t) => {
        const on = active === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            aria-label={t.label}
            title={t.label}
            onClick={() => onChange(t.id)}
            style={{
              flexShrink: 0,
              padding: '8px 0 10px',
              background: 'transparent',
              border: 'none',
              // Kept transparent for the layout box; the gliding
              // `.aspn-rule` below is the visible rule.
              borderBottom: '2px solid transparent',
              marginBottom: -1,
              fontSize: 14,
              fontWeight: on ? 600 : 500,
              letterSpacing: '-0.01em',
              color: on ? V3.TEXT_PRIMARY : V3.TEXT_SECONDARY,
              cursor: 'pointer',
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {t.label}
            {/* Optional count beside the label ("Report · 2"), in secondary
                ink; the accessible name stays the label alone. */}
            {t.badge ? <span aria-hidden="true" style={{ color: V3.TEXT_TERTIARY, fontWeight: 500 }}> · {t.badge}</span> : null}
          </button>
        )
      })}
      <span aria-hidden="true" className="aspn-rule" />
    </div>
  )
}
