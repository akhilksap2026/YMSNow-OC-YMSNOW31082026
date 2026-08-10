---
name: DB package rebuild requirement
description: When the @workspace/db schema changes, the dist/ directory must be regenerated or api-server typecheck fails with "has no exported member" errors.
---

When you add new tables or columns to `replit/lib/db/src/schema/index.ts`, the TypeScript project reference system resolves types from `replit/lib/db/dist/` (pre-compiled `.d.ts` files), not the source `.ts` files directly.

**Rule:** After any schema change, run `cd replit/lib/db && npx tsc -p tsconfig.json` to regenerate `dist/` before running api-server typecheck or you will see errors like:
- `Module '"@workspace/db"' has no exported member 'newTable'`
- `Property 'newColumn' does not exist on type 'PgTableWithColumns<...>'`

**Why:** The `api-server` tsconfig references `../../lib/db` as a project reference. TypeScript uses the compiled output in `outDir: "dist"` — specifically `dist/schema/index.d.ts` — rather than walking source files at check time.

**How to apply:** Any time you touch `replit/lib/db/src/schema/index.ts` or any schema file, immediately rebuild with `cd replit/lib/db && npx tsc -p tsconfig.json` before running downstream typechecks.
