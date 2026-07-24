import type { TFunction } from "i18next";
import { Bell, BellOff, CheckCircle, CircleX, Copy, Pencil, Plus, Printer, Send, Star, Trash2, UserPlus } from "lucide-react";

import type { BigMenuItem, BigMenuSection } from "../components/contextMenu/bigMenuTypes";
import {
  AppPauseIcon,
  AppPlayStartIcon,
  AppSquareStopIcon,
  LucideSpinner,
  lucidePrimeBtnIcon,
} from "../icons/lucide";
import { workOrderStatusAllowsFeedbackTab } from "./workOrderStatus";
import type { WorkOrder } from "./workOrderTypes";

export type WorkOrderBigMenuHandlers = {
  onAskAthene: (row: WorkOrder) => void;
  atheneBusy: boolean;
  onCreate: () => void;
  onCopy: (row: WorkOrder) => void;
  onFollowUpOrder: (row: WorkOrder) => void;
  onEdit: (row: WorkOrder) => void;
  onDelete: (row: WorkOrder) => void;
  onStart: (row: WorkOrder) => void;
  onStop: (row: WorkOrder) => void;
  onPause: (row: WorkOrder) => void;
  onAssignEmployees: (row: WorkOrder) => void;
  onCreateFeedback: (row: WorkOrder) => void;
  onCloseOrder: (row: WorkOrder) => void;
  onCancelOrder: (row: WorkOrder) => void;
  onPrint?: (row: WorkOrder) => void;
  /** When set, subscribe/unsubscribe is enabled (Monitoring). */
  subscription?: {
    isSubscribed: (workOrderId: string) => boolean;
    onToggle: (row: WorkOrder) => void;
  };
};

export type WorkOrderBigMenuModel = {
  header: string | null;
  cornerAction: BigMenuItem;
  sections: BigMenuSection[];
};

function canStartStatus(status: WorkOrder["status"]): boolean {
  return status === "open" || status === "assigned" || status === "paused";
}

function canStopPauseStatus(status: WorkOrder["status"]): boolean {
  return status === "started" || status === "continued";
}

export function buildWorkOrderBigMenuModel(
  row: WorkOrder | null,
  t: TFunction,
  handlers: WorkOrderBigMenuHandlers,
): WorkOrderBigMenuModel {
  const hasRow = row != null;
  const canStart = hasRow && canStartStatus(row.status);
  const canStopPause = hasRow && canStopPauseStatus(row.status);
  const canOpenFeedbackTab = hasRow && workOrderStatusAllowsFeedbackTab(row.status);
  const canClose = hasRow && row.status === "ended";
  const canCancel =
    hasRow && row.status !== "ended" && row.status !== "done" && row.status !== "cancelled";
  const canAssign =
    hasRow && row.status !== "ended" && row.status !== "done" && row.status !== "cancelled";
  const canCopyOrFollowUp = hasRow && Boolean(row.workgroupId);
  const isSubscribed = hasRow && handlers.subscription ? handlers.subscription.isSubscribed(row.id) : false;

  const cornerAction: BigMenuItem = {
    id: "ask-athene",
    label: t("assistant.askAthene"),
    className: "app-context-menu-athene",
    icon: handlers.atheneBusy ? (
      <LucideSpinner className={lucidePrimeBtnIcon} strokeWidth={1.75} />
    ) : (
      <Star className={lucidePrimeBtnIcon} strokeWidth={1.75} />
    ),
    disabled: !hasRow || handlers.atheneBusy,
    onSelect: () => {
      if (row) handlers.onAskAthene(row);
    },
  };

  const row1: BigMenuSection = {
    id: "row1",
    variant: "primary",
    items: [
      {
        id: "start",
        label: t("workOrders.start"),
        icon: <AppPlayStartIcon />,
        disabled: !canStart,
        onSelect: () => {
          if (row) handlers.onStart(row);
        },
      },
      {
        id: "stop",
        label: t("workOrders.stop"),
        icon: <AppSquareStopIcon />,
        className: "app-big-context-menu__action--stop",
        disabled: !canStopPause,
        onSelect: () => {
          if (row) handlers.onStop(row);
        },
      },
      {
        id: "pause",
        label: t("workOrders.pause"),
        icon: <AppPauseIcon />,
        className: "app-big-context-menu__action--pause",
        disabled: !canStopPause,
        onSelect: () => {
          if (row) handlers.onPause(row);
        },
      },
      {
        id: "feedback",
        label: t("workOrders.bigMenu.feedback"),
        icon: <Send className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canOpenFeedbackTab,
        onSelect: () => {
          if (row) handlers.onCreateFeedback(row);
        },
      },
    ],
  };

  const row2: BigMenuSection = {
    id: "row2",
    variant: "primary",
    items: [
      {
        id: "follow-up",
        label: t("workOrders.contextMenuFollowUpOrder"),
        icon: <Copy className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canCopyOrFollowUp,
        onSelect: () => {
          if (row?.workgroupId) handlers.onFollowUpOrder(row);
        },
      },
      {
        id: "edit",
        label: t("workOrders.edit"),
        icon: <Pencil className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow,
        onSelect: () => {
          if (row) handlers.onEdit(row);
        },
      },
      {
        id: "print",
        label: t("workOrders.print"),
        icon: <Printer className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow || !handlers.onPrint,
        onSelect: () => {
          if (row && handlers.onPrint) handlers.onPrint(row);
        },
      },
      {
        id: "assign",
        label: t("workOrders.bigMenu.assign"),
        icon: <UserPlus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canAssign,
        onSelect: () => {
          if (row) handlers.onAssignEmployees(row);
        },
      },
      {
        id: "subscribe",
        label: isSubscribed ? t("workOrders.bigMenu.unsubscribe") : t("workOrders.bigMenu.subscribe"),
        icon: isSubscribed ? (
          <BellOff className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ) : (
          <Bell className={lucidePrimeBtnIcon} strokeWidth={1.75} />
        ),
        disabled: !hasRow || !handlers.subscription,
        onSelect: () => {
          if (row && handlers.subscription) handlers.subscription.onToggle(row);
        },
      },
    ],
  };

  const editSection: BigMenuSection = {
    id: "edit-actions",
    title: t("workOrders.bigMenu.sectionEdit"),
    variant: "column",
    items: [
      {
        id: "new",
        label: t("workOrders.new"),
        icon: <Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        onSelect: () => handlers.onCreate(),
      },
      {
        id: "copy",
        label: t("workOrders.contextMenuCopyOrder"),
        icon: <Copy className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canCopyOrFollowUp,
        onSelect: () => {
          if (row?.workgroupId) handlers.onCopy(row);
        },
      },
    ],
  };

  const statusSection: BigMenuSection = {
    id: "status",
    title: t("workOrders.bigMenu.sectionStatus"),
    variant: "column",
    items: [
      {
        id: "close",
        label: t("workOrders.bigMenu.close"),
        icon: <CheckCircle className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canClose,
        onSelect: () => {
          if (row) handlers.onCloseOrder(row);
        },
      },
      {
        id: "cancel",
        label: t("workOrders.bigMenu.cancel"),
        icon: <CircleX className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !canCancel,
        danger: true,
        onSelect: () => {
          if (row) handlers.onCancelOrder(row);
        },
      },
      {
        id: "delete",
        label: t("workOrders.delete"),
        icon: <Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />,
        disabled: !hasRow,
        danger: true,
        onSelect: () => {
          if (row) handlers.onDelete(row);
        },
      },
    ],
  };

  return {
    header: hasRow ? `#${row.orderNumber} · ${row.name}` : null,
    cornerAction,
    sections: [row1, row2, statusSection, editSection],
  };
}
