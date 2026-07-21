import { useTranslation } from "react-i18next";
import { AppDialog } from "../AppDialog";

import type { WorkOrderOverviewRow } from "../../lib/workOrderOverviewPanel";
import { WorkOrderDialogTitle } from "./WorkOrderDialogTitle";
import { WorkOrderOverviewContent } from "./WorkOrderOverviewContent";

type Props = {
  order: WorkOrderOverviewRow | null;
  onHide: () => void;
};

export function WorkOrderOverviewOverlay({ order, onHide }: Props) {
  const { t } = useTranslation();

  return (
    <AppDialog
      visible={order !== null}
      onHide={onHide}
      className="app-wo-overview-dialog"
      header={
        order ? (
          <div className="min-w-0 pr-2">
            <div className="text-base font-medium">
              <WorkOrderDialogTitle orderNumber={order.orderNumber} status={order.status} isCreate={false} />
            </div>
            <p className="mt-1 truncate text-sm text-on-surface-variant" title={order.name}>
              {order.name}
            </p>
          </div>
        ) : undefined
      }
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      aria-label={t("workOrders.overview.panelLabel")}
    >
      {order ? <WorkOrderOverviewContent order={order} /> : null}
    </AppDialog>
  );
}
