FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci

FROM deps AS development
ENV APP_ENV=development
COPY . .
CMD ["npm", "run", "dev"]

FROM deps AS builder
COPY . .
RUN npm test && npm run typecheck && npm run build

FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production APP_ENV=production NEXT_TELEMETRY_DISABLED=1 PDF_CHROMIUM_PATH=/usr/bin/chromium PORT=3000 HOSTNAME=0.0.0.0 HOME=/home/nextjs
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
RUN groupadd --system --gid 1001 nodejs && useradd --system --create-home --home-dir /home/nextjs --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
# Playwright loads support files dynamically; standalone tracing can omit them.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
# Exercise the shipped modules and Chromium as the actual runtime user.
RUN node --input-type=module -e 'import { chromium } from "playwright"; const browser = await chromium.launch({ executablePath: process.env.PDF_CHROMIUM_PATH, args: ["--no-sandbox", "--disable-dev-shm-usage"] }); try { const page = await browser.newPage(); await page.setContent("<h1>PDF smoke check</h1>"); const pdf = await page.pdf(); if (pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF"); } finally { await browser.close(); }'
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
