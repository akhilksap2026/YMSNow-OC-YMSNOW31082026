# YMSNOW Design Migration Plan

> Maps existing routes/components to the target design system and orders the work by dependency.  
> Source: `docs/design-audit.md` (current state) → `docs/design-system.md` (target tokens/components).  
> **No application code has been changed as part of producing this plan.**

---

## Guiding Principles

1. **Tokens before components before pages.** Changing `index.css` tokens cascades automatically through every shadcn primitive and every page that uses semantic classes (`bg-card`, `text-muted-foreground`, etc.) — this is the highest-leverage, lowest-risk first step.
2. **Do not touch `status-colors.ts` semantics.** Only the underlying Tailwind color families' contrast against the new background may need spot-checks.
3. **Do not replace libraries.** Tailwind v4, shadcn/ui, Wouter, TanStack Query, Framer Motion all stay. This is a token/styling migration, not a framework migration.
4. **Verify contrast at every stage.** The navy sidebar and pale-blue-gray workspace both change text/background contrast ratios — re-check WCAG AA after each phase.

---

## Phase 0 — Baseline Capture (no code changes)

- [x] `docs/design-audit.md` — current state documented
- [x] `docs/design-system.md` — target tokens documented
- [ ] Screenshot baseline: capture current-state screenshots of Dashboard, Yard Inventory, Dock Management, Move Tasks, Admin Carriers for before/after comparison

**Dependency:** none. **Risk:** none (documentation only).

---

## Phase 1 — Global Tokens (`src/index.css`)

**Scope:** Update `:root` and `.dark` CSS custom properties only. No component files touched.

| Step | Change | Depends on |
|---|---|---|
| 1.1 | Update `--background`, `--foreground`, `--border`, `--input` to pale blue-gray values | — |
| 1.2 | Update `--card`, `--card-foreground`, `--card-border` to white/visible-border values | 1.1 |
| 1.3 | Update `--sidebar*` token group to navy palette (fill, foreground, border, primary, accent) | — (independent of 1.1/1.2) |
| 1.4 | Update `--muted`, `--secondary`, `--accent` to blue-tinted neutrals | 1.1 |
| 1.5 | Replace shadow tokens (`--shadow-*`) with real elevation values | — |
| 1.6 | Tighten `--radius` from `0.5rem` to `0.375rem` | — |
| 1.7 | Repeat 1.1–1.6 for `.dark` block (deep navy sidebar, cool dark background) | 1.1–1.6 |

**Why first:** Every page and every shadcn component consumes these tokens via Tailwind's `@theme inline` mapping. This phase alone will visually transform ~90% of the surface area with zero component edits.

**Verification:** Load Dashboard, Yard Inventory, and Admin Carriers pages; visually confirm sidebar is navy, cards are white with visible borders, background is pale blue-gray. Run contrast check on sidebar nav text against new navy fill.

**Risk:** Medium. A single wrong HSL value can make sidebar text unreadable. Mitigate by testing both active and inactive nav item states, plus the three opacity tiers (normal/secondary/subtle) that already exist in `app-sidebar.tsx`.

---

## Phase 2 — Sidebar Component Adjustments

**Scope:** `src/components/app-sidebar.tsx` only.

| Step | Change | Depends on |
|---|---|---|
| 2.1 | Update active-item classes: `bg-primary/10 text-primary` → `bg-white/10 text-white` variants | Phase 1.3 |
| 2.2 | Update left active-bar color: `bg-primary` → `bg-white/80` | Phase 1.3 |
| 2.3 | Verify `LockedNavItem` (module-subscription lock state) amber tooltip still reads correctly against navy | Phase 1.3 |
| 2.4 | Verify role-color badges (`roleColor()` in persona dropdown, if rendered inside sidebar) retain contrast | Phase 1.3 |

**Dependency:** Phase 1 must land first — sidebar component classes reference tokens, not hardcoded colors, so most of this "just works" once tokens change. This phase only touches the few places using `text-primary` / `bg-primary` directly instead of `text-sidebar-*` tokens.

**Risk:** Low. Isolated to one file with clear before/after states (active/hover/secondary/subtle).

---

## Phase 3 — Header Bar

**Scope:** `src/App.tsx` (`AuthenticatedApp` header markup only — no logic changes).

| Step | Change | Depends on |
|---|---|---|
| 3.1 | Add `h-12 border-b border-border` to header container | Phase 1.1 |
| 3.2 | Group header actions into left zone (trigger/breadcrumbs) and right zone (utilities) with `flex-1` spacer | — |
| 3.3 | Confirm existing `hidden sm:*` responsive rules still make sense at the new height | 3.1 |

**Dependency:** Phase 1 (background/border tokens).

**Risk:** Low. Purely layout classes; no state or data logic touched.

---

## Phase 4 — Typography Pass

**Scope:** Global CSS base layer + `PageHeader`, `SectionHeader`, `KPICard` components.

| Step | Change | Depends on |
|---|---|---|
| 4.1 | `PageHeader` title: `text-lg sm:text-xl` → `text-base sm:text-lg` | Phase 1 |
| 4.2 | `KPICard` label/value sizing per design-system.md §4.3 | Phase 1 |
| 4.3 | Add table typography rules to `index.css` `@layer base` (§4.5 in design-system.md) | Phase 1 |
| 4.4 | Spot-check all 27 pages for any page-local heading overrides that bypass `PageHeader` (search for raw `<h1`/`<h2` outside shared components) | 4.1 |

**Dependency:** Phase 1 (colors must be stable before re-tuning type scale against them).

**Risk:** Medium — 4.4 requires a page-by-page sweep since some pages may have hardcoded heading sizes instead of using `PageHeader`. This is the step most likely to reveal duplicated/inline UI (see design-audit.md §4).

---

## Phase 5 — Table Density Pass

**Scope:** Global `<table>` base styles (`index.css`) + any pages with custom table markup that doesn't use the shared style.

**High-traffic tables to verify individually** (ordered by usage frequency):
1. `yard-inventory.tsx` — highest-traffic table, dense trailer list
2. `move-tasks.tsx` — table view (Kanban view unaffected)
3. `dock-management.tsx` — schedule view table
4. `admin-carriers.tsx`
5. `appointments.tsx` — table view (calendar view unaffected)
6. `admin-audit.tsx`
7. `admin-users.tsx`
8. `inspections.tsx`

| Step | Change | Depends on |
|---|---|---|
| 5.1 | Add base `table`/`thead`/`tbody` rules to `index.css` | Phase 1, 4 |
| 5.2 | Verify each table above renders with new row height (~36px) without breaking action-button click targets | 5.1 |
| 5.3 | Check `yard-map.tsx` left-panel `QueueItem` list (not a `<table>` but table-adjacent) for consistent density | 5.1 |

**Dependency:** Phase 1 (tokens) and Phase 4 (typography scale).

**Risk:** Medium. Denser rows can crowd inline action buttons (e.g. "Assign Jockey" buttons in Move Tasks) — each table needs a manual pass, not just a CSS rule change.

---

## Phase 6 — Card & Component Polish

**Scope:** `enterprise/kpi-card.tsx`, `enterprise/page-header.tsx`, `ui/card.tsx` padding/shadow application.

| Step | Change | Depends on |
|---|---|---|
| 6.1 | Apply `shadow-sm` to default `Card` component | Phase 1.5 |
| 6.2 | Reduce `KPICard` internal padding | Phase 4.2 |
| 6.3 | Reduce `PageHeader` icon container size | Phase 4.1 |
| 6.4 | Add `dot`/`xs` size variant to `StatusChip` for inline table use | Phase 5 |

**Dependency:** Phases 1, 4, 5.

**Risk:** Low.

---

## Phase 7 — Page-by-Page Verification Sweep

Every page must be manually checked after Phases 1–6 land, since none of the phases touch page files directly (by design — the goal is token/shared-component leverage, not a page rewrite). Order by role-criticality:

1. **Tier 1 (daily-use, high traffic):** Dashboard, Yard Inventory, Gate Check-In, Gate Check-Out, Dock Management, Move Tasks
2. **Tier 2 (frequent, manager-facing):** Appointments, Holds & Exceptions, Notifications, Yard Map
3. **Tier 3 (periodic):** Reports, Revenue, Email Intelligence, Inspections, Yard Audit
4. **Tier 4 (admin/config, infrequent):** All `/admin/*` pages, Platform Admin
5. **Tier 5 (standalone/public):** Gate Guard Mode (no sidebar), Carrier Portal (no sidebar, public)

For each page: confirm no hardcoded colors were bypassing tokens (e.g. inline `style={{color: '#...'}}` or Tailwind arbitrary values like `bg-[#fff]`), confirm table/card/badge rendering matches Phase 1–6 output, confirm responsive behavior at `sm`/`md`/`lg` still holds.

**Dependency:** All prior phases.

**Risk:** Low individually, but cumulative — this phase is where undiscovered hardcoded styles surface. Budget the most review time here.

---

## Phase 8 — Print/PDF & Standalone Surfaces

**Scope:** Confirm `#yms-print-view` styles (already navy-aligned) don't conflict with new tokens; confirm Gate Guard Mode and Carrier Portal (which render without the sidebar) look correct against the new `--background`.

**Dependency:** Phase 1.

**Risk:** Low.

---

## Dependency Graph Summary

```
Phase 0 (docs)
   │
Phase 1 (tokens) ──────────────┬─────────────┬─────────────┐
   │                           │             │             │
Phase 2 (sidebar)        Phase 3 (header)  Phase 4 (type)  Phase 8 (print/standalone)
   │                           │             │
   └───────────┬───────────────┴─────────────┘
               │
         Phase 5 (tables)
               │
         Phase 6 (cards/components)
               │
         Phase 7 (page sweep — all pages)
```

Phases 2, 3, 4, and 8 can run **in parallel** once Phase 1 lands, since they touch disjoint files (sidebar component, App.tsx header, shared type-scale components, print CSS respectively). Phases 5–7 are strictly sequential because table density depends on the finished type scale, and the page sweep depends on tables being finished.

---

## Out of Scope (explicitly not part of this migration)

- Route restructuring or renaming (routes stay exactly as documented in `design-audit.md` §5)
- Wiring the two orphaned pages found in the file system (`role-master.tsx`, `permission-matrix.tsx` — not referenced in `App.tsx`); flag to product owner separately, not a design-system concern
- Any backend/API changes
- Replacing shadcn/ui, Tailwind, Wouter, TanStack Query, or Framer Motion
- Adding a dark-mode toggle to public surfaces (Carrier Portal) — out of scope unless requested
- New component creation beyond variant additions already specified in `design-system.md` §4
