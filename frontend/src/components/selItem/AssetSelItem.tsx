import { useCallback, useRef, useState, type FocusEvent } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/AuthContext";
import { APP_PARAM_KEY_ALLOW_SITE_CHANGE } from "../../lib/appParameterKeys";
import { lookupAssetByKey } from "../../lib/assetLookupApi";
import type { WorkOrderReferenceAsset } from "../../lib/workOrderTypes";
import { AssetSelectionDrawer } from "./AssetSelectionDrawer";
import { SelItem } from "./SelItem";

export type AssetSelItemProps = {
  inputId?: string;
  /** Selected asset id (UUID), empty when none / invalid. */
  assetId: string;
  /** Display key in the input (controlled). */
  assetKey: string;
  onSelect: (asset: WorkOrderReferenceAsset | null) => void;
  onAssetKeyChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** When true, parent can force invalid styling (e.g. required on save). */
  forceInvalid?: boolean;
  /** When set, only assets belonging to this site are accepted (lookup + drawer). */
  siteId?: string;
  /**
   * When set, only these asset ids are accepted (lookup + drawer).
   * Used e.g. to restrict activity assets to a header-asset subtree.
   */
  allowedAssetIds?: Set<string> | null;
};

/**
 * Asset selection item: direct key entry with blur validation + picker drawer.
 */
export function AssetSelItem({
  inputId,
  assetId,
  assetKey,
  onSelect,
  onAssetKeyChange,
  disabled = false,
  placeholder,
  className,
  forceInvalid = false,
  siteId,
  allowedAssetIds = null,
}: AssetSelItemProps) {
  const { t } = useTranslation();
  const { user, appParameterBooleans } = useAuth();
  const siteFieldLocked = !appParameterBooleans[APP_PARAM_KEY_ALLOW_SITE_CHANGE];

  const [invalid, setInvalid] = useState(false);
  const [validating, setValidating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const assetIdRef = useRef(assetId);
  assetIdRef.current = assetId;
  const validateSeq = useRef(0);

  const acceptAsset = useCallback(
    (asset: WorkOrderReferenceAsset) => {
      if (siteFieldLocked && asset.siteId !== user.workingSiteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      if (siteId && asset.siteId !== siteId) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      if (allowedAssetIds != null && !allowedAssetIds.has(asset.id)) {
        setInvalid(true);
        onSelect(null);
        return false;
      }
      setInvalid(false);
      onAssetKeyChange(asset.key);
      onSelect(asset);
      return true;
    },
    [
      allowedAssetIds,
      onAssetKeyChange,
      onSelect,
      siteFieldLocked,
      siteId,
      user.workingSiteId,
    ],
  );

  const validateKey = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const seq = ++validateSeq.current;
      if (!trimmed) {
        setInvalid(false);
        if (assetIdRef.current) onSelect(null);
        onAssetKeyChange("");
        return;
      }
      setValidating(true);
      try {
        const asset = await lookupAssetByKey(trimmed);
        if (seq !== validateSeq.current) return;
        if (!asset) {
          setInvalid(true);
          onSelect(null);
          onAssetKeyChange(trimmed);
          return;
        }
        acceptAsset(asset);
      } catch {
        if (seq !== validateSeq.current) return;
        setInvalid(true);
        onSelect(null);
        onAssetKeyChange(trimmed);
      } finally {
        if (seq === validateSeq.current) setValidating(false);
      }
    },
    [acceptAsset, onAssetKeyChange, onSelect],
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
      onAssetKeyChange(value);
      if (assetIdRef.current) onSelect(null);
    },
    [onAssetKeyChange, onSelect],
  );

  return (
    <>
      <SelItem
        inputId={inputId}
        value={assetKey}
        onChange={onChange}
        onBlur={onBlur}
        onOpenPicker={() => setDrawerOpen(true)}
        invalid={invalid || forceInvalid}
        disabled={disabled || validating}
        placeholder={placeholder}
        className={className}
        pickerAriaLabel={t("selItem.asset.openPicker")}
      />
      <AssetSelectionDrawer
        visible={drawerOpen}
        onHide={() => setDrawerOpen(false)}
        siteId={siteId}
        allowedAssetIds={allowedAssetIds}
        onSelect={(asset) => {
          acceptAsset(asset);
        }}
      />
    </>
  );
}
