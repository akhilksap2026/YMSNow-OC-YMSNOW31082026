---
name: api-server dev server has no hot reload
description: The api-server dev workflow runs tsx without --watch, so backend code edits are silently stale until restarted.
---

`replit/artifacts/api-server`'s `dev` script is `NODE_ENV=development tsx ./src/index.ts` — no
`--watch` flag. Editing route/storage files does not restart the process automatically the way the
Vite frontend hot-reloads.

**Why:** wasted a debugging cycle chasing why a scoping fix "didn't work" via curl — the old
in-memory route code was still running, the new backend logic was correct.

**How to apply:** after any edit under `replit/artifacts/api-server/src`, run
`WorkflowsRestart` on `replit/artifacts/api-server: API Server` before testing via curl or
screenshots, not just the frontend `yms: web` workflow.
