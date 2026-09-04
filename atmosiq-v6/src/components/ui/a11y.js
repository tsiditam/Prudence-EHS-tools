/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * a11y helpers for the inline-styled components.
 *
 * `clickable(onClick, opts)` — spread onto a non-<button> element that has
 * to stay a <div> (it contains its own buttons, or nesting rules forbid a
 * <button>) so it is reachable and operable from the keyboard:
 *
 *   <div {...clickable(() => open(item), { label: item.name })} style={…}>
 *
 * Adds role="button", tabIndex=0, Enter / Space activation and an
 * optional aria-label. Prefer a real <button> whenever the markup allows.
 */

export function clickable(onClick, { label, role = 'button', tabIndex = 0 } = {}) {
  return {
    role,
    tabIndex,
    'aria-label': label,
    onClick,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        // Only act on the element itself — a nested button's own Enter must
        // not also fire the row.
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onClick?.(e)
      }
    },
  }
}

export default clickable
