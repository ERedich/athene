import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TabPanel, TabView } from "primereact/tabview";

import { AppTabHeader } from "../components/tabs/AppTabHeader";
import { UserPermissionsPanel } from "../components/UserPermissionsPanel";
import { usePermission } from "../lib/usePermission";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS } from "../lib/tabs";
import { useTabInk } from "../lib/tabs/useTabInk";
import { PermissionTemplatesPage } from "./PermissionTemplatesPage";

/**
 * Standalone admin app: user grants + permission templates.
 * Catalog appKey remains `permission-templates` (route `/berechtigungswesen`).
 */
export function PermissionsAdminPage() {
  const { t } = useTranslation();
  const canManageUsers = usePermission("permissions.manage");
  const canViewTemplates = usePermission("permission-templates.view");
  const [activeTab, setActiveTab] = useState(0);
  const tabHostRef = useRef<HTMLDivElement>(null);
  useTabInk(tabHostRef, [activeTab, canManageUsers, canViewTemplates]);

  const userTabIndex = canManageUsers ? 0 : -1;
  const templatesTabIndex = canManageUsers ? (canViewTemplates ? 1 : -1) : canViewTemplates ? 0 : -1;
  const tabCount = (canManageUsers ? 1 : 0) + (canViewTemplates ? 1 : 0);

  if (!canManageUsers && !canViewTemplates) {
    return (
      <div className="flex flex-1 items-start p-8 text-on-surface">
        <p className="text-sm text-on-surface-variant">{t("permissions.forbiddenHint")}</p>
      </div>
    );
  }

  return (
    <div className="app-tabbed-page-shell flex min-h-0 flex-1 flex-col">
      <div ref={tabHostRef} className={STANDARD_TAB_HOST_CLASS}>
        <TabView
          className={STANDARD_TAB_VIEW_CLASS}
          activeIndex={Math.min(activeTab, Math.max(0, tabCount - 1))}
          onTabChange={(e) => setActiveTab(e.index)}
        >
          {canManageUsers ? (
            <TabPanel header={<AppTabHeader label={t("berechtigungswesen.tabUsers")} />}>
              <div className="flex min-h-0 flex-1 flex-col">
                <UserPermissionsPanel active={activeTab === userTabIndex} />
              </div>
            </TabPanel>
          ) : null}
          {canViewTemplates ? (
            <TabPanel header={<AppTabHeader label={t("berechtigungswesen.tabTemplates")} />}>
              <div className="flex min-h-0 flex-1 flex-col">
                <PermissionTemplatesPage active={activeTab === templatesTabIndex} />
              </div>
            </TabPanel>
          ) : null}
        </TabView>
      </div>
    </div>
  );
}
