// @vitest-environment jsdom
/**
 * Unit tests for the theme module (src/utils/theme.js).
 *
 * The module is responsible for the in-app dark/light toggle. These
 * tests cover the core invariants: dark is the default, light is
 * opt-in, the preference round-trips through localStorage, and the
 * <html data-theme> attribute drives the CSS-variable cascade.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTheme,
  setTheme,
  toggleTheme,
  applyTheme,
  bootTheme,
  mix,
} from '../../src/utils/theme'

const KEY = 'atmosflow-theme'

describe('theme module', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  describe('getTheme', () => {
    it('returns "dark" by default when nothing is stored', () => {
      expect(getTheme()).toBe('dark')
    })

    it('returns the stored value when it is a valid mode', () => {
      localStorage.setItem(KEY, 'light')
      expect(getTheme()).toBe('light')
      localStorage.setItem(KEY, 'dark')
      expect(getTheme()).toBe('dark')
    })

    it('returns "dark" when the stored value is invalid', () => {
      localStorage.setItem(KEY, 'midnight')
      expect(getTheme()).toBe('dark')
    })
  })

  describe('applyTheme', () => {
    it('sets data-theme="light" on <html> for light mode', () => {
      applyTheme('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('removes data-theme for dark mode (the default cascade)', () => {
      document.documentElement.setAttribute('data-theme', 'light')
      applyTheme('dark')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })
  })

  describe('setTheme', () => {
    it('persists to localStorage and applies the attribute', () => {
      setTheme('light')
      expect(localStorage.getItem(KEY)).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('falls back to dark when given an invalid value', () => {
      setTheme('cosmic' as 'dark' | 'light')
      expect(localStorage.getItem(KEY)).toBe('dark')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })
  })

  describe('toggleTheme', () => {
    it('flips dark → light', () => {
      setTheme('dark')
      toggleTheme()
      expect(getTheme()).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('flips light → dark', () => {
      setTheme('light')
      toggleTheme()
      expect(getTheme()).toBe('dark')
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })

    it('toggles twice returns to the original state', () => {
      setTheme('dark')
      toggleTheme()
      toggleTheme()
      expect(getTheme()).toBe('dark')
    })
  })

  describe('bootTheme', () => {
    it('applies the stored preference before any UI renders', () => {
      localStorage.setItem(KEY, 'light')
      bootTheme()
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('leaves the dark default in place when nothing is stored', () => {
      bootTheme()
      expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    })
  })

  describe('mix helper', () => {
    it('formats a color-mix string referencing the named CSS variable', () => {
      expect(mix('accent', 10)).toBe(
        'color-mix(in srgb, var(--accent) 10%, transparent)'
      )
    })

    it('handles hyphenated var names like accent-dim', () => {
      expect(mix('accent-dim', 25)).toBe(
        'color-mix(in srgb, var(--accent-dim) 25%, transparent)'
      )
    })
  })
})
