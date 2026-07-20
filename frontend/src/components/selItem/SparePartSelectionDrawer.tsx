import { Sidebar } from "primereact/sidebar";
import { useTranslation } from "react-i18next";

import { SparePartSelectionBrowser } from "../spareParts/SparePartSelectionBrowser";
import type { SparePartLookupResult } from "../../lib/sparePartLookupApi";

type SparePartSelectionDrawerProps = {
  visible: boolean;
  onHide: () => void;
  onSelect: (sparePart: SparePartLookupResult) => void;
  /** When set, only spare parts for this site are listed. */
  siteId?: string;
};

export function SparePartSelectionDrawer({
  visible,
  onHide,
  onSelect,
  siteId,
}: SparePartSelectionDrawerProps) {
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
      header={t("selItem.sparePart.drawerTitle")}
      pt={{
        header: { className: "app-wo-search-sidebar-header" },
        content: { className: "app-wo-search-sidebar-content flex min-h-0 flex-1 flex-col p-0" },
      }}
    >
      {visible ? (
        <SparePartSelectionBrowser
          siteId={siteId}
          onSelect={(sparePart) => {
            onSelect(sparePart);
            onHide();
          }}
          onCancel={onHide}
        />
      ) : null}
    </Sidebar>
  );
}
