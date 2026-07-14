import { useEffect, useLayoutEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "primereact/button";

import { WorkOrderDialogTitle } from "./WorkOrderDialogTitle";
import {
  WorkOrderEditDocumentDialog,
  WorkOrderEditFooter,
  WorkOrderEditTabContent,
  useWorkOrderEditHeaderIcons,
  type WorkOrderEditDialogProps,
} from "./WorkOrderEditSurface";
import { lucidePrimeBtnIcon } from "../../icons/lucide";

export function WorkOrderEditPageView(props: WorkOrderEditDialogProps) {
  const {
    t,
    closeDialog,
    editingId,
    orderNumberForTitle,
    orderStatusForUi,
    updateTabInk,
    activeTabIndex,
    dialogVisible,
  } = props;

  const headerIcons = useWorkOrderEditHeaderIcons(props);

  useLayoutEffect(() => {
    if (dialogVisible) {
      updateTabInk();
    }
  }, [dialogVisible, activeTabIndex, updateTabInk]);

  useEffect(() => {
    if (!dialogVisible) return;
    const id = requestAnimationFrame(() => updateTabInk());
    return () => cancelAnimationFrame(id);
  }, [dialogVisible, activeTabIndex, updateTabInk]);

  return (
    <>
      <div className="app-wo-edit-page-view flex min-h-0 w-full flex-1 flex-col">
        <header className="app-wo-edit-page-view__header flex shrink-0 items-center gap-3 border-b border-solid app-wo-detail-outline-border px-1 py-2">
          <Button
            type="button"
            text
            rounded
            className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0 shrink-0"
            icon={<ArrowLeft className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            aria-label={t("workOrders.backToListAria")}
            title={t("workOrders.backToList")}
            onClick={closeDialog}
          />
          <div className="min-w-0 flex-1">
            <WorkOrderDialogTitle
              orderNumber={orderNumberForTitle}
              status={orderStatusForUi}
              isCreate={!editingId}
            />
          </div>
          {headerIcons}
        </header>

        <div className="app-wo-edit-page-view__body min-h-0 flex-1 overflow-hidden">
          <WorkOrderEditTabContent {...props} />
        </div>

        <footer className="app-wo-edit-page-view__footer shrink-0 border-t border-solid app-wo-detail-outline-border px-4 py-3">
          <WorkOrderEditFooter props={props} cancelLabel={t("workOrders.backToList")} />
        </footer>
      </div>
      <WorkOrderEditDocumentDialog {...props} />
    </>
  );
}
