import { Dialog } from "primereact/dialog";

import { WorkOrderDialogTitle } from "./WorkOrderDialogTitle";
import {
  WorkOrderEditDocumentDialog,
  WorkOrderEditFooter,
  WorkOrderEditTabContent,
  useWorkOrderEditHeaderIcons,
  type WorkOrderEditDialogProps,
} from "./WorkOrderEditSurface";

export type { WorkOrderEditDialogProps };

export function WorkOrderEditDialog(props: WorkOrderEditDialogProps) {
  const {
    dialogVisible,
    closeDialog,
    editingId,
    orderNumberForTitle,
    orderStatusForUi,
    updateTabInk,
  } = props;

  const headerIcons = useWorkOrderEditHeaderIcons(props);

  return (
    <>
      <Dialog
        header={
          <WorkOrderDialogTitle
            orderNumber={orderNumberForTitle}
            status={orderStatusForUi}
            isCreate={!editingId}
          />
        }
        icons={headerIcons}
        visible={dialogVisible}
        className="app-big-modal-window app-tabbed-modal-window"
        onHide={closeDialog}
        onShow={updateTabInk}
        footer={<WorkOrderEditFooter props={props} />}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <WorkOrderEditTabContent {...props} />
      </Dialog>
      <WorkOrderEditDocumentDialog {...props} />
    </>
  );
}
