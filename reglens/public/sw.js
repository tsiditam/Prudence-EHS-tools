/**
 * RegLens Service Worker — Offline-First PWA
 * Prudence Safety & Environmental Consulting, LLC
 * Copyright (c) 2026 All rights reserved.
 */

const CACHE_NAME = 'reglens-v2-cache';
const STATIC_CACHE = 'reglens-static-v1';

// Core shell — always precached
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// API routes and external URLs that should never be cached
const NEVER_CACHE = [
  '/api/',
  'supabase.co',
  'anthropic.com',
  'api.anthropic.com',
  'stripe.com',
  'calendly.com',
];

function shouldCache(url) {
  return !NEVER_CACHE.some(pattern => url.includes(pattern));
}

// ─── Install: precache shell ───
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: clean old caches ───
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: stale-while-revalidate for assets, network-first for navigation ───
self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Skip non-GET and requests we should never cache
  if (request.method !== 'GET' || !shouldCache(request.url)) return;

  // Navigation requests (HTML pages) — network-first with offline fallback
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/').then((cached) => cached || new Response(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RegLens — Offline</title><style>*{margin:0;box-sizing:border-box}body{background:#050507;color:#fff;font-family:Inter,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}.c{max-width:400px}.icon{font-size:48px;margin-bottom:16px}.t{font-size:24px;font-weight:700;margin-bottom:8px}.s{font-size:14px;color:#8E8E93;line-height:1.6;margin-bottom:24px}.b{padding:14px 28px;border-radius:12px;border:none;background:#16a34a;color:#fff;font-size:16px;font-weight:700;cursor:pointer}</style></head><body><div class="c"><div class="icon">📡</div><div class="t">You\'re offline</div><div class="s">RegLens needs a connection for compliance reviews and syncing, but your saved readiness checks, reports, and meeting logs are still available.</div><button class="b" onclick="location.reload()">Try Again</button></div></body></html>',
          { headers: { 'Content-Type': 'text/html' } }
        )))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts) — stale-while-revalidate
  if (
    request.url.includes('/assets/') ||
    request.url.includes('.js') ||
    request.url.includes('.css') ||
    request.url.includes('.woff') ||
    request.url.includes('.png') ||
    request.url.includes('.svg')
  ) {
    e.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Google Fonts — cache-first (they never change for a given URL)
  if (request.url.includes('fonts.googleapis.com') || request.url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          const clone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return res;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // Everything else — network-first with cache fallback
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ─── Background Sync (for queued Supabase writes) ───
self.addEventListener('sync', (e) => {
  if (e.tag === 'reglens-sync') {
    e.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  // Notify all clients to flush their sync queue
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({ type: 'SYNC_REQUESTED' });
  });
}

// ─── Push notification support (future) ───
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
