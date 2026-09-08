/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * useNavStack — the in-app navigation stack.
 *
 * The shell used to hold a bare `view` string; "back" meant "go to
 * Projects", except tools, which remembered one return view, except the
 * project workspace, which drew its own. This hook makes navigation a
 * stack of { view, params } entries:
 *
 *   navigate(view, params)  push a screen (going to the screen directly
 *                           beneath you pops instead, so a popstate that
 *                           lands on the previous entry reads as back)
 *   reset(view, params)     a dock tab — the stack becomes [view]
 *   back()                  pop; with nothing beneath, fall back to the
 *                           route's declared `parent` (routes.js), then home
 *   backView                the view back() would go to — the header pill
 *                           names this, so "‹ Project" means it
 *   params                  the current entry's params (e.g. the project a
 *                           tool was opened from), so a tool carries its
 *                           context instead of the shell remembering it
 *   dir                     'tab' | 'forward' | 'back' | 'up' for the page
 *                           transition
 *
 * The browser-history mirror (useViewHistory) stays as it is: it pushes a
 * history entry per view change and rebuilds the screen on popstate by
 * calling navigate(), which the "previous entry = back" rule keeps in step
 * with this stack.
 *
 * `navReduce` and `backTarget` are pure so the rules are unit-tested.
 */
import { useCallback, useRef, useState } from 'react'
import { ROUTES } from '../constants/routes'

export function createNavState(view, params = null) {
  return { stack: [{ view, params }], dir: 'up' }
}

export function backTarget(state, home) {
  const { stack } = state
  if (stack.length > 1) return stack[stack.length - 2].view
  const cur = stack[stack.length - 1]
  const parent = ROUTES[cur.view]?.parent || null
  if (parent && parent !== cur.view) return parent
  if (home && home !== cur.view) return home
  return null
}

export function navReduce(state, action) {
  const { stack } = state
  const cur = stack[stack.length - 1]
  switch (action.type) {
    case 'reset': {
      const params = action.params || null
      if (stack.length === 1 && cur.view === action.view && sameParams(cur.params, params)) return state
      return { stack: [{ view: action.view, params }], dir: 'tab' }
    }
    case 'navigate': {
      const view = action.view
      const params = action.params === undefined ? null : action.params
      if (!view) return state
      if (cur.view === view) {
        // Same screen — refresh its params in place, never a duplicate entry.
        if (sameParams(cur.params, params)) return state
        return { stack: [...stack.slice(0, -1), { view, params }], dir: state.dir }
      }
      const prev = stack[stack.length - 2]
      if (prev && prev.view === view) return { stack: stack.slice(0, -1), dir: 'back' }
      return { stack: [...stack, { view, params }], dir: 'forward' }
    }
    case 'back': {
      if (stack.length > 1) return { stack: stack.slice(0, -1), dir: 'back' }
      const target = backTarget(state, action.home)
      if (!target) return state
      return { stack: [{ view: target, params: null }], dir: 'back' }
    }
    default:
      return state
  }
}

function sameParams(a, b) {
  if (a === b) return true
  if (!a || !b) return !a && !b
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => a[k] === b[k])
}

/**
 * @param {string} initialView
 * @param {string} home  the view back() falls to when the stack is empty
 *                       and the route has no parent (mode-dependent, so it
 *                       is passed each render rather than captured once)
 */
export function useNavStack(initialView, home) {
  const [state, setState] = useState(() => createNavState(initialView))
  const homeRef = useRef(home)
  homeRef.current = home
  const navigate = useCallback((view, params) => setState((s) => navReduce(s, { type: 'navigate', view, params })), [])
  const reset = useCallback((view, params) => setState((s) => navReduce(s, { type: 'reset', view, params })), [])
  const back = useCallback(() => setState((s) => navReduce(s, { type: 'back', home: homeRef.current })), [])
  const cur = state.stack[state.stack.length - 1]
  return {
    view: cur.view,
    params: cur.params || null,
    stack: state.stack,
    dir: state.dir,
    backView: backTarget(state, home),
    navigate,
    reset,
    back,
    /** True when `view` is anywhere on the stack — "am I inside a project?" */
    within: (view) => state.stack.some((e) => e.view === view),
  }
}

export default useNavStack
