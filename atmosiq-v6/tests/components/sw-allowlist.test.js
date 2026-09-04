/**
 * public/sw.js — caching is allow-by-list, not allow-by-default (audit
 * 2026-09 §6 Service worker).
 *
 * The worker is a classic script, so it is evaluated here against a stub
 * `self` / `caches` and the fetch handler is driven directly. Pins:
 *   • /api/*, /sw.js and any unlisted same-origin GET are never handed
 *     to respondWith (network only)
 *   • /icons/, /fonts/, /manifest.json, /precache-manifest.json,
 *     /assets/ are cacheable
 *   • non-GET and cross-origin requests pass through
 *   • the install handler still primes the cache from the precache manifest
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const SRC = readFileSync(fileURLToPath(new URL('../../public/sw.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://atmosflow.net'

function boot() {
  const listeners = {}
  const store = new Map()
  const cache = {
    async match(req) { return store.get(typeof req === 'string' ? req : req.url) || null },
    async put(req, res) { store.set(typeof req === 'string' ? req : req.url, res) },
    async add(req) { store.set(req.url, { ok: true }) },
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (name, fn) => { listeners[name] = fn },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  }
  const ctx = {
    self,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: async () => ({ ok: true, type: 'basic', clone() { return this }, json: async () => ({ version: 'v1', assets: ['/', '/manifest.json'] }) }),
    Request: class { constructor(url, init) { this.url = url; this.init = init } },
    Response: { error: () => ({ error: true }) },
    URL,
    console,
  }
  vm.createContext(ctx)
  vm.runInContext(SRC, ctx)
  return { listeners, store, self }
}

function fetchDecision(listeners, path, { method = 'GET', mode = 'cors', origin = ORIGIN } = {}) {
  let responded = false
  listeners.fetch({
    request: { method, mode, url: origin + path },
    respondWith: () => { responded = true },
  })
  return responded
}

describe('public/sw.js fetch allow-list', () => {
  let listeners, self
  beforeEach(() => { ({ listeners, self } = boot()) })

  it('registers install, activate and fetch handlers', () => {
    expect(typeof listeners.install).toBe('function')
    expect(typeof listeners.activate).toBe('function')
    expect(typeof listeners.fetch).toBe('function')
  })

  it('never intercepts /api/* or /sw.js', () => {
    expect(fetchDecision(listeners, '/api/credits')).toBe(false)
    expect(fetchDecision(listeners, '/api/narrative')).toBe(false)
    expect(fetchDecision(listeners, '/sw.js')).toBe(false)
    expect(self.__atmosflowSw.isCacheable(new URL(ORIGIN + '/sw.js'))).toBe(false)
  })

  it('lets unlisted same-origin GETs go to the network untouched', () => {
    expect(fetchDecision(listeners, '/some/authenticated/page.html')).toBe(false)
    expect(fetchDecision(listeners, '/download/report-123.docx')).toBe(false)
    expect(fetchDecision(listeners, '/atmosflow-landing.html')).toBe(false)
    expect(fetchDecision(listeners, '/sample-report.pdf')).toBe(false)
  })

  it('caches only the allow-listed static paths', () => {
    for (const p of ['/icons/icon-192.svg', '/fonts/fabrica.woff2', '/manifest.json', '/precache-manifest.json', '/assets/index-abc123.js']) {
      expect(fetchDecision(listeners, p), p).toBe(true)
      expect(self.__atmosflowSw.isCacheable(new URL(ORIGIN + p)), p).toBe(true)
    }
    // Prefix matching is on the directory, not a bare string prefix.
    expect(self.__atmosflowSw.isCacheable(new URL(ORIGIN + '/iconsXYZ'))).toBe(false)
    expect(self.__atmosflowSw.isCacheable(new URL(ORIGIN + '/manifest.json.bak'))).toBe(false)
  })

  it('navigations are handled (network-first with shell fallback)', () => {
    expect(fetchDecision(listeners, '/anything', { mode: 'navigate' })).toBe(true)
  })

  it('passes through non-GET and cross-origin requests', () => {
    expect(fetchDecision(listeners, '/icons/icon-192.svg', { method: 'POST' })).toBe(false)
    expect(fetchDecision(listeners, '/icons/icon-192.svg', { origin: 'https://cdn.example.com' })).toBe(false)
  })

  it('install primes the cache from the precache manifest', async () => {
    const { listeners: l, store } = boot()
    let done
    l.install({ waitUntil: (p) => { done = p } })
    await done
    expect(store.has('/')).toBe(true)
    expect(store.has('/manifest.json')).toBe(true)
  })
})
