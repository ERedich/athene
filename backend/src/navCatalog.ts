/**
 * Server whitelist mirroring frontend navModel + mobileNavCatalog.
 */

import { MOBILE_NAV_CATALOG } from "./mobileNavCatalog.js";

export type NavCatalogGroup = {
  id: string;
  to?: string;
  items: string[];
};

export const NAV_CATALOG: NavCatalogGroup[] = [
  { id: "dashboard", to: "/dashboard", items: [] },
  { id: "report-designer", to: "/report-designer", items: [] },
  { id: "getting-started", to: "/getting-started", items: [] },
  {
    id: "system",
    items: [
      "/audit-log",
      "/app-parameters",
      "/translations",
      "/calculator",
      "/customize-menu",
    ],
  },
  {
    id: "administration",
    items: [
      "/users",
      "/zuweisungen",
      "/sites",
      "/kpi-builder",
      "/layout-editor",
      "/suchkonfig",
      "/table-viewer",
    ],
  },
  {
    id: "stammdaten",
    items: [
      "/stammdaten-manager",
      "/assets",
      "/baumstruktur",
      "/employees",
      "/cost-centers",
      "/auftragstypen",
      "/probleme",
      "/ursachen",
      "/massnahmen",
      "/classifications",
      "/workgroups",
      "/suppliers",
      "/maintenance-plans",
      "/inspection-rounds",
    ],
  },
  {
    id: "auftragswesen",
    items: [
      "/workorders",
      "/auftragserstellung",
      "/kalendar",
      "/transactions",
      "/monitoring",
      "/mitteilungszentrale",
    ],
  },
  {
    id: "schichten",
    items: ["/shifts", "/schichtplaner"],
  },
  {
    id: "lagerhaltung",
    items: ["/warehouses", "/storage-locations", "/spare-parts"],
  },
  { id: "feedback", to: "/feedback", items: [] },
];

export const NAV_LAYOUT_LOCKED_TO = "/customize-menu";
export const NAV_LAYOUT_VERSION = 2;

export function buildNavCatalogSets(): {
  groupIds: Set<string>;
  routeTos: Set<string>;
  leafGroupTos: Map<string, string>;
} {
  const groupIds = new Set<string>();
  const routeTos = new Set<string>();
  const leafGroupTos = new Map<string, string>();
  for (const g of NAV_CATALOG) {
    groupIds.add(g.id);
    if (g.to) {
      routeTos.add(g.to);
      leafGroupTos.set(g.id, g.to);
    }
    for (const to of g.items) {
      routeTos.add(to);
    }
  }
  return { groupIds, routeTos, leafGroupTos };
}

export function mobileRouteTos(): Set<string> {
  return new Set(MOBILE_NAV_CATALOG.map((i) => i.to));
}

/** Default web layout JSON for new configs. */
export function defaultWebLayoutJson(): object {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "web",
    groups: NAV_CATALOG.map((g) => {
      if (g.items.length === 0 && g.to) {
        return {
          id: g.id,
          source: "catalog",
          role: "leaf",
          to: g.to,
          hidden: false,
          items: [],
        };
      }
      return {
        id: g.id,
        source: "catalog",
        role: "group",
        hidden: false,
        items: g.items.map((to) => ({
          id: `catalog:${g.id}:${to}`,
          source: "catalog",
          to,
          hidden: false,
        })),
      };
    }),
  };
}

export function defaultMobileLayoutJson(): object {
  return {
    version: NAV_LAYOUT_VERSION,
    platform: "mobile",
    items: MOBILE_NAV_CATALOG.map((it) => ({
      id: `catalog:mobile:${it.to}`,
      source: "catalog",
      to: it.to,
      hidden: false,
    })),
  };
}
