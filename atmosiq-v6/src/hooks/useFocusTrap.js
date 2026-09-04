/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useFocusTrap — keep keyboard focus inside a modal surface while it is
 * open, and put it back where it came from when it closes.
 *
 *   const ref = useRef(null)
 *   useFocusTrap(ref, open, { initialFocus: 'first' | 'container' | () => HTMLElement })
 *
 * What it does (WCAG 2.1 SC 2.1.2 "No Keyboard Trap" the right way round —
 * a modal that lets Tab wander into the page behind it is the trap):
 *   • on open: remembers document.activeElement, then focuses the first
 *     tabbable descendant (or the container itself when there is none);
 *   • while open: Tab / Shift+Tab cycle within the container;
 *   • on close / unmount: restores focus to the remembered element.
 *
 * Escape handling is left to the caller — sheets and dialogs already own
 * their dismiss semantics.
 */

import { useEffect } from 'react'

const TABBABLE = [
  'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', 'iframe', 'audio[controls]', 'video[controls]',
  '[contenteditable]:not([contenteditable="false"])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function getTabbable(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll(TABBABLE)).filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true') return false
    // jsdom has no layout, so offsetParent is always null there; only
    // treat an element as hidden when the browser says so explicitly.
    if (typeof el.hidden === 'boolean' && el.hidden) return false
    return true
  })
}

export function useFocusTrap(ref, active = true, { initialFocus = 'first' } = {}) {
  useEffect(() => {
    if (!active) return undefined
    const container = ref.current
    if (!container || typeof document === 'undefined') return undefined

    const previouslyFocused = document.activeElement

    // Initial focus. The container needs tabindex=-1 to be focusable as a
    // fallback; set it if the caller has not.
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
    const focusInitial = () => {
      if (typeof initialFocus === 'function') {
        const el = initialFocus()
        if (el && typeof el.focus === 'function') { el.focus(); return }
      }
      if (initialFocus !== 'container') {
        const first = getTabbable(container)[0]
        if (first) { first.focus(); return }
      }
      container.focus()
    }
    focusInitial()

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const tabbable = getTabbable(container)
      if (tabbable.length === 0) { e.preventDefault(); container.focus(); return }
      const first = tabbable[0]
      const last = tabbable[tabbable.length - 1]
      const current = document.activeElement
      const inside = container.contains(current)
      if (e.shiftKey) {
        if (!inside || current === first) { e.preventDefault(); last.focus() }
      } else if (!inside || current === last) {
        e.preventDefault(); first.focus()
      }
    }
    // Focus that escapes by other means (a click on the backdrop-less page,
    // a screen reader's virtual cursor) is pulled back in.
    const onFocusIn = (e) => {
      if (!container.contains(e.target)) {
        const first = getTabbable(container)[0]
        ;(first || container).focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('focusin', onFocusIn)
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus()
      }
    }
  }, [ref, active, initialFocus])
}

export default useFocusTrap
