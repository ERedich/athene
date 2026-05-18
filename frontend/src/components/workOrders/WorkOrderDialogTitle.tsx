import { useTranslation } from "react-i18next";

export type WorkOrderStatus =
  | "open"
  | "assigned"
  | "started"
  | "paused"
  | "continued"
  | "ended"
  | "done"
  | "cancelled";

type Props = {
  orderNumber: number | null;
  status: WorkOrderStatus | undefined;
  isCreate: boolean;
};

export function WorkOrderDialogTitle({ orderNumber, status, isCreate }: Props) {
  const { t } = useTranslation();

  if (isCreate || orderNumber == null) {
    return <span>{t("workOrders.createTitle")}</span>;
  }

  const statusCode = status ?? "open";
  const statusLabel = t(`workOrders.statusValues.${statusCode}`);

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span>
        {t("workOrders.dialogTitlePrefix")} {orderNumber}
      </span>
      <span className={`app-wo-status-modal app-wo-status-${statusCode}`}>{statusLabel}</span>
    </span>
  );
}
