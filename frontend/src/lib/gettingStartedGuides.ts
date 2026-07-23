import {
  Briefcase,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  isCountReady,
  type GettingStartedCountKey,
  type GettingStartedCounts,
} from "./gettingStartedCounts";

export type GettingStartedLink = {
  to: string;
  labelKey: string;
};

export type GettingStartedStep = {
  id: string;
  titleKey: string;
  bodyKey: string;
  /** When true, step is required before the domain works. */
  required: boolean;
  links?: GettingStartedLink[];
  /** Tables/API counts that mark this step complete when rows > 0. */
  prerequisiteKeys?: GettingStartedCountKey[];
  /** How multiple prerequisite keys combine. Default: all. */
  prerequisiteMode?: "all" | "any";
};

export type GettingStartedGuide = {
  id: string;
  Icon: LucideIcon;
  titleKey: string;
  summaryKey: string;
  introKey: string;
  tipKey: string;
  steps: GettingStartedStep[];
};

export const GETTING_STARTED_GUIDES: GettingStartedGuide[] = [
  {
    id: "auftragswesen",
    Icon: Briefcase,
    titleKey: "gettingStarted.guides.auftragswesen.title",
    summaryKey: "gettingStarted.guides.auftragswesen.summary",
    introKey: "gettingStarted.guides.auftragswesen.intro",
    tipKey: "gettingStarted.guides.auftragswesen.tip",
    steps: [
      {
        id: "buchungskreis",
        titleKey: "gettingStarted.guides.auftragswesen.steps.buchungskreis.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.buchungskreis.body",
        required: true,
        prerequisiteKeys: ["sites"],
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "kostenstellen",
        titleKey: "gettingStarted.guides.auftragswesen.steps.kostenstellen.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.kostenstellen.body",
        required: true,
        prerequisiteKeys: ["costCenters"],
        links: [{ to: "/cost-centers", labelKey: "gettingStarted.links.costCenters" }],
      },
      {
        id: "assets",
        titleKey: "gettingStarted.guides.auftragswesen.steps.assets.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.assets.body",
        required: true,
        prerequisiteKeys: ["assets"],
        links: [
          { to: "/assets", labelKey: "gettingStarted.links.assets" },
          { to: "/baumstruktur", labelKey: "gettingStarted.links.baumstruktur" },
        ],
      },
      {
        id: "planung",
        titleKey: "gettingStarted.guides.auftragswesen.steps.planung.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.planung.body",
        required: false,
        prerequisiteKeys: ["employees", "workgroups"],
        prerequisiteMode: "all",
        links: [
          { to: "/employees", labelKey: "gettingStarted.links.employees" },
          { to: "/workgroups", labelKey: "gettingStarted.links.workgroups" },
        ],
      },
      {
        id: "stammdaten-extra",
        titleKey: "gettingStarted.guides.auftragswesen.steps.stammdatenExtra.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.stammdatenExtra.body",
        required: false,
        prerequisiteKeys: [
          "workOrderTypes",
          "classifications",
          "problems",
          "causes",
          "remedies",
        ],
        prerequisiteMode: "any",
        links: [
          { to: "/auftragstypen", labelKey: "gettingStarted.links.auftragstypen" },
          { to: "/classifications", labelKey: "gettingStarted.links.classifications" },
          { to: "/probleme", labelKey: "gettingStarted.links.probleme" },
          { to: "/ursachen", labelKey: "gettingStarted.links.ursachen" },
          { to: "/massnahmen", labelKey: "gettingStarted.links.massnahmen" },
        ],
      },
      {
        id: "auftraege",
        titleKey: "gettingStarted.guides.auftragswesen.steps.auftraege.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.auftraege.body",
        required: true,
        prerequisiteKeys: ["workOrders"],
        links: [
          { to: "/auftragserstellung", labelKey: "gettingStarted.links.orderCreation" },
          { to: "/workorders", labelKey: "gettingStarted.links.workOrders" },
        ],
      },
      {
        id: "steuern",
        titleKey: "gettingStarted.guides.auftragswesen.steps.steuern.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.steuern.body",
        required: false,
        prerequisiteKeys: ["workOrders"],
        links: [
          { to: "/monitoring", labelKey: "gettingStarted.links.monitoring" },
          { to: "/kalendar", labelKey: "gettingStarted.links.kalendar" },
          { to: "/transactions", labelKey: "gettingStarted.links.transactions" },
          {
            to: "/mitteilungszentrale",
            labelKey: "gettingStarted.links.mitteilungszentrale",
          },
        ],
      },
    ],
  },
  {
    id: "materialwesen",
    Icon: Package,
    titleKey: "gettingStarted.guides.materialwesen.title",
    summaryKey: "gettingStarted.guides.materialwesen.summary",
    introKey: "gettingStarted.guides.materialwesen.intro",
    tipKey: "gettingStarted.guides.materialwesen.tip",
    steps: [
      {
        id: "buchungskreis",
        titleKey: "gettingStarted.guides.materialwesen.steps.buchungskreis.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.buchungskreis.body",
        required: true,
        prerequisiteKeys: ["sites"],
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "lager",
        titleKey: "gettingStarted.guides.materialwesen.steps.lager.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lager.body",
        required: true,
        prerequisiteKeys: ["warehouses"],
        links: [{ to: "/warehouses", labelKey: "gettingStarted.links.warehouses" }],
      },
      {
        id: "lagerorte",
        titleKey: "gettingStarted.guides.materialwesen.steps.lagerorte.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lagerorte.body",
        required: true,
        prerequisiteKeys: ["storageLocations"],
        links: [
          {
            to: "/storage-locations",
            labelKey: "gettingStarted.links.storageLocations",
          },
        ],
      },
      {
        id: "ersatzteile",
        titleKey: "gettingStarted.guides.materialwesen.steps.ersatzteile.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.ersatzteile.body",
        required: true,
        prerequisiteKeys: ["spareParts"],
        links: [{ to: "/spare-parts", labelKey: "gettingStarted.links.spareParts" }],
      },
      {
        id: "lieferanten",
        titleKey: "gettingStarted.guides.materialwesen.steps.lieferanten.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lieferanten.body",
        required: false,
        prerequisiteKeys: ["suppliers"],
        links: [{ to: "/suppliers", labelKey: "gettingStarted.links.suppliers" }],
      },
      {
        id: "buchen",
        titleKey: "gettingStarted.guides.materialwesen.steps.buchen.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.buchen.body",
        required: false,
        prerequisiteKeys: ["transactions"],
        links: [
          { to: "/transactions", labelKey: "gettingStarted.links.transactions" },
          { to: "/workorders", labelKey: "gettingStarted.links.workOrders" },
          { to: "/monitoring", labelKey: "gettingStarted.links.monitoring" },
        ],
      },
    ],
  },
  {
    id: "benutzermanagement",
    Icon: Users,
    titleKey: "gettingStarted.guides.benutzermanagement.title",
    summaryKey: "gettingStarted.guides.benutzermanagement.summary",
    introKey: "gettingStarted.guides.benutzermanagement.intro",
    tipKey: "gettingStarted.guides.benutzermanagement.tip",
    steps: [
      {
        id: "buchungskreise",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.buchungskreise.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.buchungskreise.body",
        required: true,
        prerequisiteKeys: ["sites"],
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "mitarbeiter",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.mitarbeiter.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.mitarbeiter.body",
        required: false,
        prerequisiteKeys: ["employees"],
        links: [{ to: "/employees", labelKey: "gettingStarted.links.employees" }],
      },
      {
        id: "benutzer",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.benutzer.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.benutzer.body",
        required: true,
        prerequisiteKeys: ["users"],
        links: [{ to: "/users", labelKey: "gettingStarted.links.users" }],
      },
      {
        id: "zugriff",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.zugriff.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.zugriff.body",
        required: true,
        /** Access model is ready once users exist; extra sites are assigned on the same record. */
        prerequisiteKeys: ["users"],
        links: [{ to: "/users", labelKey: "gettingStarted.links.users" }],
      },
      {
        id: "fachgruppen",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.fachgruppen.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.fachgruppen.body",
        required: false,
        prerequisiteKeys: ["workgroups"],
        links: [{ to: "/workgroups", labelKey: "gettingStarted.links.workgroups" }],
      },
      {
        id: "parameter",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.parameter.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.parameter.body",
        required: false,
        links: [
          { to: "/app-parameters", labelKey: "gettingStarted.links.appParameters" },
        ],
      },
    ],
  },
];

export function getGettingStartedGuide(
  id: string | undefined,
): GettingStartedGuide | undefined {
  if (!id) return undefined;
  return GETTING_STARTED_GUIDES.find((guide) => guide.id === id);
}

export function isGettingStartedStepComplete(
  step: GettingStartedStep,
  counts: GettingStartedCounts,
): boolean {
  const keys = step.prerequisiteKeys;
  if (!keys || keys.length === 0) return false;
  const mode = step.prerequisiteMode ?? "all";
  if (mode === "any") {
    return keys.some((key) => isCountReady(counts, key));
  }
  return keys.every((key) => isCountReady(counts, key));
}

/** Guide is done when every required step with prerequisites is complete. */
export function isGettingStartedGuideComplete(
  guide: GettingStartedGuide,
  counts: GettingStartedCounts,
): boolean {
  const required = guide.steps.filter(
    (step) => step.required && step.prerequisiteKeys && step.prerequisiteKeys.length > 0,
  );
  if (required.length === 0) return false;
  return required.every((step) => isGettingStartedStepComplete(step, counts));
}

export function gettingStartedGuideProgress(
  guide: GettingStartedGuide,
  counts: GettingStartedCounts,
): { done: number; total: number } {
  const tracked = guide.steps.filter(
    (step) => step.required && step.prerequisiteKeys && step.prerequisiteKeys.length > 0,
  );
  const done = tracked.filter((step) => isGettingStartedStepComplete(step, counts)).length;
  return { done, total: tracked.length };
}
