# YMSNOW Design System Specification

> Proposed token set, component variants, layout rules, status mapping, and responsive breakpoints.  
> Implementation target: dense enterprise operations UI matching the navy-sidebar, pale-workspace reference direction.  
> **Do not ship until the migration plan has been executed.**

---

## 1. Color Tokens

All tokens live in `src/index.css` as CSS custom properties under `:root` and `.dark`.  
Tailwind v4 reads them via `@theme inline`. No `tailwind.config.*` file is needed or created.

### 1.1 Brand palette (unchanged `@theme` block)

```css
@theme {
  --color-vid-navy:  #1E3A5F;   /* Primary sidebar fill */
  --color-vid-blue:  #2563EB;   /* Accent / highlight */
  --color-vid-green: #10B981;   /* Success / ready */
  --color-vid-amber: #F59E0B;   /* Warning / pending */
}
```

### 1.2 Semantic tokens — light mode

| Token | Proposed HSL | Approx hex | Change from current |
|---|---|---|---|
| `--background` | `210 20% 96%` | `#EEF2F7` | Was `0 0% 100%` — pale blue-gray workspace |
| `--foreground` | `215 25% 12%` | `#16202E` | Was `0 0% 10%` — slightly cooler |
| `--border` | `215 20% 82%` | `#C4CEDB` | Was `0 0% 89%` — blue-tinted border |
| `--input` | `215 20% 70%` | `#A3B1C4` | Was `0 0% 75%` |
| `--ring` | `217 60% 42%` | `#2D6AA8` | Unchanged |
| **Card** | | | |
| `--card` | `0 0% 100%` | `#FFFFFF` | Was `0 0% 98%` — pure white cards |
| `--card-foreground` | `215 25% 12%` | `#16202E` | Unchanged |
| `--card-border` | `215 20% 88%` | `#D4DCE8` | Was `0 0% 94%` — visible blue-tinted border |
| **Sidebar — MAJOR CHANGE** | | | |
| `--sidebar` | `215 50% 18%` | `#1E3A5F` | Was `0 0% 96%` — navy fill |
| `--sidebar-foreground` | `210 30% 88%` | `#D4DDE9` | Was `0 0% 10%` — light text on navy |
| `--sidebar-border` | `215 45% 24%` | `#28487A` | Was `0 0% 92%` — navy border |
| `--sidebar-primary` | `210 100% 68%` | `#5AADFF` | Was `217 60% 42%` — lighter blue on dark bg |
| `--sidebar-primary-foreground` | `215 50% 10%` | `#0D1F35` | Was `0 0% 98%` — dark on bright blue |
| `--sidebar-accent` | `215 40% 26%` | `#2D4F7A` | Was `0 0% 92%` — slightly lighter navy |
| `--sidebar-accent-foreground` | `210 30% 92%` | `#DDE4ED` | Was `0 0% 10%` — light text |
| `--sidebar-ring` | `210 100% 68%` | `#5AADFF` | |
| **Primary** | | | |
| `--primary` | `217 60% 42%` | `#2D6AA8` | Unchanged |
| `--primary-foreground` | `0 0% 98%` | `#FAFAFA` | Unchanged |
| **Secondary / Muted** | | | |
| `--secondary` | `215 20% 90%` | `#E2E8F2` | Was `0 0% 90%` — blue-tinted |
| `--secondary-foreground` | `215 25% 15%` | `#1C2A3A` | |
| `--muted` | `215 20% 92%` | `#E8EDF5` | Was `0 0% 92%` |
| `--muted-foreground` | `215 15% 45%` | `#5E6E84` | Was `0 0% 40%` — cooler mid-gray |
| `--accent` | `217 30% 90%` | `#DDE6F4` | Slightly cooler |
| `--accent-foreground` | `215 25% 15%` | `#1C2A3A` | |
| **Destructive** | | | |
| `--destructive` | `357 71% 47%` | `#CC2233` | Unchanged |
| `--destructive-foreground` | `0 0% 98%` | | Unchanged |
| **Popover** | | | |
| `--popover` | `0 0% 100%` | `#FFFFFF` | White popovers |
| `--popover-foreground` | `215 25% 12%` | `#16202E` | |
| `--popover-border` | `215 20% 85%` | `#C9D4E2` | |

### 1.3 Semantic tokens — dark mode (`.dark`)

Keep existing dark palette; adjust sidebar to a deeper navy:

| Token | Proposed HSL | Notes |
|---|---|---|
| `--sidebar` | `215 55% 11%` | `#0D1F35` — deep navy |
| `--sidebar-foreground` | `210 25% 80%` | Light |
| `--sidebar-border` | `215 45% 16%` | Visible separator |
| `--sidebar-accent` | `215 40% 16%` | Hover state |
| `--sidebar-accent-foreground` | `210 25% 85%` | |
| `--sidebar-primary` | `210 90% 65%` | Bright blue on dark |
| `--background` | `215 30% 8%` | Cool dark bg |

All other dark tokens remain as-is.

### 1.4 Elevation (shadow overhaul)

Current shadows are all `0` opacity — they produce no effect. Proposed:

```css
:root {
  --shadow-xs: 0 1px 2px hsl(215 25% 20% / 0.06);
  --shadow-sm: 0 1px 3px hsl(215 25% 20% / 0.08), 0 1px 2px hsl(215 25% 20% / 0.04);
  --shadow:    0 2px 4px hsl(215 25% 20% / 0.08), 0 1px 3px hsl(215 25% 20% / 0.06);
  --shadow-md: 0 4px 8px hsl(215 25% 20% / 0.10), 0 2px 4px hsl(215 25% 20% / 0.06);
  --shadow-lg: 0 8px 16px hsl(215 25% 20% / 0.12), 0 4px 6px hsl(215 25% 20% / 0.08);
}
```

Cards use `--shadow-sm`. Dropdowns/popovers use `--shadow-md`. Drawer/sheet uses `--shadow-lg`.

### 1.5 Radius (unchanged)

```css
--radius: 0.375rem;   /* slightly tighter than current 0.5rem for denser look */
```

Derived: `sm = 0.125rem` / `md = 0.25rem` / `lg = 0.375rem` / `xl = 0.5rem`

---

## 2. Typography Scale

| Token / Class | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| Page title (`h1`) | `text-base` (16px) | `font-semibold` (600) | `leading-tight` | PageHeader title |
| Section title (`h2`) | `text-sm` (14px) | `font-medium` (500) | `leading-tight` | SectionHeader |
| Table header | `text-[11px]` | `font-semibold` (600) | — | `<th>` cells |
| Table body | `text-xs` (12px) | `font-normal` (400) | `leading-normal` | `<td>` cells |
| Badge / chip | `text-[10px]` | `font-medium` (500) | — | StatusChip, badge |
| KPI value | `text-2xl` (24px) | `font-bold` (700) | `leading-none` | KPICard value |
| KPI label | `text-[11px]` | `font-medium` (500) | — | KPICard label |
| Sidebar nav | `text-[13px]` | `font-medium` | — | Primary nav items (unchanged) |
| Sidebar secondary | `text-[12px]` | `font-normal` | — | Secondary nav (unchanged) |
| Muted / helper | `text-[11px]` | `font-normal` | — | Timestamps, IDs |
| Monospace data | `font-mono text-xs` | — | — | Trailer IDs, visit numbers |

**Font**: Inter remains. No font changes needed.

---

## 3. Spacing & Layout Rules

### 3.1 Page container

```
main.flex-1.overflow-auto
  div.p-4.sm:p-6.space-y-4
    PageHeader
    FilterToolbar (on list pages)
    content
```

No changes to the outer shell. Page-level padding is already `p-4 sm:p-6`.

### 3.2 Card anatomy

Target: white fill, visible border, subtle shadow, tight inner padding.

```
Card
  border border-card-border
  bg-card
  shadow-sm
  rounded-lg                    (lg = --radius = 0.375rem proposed)
  
  CardHeader: px-4 py-3
  CardContent: px-4 pb-4
  CardFooter: px-4 py-2 border-t border-card-border bg-muted/30
```

### 3.3 Table rules

Dense data table target:

```
<table>
  <thead>
    <tr class="border-b border-border bg-muted/40">
      <th class="px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider text-left">
  <tbody>
    <tr class="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
      <td class="px-3 py-2 text-xs text-foreground">
```

Row height target: **36px** (currently ~44px+). Achieved with `py-2` + `text-xs`.

### 3.4 Sidebar dimensions (unchanged from shadcn defaults)

```
--sidebar-width: 16rem (256px)
--sidebar-width-icon: 3rem (48px)   [collapsed state]
```

### 3.5 Header bar

Target fixed height, clear zones:

```
header.h-12.border-b.border-border.flex.items-center.px-4.gap-3.bg-background
  [SidebarTrigger]
  [Separator vertical h-5]
  [Breadcrumbs]          flex-1
  [ShiftClock]           hidden sm:flex
  [Separator]
  [FacilitySelector]
  [ModeSelector]
  [— actions cluster —]  flex.items-center.gap-1
    EmailInboxTrigger | NotificationBell | ThemeToggle | PersonaDropdown
```

Add: `h-12 border-b border-border` to the `<header>` element in App.tsx's `AuthenticatedApp`.

---

## 4. Component Variants

### 4.1 Button

No new variants needed — existing shadcn button variants (default/secondary/outline/ghost/destructive/link) are sufficient. Ensure `size="sm"` (`h-8 px-3 text-xs`) is the default for in-table and toolbar actions.

### 4.2 Badge / StatusChip

`StatusChip` already wraps `Badge` with a `colorFn`. The color functions in `status-colors.ts` produce Tailwind classes. **No API changes needed** — only the underlying token values shift when the background changes.

Proposed: add a `dot` size variant for inline use:
```tsx
size?: "xs" | "sm" | "default"
// xs: h-4 px-1.5 text-[9px] — for table inline use
// sm: h-5 px-2 text-[10px]  — existing
// default: h-6 px-2.5 text-xs — full badge
```

### 4.3 KPICard

Current: generic card + trend arrow. Target: slightly denser.

```
KPICard
  p-3 (was p-4)
  label: text-[10px] uppercase tracking-wider font-semibold text-muted-foreground
  value: text-2xl font-bold leading-none mt-1
  trend: text-[11px] mt-1
  footer: text-[10px] text-muted-foreground mt-1.5
```

### 4.4 PageHeader

Reduce title size:
```
h1: text-base sm:text-lg font-semibold   (was text-lg sm:text-xl)
icon container: h-8 w-8 (was h-9/h-10)
```

### 4.5 Table (shadcn `<Table>`)

Override in `index.css` `@layer base`:
```css
table { @apply w-full text-xs; }
thead tr { @apply bg-muted/40 border-b border-border; }
thead th { @apply px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider; }
tbody tr { @apply border-b border-border last:border-0 hover:bg-accent/40 transition-colors; }
tbody td { @apply px-3 py-2; }
```

### 4.6 Sidebar nav item

Active state on navy background:
```
isActive: bg-white/10 text-white font-semibold  (was bg-primary/10 text-primary)
left bar:  bg-white/80                          (was bg-primary)
hover:     hover:bg-white/8 text-sidebar-foreground/90
secondary: text-sidebar-foreground/55
subtle:    text-sidebar-foreground/35
```

### 4.7 FilterToolbar

No structural changes. Compact the search input:
```
SearchAutocomplete: h-8 (was h-9)
Select triggers:    h-8 text-xs
```

---

## 5. Status Color Mapping (authoritative)

The existing `status-colors.ts` functions are kept exactly as-is. The semantic mapping below is the approved reference:

| Context | Status value | Color family | Rationale |
|---|---|---|---|
| **Visit** | checked_in, arrived | amber | Newly arrived — attention needed |
| | awaiting_slot | orange | Blocking — needs placement |
| | in_yard, loading, unloading | blue | Active operations |
| | at_dock | violet | Docked — process running |
| | ready_out | emerald | Complete — ready to leave |
| | checked_out, closed | gray | Historical / inactive |
| **Appointment** | confirmed, completed | emerald | Confirmed/done |
| | booked, scheduled, rescheduled | amber | Pending |
| | cancelled, no_show | red | Problem |
| | checked_in | blue | Active |
| **Move priority** | urgent | red | Immediate action |
| | high, dock_waiting | amber | Elevated |
| | normal | blue | Standard |
| | low | gray | Deprioritized |
| **Move status** | completed | emerald | Done |
| | in_progress, accepted | blue | Active |
| | assigned | violet | Handed off |
| | open, pending | amber | Awaiting action |
| | escalated | orange | SLA breach |
| | rejected | red | Requires attention |
| | cancelled | gray | Terminal |
| **Dock** | available | emerald | Ready |
| | occupied, at_dock | violet | In use |
| | loading, unloading | amber | Activity |
| | maintenance | gray-200 | Out of service |
| **Severity** | critical | red | |
| | high | orange | |
| | medium | amber | |
| | low | slate | |
| **Exception** | open | red | |
| | investigating | amber | |
| | resolved | emerald | |
| **Dwell** | < 8h | emerald text | Normal dwell |
| | 8–23h | amber text | Extended |
| | ≥ 24h | red text + row tint | Detention risk |

---

## 6. Responsive Breakpoints

| Breakpoint | px | Usage rule |
|---|---|---|
| (base) | 0+ | Single column, stacked layout, sidebar hidden |
| `sm` | 640px | Sidebar appears, header secondary items visible, KPI strip horizontal scroll |
| `md` | 768px | KPI grid 3-column, some table columns appear |
| `lg` | 1024px | Dashboard side panels, 12-col grids, full table columns |
| `xl` | 1280px | (Unused currently) — candidate for wider content max-width |
| `2xl` | 1536px | (Unused) — no changes planned |

### Column visibility rules for data tables (proposed)

| Column type | Always | sm+ | md+ | lg+ |
|---|---|---|---|---|
| Primary ID / number | ✓ | | | |
| Status chip | ✓ | | | |
| Carrier name | | ✓ | | |
| Dates / times | | ✓ | | |
| Location | | | ✓ | |
| Secondary metadata | | | | ✓ |
| Actions column | ✓ | | | |

---

## 7. Animation & Interaction

- **Page transitions**: none (lazy-loaded Suspense with skeleton fallback is adequate)
- **Skeleton loading**: use `<Skeleton>` component for all async data containers — already in use on Dock Management; extend to all pages
- **Toast notifications**: existing `useToast` + `<Toaster>` — no changes
- **Hover elevation**: existing `hover-elevate` CSS utility in `index.css` — keep; no changes
- **Framer Motion**: currently minimal usage. Do not introduce new motion patterns — enterprise density favors instant state changes over animation

---

## 8. Print / PDF

Existing `@media print` block is already correctly styled (dark navy `#07111f` background, 1280×720 slide format). No changes needed.

---

## 9. Icon System

Lucide React (via `lucide-react` package). All icons are `h-4 w-4` in nav, `h-3.5 w-3.5` in badges/chips, `h-5 w-5` in page headers. No custom icon font — keep Lucide throughout.

---

## 10. Tokens Not to Change

- Status color semantic mapping (`status-colors.ts`) — keep exactly
- `--primary` / `--ring` — keep at `217 60% 42%`
- Chart color scale — keep (5 chart vars)
- Dark mode background / foreground — keep (adjust sidebar only)
- Font family — Inter stays
- Framer Motion dependency — keep (used by ai-assistant panel)
- All shadcn `components/ui/` primitives — no modifications needed
