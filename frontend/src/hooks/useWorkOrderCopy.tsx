import { Copy } from "lucide-react";
import { useCallback, useState, type ReactElement } from "react";
import type { TFunction } from "i18next";
import type { MenuItem } from "primereact/menuitem";

import { WorkOrderCopyDialog } from "../components/workOrders/WorkOrderCopyDialog";
import { lucidePrimeBtnIcon } from "../icons/lucide";
import type { WorkOrderFormSource } from "../lib/workOrderForm";

type UseWorkOrderCopyOptions = {
  t: TFunction;
  onOpenCreateForm: (row: WorkOrderFormSource, name: string) => void;
};

export function useWorkOrderCopy({ t, onOpenCreateForm }: UseWorkOrderCopyOptions) {
  const [copyTemplate, setCopyTemplate] = useState<WorkOrderFormSource | null>(null);

  const startCopy = useCallback((row: WorkOrderFormSource) => {
    setCopyTemplate(row);
  }, []);

  const hideCopyDialog = useCallback(() => {
    setCopyTemplate(null);
  }, []);

  const confirmCopy = useCallback(
    (name: string) => {
      if (!copyTemplate) return;
      onOpenCreateForm(copyTemplate, name);
      setCopyTemplate(null);
    },
    [copyTemplate, onOpenCreateForm],
  );

  const contextMenuItem = useCallback(
    (row: WorkOrderFormSource | null): MenuItem => ({
      label: t("workOrders.contextMenuCopyOrder"),
      icon: <Copy className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
      disabled: !row || !row.workgroupId,
      command: () => {
        if (row?.workgroupId) startCopy(row);
      },
    }),
    [startCopy, t],
  );

  const CopyDialogEl: ReactElement = (
    <WorkOrderCopyDialog
      visible={copyTemplate != null}
      template={copyTemplate}
      onHide={hideCopyDialog}
      onConfirm={confirmCopy}
    />
  );

  return { contextMenuItem, CopyDialogEl, startCopy };
}
