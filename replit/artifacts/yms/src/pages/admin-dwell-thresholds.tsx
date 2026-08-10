import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Timer, Save, AlertTriangle, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PageHeader } from "@/components/enterprise";

const CLASS_META: Record<string, { label: string; description: string; accent: string }> = {
  general: {
    label: "General",
    description: "Standard trailers without a specific classification",
    accent: "border-l-blue-500",
  },
  internal_network: {
    label: "Internal Network",
    description: "Internal linehaul and hub-to-hub trailers",
    accent: "border-l-violet-500",
  },
  empty: {
    label: "Empty Trailer",
    description: "Trailers parked with no freight load",
    accent: "border-l-slate-400",
  },
  non_mail_storage: {
    label: "Non-Mail / Storage",
    description: "Long-stay trailers used for storage or non-mail cargo",
    accent: "border-l-amber-500",
  },
};

interface DwellThreshold {
  trailerClass: string;
  warningHours: number;
  alertHours: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export default function AdminDwellThresholdsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: thresholds = [], isLoading } = useQuery<DwellThreshold[]>({
    queryKey: ["/api/dwell-thresholds"],
  });
  const [edits, setEdits] = useState<Record<string, { warningHours: string; alertHours: string }>>({});

  const saveMutation = useMutation({
    mutationFn: async ({ trailerClass, warningHours, alertHours }: { trailerClass: string; warningHours: number; alertHours: number }) => {
      const res = await apiRequest("PUT", `/api/dwell-thresholds/${trailerClass}`, { warningHours, alertHours });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/dwell-thresholds"] });
      // Clear local edits for this class
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.trailerClass];
        return next;
      });
      toast({ title: "Thresholds saved", description: "Dwell thresholds updated successfully." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const getVal = (tc: string, field: "warningHours" | "alertHours", fallback: number) =>
    edits[tc]?.[field] ?? String(fallback);

  const setVal = (tc: string, field: "warningHours" | "alertHours", val: string) =>
    setEdits((prev) => ({ ...prev, [tc]: { ...(prev[tc] || {}), [field]: val } }));

  const handleSave = (t: DwellThreshold) => {
    const wh = Number(getVal(t.trailerClass, "warningHours", t.warningHours));
    const ah = Number(getVal(t.trailerClass, "alertHours", t.alertHours));
    if (!wh || !ah || wh < 1 || ah < 1) {
      toast({ title: "Invalid values", description: "Hours must be a positive number.", variant: "destructive" });
      return;
    }
    if (ah <= wh) {
      toast({ title: "Validation error", description: "Alert threshold must exceed the warning threshold.", variant: "destructive" });
      return;
    }
    saveMutation.mutate({ trailerClass: t.trailerClass, warningHours: wh, alertHours: ah });
  };

  const isDirty = (t: DwellThreshold) =>
    edits[t.trailerClass] !== undefined;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Dwell Thresholds"
        subtitle="Configure per-class dwell time warning and alert thresholds for trailer visibility"
        icon={<Timer className="h-5 w-5" />}
      />

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">How thresholds work: </span>
          trailers in the yard that exceed the <span className="font-medium">warning</span> threshold turn amber on the inventory view. Trailers exceeding the <span className="font-medium">alert</span> threshold trigger a breach notification on the dashboard.
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {isLoading
          ? [1, 2, 3, 4].map((i) => (
              <Card key={i} className="animate-pulse h-56" />
            ))
          : thresholds.map((t) => {
              const meta = CLASS_META[t.trailerClass] || { label: t.trailerClass, description: "", accent: "border-l-gray-400" };
              const wh = getVal(t.trailerClass, "warningHours", t.warningHours);
              const ah = getVal(t.trailerClass, "alertHours", t.alertHours);
              const dirty = isDirty(t);

              return (
                <Card key={t.trailerClass} className={`border-l-4 ${meta.accent}`}>
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold">{meta.label}</CardTitle>
                      {dirty && (
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800">
                          Unsaved
                        </Badge>
                      )}
                    </div>
                    {meta.description && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                          <Clock className="h-3 w-3" /> Warning (hours)
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={wh}
                          onChange={(e) => setVal(t.trailerClass, "warningHours", e.target.value)}
                          className="h-9 text-sm"
                          data-testid={`input-warning-${t.trailerClass}`}
                        />
                        <p className="text-[10px] text-muted-foreground">Amber indicator after this many hours</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5 text-red-600 dark:text-red-400">
                          <AlertTriangle className="h-3 w-3" /> Alert (hours)
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          value={ah}
                          onChange={(e) => setVal(t.trailerClass, "alertHours", e.target.value)}
                          className="h-9 text-sm"
                          data-testid={`input-alert-${t.trailerClass}`}
                        />
                        <p className="text-[10px] text-muted-foreground">Red breach alert after this many hours</p>
                      </div>
                    </div>
                    {t.updatedBy && (
                      <p className="text-[10px] text-muted-foreground">
                        Last updated by {t.updatedBy}
                        {t.updatedAt ? ` · ${new Date(t.updatedAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}` : ""}
                      </p>
                    )}
                    <Button
                      size="sm"
                      onClick={() => handleSave(t)}
                      disabled={saveMutation.isPending}
                      variant={dirty ? "default" : "outline"}
                      className="w-full h-8 text-xs gap-1.5"
                      data-testid={`button-save-${t.trailerClass}`}
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saveMutation.isPending ? "Saving…" : "Save Thresholds"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </div>
  );
}
