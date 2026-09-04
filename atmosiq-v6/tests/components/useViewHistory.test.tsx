// @vitest-environment jsdom
/**
 * useViewHistory — history-backed navigation (audit 2026-09 §6).
 *
 * Pins, against jsdom's real History implementation:
 *   • a view change pushes an entry carrying { af, view, ...ids } and the
 *     #/view hash (query string preserved)
 *   • the browser back gesture (popstate with our entry) calls onPop with
 *     the previous screen, and that restore does not push a new entry
 *   • entries that are not ours (Supabase auth / siteLink) are ignored
 *   • readInitialNav restores a plain view from history.state or the hash,
 *     hands id-bearing views back as `pending`, and refuses to restore
 *     assessment-flow screens
 *   • an OAuth callback hash is never overwritten
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewHistory, readInitialNav, parseViewHash, isOAuthHash, NAV_KEY } from '../../src/hooks/useViewHistory'

function popTo(state: unknown) {
  window.history.replaceState(state, '', '')
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}

beforeEach(() => {
  window.history.replaceState(null, '', '/?kg=1')
})

describe('useViewHistory', () => {
  it('pushes an entry per view change and keeps the query string', () => {
    const onPop = vi.fn()
    const { rerender } = renderHook(({ view, extra }) => useViewHistory({ view, extra, onPop }), {
      initialProps: { view: 'projects', extra: {} as Record<string, unknown> },
    })
    expect(window.history.state).toMatchObject({ [NAV_KEY]: true, view: 'projects' })
    expect(window.location.hash).toBe('#/projects')
    expect(window.location.search).toBe('?kg=1')

    const len = window.history.length
    rerender({ view: 'history', extra: {} })
    expect(window.history.length).toBe(len + 1)
    expect(window.history.state.view).toBe('history')
    expect(window.location.hash).toBe('#/history')

    rerender({ view: 'report', extra: { rptId: 'rpt-1' } })
    expect(window.history.state).toMatchObject({ view: 'report', rptId: 'rpt-1' })
  })

  it('back gesture restores the previous screen without pushing again', () => {
    const onPop = vi.fn()
    const { rerender } = renderHook(({ view }) => useViewHistory({ view, extra: {}, onPop }), {
      initialProps: { view: 'projects' },
    })
    rerender({ view: 'settings' })
    const lenAfterForward = window.history.length

    // The platform pops back to the 'projects' entry.
    act(() => { popTo({ [NAV_KEY]: true, view: 'projects' }) })
    expect(onPop).toHaveBeenCalledWith(expect.objectContaining({ view: 'projects' }))

    // The app answers by setting view back — that must be a replace, not
    // a push, or back/forward would loop.
    rerender({ view: 'projects' })
    expect(window.history.length).toBe(lenAfterForward)
    expect(window.history.state.view).toBe('projects')
  })

  it('ignores popstate entries that are not ours', () => {
    const onPop = vi.fn()
    renderHook(() => useViewHistory({ view: 'projects', extra: {}, onPop }))
    act(() => { popTo({ from: 'supabase' }) })
    act(() => { popTo(null) })
    expect(onPop).not.toHaveBeenCalled()
  })

  it('does not overwrite an OAuth callback hash', () => {
    window.history.replaceState(null, '', '/#access_token=abc&refresh_token=def')
    renderHook(() => useViewHistory({ view: 'projects', extra: {}, onPop: () => {} }))
    expect(window.location.hash).toBe('#access_token=abc&refresh_token=def')
    expect(window.history.state.view).toBe('projects')
  })
})

describe('readInitialNav', () => {
  it('restores a plain view from history.state (refresh)', () => {
    window.history.replaceState({ [NAV_KEY]: true, view: 'settings' }, '', '/#/settings')
    expect(readInitialNav('projects')).toEqual({ view: 'settings', pending: null })
  })

  it('restores a plain view from the hash (deep link)', () => {
    window.history.replaceState(null, '', '/#/history')
    expect(readInitialNav('projects')).toEqual({ view: 'history', pending: null })
  })

  it('hands id-bearing views back as pending', () => {
    window.history.replaceState({ [NAV_KEY]: true, view: 'report', rptId: 'rpt-9' }, '', '/#/report')
    expect(readInitialNav('projects')).toEqual({ view: 'projects', pending: expect.objectContaining({ view: 'report', rptId: 'rpt-9' }) })
    // …but not without the id.
    window.history.replaceState({ [NAV_KEY]: true, view: 'report' }, '', '/#/report')
    expect(readInitialNav('projects')).toEqual({ view: 'projects', pending: null })
  })

  it('refuses assessment-flow and unknown views', () => {
    window.history.replaceState({ [NAV_KEY]: true, view: 'zone' }, '', '/#/zone')
    expect(readInitialNav('projects').view).toBe('projects')
    window.history.replaceState(null, '', '/#/not-a-view')
    expect(readInitialNav('projects').view).toBe('projects')
  })

  it('helpers', () => {
    expect(parseViewHash('#/sensor-data')).toBe('sensor-data')
    expect(parseViewHash('#access_token=x')).toBeNull()
    expect(isOAuthHash('#access_token=x&type=recovery')).toBe(true)
    expect(isOAuthHash('#/projects')).toBe(false)
  })
})
