/**
 * AtmosFlow Service Worker — app-shell precache + smart fetch strategy.
 *
 * Replaces the prior network-first cache-aside that had three bugs:
 *   1. /api/* responses were silently cached (stale credits, stale
 *      narrative, stale auth tokens).
 *   2. Every navigation paid a network round-trip even when the
 *      cached shell was good — felt slow on flaky cell.
 *   3. After a deploy, the cache only repopulated lazily via the
 *      cache-aside path. The first cold-offline open after a deploy
 *      was effectively broken — references to new chunks that the
 *      user had not yet fetched.
 *
 * Strategy now:
 *   - install: fetch /precache-manifest.json (emitted at build time
 *     by scripts/build-precache-manifest.mjs) and prime the cache
 *     with every entry. Fall back to a small static set if the
 *     manifest is missing.
 *   - activate: delete every cache whose key doesn't match the new
 *     version, then claim all clients so the new SW takes over. The
 *     page listens for `controllerchange` (src/main.jsx) and offers a
 *     reload, so a tab is never silently left running old JS against
 *     the new cache.
 *   - fetch:
 *       /api/* + non-GET + cross-origin → pass through to network
 *       navigation (mode === 'navigate') → network-first, fall back
 *         to cached app shell (so cold-offline still serves the UI)
 *       /assets/* (content-hashed) → cache-first, repopulate on success
 *       the static allow-list below (/icons/, /manifest.json, /fonts/,
 *         /precache-manifest.json) → stale-while-revalidate
 *       everything else → network only, never cached.
 *
 *     The last rule is the audit fix (2026-09 §6 Service worker): the
 *     previous default cached ANY other same-origin GET, so a future
 *     authenticated non-/api route, a signed download, or a per-user
 *     HTML fragment would have been served from cache on a shared
 *     device. Caching is now allow-by-list, not allow-by-default.
 *     /sw.js itself is served no-store (vercel.json) and is never in
 *     the allow-list, so the browser's own update check is not
 *     answered from cache.
 *
 * Per CLAUDE.md "no functional regressions" — the version bump means
 * old caches get cleaned on activate.
 */

const STATIC_PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

// Same-origin GET paths (besides /assets/ and navigations) the worker is
// allowed to cache. Exact files and directory prefixes only; anything
// not listed goes straight to the network.
const CACHEABLE_PREFIXES = ['/icons/', '/fonts/', '/assets/']
const CACHEABLE_FILES = ['/manifest.json', '/precache-manifest.json']

// CACHE_VERSION bumps on every deploy via the activate fallback —
// build pipelines that want explicit versioning can substitute
// __ATMOSFLOW_SW_VERSION__ at deploy time. Today the install handler
// reads the version from the runtime precache manifest, so this
// constant is only used as a deterministic fallback when the
// manifest fetch fails.
const FALLBACK_VERSION = 'fallback-v8'
const CACHE_PREFIX = 'atmosflow-cache-'
let currentCacheName = `${CACHE_PREFIX}${FALLBACK_VERSION}`

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      let version = FALLBACK_VERSION
      let assets = STATIC_PRECACHE
      try {
        const res = await fetch('/precache-manifest.json', { cache: 'no-store' })
        if (res && res.ok) {
          const manifest = await res.json()
          if (manifest && typeof manifest.version === 'string') version = `m-${manifest.version}`
          if (manifest && Array.isArray(manifest.assets) && manifest.assets.length > 0) {
            assets = manifest.assets
          }
        }
      } catch {
        // Manifest fetch failed (e.g. offline install, mid-deploy
        // window). Fall through to the static precache set.
      }
      currentCacheName = `${CACHE_PREFIX}${version}`
      const cache = await caches.open(currentCacheName)
      // cache.addAll is atomic — if any single asset fails the whole
      // install fails. For resilience against a stale manifest entry,
      // we add items one-by-one and let individual failures slide.
      await Promise.all(assets.map(async (url) => {
        try { await cache.add(new Request(url, { cache: 'reload' })) }
        catch { /* skip — best-effort precache */ }
      }))
    })()
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== currentCacheName)
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
}

function isImmutableAsset(url) {
  // Vite emits content-hashed filenames into /assets/. Those are
  // safe to cache-first indefinitely; the hash changes when the
  // content changes.
  return url.pathname.startsWith('/assets/')
}

/**
 * Allow-list decision for a same-origin GET. Exported for the unit test
 * (tests/components/sw-allowlist.test.js evaluates this file with a stub
 * `self`) — this is the one function that decides what may be cached.
 */
function isCacheable(url) {
  if (isApiRequest(url)) return false
  if (url.pathname === '/sw.js') return false
  if (CACHEABLE_FILES.includes(url.pathname)) return true
  return CACHEABLE_PREFIXES.some((p) => url.pathname.startsWith(p))
}

async function cacheFirst(request) {
  const cache = await caches.open(currentCacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok && response.type === 'basic') {
    cache.put(request, response.clone()).catch(() => {})
  }
  return response
}

async function networkFirstWithShellFallback(request) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(currentCacheName)
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  } catch {
    const cache = await caches.open(currentCacheName)
    const cached = await cache.match(request)
    if (cached) return cached
    // Last-resort: serve the root shell so the SPA boots and shows
    // the user its own offline UX (the connection toast, the
    // PendingSyncIndicator) instead of a browser error.
    const shell = await cache.match('/')
    if (shell) return shell
    throw new Error('offline_no_cache')
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(currentCacheName)
  const cached = await cache.match(request)
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {})
    }
    return response
  }).catch(() => null)
  return cached || (await networkPromise) || Response.error()
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return
  // API routes always go to the network — no caching, no offline
  // illusion. Credits, narrative, auth tokens must be live.
  if (isApiRequest(url)) return

  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirstWithShellFallback(e.request))
    return
  }
  if (isImmutableAsset(url)) {
    e.respondWith(cacheFirst(e.request))
    return
  }
  if (isCacheable(url)) {
    e.respondWith(staleWhileRevalidate(e.request))
    return
  }
  // Not on the allow-list: network only. Returning without respondWith
  // lets the browser handle the request as if no worker were installed.
})

// Test seam — a plain browser ignores this; the unit test reads it off
// the stub `self` it evaluates the file with.
if (typeof self !== 'undefined') self.__atmosflowSw = { isCacheable, isApiRequest, isImmutableAsset, CACHEABLE_PREFIXES, CACHEABLE_FILES }
