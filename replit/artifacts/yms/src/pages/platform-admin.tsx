import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  Lock,
  CheckCircle2,
  Package2,
  Shield,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ALL_MODULES = [
  {
    key: "core_operations",
    label: "Core Operations",
    description: "Appointments, Gate, Yard Inventory, Yard Map & Moves",
    alwaysOn: true,
  },
  {
    key: "dock_management",
    label: "Dock Management",
    description: "Dock door assignments and load/unload workflow",
    alwaysOn: false,
  },
  {
    key: "compliance",
    label: "Compliance Suite",
    description: "Holds & Exceptions, Inspections, Yard Audit",
    alwaysOn: false,
  },
  {
    key: "analytics",
    label: "Analytics & Revenue",
    description: "Reports, dashboards, revenue tracking",
    alwaysOn: false,
  },
  {
    key: "notifications",
    label: "Notifications",
    description: "Real-time operational alerts",
    alwaysOn: false,
  },
  {
    key: "ai_suite",
    label: "AI Suite",
    description: "Email Intelligence, Lifecycle Video, AI Configuration",
    alwaysOn: false,
  },
] as const;

type ModuleKey = typeof ALL_MODULES[number]["key"];

interface SubEntry {
  isEnabled: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface FacilityWithSubs {
  id: number;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  isActive: boolean;
  subscriptions: Record<string, SubEntry>;
}

function ModuleLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-[12px] font-semibold flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          Module reference
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-px border-t bg-border">
          {ALL_MODULES.map((mod) => (
            <div key={mod.key} className="px-4 py-3 bg-card">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[12px] font-semibold">{mod.label}</span>
                {mod.alwaysOn && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Always On
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">{mod.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlatformAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: facilities = [], isLoading } = useQuery<FacilityWithSubs[]>({
    queryKey: ["/api/platform/facilities"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({
      facilityId,
      moduleKey,
      isEnabled,
    }: {
      facilityId: number;
      moduleKey: string;
      isEnabled: boolean;
    }) => {
      await apiRequest("PUT", `/api/platform/facilities/${facilityId}/modules`, {
        moduleKey,
        isEnabled,
      });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform/facilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      const modLabel = ALL_MODULES.find((m) => m.key === vars.moduleKey)?.label ?? vars.moduleKey;
      toast({
        title: vars.isEnabled ? "Module enabled" : "Module disabled",
        description: `${modLabel} is now ${vars.isEnabled ? "active" : "locked"} for this facility.`,
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not update module subscription.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Package2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Module Subscription Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control which modules each facility tenant can access. Changes take effect immediately.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-blue-700 dark:text-blue-300 leading-snug">
          When a module is disabled, tenants at that facility see a padlock on those nav items with a
          message to contact their platform admin.{" "}
          <span className="font-semibold">Core Operations is always on</span> — it is the base
          subscription for every facility.
        </p>
      </div>

      {/* Matrix table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground w-60">
                    Facility
                  </th>
                  {ALL_MODULES.map((mod) => (
                    <th
                      key={mod.key}
                      className="text-center px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground min-w-[130px]"
                    >
                      {mod.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facilities.map((facility, idx) => (
                  <tr
                    key={facility.id}
                    className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${
                      idx % 2 === 1 ? "bg-muted/10" : ""
                    }`}
                  >
                    {/* Facility name column */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <div className="text-[13px] font-semibold leading-tight">{facility.name}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {facility.code}
                            {facility.city && ` · ${facility.city}`}
                            {facility.state && `, ${facility.state}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Module toggle cells */}
                    {ALL_MODULES.map((mod) => {
                      const sub = facility.subscriptions[mod.key];
                      const isEnabled = sub?.isEnabled ?? true;
                      const updatedBy = sub?.updatedBy;
                      const isPending = toggleMutation.isPending;

                      return (
                        <td key={mod.key} className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            <Switch
                              checked={isEnabled}
                              disabled={mod.alwaysOn || isPending}
                              onCheckedChange={(checked) => {
                                toggleMutation.mutate({
                                  facilityId: facility.id,
                                  moduleKey: mod.key,
                                  isEnabled: checked,
                                });
                              }}
                              className={mod.alwaysOn ? "opacity-60 cursor-not-allowed" : ""}
                            />
                            {mod.alwaysOn ? (
                              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Always on
                              </span>
                            ) : isEnabled ? (
                              <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-0.5">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Active
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Lock className="h-2.5 w-2.5" />
                                Locked
                              </span>
                            )}
                            {updatedBy && updatedBy !== "system" && (
                              <span
                                className="text-[9px] text-muted-foreground/50 truncate max-w-[110px]"
                                title={`Last changed by ${updatedBy}`}
                              >
                                {updatedBy}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}

                {facilities.length === 0 && (
                  <tr>
                    <td
                      colSpan={ALL_MODULES.length + 1}
                      className="px-5 py-10 text-center text-sm text-muted-foreground"
                    >
                      No active facilities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModuleLegend />
    </div>
  );
}
