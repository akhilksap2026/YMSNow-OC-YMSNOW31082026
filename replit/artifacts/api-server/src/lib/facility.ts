import { isSuperAdmin } from "./rbac";

// Preserves current single-facility behavior for any request that doesn't yet
// know about facilities (e.g. old cached frontend, or a header omitted by
// mistake) — resolves to the original Columbus hub created by seed.ts.
export const DEFAULT_FACILITY_ID = 1;

// Facility personas send their facility via this header, exactly mirroring the
// existing x-carrier-id / x-user-role pattern used elsewhere in this demo app
// (there is no real session auth here — headers are trusted as-is).
//
// - super_admin may pass any facility id (or omit it to mean "all facilities"
//   for endpoints that support an aggregate view).
// - Every other role is expected to always send the facility id assigned to
//   their persona; if it's missing we fall back to DEFAULT_FACILITY_ID rather
//   than silently returning cross-facility data.
export function parseFacilityIdHeader(req: any): number | undefined {
  const raw = req.headers["x-facility-id"];
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : undefined;
}

export interface FacilityScope {
  // undefined means "no filter" — only ever true for a super_admin explicitly
  // requesting the all-facilities aggregate view.
  facilityId: number | undefined;
  isSuperAdmin: boolean;
}

// Resolves the effective facility a request should be scoped to.
export function resolveFacilityScope(req: any): FacilityScope {
  const role: string = (req.headers["x-user-role"] as string) || "";
  const headerFacilityId = parseFacilityIdHeader(req);
  const superAdmin = isSuperAdmin(role);

  if (superAdmin) {
    // super_admin explicitly chose "All facilities" in the selector -> no filter.
    return { facilityId: headerFacilityId, isSuperAdmin: true };
  }

  return { facilityId: headerFacilityId ?? DEFAULT_FACILITY_ID, isSuperAdmin: false };
}
