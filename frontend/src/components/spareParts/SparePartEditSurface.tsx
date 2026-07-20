import type { ReactNode, Ref } from "react";
import { Check } from "lucide-react";
import { Button } from "primereact/button";

import { lucidePrimeBtnIcon } from "../../icons/lucide";

type SparePartEditFooterProps = {
  cancelLabel: string;
  saveLabel: string;
  saving: boolean;
  documentsUploading: boolean;
  onCancel: () => void;
  onSave: () => void;
};

export function SparePartEditFooter({
  cancelLabel,
  saveLabel,
  saving,
  documentsUploading,
  onCancel,
  onSave,
}: SparePartEditFooterProps) {
  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        label={cancelLabel}
        severity="secondary"
        outlined
        disabled={saving || documentsUploading}
        onClick={onCancel}
      />
      <Button
        type="button"
        label={saveLabel}
        icon={<Check className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
        loading={saving || documentsUploading}
        disabled={documentsUploading}
        onClick={onSave}
      />
    </div>
  );
}

type SparePartEditTabHostProps = {
  tabHostRef: Ref<HTMLDivElement>;
  children: ReactNode;
};

/** Tab host wrapper used by fullscreen (and formerly modal) spare-part edit. */
export function SparePartEditTabHost({ tabHostRef, children }: SparePartEditTabHostProps) {
  return (
    <div ref={tabHostRef} className="app-tabview-with-ink app-sp-edit-tab-host">
      {children}
    </div>
  );
}
