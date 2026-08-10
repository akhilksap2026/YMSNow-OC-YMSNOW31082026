import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, StatusChip, EmptyState } from "@/components/enterprise";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { activeStatusColor } from "@/lib/status-colors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, Pencil, Check, X, MapPin } from "lucide-react";

interface Facility {
  id: number;
  name: string;
  code: string;
  city: string | null;
  state: string | null;
  timezone: string;
  isActive: boolean;
  createdAt?: string;
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
];

interface EditForm {
  name: string;
  code: string;
  city: string;
  state: string;
  timezone: string;
  isActive: boolean;
}

function facilityToForm(f: Facility): EditForm {
  return {
    name: f.name,
    code: f.code,
    city: f.city || "",
    state: f.state || "",
    timezone: f.timezone,
    isActive: f.isActive,
  };
}

function FacilityRow({ facility, onEdit }: { facility: Facility; onEdit: () => void }) {
  return (
    <div
      className="grid items-center gap-2 px-3 py-2.5 hover:bg-muted/30 transition-colors"
      style={{ gridTemplateColumns: "1fr 90px 1fr 140px 90px 60px" }}
      data-testid={`row-facility-${facility.id}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="rounded-md p-1.5 bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 shrink-0">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <span className="font-medium text-sm truncate" data-testid={`text-facility-name-${facility.id}`}>{facility.name}</span>
      </div>
      <Badge variant="secondary" className="font-mono text-xs w-fit">{facility.code}</Badge>
      <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
        {(facility.city || facility.state) && <MapPin className="h-3 w-3 shrink-0" />}
        <span className="truncate">
          {[facility.city, facility.state].filter(Boolean).join(", ") || "—"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground truncate">{facility.timezone}</span>
      <StatusChip
        status={facility.isActive ? "active" : "inactive"}
        colorFn={() => activeStatusColor(facility.isActive)}
        label={facility.isActive ? "Active" : "Inactive"}
        size="sm"
      />
      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 justify-self-end" onClick={onEdit} data-testid={`button-edit-facility-${facility.id}`}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export default function AdminFacilitiesPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [createTimezone, setCreateTimezone] = useState("America/New_York");
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);

  const { data: facilities = [], isLoading } = useQuery<Facility[]>({ queryKey: ["/api/facilities"] });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/facilities", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facilities/mine"] });
      setCreateOpen(false);
      toast({ title: "Facility created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/facilities/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/facilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/facilities/mine"] });
      setEditing(null);
      setForm(null);
      toast({ title: "Facility updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      name: fd.get("name"),
      code: (fd.get("code") as string || "").toUpperCase(),
      city: fd.get("city") || null,
      state: fd.get("state") || null,
      timezone: createTimezone,
    });
  };

  const openEdit = (facility: Facility) => {
    setEditing(facility);
    setForm(facilityToForm(facility));
  };

  const saveEdit = () => {
    if (!editing || !form) return;
    updateMutation.mutate({
      id: editing.id,
      data: {
        name: form.name,
        code: form.code.toUpperCase(),
        city: form.city || null,
        state: form.state || null,
        timezone: form.timezone,
        isActive: form.isActive,
      },
    });
  };

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <PageHeader
        title="Manage Facilities"
        subtitle="Create and configure the yards/sites this instance operates across"
        icon={<Building2 className="h-5 w-5" />}
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-facility">
                <Plus className="h-4 w-4 mr-1.5" /> Add Facility
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Add Facility</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Facility Name *</Label><Input name="name" required placeholder="Dallas, TX Hub" data-testid="input-facility-name" /></div>
                  <div className="space-y-1.5"><Label>Code *</Label><Input name="code" required maxLength={10} placeholder="DAL" className="uppercase" data-testid="input-facility-code" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>City</Label><Input name="city" data-testid="input-facility-city" /></div>
                  <div className="space-y-1.5"><Label>State</Label><Input name="state" maxLength={2} className="uppercase" data-testid="input-facility-state" /></div>
                </div>
                <div className="space-y-1.5">
                  <Label>Timezone</Label>
                  <Select value={createTimezone} onValueChange={setCreateTimezone}>
                    <SelectTrigger data-testid="select-facility-timezone"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-facility">
                    {createMutation.isPending ? "Creating…" : "Add Facility"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border bg-card flex-1 min-h-0 overflow-hidden flex flex-col">
        <div
          className="grid gap-2 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ gridTemplateColumns: "1fr 90px 1fr 140px 90px 60px" }}
        >
          <span>Facility</span>
          <span>Code</span>
          <span>Location</span>
          <span>Timezone</span>
          <span>Status</span>
          <span />
        </div>
        <div className="flex-1 overflow-y-auto divide-y" data-testid="table-facilities">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : facilities.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-5 w-5" />}
              heading="No facilities yet"
              description="Add your first facility to start operating a yard."
              compact
            />
          ) : (
            facilities.map((f) => (
              <FacilityRow key={f.id} facility={f} onEdit={() => openEdit(f)} />
            ))
          )}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setForm(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Facility</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Facility Name *</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-edit-facility-name" />
                </div>
                <div className="space-y-1.5">
                  <Label>Code *</Label>
                  <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} maxLength={10} className="uppercase" data-testid="input-edit-facility-code" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-edit-facility-city" />
                </div>
                <div className="space-y-1.5">
                  <Label>State</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} className="uppercase" data-testid="input-edit-facility-state" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger data-testid="select-edit-facility-timezone"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <p className="text-sm font-medium">Facility Status</p>
                  <p className="text-[11px] text-muted-foreground">
                    {form.isActive ? "Operating and accepting activity" : "Disabled — hidden from active operations"}
                  </p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                  data-testid="switch-edit-facility-active"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => { setEditing(null); setForm(null); }}>
                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <Button onClick={saveEdit} disabled={updateMutation.isPending || !form.name || !form.code} data-testid="button-save-facility">
                  <Check className="h-3.5 w-3.5 mr-1" />
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
