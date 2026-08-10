# YMSNOW Design Audit

> Audit date: 2026-08-10  
> Auditor: Replit Agent  
> Target reference: dense enterprise operations UI — navy sidebar, white-bordered cards, pale blue-gray workspace, compact typography, semantic status colors, data-heavy tables.

---

## 1. Stack & Tooling

| Concern | Current state |
|---|---|
| Framework | React 19.1.0 |
| Build | Vite 7.3 |
| Styling | Tailwind CSS v4 (CSS-driven via `@theme`/`@layer`; no `tailwind.config.*` file) |
| Component library | shadcn/ui "New York" style, CSS variables mode, neutral base; components are vendored into `src/components/ui/` |
| Routing | Wouter 3.3.5 (client-side, no nested router) |
| State / data | TanStack Query v5; API requests via custom `apiRequest` wrapper |
| Animation | Framer Motion 12.35.1 (in workspace catalog; usage is light) |
| Package manager | pnpm workspaces (workspace root: `replit/`) |
| TypeScript | Strict-ish: `noImplicitAny`, `strictNullChecks`, `noImplicitReturns`; no top-level `strict: true`; `strictFunctionTypes: false` |
| Linting | No ESLint or Biome config file present; Prettier is a dev dependency with no config |
| Testing | No frontend test framework; API server uses Node's built-in `tsx --test` runner |
| Preview command | `pnpm --filter @workspace/yms run serve` (Vite preview, same port as dev) |
| Typecheck command | `cd replit && pnpm run typecheck` (composite tsc build across all packages) |

---

## 2. Current Color & Token System

### Brand tokens (`@theme` in `index.css`)
```
--color-vid-navy:  #1E3A5F   (defined but largely unused in CSS vars)
--color-vid-blue:  #2563EB   (defined but largely unused)
--color-vid-green: #10B981
--color-vid-amber: #F59E0B
```

### Semantic tokens (light mode `:root`)
| Token | HSL | Approx hex | Notes |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | Pure white |
| `--foreground` | `0 0% 10%` | `#1A1A1A` | Near-black |
| `--border` | `0 0% 89%` | `#E3E3E3` | Light gray |
| `--card` | `0 0% 98%` | `#FAFAFA` | Near-white |
| `--card-border` | `0 0% 94%` | `#F0F0F0` | Very light |
| `--sidebar` | `0 0% 96%` | `#F5F5F5` | **Near-white — conflicts with navy target** |
| `--sidebar-primary` | `217 60% 42%` | `#2D6AA8` | Active nav color |
| `--primary` | `217 60% 42%` | `#2D6AA8` | Primary actions |
| `--muted` | `0 0% 92%` | `#EBEBEB` | |
| `--muted-foreground` | `0 0% 40%` | `#666666` | |
| `--accent` | `217 20% 92%` | `#E8EDF5` | Bluish tint |
| `--destructive` | `357 71% 47%` | `#CC2233` | |

### Shadows
All shadow values are `hsl(0 0% 0% / 0.00)` — **effectively invisible**. No elevation is communicated through shadows.

### Radius
`--radius: 0.5rem` → sm `0.25rem` / md `0.375rem` / lg `0.5rem` / xl `0.625rem`

### Typography
- Font: Inter → Open Sans → system-ui
- Mono: JetBrains Mono → Menlo → Fira Code
- Page titles: `text-lg sm:text-xl font-semibold` (current)
- Nav items: `text-[13px]` / secondary items `text-[12px]`
- Filter label: `text-[11px] uppercase tracking-wider`
- No explicit line-height or letter-spacing tokens beyond `--tracking-normal: 0em`

---

## 3. Layout Architecture

```
ThemeProvider
  TabletViewProvider
    ProductModeProvider
      QueryClientProvider
        SidebarProvider
          AppSidebar (fixed left, collapsible)
          main
            Header bar (SidebarTrigger · Breadcrumbs · ShiftClock · actions)
            <Suspense> → page content
```

### Header bar (App.tsx ~346–420)
- Height: implicit, no fixed `h-*` class
- Contains: SidebarTrigger | Breadcrumbs | Separator | ShiftClock | FacilitySelector | ModeSelector | TabletToggle | EmailInboxTrigger | NotificationBell | ThemeToggle | PersonaDropdown | LogoutButton
- Crowded at small viewports; several items are `hidden sm:*`

### Sidebar (app-sidebar.tsx)
- Background: `bg-sidebar` → `#F5F5F5` light / `#0D0D0D` dark  
- **Critical gap**: target requires navy (`#1E3A5F`); current sidebar is almost white in light mode
- Width: shadcn default (`--sidebar-width: 16rem` / `--sidebar-width-icon: 3rem`)
- Active item: `bg-primary/10` + left `3px` primary bar + `font-bold` + `pl-4` indent
- Three visual tiers: normal (80% opacity) / secondary (55%) / subtle (40%)
- Sections: Operations (non-collapsible), Compliance (collapsible), Analytics (collapsible), Administration (collapsible)
- Live badges: `gateExpected`, `movePending`, `exceptionsOpen`, `notificationsCount`
- Module subscription gating: locked items show amber tooltip

### Page layout pattern
All authenticated pages follow:
```tsx
<div className="space-y-4 sm:space-y-6">
  <PageHeader title icon actions kpiStrip />
  <FilterToolbar ... />
  <Card> or <table> content </Card>
</div>
```
Pages are padded by the parent `<main>` — no consistent `p-*` class on pages themselves; main wrapper uses `p-4 sm:p-6`.

---

## 4. Component Inventory

### Enterprise shared components (`src/components/enterprise/`)
| Component | File | Reuse | Issues |
|---|---|---|---|
| `PageHeader` | `page-header.tsx` | All pages | Good; title is `text-lg sm:text-xl`; no sticky behavior |
| `FilterToolbar` | `filter-toolbar.tsx` | Most list pages | Good composable pattern |
| `StatusChip` | `status-chip.tsx` | Everywhere | Maps to `status-colors.ts`; solid |
| `KPICard` | `kpi-card.tsx` | Dashboard, headers | Clickable variant; no skeleton built-in |
| `DetailDrawer` | `detail-drawer.tsx` | Several pages | Sheet-based; widths sm/md/lg |
| `EmptyState` | `empty-state.tsx` | All list pages | Consistent |
| `SectionHeader` | `section-header.tsx` | Sections within pages | Thin wrapper; rarely extracted |
| `SearchAutocomplete` | `search-autocomplete.tsx` | FilterToolbar | Custom combobox |
| `JockeyBoard` | `jockey-board.tsx` | Move tasks | Kanban; self-contained |

### shadcn/ui components present
`accordion` `alert-dialog` `alert` `avatar` `badge` `button` `card` `checkbox` `collapsible` `dialog` `dropdown-menu` `hover-card` `input` `label` `select` `separator` `sheet` `sidebar` `skeleton` `slider` `switch` `table` `tabs` `textarea` `toaster` `toast` `toggle` `tooltip`

Notable absences (not installed): `carousel` `command` `drawer` `input-otp` `vaul` — deliberately removed to reduce bundle size.

### AI-specific components
`ai-assistant.tsx` (floating panel), `ai-recommendation-card.tsx`, `assist/` folder (3 panels), `optimize/` folder (2 panels), `demo-helper.tsx`, `mode-selector.tsx`

---

## 5. Page & Route Inventory

| Route | Page file | Auth / roles | Primary UI pattern |
|---|---|---|---|
| `/` | `dashboard.tsx` | All roles | KPI grid + action panels + charts |
| `/appointments` | `appointments.tsx` | Most roles | Table + calendar toggle |
| `/gate/check-in` | `gate-checkin.tsx` | gate roles | Tabs + search + form |
| `/gate/check-out` | `gate-checkout.tsx` | gate roles | Tabs + table |
| `/yard/inventory` | `yard-inventory.tsx` | Most roles | Dense table |
| `/yard/map` | `yard-map.tsx` | admin+jockey | SVG canvas + side panels |
| `/dock` | `dock-management.tsx` | dock roles | Card grid + schedule toggle |
| `/moves` | `move-tasks.tsx` | jockey roles | Kanban board + table |
| `/exceptions` | `exceptions.tsx` | manager roles | Card list |
| `/reports` | `reports.tsx` | manager roles | Charts (Recharts) |
| `/revenue` | `revenue.tsx` | manager roles | KPI + charts + table |
| `/email-intelligence` | `email-intelligence.tsx` | manager roles | Panel + AI analysis |
| `/notifications` | `notifications.tsx` | All | List |
| `/inspections` | `inspections.tsx` | Several roles | Table + form |
| `/yard/audit` | `yard-audit.tsx` | manager roles | Checklist |
| `/admin/carriers` | `admin-carriers.tsx` | manager roles | Table + detail |
| `/admin/users` | `admin-users.tsx` | admin roles | Table |
| `/admin/audit` | `admin-audit.tsx` | manager roles | Table |
| `/admin/yard-setup` | `admin-yard-setup.tsx` | admin roles | Config cards |
| `/admin/ai-config` | `admin-ai-config.tsx` | admin roles | Config + reset |
| `/admin/dwell-thresholds` | `admin-dwell-thresholds.tsx` | admin roles | Config cards |
| `/admin/facilities` | `admin-facilities.tsx` | super_admin | Cards |
| `/platform-admin` | `platform-admin.tsx` | super_admin | Module subscription grid |
| `/gate/guard-mode` | `gate-guard.tsx` | gate roles | Full-screen, no sidebar |
| `/portal` | `carrier-portal.tsx` | Public | Booking wizard |
| `/role-master` | `role-master.tsx` | ? | Exists in files but not wired in App.tsx |
| `/permission-matrix` | `permission-matrix.tsx` | ? | Exists in files but not wired in App.tsx |

---

## 6. Status Color System

All status colors follow the pattern `bg-{color}-100 text-{color}-800 dark:bg-{color}-900/60 dark:text-{color}-200`.

| Domain | Status → Color |
|---|---|
| Visit | checked_in/arrived → **amber**; awaiting_slot → **orange**; in_yard/loading/unloading → **blue**; at_dock → **violet**; ready_out → **emerald**; closed → **gray** |
| Appointment | confirmed/completed → **emerald**; booked/scheduled/rescheduled → **amber**; cancelled/no_show → **red**; checked_in → **blue** |
| Move priority | urgent → **red**; high → **amber**; normal → **blue**; low → **gray** |
| Move status | completed → **emerald**; in_progress/accepted → **blue**; assigned → **violet**; open → **amber**; escalated → **orange**; rejected → **red** |
| Dock | available → **emerald**; occupied → **violet**; loading/unloading → **amber**; maintenance → **gray-200** |
| Exception | open → **red**; investigating → **amber**; resolved → **emerald** |
| Severity | critical → **red**; high → **orange**; medium → **amber**; low → **slate** |
| Role | super_admin → **rose**; admin → **red**; yard_manager → **violet**; gate_guard → **blue**; yard_jockey → **amber**; dock_user → **teal**; carrier → **indigo** |

The system is well-structured and semantically sound. **No changes to the status color semantic mapping are needed** — only the base token hue and lightness may shift slightly to read correctly against a navy sidebar context.

---

## 7. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `sm` (640px) | Sidebar renders; breadcrumb group label shows; page subtitles visible; KPI strip switches from wrap to nowrap scroll |
| `md` (768px) | KPI grid goes 3-column; some table columns visible |
| `lg` (1024px) | Dashboard 12-col grid activates; side panels visible alongside main content |
| Tablet mode | Manual toggle stored in `localStorage`; sidebar auto-collapses via `TabletSidebarSync`; several pages have explicit tablet adaptations |

**Gaps:** No consistent `xl` or `2xl` breakpoint usage. Table columns are rarely hidden progressively — most tables scroll horizontally at small viewports. No `container` class used; pages fill the available main-content area.

---

## 8. Accessibility Observations

- `data-testid` attributes are present on most interactive elements — good for testing, not accessibility
- `RoleGuard` does page-level access control with a skeleton fallback — appropriate
- `DialogDescription` warnings were previously fixed across all dialogs
- No visible skip-to-content link
- No `aria-label` on icon-only buttons (theme toggle, sidebar trigger, bell)
- `SidebarMenuButton` active state is communicated via `data-active` attribute and visual left bar — no `aria-current="page"`
- Color-only status communication: status chips use color + text label (adequate)
- Focus ring: uses `--ring` token via Tailwind's `ring` utility — present but thin

---

## 9. Gaps vs. Target Design

| Gap | Severity | Description |
|---|---|---|
| Sidebar color | **Critical** | Current sidebar: `#F5F5F5` (near-white). Target: navy (`#1E3A5F`). Requires sidebar token overhaul and text/icon color inversion |
| Workspace background | **High** | Current: pure white. Target: pale blue-gray (e.g. `#F0F4F8`). One token change in `:root` |
| Card styling | **High** | Current: `bg-card` = `#FAFAFA` with almost invisible borders. Target: white cards with clearly visible `1px` borders |
| Typography density | **High** | Page titles at `text-xl`; tables at default `text-sm`. Target wants compact — titles `text-base font-semibold`, table rows `text-xs/sm` with tighter `py-*` |
| Shadows | **Medium** | All shadows have `0` opacity — no elevation cues. Target enterprise UI uses subtle `1px` border + faint drop shadow on cards |
| Header bar | **Medium** | Crowded; no fixed height; acts as a band of buttons. Target shows a clean `h-12` fixed bar with clear zone separation |
| Table styling | **Medium** | Tables use default shadcn style. Target shows striped/bordered dense tables with sticky headers |
| KPI cards | **Low** | Current cards are adequate; target shows slightly denser metric tiles with stronger number typography |
| Print/PDF | **Low** | Print CSS exists (`#yms-print-view`) using dark navy `#07111f` — already aligned with brand |
