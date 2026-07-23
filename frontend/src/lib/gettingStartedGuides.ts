import {
  Briefcase,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";

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
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "kostenstellen",
        titleKey: "gettingStarted.guides.auftragswesen.steps.kostenstellen.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.kostenstellen.body",
        required: true,
        links: [{ to: "/cost-centers", labelKey: "gettingStarted.links.costCenters" }],
      },
      {
        id: "assets",
        titleKey: "gettingStarted.guides.auftragswesen.steps.assets.title",
        bodyKey: "gettingStarted.guides.auftragswesen.steps.assets.body",
        required: true,
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
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "lager",
        titleKey: "gettingStarted.guides.materialwesen.steps.lager.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lager.body",
        required: true,
        links: [{ to: "/warehouses", labelKey: "gettingStarted.links.warehouses" }],
      },
      {
        id: "lagerorte",
        titleKey: "gettingStarted.guides.materialwesen.steps.lagerorte.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lagerorte.body",
        required: true,
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
        links: [{ to: "/spare-parts", labelKey: "gettingStarted.links.spareParts" }],
      },
      {
        id: "lieferanten",
        titleKey: "gettingStarted.guides.materialwesen.steps.lieferanten.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.lieferanten.body",
        required: false,
        links: [{ to: "/suppliers", labelKey: "gettingStarted.links.suppliers" }],
      },
      {
        id: "buchen",
        titleKey: "gettingStarted.guides.materialwesen.steps.buchen.title",
        bodyKey: "gettingStarted.guides.materialwesen.steps.buchen.body",
        required: false,
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
        links: [{ to: "/sites", labelKey: "gettingStarted.links.sites" }],
      },
      {
        id: "mitarbeiter",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.mitarbeiter.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.mitarbeiter.body",
        required: false,
        links: [{ to: "/employees", labelKey: "gettingStarted.links.employees" }],
      },
      {
        id: "benutzer",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.benutzer.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.benutzer.body",
        required: true,
        links: [{ to: "/users", labelKey: "gettingStarted.links.users" }],
      },
      {
        id: "zugriff",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.zugriff.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.zugriff.body",
        required: true,
        links: [{ to: "/users", labelKey: "gettingStarted.links.users" }],
      },
      {
        id: "fachgruppen",
        titleKey: "gettingStarted.guides.benutzermanagement.steps.fachgruppen.title",
        bodyKey: "gettingStarted.guides.benutzermanagement.steps.fachgruppen.body",
        required: false,
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
