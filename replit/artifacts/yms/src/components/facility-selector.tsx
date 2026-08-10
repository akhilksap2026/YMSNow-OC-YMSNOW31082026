import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Globe2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getCurrentFacilityId, storeCurrentFacilityId } from "@/lib/queryClient";
import { invalidateAll } from "@/lib/invalidation";
import { useToast } from "@/hooks/use-toast";

interface Facility {
  id: number;
  name: string;
  code: string;
  isActive: boolean;
}

/**
 * Facility Selector — visible only to super_admin personas that can see more
 * than one facility. Lets them switch which facility's data the whole app
 * is scoped to (or view "All Facilities" aggregated), persisting the choice
 * for the session and refetching every mounted query on change.
 */
export function FacilitySelector({ userRole }: { userRole?: string }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string>(() => getCurrentFacilityId());

  const { data: facilities = [] } = useQuery<Facility[]>({
    queryKey: ["/api/facilities/mine"],
    enabled: userRole === "super_admin",
  });

  // Keep local state in sync if something else changes the stored facility
  // (e.g. persona switch resetting it back to "all facilities").
  useEffect(() => {
    setSelectedId(getCurrentFacilityId());
  }, [userRole]);

  if (userRole !== "super_admin" || facilities.length <= 1) {
    return null;
  }

  const activeFacility = facilities.find((f) => String(f.id) === selectedId);

  const handleSelect = (facilityId: string) => {
    if (facilityId === selectedId) return;
    setSelectedId(facilityId);
    storeCurrentFacilityId(facilityId ? Number(facilityId) : null);
    invalidateAll();
    const facility = facilities.find((f) => String(f.id) === facilityId);
    toast({
      title: facility ? `Switched to ${facility.name}` : "Switched to All Facilities",
      description: facility ? `Now viewing ${facility.code} only.` : "Now viewing aggregated data across all facilities.",
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-[11px] border-dashed"
          data-testid="button-facility-selector"
        >
          {activeFacility ? (
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Globe2 className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="max-w-[120px] truncate font-medium" data-testid="text-current-facility">
            {activeFacility ? activeFacility.name : "All Facilities"}
          </span>
          <ChevronDown className="h-3 w-3 opacity-40" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" data-testid="facility-dropdown">
        <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Switch Facility
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => handleSelect("")}
          data-testid="facility-option-all"
          className={`py-1.5 cursor-pointer ${selectedId === "" ? "bg-accent" : ""}`}
        >
          <div className="flex items-center gap-2 w-full">
            <Globe2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-[12px] font-medium flex-1">All Facilities</span>
            {selectedId === "" && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-0.5" />
        {facilities.map((facility) => {
          const isActive = String(facility.id) === selectedId;
          return (
            <DropdownMenuItem
              key={facility.id}
              onClick={() => handleSelect(String(facility.id))}
              data-testid={`facility-option-${facility.id}`}
              className={`py-1.5 cursor-pointer ${isActive ? "bg-accent" : ""}`}
            >
              <div className="flex items-center gap-2 w-full">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[12px] font-medium leading-tight truncate">{facility.name}</span>
                  <span className="text-[9px] text-muted-foreground">{facility.code}</span>
                </div>
                {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
