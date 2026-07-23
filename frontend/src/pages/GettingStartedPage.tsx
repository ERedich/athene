import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NavLink } from "react-router-dom";

type GuideId =
  | "orderManagement"
  | "materialManagement"
  | "userManagementAndSites";

type GuideLink = {
  to: string;
  labelKey: string;
};

type GuideConfig = {
  id: GuideId;
  links: GuideLink[];
  prerequisiteKeys: string[];
  firstStepKeys: string[];
  expansionKeys: string[];
};

const GUIDE_CONFIGS: GuideConfig[] = [
  {
    id: "orderManagement",
    links: [
      { to: "/assets", labelKey: "assets.navAssets" },
      { to: "/cost-centers", labelKey: "costCenters.navCostCenters" },
      { to: "/employees", labelKey: "employees.navEmployees" },
      { to: "/workgroups", labelKey: "workgroups.navWorkgroups" },
      { to: "/workorders", labelKey: "workOrders.navOrders" },
      { to: "/monitoring", labelKey: "monitoring.navMonitoring" },
    ],
    prerequisiteKeys: [
      "prereqAssets",
      "prereqCostCenters",
      "prereqEmployeesWorkgroups",
    ],
    firstStepKeys: [
      "stepOrderTypes",
      "stepCreateOrders",
      "stepMonitoring",
      "stepCalendar",
    ],
    expansionKeys: [
      "expandFailures",
      "expandMaintenancePlans",
      "expandShiftsAndSubscriptions",
    ],
  },
  {
    id: "materialManagement",
    links: [
      { to: "/warehouses", labelKey: "warehouses.navWarehouses" },
      { to: "/storage-locations", labelKey: "storageLocations.navStorageLocations" },
      { to: "/spare-parts", labelKey: "spareParts.navSpareParts" },
      { to: "/suppliers", labelKey: "suppliers.navSuppliers" },
      { to: "/transactions", labelKey: "transactions.navTransactions" },
    ],
    prerequisiteKeys: [
      "prereqWarehouses",
      "prereqStorageLocations",
      "prereqSparePartsAndSuppliers",
    ],
    firstStepKeys: [
      "stepMinStock",
      "stepMaterialBookings",
      "stepAssetLinks",
      "stepCycleCounts",
    ],
    expansionKeys: [
      "expandReorderPolicies",
      "expandClassifications",
      "expandDashboard",
    ],
  },
  {
    id: "userManagementAndSites",
    links: [
      { to: "/users", labelKey: "users.navUsers" },
      { to: "/employees", labelKey: "employees.navEmployees" },
      { to: "/sites", labelKey: "sites.navSites" },
      { to: "/app-parameters", labelKey: "appParameters.navAppParameters" },
      { to: "/shifts", labelKey: "shifts.navShifts" },
      { to: "/schichtplaner", labelKey: "schichtplaner.nav" },
    ],
    prerequisiteKeys: [
      "prereqUsers",
      "prereqEmployeesLink",
      "prereqSitesAndParameter",
    ],
    firstStepKeys: [
      "stepDefaultSiteFlow",
      "stepSitePermissions",
      "stepAssignWorkgroups",
      "stepPlanShifts",
    ],
    expansionKeys: [
      "expandOnboarding",
      "expandAuditAndTranslations",
      "expandRoleProfiles",
    ],
  },
];

function i18nItemKey(guideId: GuideId, key: string): string {
  return `gettingStarted.guides.${guideId}.${key}`;
}

export function GettingStartedPage() {
  const { t } = useTranslation();
  const guides = useMemo(() => GUIDE_CONFIGS, []);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <section className="rounded-lg bg-surface-container-low p-5">
          <h2 className="m-0 text-xl font-semibold text-on-surface">
            {t("gettingStarted.introTitle")}
          </h2>
          <p className="mb-0 mt-2 whitespace-pre-line text-sm text-on-surface-variant">
            {t("gettingStarted.introBody")}
          </p>
        </section>

        {guides.map((guide) => (
          <article
            key={guide.id}
            className="rounded-lg border border-[color-mix(in_srgb,var(--color-on-surface)_16%,transparent)] bg-surface p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="m-0 text-lg font-semibold text-on-surface">
                  {t(i18nItemKey(guide.id, "title"))}
                </h3>
                <p className="mb-0 mt-1 max-w-3xl text-sm text-on-surface-variant">
                  {t(i18nItemKey(guide.id, "summary"))}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {guide.links.map((link) => (
                  <NavLink
                    key={`${guide.id}-${link.to}`}
                    to={link.to}
                    className="inline-flex items-center rounded-sm border border-[color-mix(in_srgb,var(--color-primary)_35%,transparent)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                  >
                    {t(link.labelKey)}
                  </NavLink>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <section className="rounded-md bg-surface-container-low px-4 py-3">
                <h4 className="m-0 text-sm font-semibold uppercase tracking-wide text-on-surface">
                  {t(i18nItemKey(guide.id, "prerequisitesTitle"))}
                </h4>
                <ul className="mb-0 mt-2 space-y-2 pl-4 text-sm text-on-surface-variant">
                  {guide.prerequisiteKeys.map((key) => (
                    <li key={key}>{t(i18nItemKey(guide.id, key))}</li>
                  ))}
                </ul>
              </section>

              <section className="rounded-md bg-surface-container-low px-4 py-3">
                <h4 className="m-0 text-sm font-semibold uppercase tracking-wide text-on-surface">
                  {t(i18nItemKey(guide.id, "firstStepsTitle"))}
                </h4>
                <ol className="mb-0 mt-2 space-y-2 pl-4 text-sm text-on-surface-variant">
                  {guide.firstStepKeys.map((key) => (
                    <li key={key}>{t(i18nItemKey(guide.id, key))}</li>
                  ))}
                </ol>
              </section>

              <section className="rounded-md bg-surface-container-low px-4 py-3">
                <h4 className="m-0 text-sm font-semibold uppercase tracking-wide text-on-surface">
                  {t(i18nItemKey(guide.id, "expansionTitle"))}
                </h4>
                <ul className="mb-0 mt-2 space-y-2 pl-4 text-sm text-on-surface-variant">
                  {guide.expansionKeys.map((key) => (
                    <li key={key}>{t(i18nItemKey(guide.id, key))}</li>
                  ))}
                </ul>
              </section>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
