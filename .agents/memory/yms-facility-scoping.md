---
name: YMS multi-facility scoping via trusted header
description: How facility isolation was added to YMSNOW on top of the header-trust auth model — x-facility-id mirrors x-carrier-id, no server-side identity resolution.
---

YMSNOW added multi-facility support on top of the existing fully header-trusted auth model (see
`yms-header-auth.md`). Since there is no per-request server-side user identity — only a client-sent
`x-user-role` (and `x-carrier-id` for carriers) — true server-side resolution of "this user's
facility" from `userProfiles.facilityId` is not mechanically enforceable without a bigger identity
layer.

**Decision:** `x-facility-id` was implemented exactly like `x-carrier-id` — a client-trusted header,
not a server-verified one.

- `resolveFacilityScope(req)` (in `replit/artifacts/api-server/src/lib/facility.ts`) is the single
  place this is resolved: `super_admin` may pass any facility id, or omit it entirely to mean
  "all facilities" (aggregate view). Every other role's header is honored if present; if absent it
  falls back to `DEFAULT_FACILITY_ID` (1) rather than erroring, so single-facility deployments and
  any caller that forgets the header keep working unchanged.
- `super_admin` is a new role, additive to the existing role hierarchy (level 200, above `admin`).
  It has the same static permission matrix as `admin` plus exclusive create/modify rights on a new
  `facility_mgmt` permission module; `admin` itself is facility-scoped like every other role, not
  global.

**Why:** matches the project's existing security posture (header-trust, no sessions) rather than
introducing a stronger auth model for just this feature — consistency with `yms-header-auth.md`
was prioritized over defense-in-depth, since the whole app already trusts client-supplied identity.

**How to apply:**
- Any new endpoint that must be facility-scoped should call `resolveFacilityScope(req)` and filter
  by the returned `facilityId` (treating `null`/`undefined` as "no filter", i.e. super_admin
  aggregate view) — don't invent a separate mechanism.
- Tables directly owned by a facility (`carriers`, `yardZones`, `yardSlots`, `dockDoors`, `gates`,
  `appointments`, `visits`, `userProfiles`) carry their own `facilityId` column. Tables that hang off
  a `visitId` (moves, exceptions, inspections, seal/location history) do *not* get their own
  `facilityId` — resolve their facility by joining through the parent visit.
- Known limitation: several by-id detail routes and a handful of secondary/reporting endpoints do
  not yet check facility ownership of the fetched record — a caller who knows/guesses another
  facility's numeric id can still read it directly.
