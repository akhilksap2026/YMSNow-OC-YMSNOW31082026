##############################################################################
# YMSNOW — Multi-stage Dockerfile
#
# Build targets:
#   migrate   Run "drizzle-kit push" as a one-shot init container
#   api       Production Node.js API server  (port 8080)
#   web       Nginx serving the built React frontend  (port 80)
#
# Build from the repo root:
#   docker build --target api -t ymsnow-api .
#   docker build --target web -t ymsnow-web .
#   docker build --target migrate -t ymsnow-migrate .
#
# Or use docker-compose (recommended).
##############################################################################

# ── base: Node 24 + pnpm ─────────────────────────────────────────────────────
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate


# ── deps: install all workspace dependencies (layer-cached) ──────────────────
FROM base AS deps
WORKDIR /workspace

# Copy workspace manifests only — lets Docker cache the install layer
# separately from source code so a code-only change doesn't re-run pnpm install.
COPY replit/pnpm-workspace.yaml \
     replit/pnpm-lock.yaml \
     replit/package.json \
     ./

COPY replit/lib/db/package.json                ./lib/db/package.json
COPY replit/lib/api-spec/package.json          ./lib/api-spec/package.json
COPY replit/lib/api-zod/package.json           ./lib/api-zod/package.json
COPY replit/lib/api-client-react/package.json  ./lib/api-client-react/package.json
COPY replit/artifacts/api-server/package.json       ./artifacts/api-server/package.json
COPY replit/artifacts/yms/package.json              ./artifacts/yms/package.json
COPY replit/artifacts/mockup-sandbox/package.json   ./artifacts/mockup-sandbox/package.json
COPY replit/scripts/package.json                    ./scripts/package.json

RUN pnpm install --frozen-lockfile


# ── builder: compile everything ───────────────────────────────────────────────
FROM deps AS builder
WORKDIR /workspace

# Copy all source (node_modules excluded via .dockerignore)
COPY replit/tsconfig.base.json replit/tsconfig.json ./
COPY replit/lib        ./lib
COPY replit/artifacts/api-server  ./artifacts/api-server
COPY replit/artifacts/yms         ./artifacts/yms
COPY replit/scripts               ./scripts

# 1. Build shared DB types (api-server imports from @workspace/db)
RUN pnpm --filter @workspace/db run build

# 2. Bundle API server → artifacts/api-server/dist/index.cjs
RUN pnpm --filter @workspace/api-server run build

# 3. Build React frontend → artifacts/yms/dist/public
RUN NODE_ENV=production pnpm --filter @workspace/yms run build

# 4. Create a self-contained production deployment bundle for the API server.
#    pnpm deploy copies the package + its resolved production node_modules
#    (including the built dist/ directory) into /deploy.
RUN pnpm --filter @workspace/api-server deploy --prod /deploy


# ── migrate: one-shot drizzle-kit push ───────────────────────────────────────
# Use as an init container in docker-compose (restart: "no").
FROM builder AS migrate
WORKDIR /workspace
ENV NODE_ENV=production
ENTRYPOINT ["pnpm", "--filter", "@workspace/db", "run", "push"]


# ── api: production Node runner ───────────────────────────────────────────────
FROM node:24-alpine AS api
WORKDIR /app

# Copy the pnpm deploy output: built source + production node_modules
COPY --from=builder /deploy ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/healthz || exit 1

CMD ["node", "dist/index.cjs"]


# ── web: nginx serving the built React SPA ───────────────────────────────────
FROM nginx:1.27-alpine AS web

COPY --from=builder /workspace/artifacts/yms/dist/public /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/healthz || exit 1
