import { useCallback, useRef, useState, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import {
  lookupWorkOrderByOrderNumber,
  type WorkOrderLookupResult,
} from "../../lib/workOrderLookupApi";
import { WorkOrderSelectionDrawer } from "./WorkOrderSelectionDrawer";
import { SelItem } from "./SelItem";

export type WorkOrderSelItemProps = {
  inputId?: string;
  workOrderId: string;
  /** Display order number in the input (controlled, as string). */
  orderNumberDisplay: string;
  onSelect: (workOrder: WorkOrderLookupResult | null) => void;
  onOrderNumberChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  forceInvalid?: boolean;
  siteId?: string;
};

/**
 * Work order selection: order-number entry with blur validation + picker drawer.
 */
export function WorkOrderSelItem({
  inputId,
  workOrderId,
  orderNumberDisplay,
  onSelect,
  onOrderNumberChange,
  disabled = false,
  placeholder,
  className,
  forceInvalid = false,
  siteId,
}: WorkOrderSelItemProps) {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [invalid, setInvalid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const workOrderIdRef = useRef(workOrderId);
  workOrderIdRef.current = workOrderId;
  const validateSeq = useRef(0);

  const acceptWorkOrder = useCallback(
    (workOrder: WorkOrderLookupResult) => {
      if (siteFieldLocked && workOrder.siteId !== user.workingSiteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      if (siteId && workOrder.siteId !== siteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      setInvalid(false);
      onOrderNumberChange(String(workOrder.orderNumber));
      onSelect(workOrder);
      return true;
    },
    [onOrderNumberChange, onSelect, siteFieldLocked, siteId, user.workingSiteId],
  );

  const validateKey = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const seq = ++validateSeq.current;
      if (!trimmed) {
        setInvalid(false);
        if (workOrderIdRef.current) onSelect(null);
        onOrderNumberChange("");
        return;
      }
      setValidating(true);
      try {
        const workOrder = await lookupWorkOrderByOrderNumber(trimmed, { siteId });
        if (seq !== validateSeq.current) return;
        if (!workOrder) {
          setInvalid(true);
          onSelect(null);
          onOrderNumberChange(trimmed);
          return;
        }
        acceptWorkOrder(workOrder);
      } catch {
        if (seq !== validateSeq.current) return;
        setInvalid(true);
        onSelect(null);
        onOrderNumberChange(trimmed);
      } finally {
        if (seq === validateSeq.current) setValidating(false);
      }
    },
    [acceptWorkOrder, onOrderNumberChange, onSelect, siteId],
  );

  const onBlur = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      void validateKey(e.target.value);
    },
    [validateKey],
  );

  const onChange = useCallback(
    (value: string) => {
      setInvalid(false);
      onOrderNumberChange(value);
      if (workOrderIdRef.current) onSelect(null);
    },
    [onOrderNumberChange, onSelect],
  );

  return (
    <>
      <SelItem
        inputId={inputId}
        value={orderNumberDisplay}
        onChange={onChange}
        onBlur={onBlur}
        onOpenPicker={() => setDrawerOpen(true)}
        invalid={invalid || forceInvalid}
        disabled={disabled || validating}
        placeholder={placeholder}
        className={className}
        pickerAriaLabel={t("selItem.workOrder.openPicker")}
      />
      <WorkOrderSelectionDrawer
        visible={drawerOpen}
        onHide={() => setDrawerOpen(false)}
        siteId={siteId}
        onSelect={(workOrder) => {
          acceptWorkOrder(workOrder);
        }}
      />
    </>
  );
}
