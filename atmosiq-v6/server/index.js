/**
 * AtmosFlow container entrypoint.
 *
 * Serves the built SPA (dist/) and mounts the eight Vercel-shape handlers
 * from api/ onto Express. One process, one port — runs anywhere Docker runs:
 * Vercel, GovCloud, AWS App Runner, Azure Container Instances, on-prem.
 *
 * The webhook handler must receive the raw request body for Stripe signature
 * verification, so its route is registered BEFORE express.json() runs.
 */

const path = require('path')
const { pathToFileURL } = require('url')
const { Readable } = require('stream')
const express = require('express')

const app = express()
const PORT = process.env.PORT || 8080

// Some api/*.js files use CJS (`module.exports = fn`); narrative.js uses ESM
// (`export default fn`). Dynamic import handles both — for CJS it returns
// `{ default: module.exports }`, for ESM it returns the namespace.
async function loadHandler(relPath) {
  const absPath = path.resolve(__dirname, relPath)
  const mod = await import(pathToFileURL(absPath).href)
  return mod.default || mod
}

async function start() {
  // Webhook needs raw body BEFORE express.json runs. The Vercel handler
  // expects req to be a readable stream of body bytes; express.raw() has
  // already buffered it, so we synthesize a stream from the buffer.
  const webhookHandler = await loadHandler('../api/webhook.js')
  app.post('/api/webhook', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
    const bodyBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '')
    const fakeReq = Object.assign(Readable.from(bodyBuf), {
      headers: req.headers,
      method: req.method,
      url: req.url,
      query: req.query,
    })
    try {
      await webhookHandler(fakeReq, res)
    } catch (err) {
      console.error('[webhook] handler error:', err)
      if (!res.headersSent) res.status(500).json({ error: 'webhook handler error' })
    }
  })

  app.use(express.json({ limit: '10mb' }))

  const routes = [
    ['/api/admin', '../api/admin.js'],
    ['/api/audit', '../api/audit.js'],
    ['/api/checkout', '../api/checkout.js'],
    ['/api/credits', '../api/credits.js'],
    ['/api/delete-account', '../api/delete-account.js'],
    ['/api/early-access', '../api/early-access.js'],
    ['/api/narrative', '../api/narrative.js'],
    ['/api/reset-credits', '../api/reset-credits.js'],
  ]

  for (const [routePath, modulePath] of routes) {
    const handler = await loadHandler(modulePath)
    app.all(routePath, async (req, res) => {
      try {
        await handler(req, res)
      } catch (err) {
        console.error(`[${routePath}] handler error:`, err)
        if (!res.headersSent) res.status(500).json({ error: 'Internal server error' })
      }
    })
  }

  // Static SPA — sw.js gets no-cache headers (mirrors vercel.json).
  const distDir = path.join(__dirname, '..', 'dist')
  app.use(express.static(distDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      }
    },
  }))

  // SPA fallback for non-/api routes (mirrors vercel.json rewrites).
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })

  app.listen(PORT, () => {
    console.log(`AtmosFlow listening on port ${PORT}`)
  })
}

start().catch(err => {
  console.error('[startup] fatal:', err)
  process.exit(1)
})
