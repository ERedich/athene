import { Sidebar } from "primereact/sidebar";
import { useTranslation } from "react-i18next";

import { AssetSelectionBrowser } from "../assets/AssetSelectionBrowser";
import type { WorkOrderReferenceAsset } from "../../lib/workOrderTypes";

type AssetSelectionDrawerProps = {
  visible: boolean;
  onHide: () => void;
  onSelect: (asset: WorkOrderReferenceAsset) => void;
  /** When set, only assets for this site are listed. */
  siteId?: string;
  /** When set, only these asset ids are listed (e.g. header-asset subtree). */
  allowedAssetIds?: Set<string> | null;
};

export function AssetSelectionDrawer({
  visible,
  onHide,
  onSelect,
  siteId,
  allowedAssetIds = null,
}: AssetSelectionDrawerProps) {
  const { t } = useTranslation();

  return (
    <Sidebar
      visible={visible}
      position="right"
      onHide={onHide}
      modal
      dismissable
      className="app-wo-search-sidebar !w-[min(70vw,56rem)] max-w-none"
      appendTo={typeof document !== "undefined" ? document.body : undefined}
      header={t("selItem.asset.drawerTitle")}
      pt={{
        header: { className: "app-wo-search-sidebar-header" },
        content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
      }}
    >
      {visible ? (
        <AssetSelectionBrowser
          siteId={siteId}
          allowedAssetIds={allowedAssetIds}
          onSelect={(asset) => {
            onSelect(asset);
            onHide();
          }}
          onCancel={onHide}
        />
      ) : null}
    </Sidebar>
  );
}
