/**
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 Prudence Safety & Environmental Consulting, LLC
 * All rights reserved.
 *
 * Theme module — manual dark/light toggle for the in-app surface.
 *
 * Dark is the default. Setting mode='light' adds `data-theme="light"`
 * to <html>, which flips the CSS-variable overrides defined in
 * index.html. Public landing pages, auth, early-access, and the PWA
 * manifest stay dark/branded regardless of this preference — those
 * surfaces hard-code dark literals and do not consult var(--bg) etc.
 *
 * Persistence lives in localStorage under `atmosflow-theme`. The
 * `storage` event keeps the preference in sync across tabs.
 */

import { useState, useEffect } from 'react'

const KEY = 'atmosflow-theme'
const VALID = new Set(['dark', 'light'])

export function getTheme() {
  try {
    const v = localStorage.getItem(KEY)
    return VALID.has(v) ? v : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(mode) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (mode === 'light') html.setAttribute('data-theme', 'light')
  else html.removeAttribute('data-theme')
}

export function setTheme(mode) {
  const next = VALID.has(mode) ? mode : 'dark'
  try { localStorage.setItem(KEY, next) } catch {}
  applyTheme(next)
}

export function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}

// Call once at app boot so the saved preference applies before
// first paint and survives a hard reload.
export function bootTheme() {
  applyTheme(getTheme())
}

export function useTheme() {
  const [mode, setMode] = useState(getTheme)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === KEY) setMode(getTheme())
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  const update = (m) => {
    setTheme(m)
    setMode(VALID.has(m) ? m : 'dark')
  }
  const toggle = () => update(mode === 'light' ? 'dark' : 'light')
  return { mode, setMode: update, toggle }
}

// color-mix helper for the legacy `${TOKEN}HEX_ALPHA` template-string
// pattern. With CSS-var references TOKEN no longer expands to a hex
// string, so we rewrite those sites to color-mix. `name` is the bare
// var name without the `var(--)` wrapper. Supported on Safari 16.2+ /
// Chrome 111+ / Firefox 113+ — within the iOS-PWA target.
export const mix = (name, pct) =>
  `color-mix(in srgb, var(--${name}) ${pct}%, transparent)`
