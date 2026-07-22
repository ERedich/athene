import {
  Briefcase,
  CircleAlert,
  ClipboardCheck,
  FolderTree,
  IdCard,
  Network,
  Package,
  Tags,
  Truck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type StammdatenCountKey =
  | "assets"
  | "employees"
  | "costCenters"
  | "workOrderTypes"
  | "problems"
  | "causes"
  | "remedies"
  | "classifications"
  | "workgroups"
  | "suppliers"
  | "maintenancePlans"
  | "inspectionRounds";

export type StammdatenManagerTile = {
  id: string;
  to: string;
  labelKey: string;
  Icon: LucideIcon;
  countKey: StammdatenCountKey;
};

/** Unique list endpoints used for KPI counts (assets shared by Assets + Baumstruktur). */
export const STAMMDATEN_COUNT_ENDPOINTS: Record<StammdatenCountKey, string> = {
  assets: "/api/assets",
  employees: "/api/employees",
  costCenters: "/api/cost-centers",
  workOrderTypes: "/api/work-order-types",
  problems: "/api/problems",
  causes: "/api/causes",
  remedies: "/api/remedies",
  classifications: "/api/classifications",
  workgroups: "/api/workgroups",
  suppliers: "/api/suppliers",
  maintenancePlans: "/api/maintenance-plans",
  inspectionRounds: "/api/inspection-rounds",
};

export const STAMMDATEN_MANAGER_TILES: StammdatenManagerTile[] = [
  {
    id: "assets",
    to: "/assets",
    labelKey: "assets.navAssets",
    Icon: Package,
    countKey: "assets",
  },
  {
    id: "baumstruktur",
    to: "/baumstruktur",
    labelKey: "baumstruktur.navBaumstruktur",
    Icon: FolderTree,
    countKey: "assets",
  },
  {
    id: "employees",
    to: "/employees",
    labelKey: "employees.navEmployees",
    Icon: IdCard,
    countKey: "employees",
  },
  {
    id: "cost-centers",
    to: "/cost-centers",
    labelKey: "costCenters.navCostCenters",
    Icon: Briefcase,
    countKey: "costCenters",
  },
  {
    id: "auftragstypen",
    to: "/auftragstypen",
    labelKey: "auftragstypen.navAuftragstypen",
    Icon: ClipboardCheck,
    countKey: "workOrderTypes",
  },
  {
    id: "probleme",
    to: "/probleme",
    labelKey: "probleme.navProbleme",
    Icon: CircleAlert,
    countKey: "problems",
  },
  {
    id: "ursachen",
    to: "/ursachen",
    labelKey: "ursachen.navUrsachen",
    Icon: Wrench,
    countKey: "causes",
  },
  {
    id: "massnahmen",
    to: "/massnahmen",
    labelKey: "massnahmen.navMassnahmen",
    Icon: ClipboardCheck,
    countKey: "remedies",
  },
  {
    id: "classifications",
    to: "/classifications",
    labelKey: "classifications.navClassifications",
    Icon: Tags,
    countKey: "classifications",
  },
  {
    id: "workgroups",
    to: "/workgroups",
    labelKey: "workgroups.navWorkgroups",
    Icon: Network,
    countKey: "workgroups",
  },
  {
    id: "suppliers",
    to: "/suppliers",
    labelKey: "suppliers.navSuppliers",
    Icon: Truck,
    countKey: "suppliers",
  },
  {
    id: "maintenance-plans",
    to: "/maintenance-plans",
    labelKey: "maintenancePlans.navMaintenancePlans",
    Icon: Wrench,
    countKey: "maintenancePlans",
  },
  {
    id: "inspection-rounds",
    to: "/inspection-rounds",
    labelKey: "inspectionRounds.navInspectionRounds",
    Icon: ClipboardCheck,
    countKey: "inspectionRounds",
  },
];
