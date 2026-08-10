import { QueryClient, QueryFunction } from "@tanstack/react-query";

const ROLE_KEY = "ymsnow_current_role";
const CARRIER_ID_KEY = "ymsnow_current_carrier_id";
const FACILITY_ID_KEY = "ymsnow_current_facility_id";

export function storeCurrentRole(role: string) {
  localStorage.setItem(ROLE_KEY, role);
}

export function getCurrentRole(): string {
  return localStorage.getItem(ROLE_KEY) || "admin";
}

// Carrier personas carry a carrierId so carrier-scoped endpoints (dashboard stats,
// appointments) can filter to that carrier's own data instead of the whole yard.
export function storeCurrentCarrierId(carrierId: number | null) {
  if (carrierId == null) localStorage.removeItem(CARRIER_ID_KEY);
  else localStorage.setItem(CARRIER_ID_KEY, String(carrierId));
}

export function getCurrentCarrierId(): string {
  return localStorage.getItem(CARRIER_ID_KEY) || "";
}

// Facility persona pinning, mirroring the carrier pattern above. super_admin
// personas may leave this empty (meaning "all facilities" aggregate view);
// every other persona should have one set so the backend can scope its data.
export function storeCurrentFacilityId(facilityId: number | null) {
  if (facilityId == null) localStorage.removeItem(FACILITY_ID_KEY);
  else localStorage.setItem(FACILITY_ID_KEY, String(facilityId));
}

export function getCurrentFacilityId(): string {
  return localStorage.getItem(FACILITY_ID_KEY) || "";
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const role = getCurrentRole();
  return {
    ...(extra ?? {}),
    "x-user-role": role,
    "x-carrier-id": getCurrentCarrierId(),
    "x-facility-id": getCurrentFacilityId(),
  };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers = buildHeaders(data ? { "Content-Type": "application/json" } : {});
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: buildHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: false,
      networkMode: "online",
    },
    mutations: {
      retry: false,
      networkMode: "online",
    },
  },
});
