/** Count keys used by Getting Started completion checks. */
export type GettingStartedCountKey =
  | "sites"
  | "costCenters"
  | "assets"
  | "employees"
  | "workgroups"
  | "workOrderTypes"
  | "classifications"
  | "problems"
  | "causes"
  | "remedies"
  | "workOrders"
  | "warehouses"
  | "storageLocations"
  | "spareParts"
  | "suppliers"
  | "transactions"
  | "users";

export type GettingStartedCounts = Record<GettingStartedCountKey, number | null>;

export const GETTING_STARTED_COUNT_ENDPOINTS: Record<
  GettingStartedCountKey,
  string
> = {
  sites: "/api/sites",
  costCenters: "/api/cost-centers",
  assets: "/api/assets",
  employees: "/api/employees",
  workgroups: "/api/workgroups",
  workOrderTypes: "/api/work-order-types",
  classifications: "/api/classifications",
  problems: "/api/problems",
  causes: "/api/causes",
  remedies: "/api/remedies",
  workOrders: "/api/work-orders?limit=1&offset=0",
  warehouses: "/api/warehouses",
  storageLocations: "/api/storage-locations",
  spareParts: "/api/spare-parts",
  suppliers: "/api/suppliers",
  transactions: "/api/transactions?page=1&limit=1",
  users: "/api/users",
};

export function emptyGettingStartedCounts(): GettingStartedCounts {
  return {
    sites: null,
    costCenters: null,
    assets: null,
    employees: null,
    workgroups: null,
    workOrderTypes: null,
    classifications: null,
    problems: null,
    causes: null,
    remedies: null,
    workOrders: null,
    warehouses: null,
    storageLocations: null,
    spareParts: null,
    suppliers: null,
    transactions: null,
    users: null,
  };
}

function countFromPayload(key: GettingStartedCountKey, data: unknown): number | null {
  if (key === "transactions") {
    if (
      data &&
      typeof data === "object" &&
      "total" in data &&
      typeof (data as { total: unknown }).total === "number"
    ) {
      return (data as { total: number }).total;
    }
    return null;
  }

  if (key === "workOrders") {
    // Soft-limited list: presence check — any row or hasMore means work orders exist.
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === "object") {
      const obj = data as { rows?: unknown; hasMore?: unknown };
      const rowCount = Array.isArray(obj.rows) ? obj.rows.length : 0;
      if (rowCount > 0 || obj.hasMore) return Math.max(rowCount, obj.hasMore ? 1 : 0);
      return 0;
    }
    return null;
  }

  return Array.isArray(data) ? data.length : null;
}

/** Unique fetch paths → which count keys share that response. */
export function gettingStartedFetchGroups(): {
  path: string;
  keys: GettingStartedCountKey[];
}[] {
  const byPath = new Map<string, GettingStartedCountKey[]>();
  for (const key of Object.keys(GETTING_STARTED_COUNT_ENDPOINTS) as GettingStartedCountKey[]) {
    const path = GETTING_STARTED_COUNT_ENDPOINTS[key];
    const list = byPath.get(path) ?? [];
    list.push(key);
    byPath.set(path, list);
  }
  return [...byPath.entries()].map(([path, keys]) => ({ path, keys }));
}

export async function fetchGettingStartedCounts(
  apiFetch: (path: string) => Promise<Response>,
): Promise<GettingStartedCounts> {
  const next = emptyGettingStartedCounts();
  const groups = gettingStartedFetchGroups();

  await Promise.all(
    groups.map(async ({ path, keys }) => {
      try {
        const res = await apiFetch(path);
        if (!res.ok) return;
        const data: unknown = await res.json();
        for (const key of keys) {
          next[key] = countFromPayload(key, data);
        }
      } catch {
        /* leave keys null */
      }
    }),
  );

  return next;
}

export function isCountReady(
  counts: GettingStartedCounts,
  key: GettingStartedCountKey,
): boolean {
  const value = counts[key];
  return typeof value === "number" && value > 0;
}
