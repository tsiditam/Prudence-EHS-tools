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
import * as V3 from '../../styles/tokens'
import { useScrollEdges } from '../../hooks/useScrollEdges'

if (typeof document !== 'undefined' && !document.getElementById('aspn-style')) {
  const s = document.createElement('style')
  s.id = 'aspn-style'
  s.textContent = '.aspn-scroll::-webkit-scrollbar{display:none}'
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

  return (
    <div
      id={id}
      role="tablist"
      aria-label={ariaLabel}
      className="aspn-scroll"
      ref={scroll.ref}
      style={{
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
              borderBottom: `2px solid ${on ? V3.TEXT_PRIMARY : 'transparent'}`,
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
    </div>
  )
}
