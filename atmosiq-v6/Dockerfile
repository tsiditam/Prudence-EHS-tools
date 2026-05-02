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
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY api ./api
COPY server ./server

EXPOSE 8080
CMD ["node", "server/index.js"]
