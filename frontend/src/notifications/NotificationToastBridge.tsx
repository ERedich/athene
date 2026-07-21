import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Toast, type ToastMessage } from "primereact/toast";

import { orderDialogTabs } from "../lib/workOrderDialog";
import { useWorkOrderDialog } from "../workOrders/WorkOrderDialogContext";
import {
  useWorkOrderSubscriptions,
  type WorkOrderChatNotification,
  type WorkOrderSubscriptionNotification,
} from "../workOrders/WorkOrderSubscriptionContext";

type PendingOpen = {
  workOrderId: string;
  openMessagesTab: boolean;
};

const TOAST_LIFE_MS = 9000;

function orderLabel(orderNumber: number, workOrderName: string): string {
  const name = workOrderName.trim();
  return name ? `#${orderNumber} ${name}` : `#${orderNumber}`;
}

export function NotificationToastBridge() {
  const { t } = useTranslation();
  const location = useLocation();
  const woDialog = useWorkOrderDialog();
  const { onNotificationEvent } = useWorkOrderSubscriptions();
  const toastRef = useRef<Toast>(null);
  const pendingOpensRef = useRef(new Map<string, PendingOpen>());
  const locationRef = useRef(location.pathname);
  const tRef = useRef(t);

  locationRef.current = location.pathname;
  tRef.current = t;

  useEffect(() => {
    return onNotificationEvent((message) => {
      if (locationRef.current === "/mitteilungszentrale") return;

      const toastId = message.notification.id;
      const translate = tRef.current;

      if (message.type === "subscription_notification") {
        showSubscriptionToast(toastRef.current, pendingOpensRef.current, translate, message.notification, toastId);
        return;
      }
      showChatToast(toastRef.current, pendingOpensRef.current, translate, message.notification, toastId);
    });
  }, [onNotificationEvent]);

  const onToastClick = (message: ToastMessage) => {
    const toastId = message.id;
    if (!toastId) return;
    const pending = pendingOpensRef.current.get(toastId);
    if (!pending) return;
    pendingOpensRef.current.delete(toastId);
    toastRef.current?.remove(message);
    woDialog.openEdit(
      pending.workOrderId,
      pending.openMessagesTab ? { tab: orderDialogTabs.Messages } : undefined,
    );
  };

  const onToastRemove = (message: ToastMessage) => {
    if (message.id) pendingOpensRef.current.delete(message.id);
  };

  return (
    <Toast
      ref={toastRef}
      position="top-right"
      baseZIndex={4000}
      onClick={onToastClick}
      onRemove={onToastRemove}
    />
  );
}

function showSubscriptionToast(
  toast: Toast | null,
  pendingOpens: Map<string, PendingOpen>,
  t: (key: string, options?: Record<string, string>) => string,
  notification: WorkOrderSubscriptionNotification,
  toastId: string,
) {
  const changeLabels = notification.changeKinds
    .map((kind) => t(`abonnements.changeKind.${kind}`))
    .join(", ");
  pendingOpens.set(toastId, {
    workOrderId: notification.workOrderId,
    openMessagesTab: false,
  });
  toast?.show({
    id: toastId,
    severity: "info",
    summary: t("mitteilungszentrale.toastSubscriptionSummary", {
      order: orderLabel(notification.orderNumber, notification.workOrderName),
    }),
    detail: (
      <div className="app-notification-toast-detail">
        <div>{changeLabels || t("mitteilungszentrale.kindSubscription")}</div>
        <div className="app-notification-toast-hint">{t("mitteilungszentrale.toastOpenHint")}</div>
      </div>
    ),
    life: TOAST_LIFE_MS,
    className: "app-notification-toast",
  });
}

function showChatToast(
  toast: Toast | null,
  pendingOpens: Map<string, PendingOpen>,
  t: (key: string, options?: Record<string, string>) => string,
  notification: WorkOrderChatNotification,
  toastId: string,
) {
  const preview = notification.messagePreview.trim();
  const author = notification.authorUserName.trim();
  const detailText = author
    ? preview
      ? `${author}: ${preview}`
      : author
    : preview || t("mitteilungszentrale.kindChat");
  pendingOpens.set(toastId, {
    workOrderId: notification.workOrderId,
    openMessagesTab: true,
  });
  toast?.show({
    id: toastId,
    severity: "info",
    summary: t("mitteilungszentrale.toastChatSummary", {
      order: orderLabel(notification.orderNumber, notification.workOrderName),
    }),
    detail: (
      <div className="app-notification-toast-detail">
        <div>{detailText}</div>
        <div className="app-notification-toast-hint">{t("mitteilungszentrale.toastOpenHint")}</div>
      </div>
    ),
    life: TOAST_LIFE_MS,
    className: "app-notification-toast",
  });
}
