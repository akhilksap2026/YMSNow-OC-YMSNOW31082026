---
name: YMS header-based demo auth
description: How role and carrier identity flow through the YMSNOW demo app — no real sessions, headers are trusted as-is.
---

The YMSNOW yard management demo has no session/token auth layer. Identity flows entirely through
request headers that the frontend attaches on every API call (`buildHeaders()` in `queryClient.ts`):

- `x-user-role` — the active persona's role. Backend route handlers and `rbac.ts` middleware read
  this directly with no verification.
- `x-carrier-id` — added for carrier-scoped endpoints (dashboard stats, appointments). Only trusted
  when `x-user-role === "carrier"`.

**Why:** the app has one demo user server-side; "switching persona" in the UI patches that single
user's role via `PATCH /api/admin/users/:id/role` and stores role/carrierId in `localStorage` for
the header builder. There's no per-persona session — everything is global mutable state keyed off
headers.

**How to apply:**
- Any new endpoint that must differ by role or by carrier should read these headers directly,
  matching the existing trust model — don't invent a separate auth mechanism for one endpoint.
- When testing a specific role/persona via a fresh screenshot or curl, you must either (a) drive the
  actual persona-switch UI flow, or (b) directly `PATCH /api/admin/users/demo-user/role` to update
  server state, *and* pass matching `x-user-role`/`x-carrier-id` headers on any direct curl calls.
  Just setting `localStorage` via a URL param does not update the server-side role.
- `DashboardPage` derives its rendered role from `/api/user/profile` (the single demo user's stored
  role), not from any `userRole` prop passed down from `App.tsx` — that prop is otherwise unused
  there by design, since the profile fetch is the source of truth after a persona switch.
