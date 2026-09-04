/**
 * Mobile drawer catalog — mirrors mobile AppDrawerContent navigable links.
 * Keep in sync with backend/src/mobileNavCatalog.ts
 */

import {
  ClipboardList,
  Factory,
  FolderTree,
  Home,
  Landmark,
  type LucideIcon,
} from "lucide-react";

export type MobileNavCatalogItem = {
  to: string;
  labelKey: string;
  Icon: LucideIcon;
};

export const mobileNavCatalog: MobileNavCatalogItem[] = [
  { to: "/home", labelKey: "drawer.navStart", Icon: Home },
  { to: "/cost-centers", labelKey: "drawer.navCostCenters", Icon: Landmark },
  { to: "/assets", labelKey: "drawer.navAssets", Icon: Factory },
  { to: "/baumstruktur", labelKey: "drawer.navBaumstruktur", Icon: FolderTree },
  { to: "/work-orders", labelKey: "drawer.navWorkOrders", Icon: ClipboardList },
];

export function mobileNavCatalogByTo(): Map<string, MobileNavCatalogItem> {
  return new Map(mobileNavCatalog.map((i) => [i.to, i]));
}
