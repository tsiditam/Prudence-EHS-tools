/**
 * AtmosFlow container entrypoint.
 *
 * Serves the built SPA (dist/) and mounts EVERY api/** handler — bundled
 * to plain-Node ESM under server/handlers/ by `scripts/bundle-api.mjs`
 * at image build time — onto one Express process on one port. Runs
 * anywhere Docker runs: GovCloud, AWS App Runner, Azure Container
 * Instances, on-prem.
 *
 * Route table is the file tree, not a hand-kept list:
 *   server/handlers/credits.mjs                 → /api/credits
 *   server/handlers/profile/mark-onboarded.mjs  → /api/profile/mark-onboarded
 *   server/handlers/_sentry.mjs                 → (not a route; Sentry init)
 *
 * Body parsing is per route. A handler that exports Vercel's
 * `config.api.bodyParser = false` (the Stripe webhook) receives the raw
 * request bytes as a readable stream so signature verification works;
 * everything else gets express.json(). All HTTP methods are forwarded —
 * each handler enforces its own method / auth / CRON_SECRET gate exactly
 * as it does on Vercel.
 */

const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
const { Readable } = require('stream')
const express = require('express')

const HANDLERS_DIR = path.join(__dirname, 'handlers')
const DIST_DIR = path.join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT) || 8080
const BUILD_SHA = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  'unknown'
).slice(0, 40)

const importFile = (absPath) => import(pathToFileURL(absPath).href)

/**
 * Walk server/handlers/ recursively. Route = path minus extension;
 * `_`-prefixed files (helpers, _sentry.mjs) are skipped.
 */
function discoverHandlers(dir = HANDLERS_DIR, rel = '') {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.name.startsWith('_')) continue
    const relPath = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) { out.push(...discoverHandlers(path.join(dir, d.name), relPath)); continue }
    if (!d.name.endsWith('.mjs')) continue
    out.push({ route: `/api/${relPath.replace(/\.mjs$/, '')}`, file: path.join(dir, d.name) })
  }
  return out.sort((a, b) => a.route.localeCompare(b.route))
}

async function initSentry() {
  const sentryFile = path.join(HANDLERS_DIR, '_sentry.mjs')
  if (!fs.existsSync(sentryFile)) {
    console.warn('[sentry] server/handlers/_sentry.mjs missing — run `npm run bundle:api`; Sentry disabled')
    return
  }
  try {
    const mod = await importFile(sentryFile)
    if (typeof mod.initSentryServer === 'function') mod.initSentryServer()
    console.log(process.env.SENTRY_DSN ? '[sentry] initialised' : '[sentry] SENTRY_DSN unset — no-op')
  } catch (err) {
    console.warn('[sentry] init failed:', err && err.message)
  }
}

async function reportEnv() {
  // scripts/check-env.mjs is copied into the image; missing vars are logged,
  // not fatal — each handler 500s with its own "not configured" message.
  const checkEnvFile = path.join(__dirname, '..', 'scripts', 'check-env.mjs')
  if (!fs.existsSync(checkEnvFile)) return
  try {
    const { checkEnv, formatReport } = await importFile(checkEnvFile)
    console.log(formatReport(checkEnv(process.env)))
  } catch (err) {
    console.warn('[check-env] skipped:', err && err.message)
  }
}

/** Wrap a Vercel-shape handler so a thrown error becomes a 500, not a crash. */
function wrap(route, handler) {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error(`[${route}] handler error:`, err)
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
    }
  }
}

/** Raw-body variant: hand the handler a stream of the buffered bytes. */
function wrapRaw(route, handler) {
  const inner = wrap(route, handler)
  return async (req, res) => {
    // express.raw() leaves req.body as {} when there is no body (GET, or a
    // POST with no content-type match); only a Buffer or string is bytes.
    const bodyBuf = Buffer.isBuffer(req.body) ? req.body
      : typeof req.body === 'string' ? Buffer.from(req.body)
      : Buffer.alloc(0)
    const fakeReq = Object.assign(Readable.from(bodyBuf), {
      headers: req.headers,
      method: req.method,
      url: req.url,
      query: req.query,
    })
    return inner(fakeReq, res)
  }
}

async function mountHandlers(app) {
  const handlers = discoverHandlers()
  if (handlers.length === 0) {
    console.warn('[startup] no handlers under server/handlers/ — run `npm run bundle:api` before `npm start`')
  }
  const jsonBody = express.json({ limit: '10mb' })
  const rawBody = express.raw({ type: '*/*', limit: '5mb' })
  for (const { route, file } of handlers) {
    const mod = await importFile(file)
    const handler = typeof mod.default === 'function' ? mod.default : mod
    if (typeof handler !== 'function') {
      throw new Error(`${path.relative(__dirname, file)} does not export a handler function`)
    }
    const wantsRaw = handler.config && handler.config.api && handler.config.api.bodyParser === false
    if (wantsRaw) app.all(route, rawBody, wrapRaw(route, handler))
    else app.all(route, jsonBody, wrap(route, handler))
  }
  return handlers.map(h => h.route)
}

async function createApp() {
  const app = express()
  // Behind App Runner / ACI / an ingress the client IP and scheme arrive in
  // X-Forwarded-*; trust exactly one hop.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, sha: BUILD_SHA })
  })

  const routes = await mountHandlers(app)

  // Anything else under /api is a 404 JSON, never the SPA shell.
  app.all(/^\/api(\/.*)?$/, (_req, res) => res.status(404).json({ error: 'Not found' }))

  // Static SPA — sw.js gets no-cache headers (mirrors vercel.json).
  app.use(express.static(DIST_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      }
    },
  }))

  // SPA fallback for non-/api routes (mirrors vercel.json rewrites).
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })

  return { app, routes }
}

async function start() {
  await initSentry()
  await reportEnv()
  const { app, routes } = await createApp()
  app.listen(PORT, () => {
    console.log(`AtmosFlow listening on port ${PORT} · build ${BUILD_SHA} · ${routes.length} api routes`)
    for (const r of routes) console.log(`  ${r}`)
  })
}

module.exports = { createApp, discoverHandlers, HANDLERS_DIR }

if (require.main === module) {
  start().catch(err => {
    console.error('[startup] fatal:', err)
    process.exit(1)
  })
}
