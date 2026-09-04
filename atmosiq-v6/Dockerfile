# syntax=docker/dockerfile:1.7

# ─── Build stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Vite bakes VITE_* env vars into the SPA bundle at build time. Pass them
# via --build-arg or a build secrets file. Runtime env does NOT affect the
# built client bundle — only the server-side handlers can read process.env
# at request time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN
ARG VITE_BILLING_MODE
ARG GIT_COMMIT_SHA
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_BILLING_MODE=$VITE_BILLING_MODE
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA
ENV VITE_GIT_COMMIT_SHA=$GIT_COMMIT_SHA

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Every api/** handler (TypeScript included) + lib/sentry.ts → plain-Node
# ESM under server/handlers/. This is what makes the container bootable
# without tsx: nothing under api/ or lib/ is loaded from source at runtime.
RUN node scripts/bundle-api.mjs

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ARG GIT_COMMIT_SHA
ENV GIT_COMMIT_SHA=$GIT_COMMIT_SHA

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/scripts/check-env.mjs ./scripts/check-env.mjs

EXPOSE 8080

# /healthz returns { ok: true, sha } once every handler has been mounted.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
