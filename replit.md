# YMSNOW — Yard Management System

## Overview

Production-grade Yard Management System (YMS) built as a pnpm monorepo with TypeScript. Features 15+ operational pages with real-time data, AI-powered email intelligence, and an interactive yard map.

## Stack

- **Monorepo tool**: pnpm workspaces (workspace root: `replit/`)
- **Node.js version**: 24
- **Package manager**: pnpm
- **Frontend**: React + Vite + shadcn/ui + Wouter + TanStack Query
- **Backend**: Express 5 + Drizzle ORM + PostgreSQL
- **AI**: OpenAI (optional — via Replit AI Integrations `AI_INTEGRATIONS_OPENAI_API_KEY`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Build**: esbuild (API server), Vite (frontend)

## Running the App

Two workflows are configured and both must be running:

| Workflow | Command | Port |
|---|---|---|
| `replit/artifacts/yms: web` | `pnpm --filter @workspace/yms run dev` | 25753 → external :80 (webview) |
| `replit/artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |

> **PORT injection**: The Replit platform automatically sets `PORT` for each workflow based on the port mappings in the root `.replit` file (`localPort = 25753` for frontend, `localPort = 8080` for API). No explicit `PORT=` prefix is needed in the workflow command.

The frontend proxies all `/api/*` requests → `localhost:8080` (configured in `replit/artifacts/yms/vite.config.ts`).

## First-Time Setup

```bash
# Install all workspace dependencies
cd replit && pnpm install

# Push DB schema to Replit PostgreSQL
cd replit && pnpm --filter @workspace/db run push
```

The API server auto-seeds the database with hyper-realistic demo data on first start.

## Project Structure

```text
replit/
├── artifacts/
│   ├── api-server/         # Express API server (port 8080)
│   │   └── src/lib/
│   │       ├── register-yms-routes.ts  # All 70+ API routes
│   │       ├── storage.ts              # DB access layer
│   │       └── seed.ts                 # Demo data seeder (Columbus Hub + DFW + ORD)
│   └── yms/                # React frontend (port 25753)
│       └── src/
│           ├── pages/      # 15+ page components
│           └── components/ # UI components + AI panels
├── lib/
│   ├── db/                 # Drizzle ORM schema + DB connection (@workspace/db)
│   ├── api-spec/           # OpenAPI spec
│   ├── api-client-react/   # Generated React Query hooks
│   └── api-zod/            # Generated Zod schemas
└── scripts/
    └── post-merge.sh       # Runs on merge: pnpm install + db push
```

## Authentication (Demo)

Header-based, no real sessions. All accounts share credential `12345`.
- Select an operator profile on the login screen and enter `12345`
- Role and facility context flow via `x-user-role` / `x-carrier-id` / `x-facility-id` headers

## Seed Data (Columbus Hub CMH)

Seeded automatically on API server startup when DB is empty:
- 12 carriers (6 Nexus business units + 6 national partners)
- 5 zones, 49 slots, 10 dock doors, 3 gates
- 52 appointments, 43 visits, 25 move tasks, 15 exceptions, 8 inspections
- 18 user profiles across all roles
- Multi-facility: Dallas–Fort Worth Gateway (DFW) + Chicago O'Hare Crossdock (ORD)

To reset: `POST /api/admin/reset-to-seed` or use the Reset button on `/admin/ai-config`.

## Development Commands

```bash
cd replit

# Install dependencies
pnpm install

# Push schema after changes
pnpm --filter @workspace/db run push

# Typecheck all packages
pnpm run typecheck

# Run tests
pnpm --filter @workspace/api-server run test
```

## AI Features

Connect via Replit AI Integrations → OpenAI connector. This sets `AI_INTEGRATIONS_OPENAI_API_KEY` automatically. The app degrades gracefully with no key configured (AI pages load but show "not configured" state).

## Deployment

- **Target**: autoscale
- **Build**: `cd replit && pnpm --filter @workspace/yms run build && pnpm --filter @workspace/api-server run build`
- **Run**: `cd replit && PORT=25753 node artifacts/api-server/dist/index.cjs`

## User Preferences

- Keep existing monorepo structure under `replit/`
- All commands run from `cd replit && ...`
