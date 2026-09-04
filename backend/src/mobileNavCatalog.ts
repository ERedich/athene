/**
 * Mobile drawer catalog — mirrors mobile AppDrawerContent navigable links.
 * Athene / theme / language / logout stay fixed chrome (not configurable).
 */

export type MobileNavCatalogItem = {
  to: string;
  labelKey: string;
};

export const MOBILE_NAV_CATALOG: MobileNavCatalogItem[] = [
  { to: "/home", labelKey: "drawer.navStart" },
  { to: "/cost-centers", labelKey: "drawer.navCostCenters" },
  { to: "/assets", labelKey: "drawer.navAssets" },
  { to: "/baumstruktur", labelKey: "drawer.navBaumstruktur" },
  { to: "/work-orders", labelKey: "drawer.navWorkOrders" },
];

export function mobileNavCatalogTos(): Set<string> {
  return new Set(MOBILE_NAV_CATALOG.map((i) => i.to));
}
