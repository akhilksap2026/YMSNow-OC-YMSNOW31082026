import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  CalendarDays,
  LogIn,
  Truck,
  DoorOpen,
  ArrowRightLeft,
  AlertTriangle,
  Container,
  ClipboardList,
  ChevronDown,
  ClipboardCheck,
  ShieldCheck,
  UserCircle2,
  CheckCircle2,
  Bot,
  MapPin,
  Settings2,
  Building2,
  Bell,
  BarChart3,
  TrendingUp,
  PlayCircle,
  Mail,
  Users,
  Timer,
  Landmark,
  Lock,
  Package2,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roleColor } from "@/lib/status-colors";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import type { Persona } from "@/App";
import { useProductMode, isStandardMode } from "@/lib/product-mode";

interface NavItem {
  title: string;
  url: string;
  icon: any;
  roles?: string[];
  badgeKey?: string;
  aiOnly?: boolean;
  subtle?: boolean;
  secondary?: boolean;
  /** If set, this item is gated by the named subscription module */
  moduleKey?: string;
}

const dashboardItem: NavItem = {
  title: "Dashboard",
  url: "/",
  icon: LayoutDashboard,
  roles: ["super_admin", "admin", "yard_manager", "supervisor", "dock_user", "gate_guard", "yard_jockey"],
};

const operationsItems: NavItem[] = [
  { title: "Appointments",   url: "/appointments",    icon: CalendarDays,     roles: ["super_admin","admin","yard_manager","supervisor","carrier"],                                          moduleKey: "core_operations" },
  { title: "Gate Operations",url: "/gate/check-in",  icon: LogIn,            roles: ["super_admin","admin","yard_manager","supervisor","gate_guard"], badgeKey: "gateExpected",              moduleKey: "core_operations" },
  { title: "Yard Inventory", url: "/yard/inventory",  icon: Truck,            roles: ["super_admin","admin","yard_manager","supervisor","gate_guard","yard_jockey","dock_user"],             moduleKey: "core_operations" },
  { title: "Yard Map",       url: "/yard/map",        icon: MapPin,           roles: ["super_admin","admin","yard_manager","supervisor","yard_jockey"],        secondary: true,              moduleKey: "core_operations" },
  { title: "Dock Management",url: "/dock",            icon: DoorOpen,         roles: ["super_admin","admin","yard_manager","supervisor","dock_user"],                                        moduleKey: "dock_management" },
  { title: "Yard Moves",     url: "/moves",           icon: ArrowRightLeft,   roles: ["super_admin","admin","yard_manager","supervisor","yard_jockey","dock_user"], badgeKey: "movePending", moduleKey: "core_operations" },
];

const complianceItems: NavItem[] = [
  { title: "Holds & Exceptions", url: "/exceptions",  icon: AlertTriangle, roles: ["super_admin","admin","yard_manager","supervisor"],                                    badgeKey: "exceptionsOpen", moduleKey: "compliance" },
  { title: "Inspections",        url: "/inspections", icon: ShieldCheck,   roles: ["super_admin","admin","yard_manager","supervisor","gate_guard","dock_user"], secondary: true,             moduleKey: "compliance" },
  { title: "Yard Audit",         url: "/yard/audit",  icon: ClipboardCheck,roles: ["super_admin","admin","yard_manager","supervisor"],                          secondary: true,             moduleKey: "compliance" },
];

const analyticsItems: NavItem[] = [
  { title: "Reports & Analytics", url: "/reports",        icon: BarChart3,  roles: ["super_admin","admin","yard_manager","supervisor"],                                moduleKey: "analytics"     },
  { title: "Revenue",             url: "/revenue",        icon: TrendingUp, roles: ["super_admin","admin","yard_manager","supervisor"], secondary: true,               moduleKey: "analytics"     },
  { title: "Notifications",       url: "/notifications",  icon: Bell,       badgeKey: "notificationsCount",                            secondary: true,               moduleKey: "notifications" },
];

const adminItems: NavItem[] = [
  { title: "Module Subscriptions",url: "/platform-admin",          icon: Package2,     roles: ["super_admin"]                                        },
  { title: "Manage Facilities",   url: "/admin/facilities",        icon: Landmark,     roles: ["super_admin"]                                        },
  { title: "Dwell Thresholds",    url: "/admin/dwell-thresholds",  icon: Timer,        roles: ["super_admin","admin"]                                },
  { title: "Carrier Management",  url: "/admin/carriers",          icon: Building2,    roles: ["super_admin","admin","yard_manager"]                  },
  { title: "Yard Setup",          url: "/admin/yard-setup",        icon: Settings2,    roles: ["super_admin","admin"],                secondary: true },
  { title: "Users",               url: "/admin/users",             icon: Users,        roles: ["super_admin","admin"],                secondary: true },
  { title: "Audit Log",           url: "/admin/audit",             icon: ClipboardList,roles: ["super_admin","admin","yard_manager"], secondary: true },
  { title: "Email Intelligence",  url: "/email-intelligence",      icon: Mail,         roles: ["super_admin","admin","yard_manager"], aiOnly: true,    moduleKey: "ai_suite" },
  { title: "Lifecycle Video",     url: "/video",                   icon: PlayCircle,   aiOnly: true, subtle: true,                                   moduleKey: "ai_suite" },
  { title: "AI Configuration",    url: "/admin/ai-config",         icon: Bot,          roles: ["super_admin","admin"],               aiOnly: true, subtle: true, moduleKey: "ai_suite" },
];

export const allNavItems = [dashboardItem, ...operationsItems, ...complianceItems, ...analyticsItems, ...adminItems];

// ── Subscription hook ─────────────────────────────────────────────────────────
function useSidebarSubscriptions(userRole?: string) {
  const { data } = useQuery<{ enabledModules: string[] }>({
    queryKey: ["/api/subscriptions"],
    staleTime: 5 * 60 * 1000,
    enabled: !!userRole,
  });
  // super_admin is never locked — they manage the subscriptions
  if (userRole === "super_admin") return new Set<string>(["core_operations","dock_management","compliance","analytics","notifications","ai_suite"]);
  if (!data) return null; // loading — treat as all enabled (fail open)
  return new Set<string>(data.enabledModules);
}

// ── Locked nav item ───────────────────────────────────────────────────────────
function LockedNavItem({ item }: { item: NavItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SidebarMenuItem className="relative">
      <SidebarMenuButton
        className="h-8 text-[13px] cursor-pointer opacity-40 hover:opacity-55 transition-opacity"
        onClick={() => setExpanded((e) => !e)}
      >
        <Lock className="h-4 w-4 shrink-0" />
        <span className="truncate flex-1 text-[12px]">{item.title}</span>
        <Lock className="h-2.5 w-2.5 shrink-0 ml-auto opacity-70" />
      </SidebarMenuButton>
      {expanded && (
        <div className="mx-2 mb-1.5 px-2.5 py-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50">
          <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-snug">
            <span className="font-semibold">{item.title}</span> isn't included in your facility's
            subscription. Contact your platform admin to get access.
          </p>
        </div>
      )}
    </SidebarMenuItem>
  );
}

// ── Regular nav item ──────────────────────────────────────────────────────────
function NavItem({ item, badgeCounts }: { item: NavItem; badgeCounts?: Record<string, number> }) {
  const [location] = useLocation();
  const isActive = location === item.url ||
    (item.url === "/gate/check-in" && location === "/gate/check-out");
  const badgeCount = item.badgeKey && badgeCounts ? badgeCounts[item.badgeKey] : 0;
  const isCriticalBadge = item.badgeKey === "exceptionsOpen" && badgeCount > 0;
  const isSubtle = item.subtle && !isActive;
  const isSecondary = item.secondary && !isActive;

  return (
    <SidebarMenuItem className="relative">
      {isActive && (
        <div className="absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-r-full bg-primary z-10" />
      )}
      <SidebarMenuButton
        asChild
        data-active={isActive}
        data-testid={`nav-${item.url.replace(/\//g, "-").replace(/^-/, "")}`}
        className={`h-8 text-[13px] transition-colors ${
          isActive
            ? "text-primary font-bold bg-primary/10 pl-4"
            : isSubtle
            ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/70 hover:bg-accent/30"
            : isSecondary
            ? "text-sidebar-foreground/55 hover:text-sidebar-foreground/80 hover:bg-accent/40"
            : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-accent/50"
        }`}
      >
        <Link href={item.url}>
          <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : isSubtle ? "opacity-40" : isSecondary ? "opacity-50" : ""}`} />
          <span className={`truncate flex-1 ${isSubtle ? "text-[12px]" : isSecondary ? "text-[12px]" : ""}`}>{item.title}</span>
          {badgeCount > 0 && (
            <Badge
              className={`ml-auto text-[10px] px-1.5 py-0 min-w-[20px] h-5 justify-center border-0 no-default-active-elevate ${
                isCriticalBadge
                  ? "bg-red-500 text-white hover:bg-red-500"
                  : "bg-primary text-primary-foreground hover:bg-primary"
              }`}
              data-testid={`badge-${item.badgeKey}`}
            >
              {badgeCount}
            </Badge>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ── Collapsible nav group ─────────────────────────────────────────────────────
function CollapsibleNavGroup({
  label,
  items,
  userRole,
  badgeCounts,
  lockedModules,
  defaultOpen = true,
  collapsible = true,
  hideAI = false,
}: {
  label: string;
  items: NavItem[];
  userRole?: string;
  badgeCounts?: Record<string, number>;
  lockedModules?: Set<string> | null;
  defaultOpen?: boolean;
  collapsible?: boolean;
  hideAI?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filtered = items.filter((item) => {
    if (!item.roles || !userRole || item.roles.includes(userRole)) {
      if (hideAI && item.aiOnly) return false;
      return true;
    }
    return false;
  });
  if (filtered.length === 0) return null;

  const renderItem = (item: NavItem) => {
    // A module is locked when: subscriptions are loaded (not null) AND the item
    // has a moduleKey AND that key is NOT in the enabled set.
    const isLocked =
      lockedModules !== null &&
      lockedModules !== undefined &&
      !!item.moduleKey &&
      !lockedModules.has(item.moduleKey);

    if (isLocked) return <LockedNavItem key={item.title} item={item} />;
    return <NavItem key={item.title} item={item} badgeCounts={badgeCounts} />;
  };

  if (!collapsible) {
    return (
      <SidebarGroup className="py-1">
        <div className="flex items-center px-3 mb-0.5 py-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            {label}
          </span>
        </div>
        <SidebarGroupContent>
          <SidebarMenu className="gap-px">
            {filtered.map(renderItem)}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="py-1">
        <CollapsibleTrigger asChild>
          <button
            className="flex items-center justify-between w-full px-3 mb-0.5 py-0.5 group"
            aria-label={`Toggle ${label} section`}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
              {label}
            </span>
            <ChevronDown
              className={`h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground transition-all duration-200 ${open ? "" : "-rotate-90"}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {filtered.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function formatRole(r: string): string {
  return r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(firstName: string, lastName: string): string {
  return (firstName[0] || "") + (lastName[0] || "");
}

const ROLE_GROUPS: { key: string; label: string; roles: string[] }[] = [
  { key: "super_admin", label: "Super Admin",      roles: ["super_admin"] },
  { key: "admin",       label: "Administration",   roles: ["admin"] },
  { key: "ops",         label: "Operations",        roles: ["yard_manager", "gate_guard"] },
  { key: "yard",        label: "Yard Crew",         roles: ["yard_jockey"] },
  { key: "dock",        label: "Dock Operations",   roles: ["dock_user"] },
  { key: "carrier",     label: "Carrier Portal",    roles: ["carrier"] },
];

function useSidebarBadgeCounts() {
  const { data } = useQuery<{
    gateStats: { expectedToday: number; checkedInToday: number };
    moveSummary: { available: number; assigned: number; inProgress: number };
    exceptionsOpen: number;
  }>({
    queryKey: ["/api/sidebar/stats"],
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  const { data: notifications = [] } = useQuery<any[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });

  return {
    gateExpected:      data?.gateStats?.expectedToday ?? 0,
    movePending:       data?.moveSummary ? (data.moveSummary.available + data.moveSummary.assigned + data.moveSummary.inProgress) : 0,
    exceptionsOpen:    data?.exceptionsOpen ?? 0,
    notificationsCount: notifications.length,
  };
}

export function AppSidebar({
  userRole,
  currentPersona,
  personas = [],
  onPersonaChange,
}: {
  userRole?: string;
  currentPersona?: Persona | null;
  personas?: Persona[];
  onPersonaChange?: (persona: Persona) => void;
}) {
  const [location] = useLocation();
  const { mode } = useProductMode();
  const hideAI = isStandardMode(mode);

  const displayName = currentPersona
    ? `${currentPersona.firstName} ${currentPersona.lastName}`
    : "Select User";

  const displayRole = currentPersona?.role || userRole;
  const displayCarrier = currentPersona?.carrierName;
  const badgeCounts = useSidebarBadgeCounts();
  const lockedModules = useSidebarSubscriptions(userRole);

  const isDashboardActive = location === "/";

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-2.5 border-b border-sidebar-border">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2 select-none">
            <div className="h-8 w-8 rounded-lg bg-[#D40511] flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            </div>
            <span className="text-lg font-black tracking-tight leading-none">
              YMS<span className="text-[#1d4ed8]">Now</span>
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="py-1">
        {/* Persona selector */}
        <SidebarGroup className="py-1 px-2">
          <div className="px-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-auto min-h-8 py-1.5 px-2 text-xs border-dashed"
                  data-testid="button-role-selector"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {currentPersona ? (
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback className="text-[9px] font-bold bg-primary/15 text-primary">
                          {getInitials(currentPersona.firstName, currentPersona.lastName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="flex flex-col items-start min-w-0">
                      <span className="font-medium text-[12px] leading-tight truncate max-w-[120px]" data-testid="text-current-persona-name">
                        {displayName}
                      </span>
                      {displayRole && (
                        <span className={`inline-flex rounded px-1 py-px text-[9px] font-semibold mt-px ${roleColor(displayRole)}`}>
                          {displayCarrier ? displayCarrier.split(" ").slice(0, 2).join(" ") : formatRole(displayRole)}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64" data-testid="persona-dropdown">
                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Switch User / Persona
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ROLE_GROUPS.map((group) => {
                  const groupPersonas = personas.filter((p) => group.roles.includes(p.role));
                  if (groupPersonas.length === 0) return null;
                  return (
                    <div key={group.key}>
                      <DropdownMenuLabel className="text-[9px] text-muted-foreground/60 uppercase tracking-wider py-1 px-2">
                        {group.label}
                      </DropdownMenuLabel>
                      {groupPersonas.map((persona) => {
                        const isActive = currentPersona?.id === persona.id;
                        return (
                          <DropdownMenuItem
                            key={persona.id}
                            onClick={() => onPersonaChange?.(persona)}
                            data-testid={`persona-option-${persona.id}`}
                            className={`py-1.5 cursor-pointer ${isActive ? "bg-accent" : ""}`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <Avatar className="h-6 w-6 shrink-0">
                                <AvatarFallback className={`text-[10px] font-bold ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                                  {getInitials(persona.firstName, persona.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[12px] font-medium leading-tight flex items-center gap-1">
                                  {persona.firstName} {persona.lastName}
                                  {isActive && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                                </span>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className={`inline-flex rounded px-1 py-px text-[9px] font-semibold ${roleColor(persona.role)}`}>
                                    {formatRole(persona.role)}
                                  </span>
                                  {persona.carrierName && (
                                    <span className="text-[9px] text-muted-foreground truncate">
                                      {persona.carrierName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator className="my-0.5" />
                    </div>
                  );
                })}
                {personas.length === 0 && (
                  <div className="px-2 py-3 text-center text-[11px] text-muted-foreground">
                    Loading users...
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarGroup>

        {/* Dashboard (always visible, never locked) */}
        <SidebarGroup className="py-1 px-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              <SidebarMenuItem>
                {isDashboardActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-primary z-10" />
                )}
                <SidebarMenuButton
                  asChild
                  data-active={isDashboardActive}
                  data-testid="nav-"
                  className={`h-8 text-[13px] transition-colors ${isDashboardActive ? "text-primary font-bold bg-primary/10 pl-4" : "text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-accent/50"}`}
                >
                  <Link href="/">
                    <LayoutDashboard className="h-4 w-4 shrink-0" />
                    <span className="truncate flex-1">Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <CollapsibleNavGroup
          label="Operations"
          items={operationsItems}
          userRole={userRole}
          badgeCounts={badgeCounts}
          lockedModules={lockedModules}
          collapsible={false}
          hideAI={hideAI}
        />

        <CollapsibleNavGroup
          label="Compliance"
          items={complianceItems}
          userRole={userRole}
          badgeCounts={badgeCounts}
          lockedModules={lockedModules}
          defaultOpen={true}
          hideAI={hideAI}
        />

        <CollapsibleNavGroup
          label="Analytics"
          items={analyticsItems}
          userRole={userRole}
          badgeCounts={badgeCounts}
          lockedModules={lockedModules}
          defaultOpen={true}
          hideAI={hideAI}
        />

        <CollapsibleNavGroup
          label="Administration"
          items={adminItems}
          userRole={userRole}
          lockedModules={lockedModules}
          defaultOpen={false}
          hideAI={hideAI}
        />
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {currentPersona && (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                {getInitials(currentPersona.firstName, currentPersona.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate leading-none" data-testid="text-user-name">
                {currentPersona.firstName} {currentPersona.lastName}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {currentPersona.carrierName || formatRole(currentPersona.role)}
              </p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
