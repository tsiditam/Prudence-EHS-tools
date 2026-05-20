/**
 * Precache manifest generator — URL extraction + list composition.
 *
 * Pins the contract the Vite plugin relies on:
 *   • extractAssetUrls pulls <script src> and supported <link href>
 *     from an HTML string, skips externals + duplicates, normalizes
 *     to a leading slash.
 *   • buildPrecacheList prepends STATIC_PRECACHE in order, then
 *     appends Vite-emitted URLs that aren't already in the static
 *     set.
 *
 * The fs-touching writePrecacheManifest is covered by the runtime
 * smoke (npm run build emits dist/precache-manifest.json) and not
 * unit-tested here — keeps this file free of tmpdir setup.
 */
import { describe, it, expect } from 'vitest'
import { extractAssetUrls, buildPrecacheList, STATIC_PRECACHE } from '../../scripts/build-precache-manifest.mjs'

describe('extractAssetUrls', () => {
  it('returns [] for empty / non-string input', () => {
    expect(extractAssetUrls('')).toEqual([])
    expect(extractAssetUrls(null as unknown as string)).toEqual([])
    expect(extractAssetUrls(undefined as unknown as string)).toEqual([])
  })

  it('extracts <script src> and <link href> for same-origin assets', () => {
    const html = `
      <!doctype html>
      <html>
        <head>
          <link rel="stylesheet" href="/assets/index-abc123.css">
          <link rel="modulepreload" href="/assets/vendor-def456.js">
          <link rel="icon" href="/icons/icon-192.svg">
          <link rel="preconnect" href="/assets/skip-this.css">
        </head>
        <body>
          <script type="module" src="/assets/main-789xyz.js"></script>
        </body>
      </html>
    `
    const urls = extractAssetUrls(html)
    expect(urls).toContain('/assets/index-abc123.css')
    expect(urls).toContain('/assets/vendor-def456.js')
    expect(urls).toContain('/icons/icon-192.svg')
    expect(urls).toContain('/assets/main-789xyz.js')
    // preconnect/dns-prefetch links not in the allowed rel set
    expect(urls).not.toContain('/assets/skip-this.css')
  })

  it('skips external URLs (absolute + protocol-relative)', () => {
    const html = `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
      <link rel="stylesheet" href="//cdn.example.com/lib.css">
      <script src="https://example.com/cdn.js"></script>
      <script src="/assets/local.js"></script>
    `
    const urls = extractAssetUrls(html)
    expect(urls).not.toContain('https://fonts.googleapis.com/css2?family=Inter')
    expect(urls).not.toContain('//cdn.example.com/lib.css')
    expect(urls).not.toContain('https://example.com/cdn.js')
    expect(urls).toContain('/assets/local.js')
  })

  it('skips empty / fragment / data URLs', () => {
    const html = `
      <script src=""></script>
      <script src="#anchor"></script>
      <link rel="icon" href="data:image/png;base64,iVBORw0KGgo">
      <script src="/real.js"></script>
    `
    expect(extractAssetUrls(html)).toEqual(['/real.js'])
  })

  it('deduplicates while preserving first-seen order', () => {
    const html = `
      <script src="/a.js"></script>
      <link rel="modulepreload" href="/b.js">
      <script src="/a.js"></script>
      <link rel="stylesheet" href="/c.css">
    `
    expect(extractAssetUrls(html)).toEqual(['/a.js', '/b.js', '/c.css'])
  })

  it('normalizes paths without leading slash to absolute', () => {
    const html = `<script src="assets/no-slash.js"></script>`
    expect(extractAssetUrls(html)).toEqual(['/assets/no-slash.js'])
  })

  it('respects supported <link rel> values only', () => {
    const html = `
      <link rel="stylesheet" href="/css.css">
      <link rel="modulepreload" href="/mp.js">
      <link rel="icon" href="/i.svg">
      <link rel="shortcut icon" href="/si.svg">
      <link rel="apple-touch-icon" href="/at.png">
      <link rel="prefetch" href="/pf.js">
      <link rel="preconnect" href="/pc">
      <link rel="dns-prefetch" href="/dp">
    `
    const urls = extractAssetUrls(html)
    expect(urls).toEqual(['/css.css', '/mp.js', '/i.svg', '/si.svg', '/at.png'])
  })
})

describe('buildPrecacheList', () => {
  it('always starts with STATIC_PRECACHE in declaration order', () => {
    const list = buildPrecacheList('')
    expect(list.slice(0, STATIC_PRECACHE.length)).toEqual([...STATIC_PRECACHE])
  })

  it('appends Vite-emitted assets that are not already static', () => {
    const html = `
      <link rel="stylesheet" href="/assets/index-abc.css">
      <script src="/assets/main-def.js"></script>
    `
    const list = buildPrecacheList(html)
    expect(list).toContain('/assets/index-abc.css')
    expect(list).toContain('/assets/main-def.js')
    // STATIC entries don't get duplicated even if extractAssetUrls
    // happened to surface them.
    const counts = list.reduce<Record<string, number>>((acc, u) => {
      acc[u] = (acc[u] || 0) + 1
      return acc
    }, {})
    for (const [url, n] of Object.entries(counts)) {
      expect(n, `${url} appeared ${n} times`).toBe(1)
    }
  })

  it('does not duplicate when HTML also references a static entry', () => {
    const html = `<link rel="icon" href="/icons/icon-192.svg">`
    const list = buildPrecacheList(html)
    expect(list.filter((u) => u === '/icons/icon-192.svg')).toHaveLength(1)
  })
})
