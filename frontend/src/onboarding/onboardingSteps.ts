/** Product version Athene mentions during first-login intro (alpha). */
export const ONBOARDING_ALPHA_VERSION = "0.3";

export type OnboardingStepId =
  | "intro"
  | "stammdaten"
  | "people"
  | "auftragswesen"
  | "monitoring"
  | "ersatzteile"
  | "schichten"
  | "finish"
  | (string & {});

export type OnboardingStep = {
  id: string;
  /** Navigate here before showing the coachmark; omit to stay on current route. */
  route?: string;
  /** Value of `data-onboarding` on the spotlight target. */
  target: string;
  /** Expand this sidebar nav group before measuring the target. */
  expandNavGroup?: string;
  titleKey: string;
  bodyKey: string;
  /** Show work-order status color legend under the body text. */
  showStatusLegend?: boolean;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "intro",
    route: "/dashboard",
    target: "athene",
    titleKey: "onboarding.introTitle",
    bodyKey: "onboarding.introBody",
  },
  {
    id: "stammdaten",
    route: "/assets",
    target: "stammdaten",
    expandNavGroup: "stammdaten",
    titleKey: "onboarding.stammdatenTitle",
    bodyKey: "onboarding.stammdatenBody",
  },
  {
    id: "people",
    route: "/employees",
    target: "employees",
    expandNavGroup: "stammdaten",
    titleKey: "onboarding.peopleTitle",
    bodyKey: "onboarding.peopleBody",
  },
  {
    id: "auftragswesen",
    route: "/workorders",
    target: "auftragswesen",
    expandNavGroup: "auftragswesen",
    titleKey: "onboarding.auftragswesenTitle",
    bodyKey: "onboarding.auftragswesenBody",
  },
  {
    id: "monitoring",
    route: "/monitoring",
    target: "monitoring",
    expandNavGroup: "auftragswesen",
    titleKey: "onboarding.monitoringTitle",
    bodyKey: "onboarding.monitoringBody",
  },
  {
    id: "ersatzteile",
    route: "/spare-parts",
    target: "lagerhaltung",
    expandNavGroup: "lagerhaltung",
    titleKey: "onboarding.ersatzteileTitle",
    bodyKey: "onboarding.ersatzteileBody",
  },
  {
    id: "schichten",
    route: "/schichtplaner",
    target: "schichten",
    expandNavGroup: "schichten",
    titleKey: "onboarding.schichtenTitle",
    bodyKey: "onboarding.schichtenBody",
  },
  {
    id: "finish",
    route: "/monitoring",
    target: "monitoring-help",
    expandNavGroup: "auftragswesen",
    titleKey: "onboarding.finishTitle",
    bodyKey: "onboarding.finishBody",
  },
];

/** Alias for page-level Athene tours (same shape as first-login steps). */
export type TourStep = OnboardingStep;
