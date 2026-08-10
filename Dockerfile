FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
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
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
