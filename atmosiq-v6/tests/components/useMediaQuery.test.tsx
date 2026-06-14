// @vitest-environment jsdom
/**
 * useMediaQuery — responsive breakpoint hook.
 *
 * Pins the desktop gate the desktop layout depends on:
 *   • isDesktop at width >= 1024 (regardless of standalone/PWA — an installed
 *     desktop PWA window should also get the desktop layout)
 *   • tablet / mobile bands unchanged
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useMediaQuery } from '../../src/hooks/useMediaQuery'

function setViewport(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h })
}

beforeEach(() => {
  // jsdom has no matchMedia — stub it (display-mode: standalone → false).
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false },
  })) as unknown as typeof window.matchMedia
})

describe('useMediaQuery', () => {
  it('reports desktop at >= 1024px (and tablet is also true there)', () => {
    setViewport(1280, 900)
    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.isTablet).toBe(true)
    expect(result.current.isMobile).toBe(false)
  })

  it('is not desktop at tablet width (800px)', () => {
    setViewport(800, 1000)
    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.isTablet).toBe(true)
  })

  it('is mobile (not desktop) at phone width (375px)', () => {
    setViewport(375, 800)
    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isMobile).toBe(true)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.isTablet).toBe(false)
  })

  it('still reports desktop when running as an installed (standalone) PWA at >= 1024', () => {
    setViewport(1440, 900)
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('standalone'), media: query,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false },
    })) as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useMediaQuery())
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.isStandalone).toBe(true)
  })
})
