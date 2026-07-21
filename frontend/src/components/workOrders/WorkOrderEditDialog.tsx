import { AppDialog } from "../AppDialog";
import { orderDialogTabs } from "../../lib/workOrderDialog";
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
    activeTabIndex,
    openFeedbackAthene,
  } = props;

  const headerIcons = useWorkOrderEditHeaderIcons(props);

  return (
    <>
      <AppDialog
        header={
          <WorkOrderDialogTitle
            orderNumber={orderNumberForTitle}
            status={orderStatusForUi}
            isCreate={!editingId}
          />
        }
        icons={headerIcons}
        onAskAthene={
          activeTabIndex === orderDialogTabs.Feedback ? openFeedbackAthene : undefined
        }
        visible={dialogVisible}
        className={`app-big-modal-window app-tabbed-modal-window${!editingId ? " app-wo-create-surface" : ""}`}
        onHide={closeDialog}
        onShow={updateTabInk}
        footer={<WorkOrderEditFooter props={props} />}
        modal
        dismissableMask
        draggable={false}
        resizable={false}
      >
        <WorkOrderEditTabContent {...props} />
      </AppDialog>
      <WorkOrderEditDocumentDialog {...props} />
    </>
  );
}
