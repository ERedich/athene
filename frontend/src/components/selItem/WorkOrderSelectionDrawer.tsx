import { Sidebar } from "primereact/sidebar";
import { useTranslation } from "react-i18next";

import { WorkOrderSelectionBrowser } from "../workOrders/WorkOrderSelectionBrowser";
import type { WorkOrderLookupResult } from "../../lib/workOrderLookupApi";

type WorkOrderSelectionDrawerProps = {
  visible: boolean;
  onHide: () => void;
  onSelect: (workOrder: WorkOrderLookupResult) => void;
  siteId?: string;
};

export function WorkOrderSelectionDrawer({
  visible,
  onHide,
  onSelect,
  siteId,
}: WorkOrderSelectionDrawerProps) {
  const { t } = useTranslation();

  return (
    <Sidebar
      visible={visible}
      position="right"
      onHide={onHide}
      modal
      dismissable
      className="app-wo-search-sidebar !w-[min(70vw,56rem)] max-w-none"
      appendTo={typeof document !== "undefined" ? document.body : undefined}
      header={t("selItem.workOrder.drawerTitle")}
      pt={{
        header: { className: "app-wo-search-sidebar-header" },
        content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
      }}
    >
      {visible ? (
        <WorkOrderSelectionBrowser
          siteId={siteId}
          onSelect={(workOrder) => {
            onSelect(workOrder);
            onHide();
          }}
          onCancel={onHide}
        />
      ) : null}
    </Sidebar>
  );
}
