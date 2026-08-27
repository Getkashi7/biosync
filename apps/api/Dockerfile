# Pulse/BIOSYNC API container.
#
# Built from the REPO ROOT, not apps/api:
#   docker build -f apps/api/Dockerfile -t biosync-api .
# The API imports @pulse/shared as raw TypeScript source (no build step, see
# CLAUDE.md), so the workspace has to come along and the process runs through
# tsx — the same way it runs in dev, which is the point: no production-only
# transpile path that can drift from what was tested.

FROM node:20-slim AS base
# openssl: required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ---- dependencies -----------------------------------------------------------
# Manifests first so a code-only change doesn't re-resolve the whole tree.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
# The api postinstall runs `prisma generate`, which needs the schema present.
COPY apps/api/prisma apps/api/prisma
# Dev deps are kept: the prisma CLI runs migrations at release time.
RUN pnpm install --frozen-lockfile --filter @pulse/api...

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY privacy.html privacy.html

# Drop root — nothing here needs it.
USER node

EXPOSE 4000
WORKDIR /app/apps/api
CMD ["pnpm", "start"]
