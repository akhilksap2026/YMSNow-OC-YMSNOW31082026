---
name: YMS Module Subscription System
description: Architecture of the platform-admin-managed module access control system — DB table, API routes, sidebar padlock UX, login entry point.
---

## What it does
Platform admin (super_admin) can toggle which modules each facility tenant can access.
Disabled modules show a padlock in the sidebar with a "contact your platform admin" message.
super_admin is never locked out — the API returns all modules for them.

## DB table
`facility_module_subscriptions` — columns: id, facility_id, module_key, is_enabled, updated_by, updated_at
Unique constraint: (facility_id, module_key) — named `facility_module_unique`
Source: `replit/lib/db/src/schema/index.ts` (exported as `facilityModuleSubscriptions`)
Build: `cd replit/lib/db && pnpm exec tsc --build` — must run after schema changes so api-server tsc sees new types

## Module keys (6 total)
- `core_operations` — Appointments, Gate, Yard Inventory, Yard Map, Yard Moves (always-on in UI)
- `dock_management` — Dock Management
- `compliance` — Holds & Exceptions, Inspections, Yard Audit
- `analytics` — Reports & Analytics, Revenue
- `notifications` — Notifications
- `ai_suite` — Email Intelligence, Lifecycle Video, AI Configuration

Dashboard is always visible (no moduleKey on the nav item).
Admin tools (Carrier Management, Yard Setup, Users, Audit Log, Manage Facilities) are role-gated only, not module-gated.

## API endpoints (all in register-yms-routes.ts, end of file)
- `GET /api/subscriptions` — returns `{ enabledModules: string[] }` for current facility; super_admin gets all
- `GET /api/platform/facilities` — returns facilities with subscription matrix; super_admin only
- `PUT /api/platform/facilities/:facilityId/modules` — body `{ moduleKey, isEnabled }`; super_admin only

## Seeding
`seedModuleSubscriptions()` in seed.ts — called from api-server/src/index.ts startup chain
Idempotent: skips if any rows exist. Seeds all 6 modules as enabled for all facilities.
`resetAndReseed()` also deletes facility_module_subscriptions before facilities (FK constraint).

## Frontend
- **Platform Admin page**: `replit/artifacts/yms/src/pages/platform-admin.tsx` — `/platform-admin` route, super_admin only
- **Sidebar padlock**: `app-sidebar.tsx` — `useSidebarSubscriptions(userRole)` hook, `LockedNavItem` component; module keys on NavItem interface; clicking locked item toggles inline amber info box
- **Login entry**: Platform Admin button in login.tsx calls `onLogin("demo-superadmin-001", "super_admin", null, "/platform-admin")` — stores redirect in sessionStorage; AppGate useEffect reads it on mount and navigates
- **Module Subscriptions** nav item in Administration section (super_admin only) → `/platform-admin`

## Key gotchas
- `noImplicitReturns: true` in tsconfig — can't use `return res.json(...)` in Express handlers; use `res.json(...); return;` pattern
- DB package uses composite mode — must `tsc --build` the db package when schema changes before api-server tsc will compile correctly
- tsx runtime (api-server dev) doesn't need a separate build — just restart the workflow
