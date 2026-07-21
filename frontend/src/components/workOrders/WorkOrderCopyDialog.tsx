import { Button } from "primereact/button";
import { AppDialog } from "../AppDialog";
import { InputText } from "primereact/inputtext";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { WorkOrderFormSource } from "../../lib/workOrderForm";

type WorkOrderCopyDialogProps = {
  visible: boolean;
  template: WorkOrderFormSource | null;
  onHide: () => void;
  onConfirm: (name: string) => void;
};

export function WorkOrderCopyDialog({ visible, template, onHide, onConfirm }: WorkOrderCopyDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!visible || !template) return;
    setName(t("workOrders.copyOrderDefaultName", { name: template.name }));
  }, [visible, template, t]);

  const footer = (
    <div className="flex justify-end gap-2">
      <Button type="button" label={t("workOrders.no")} severity="secondary" text onClick={onHide} />
      <Button
        type="button"
        label={t("workOrders.yes")}
        disabled={!name.trim()}
        onClick={() => {
          const trimmed = name.trim();
          if (!trimmed) return;
          onConfirm(trimmed);
        }}
      />
    </div>
  );

  return (
    <AppDialog
      visible={visible}
      header={t("workOrders.copyOrderDialogTitle")}
      footer={footer}
      onHide={onHide}
      className="app-dialog-sm"
      modal
      draggable={false}
    >
      {template ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-on-surface-variant">
            {t("workOrders.copyOrderDialogSource", {
              orderNumber: template.orderNumber,
              name: template.name,
            })}
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="work-order-copy-name" className="text-sm font-medium">
              {t("workOrders.copyOrderNameLabel")}
            </label>
            <InputText
              id="work-order-copy-name"
              value={name}
              maxLength={200}
              className="w-full"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) {
                  e.preventDefault();
                  onConfirm(name.trim());
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </AppDialog>
  );
}
