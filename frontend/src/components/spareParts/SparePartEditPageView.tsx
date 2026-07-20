import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "primereact/button";

import { SparePartEditFooter } from "./SparePartEditSurface";
import { lucidePrimeBtnIcon } from "../../icons/lucide";

type SparePartEditPageViewProps = {
  title: string;
  backLabel: string;
  backAriaLabel: string;
  saveLabel: string;
  saving: boolean;
  documentsUploading: boolean;
  onClose: () => void;
  onSave: () => void;
  onShow?: () => void;
  activeTabIndex: number;
  children: ReactNode;
  extraDialogs?: ReactNode;
};

export function SparePartEditPageView({
  title,
  backLabel,
  backAriaLabel,
  saveLabel,
  saving,
  documentsUploading,
  onClose,
  onSave,
  onShow,
  activeTabIndex,
  children,
  extraDialogs,
}: SparePartEditPageViewProps) {
  useLayoutEffect(() => {
    onShow?.();
  }, [onShow, activeTabIndex]);

  useEffect(() => {
    const id = requestAnimationFrame(() => onShow?.());
    return () => cancelAnimationFrame(id);
  }, [onShow, activeTabIndex]);

  return (
    <>
      <div className="app-wo-edit-page-view app-sp-edit-page-view flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden">
        <header className="app-wo-edit-page-view__header flex shrink-0 items-center gap-3 border-b border-solid app-wo-detail-outline-border px-1 py-2">
          <Button
            type="button"
            text
            rounded
            className="!h-9 !min-h-9 !w-9 !min-w-9 !p-0 shrink-0"
            icon={<ArrowLeft className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            aria-label={backAriaLabel}
            title={backLabel}
            onClick={onClose}
          />
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-lg font-medium text-on-surface">{title}</h1>
          </div>
        </header>

        <div className="app-wo-edit-page-view__body min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>

        <footer className="app-wo-edit-page-view__footer shrink-0 border-t border-solid app-wo-detail-outline-border px-4 py-3">
          <SparePartEditFooter
            cancelLabel={backLabel}
            saveLabel={saveLabel}
            saving={saving}
            documentsUploading={documentsUploading}
            onCancel={onClose}
            onSave={onSave}
          />
        </footer>
      </div>
      {extraDialogs}
    </>
  );
}
