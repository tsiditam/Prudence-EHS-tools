/**
 * Build-time precache-manifest generator.
 *
 * Runs as a Vite `closeBundle` hook (see vite.config.js). After Vite
 * writes dist/, this script reads dist/index.html, extracts every
 * <script src> and <link href> referencing a same-origin asset, and
 * writes the URLs (plus a small static base set) to
 * dist/precache-manifest.json.
 *
 * The runtime service worker (public/sw.js) fetches this manifest on
 * install and pre-populates its cache with every URL in it, so a
 * cold-offline page load after a fresh deploy has the full app shell
 * ready — not just whatever happened to be fetched lazily by the
 * cache-aside strategy.
 *
 * Manifest shape:
 *   { "version": "<build-id>", "assets": ["/", "/assets/...", ...] }
 *
 * Pure URL extraction (no fs / no path) is factored into
 * extractAssetUrls() so it can be unit-tested without touching the
 * filesystem.
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Static base set — items always precached regardless of what
 * Vite's index.html happens to reference. Kept narrow on purpose:
 * just the root navigation target, the PWA manifest, and the
 * launcher icons.
 */
export const STATIC_PRECACHE = Object.freeze([
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
])

/**
 * Extract same-origin asset URLs from an HTML string. Matches
 * <script src="…">, <link href="…" rel="stylesheet"|"modulepreload">,
 * and <link rel="icon"> tags. Skips:
 *   - absolute external URLs (https://…, //cdn.example.com)
 *   - empty / fragment / data: URLs
 *   - duplicates (preserves first-seen order)
 *
 * Returns a fresh array of strings.
 */
export function extractAssetUrls(html) {
  if (typeof html !== 'string' || html.length === 0) return []
  const seen = new Set()
  const out = []
  const add = (url) => {
    if (!url || typeof url !== 'string') return
    const trimmed = url.trim()
    if (!trimmed) return
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return
    if (trimmed.startsWith('//')) return
    if (trimmed.startsWith('data:')) return
    if (trimmed.startsWith('#')) return
    // Normalize to a leading slash so cache keys are consistent.
    const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    if (seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  }
  const scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi
  const linkRe = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi
  let m
  while ((m = scriptRe.exec(html)) !== null) add(m[1])
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0]
    // Only precache stylesheets, modulepreloads, and icons — skip
    // external font CSS that's loaded from fonts.googleapis.com etc.
    // (already excluded by the absolute-URL filter above) and skip
    // bare prefetch hints.
    if (/rel=["'](stylesheet|modulepreload|icon|shortcut icon|apple-touch-icon)["']/i.test(tag)) {
      add(m[1])
    }
  }
  return out
}

/**
 * Compose the final precache list: STATIC_PRECACHE first, then any
 * Vite-emitted assets extracted from HTML that aren't already in
 * the static set.
 */
export function buildPrecacheList(html) {
  const fromHtml = extractAssetUrls(html)
  const seen = new Set(STATIC_PRECACHE)
  const merged = [...STATIC_PRECACHE]
  for (const url of fromHtml) {
    if (!seen.has(url)) { seen.add(url); merged.push(url) }
  }
  return merged
}

/**
 * Walk dist/assets/ (or any nested asset directory) and return every
 * .js / .css / .woff2 / .png / .svg / .jpg file as a leading-slash
 * URL. Used to capture lazy-loaded chunks that Vite's code-splitting
 * emits but doesn't reference from index.html — jsPDF + html2canvas
 * + DOMPurify on this codebase, all loaded via dynamic import() at
 * runtime, would otherwise be missed by an HTML-only scan.
 *
 * Pure-ish: takes the dist root, walks recursively, returns sorted
 * URLs relative to dist root with a leading slash. Errors swallowed
 * — a missing directory yields an empty array.
 */
export async function listEmittedAssets(distDir) {
  const out = []
  async function walk(dir, prefix) {
    let entries
    try { entries = await readdir(dir) } catch { return }
    for (const name of entries) {
      const full = join(dir, name)
      let s
      try { s = await stat(full) } catch { continue }
      if (s.isDirectory()) {
        await walk(full, `${prefix}${name}/`)
      } else if (/\.(?:js|css|woff2?|png|jpe?g|svg|gif|webp|ico)$/i.test(name)) {
        out.push(`${prefix}${name}`)
      }
    }
  }
  await walk(join(distDir, 'assets'), '/assets/')
  await walk(join(distDir, 'icons'), '/icons/')
  return out.sort()
}

/**
 * Vite plugin entry. Reads dist/index.html, walks dist/assets/ and
 * dist/icons/, builds the precache list, writes
 * dist/precache-manifest.json with a fresh build id.
 *
 * @param {object} opts
 * @param {string} [opts.distDir='dist']  build output directory
 * @param {string} [opts.version]         build id; defaults to Date.now() in dev/CI
 * @returns {Promise<{ manifestPath: string, assetCount: number, version: string }>}
 */
export async function writePrecacheManifest(opts = {}) {
  const distDir = opts.distDir || 'dist'
  const indexPath = join(distDir, 'index.html')
  const manifestPath = join(distDir, 'precache-manifest.json')
  const html = await readFile(indexPath, 'utf8')
  const htmlAssets = buildPrecacheList(html)
  const emitted = await listEmittedAssets(distDir)
  // Union: HTML-referenced first (preserves declaration order), then
  // any emitted asset that wasn't already in the HTML scan.
  const seen = new Set(htmlAssets)
  const assets = [...htmlAssets]
  for (const url of emitted) {
    if (!seen.has(url)) { seen.add(url); assets.push(url) }
  }
  const version = opts.version || String(Date.now())
  const manifest = { version, assets }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  return { manifestPath, assetCount: assets.length, version }
}
