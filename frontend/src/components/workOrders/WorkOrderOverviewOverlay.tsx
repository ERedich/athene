import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { OverlayPanel } from "primereact/overlaypanel";
import type { OverlayPanel as OverlayPanelType } from "primereact/overlaypanel";

import type { WorkOrderOverviewRow } from "../../lib/workOrderOverviewPanel";
import { WorkOrderOverviewContent } from "./WorkOrderOverviewContent";

type Props = {
  order: WorkOrderOverviewRow | null;
  onHide: () => void;
};

export const WorkOrderOverviewOverlay = forwardRef<OverlayPanelType, Props>(function WorkOrderOverviewOverlay(
  { order, onHide },
  ref,
) {
  const { t } = useTranslation();

  return (
    <OverlayPanel
      ref={ref}
      className="app-wo-overview-overlay"
      dismissable
      showCloseIcon
      onHide={onHide}
      aria-label={t("workOrders.overview.panelLabel")}
    >
      {order ? <WorkOrderOverviewContent order={order} /> : null}
    </OverlayPanel>
  );
});
