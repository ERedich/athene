import { useMemo } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";

import { AppDialog } from "../AppDialog";
import {
  getFieldCatalog,
  resolveColumnWidget,
  type AppLayoutAppKey,
  type ContextMenuLayoutPayload,
  type ModalColumnDef,
  type ModalLayoutPayload,
  type TableLayoutPayload,
} from "../../lib/layoutEditor/types";
import { storageToCheckbox, storageToDate } from "../../lib/layoutEditor/dynamicFieldValue";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../../lib/siteColor";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

export type LayoutPreviewProps = {
  visible: boolean;
  onHide: () => void;
  layoutName: string;
  appKey: string;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  sites: { id: string; key: string; name: string; colorHex: string }[];
};

function sampleRows(appKey: string, sites: LayoutPreviewProps["sites"]) {
  const site = sites[0];
  if (appKey === "suppliers") {
    return [
      {
        id: "1",
        key: "EY-LIEF-0001",
        name: "Beispiel Lieferant GmbH",
        customerNumber: "KD-100245",
        address: "Musterstraße 1, 12345 Stadt",
        phone: "+49 123 456789",
        email: "einkauf@beispiel.example",
        siteId: site?.id ?? "",
        siteName: site?.name ?? "Demo",
        siteColorHex: site?.colorHex ?? DEFAULT_SITE_COLOR_HEX,
        isActive: true,
        dynamicField0: "Demo",
        createdAt: "2026-01-15T10:30:00.000Z",
        createdBy: "admin",
        updatedAt: "2026-03-02T14:12:00.000Z",
        updatedBy: "admin",
      },
    ];
  }
  return [];
}

export function LayoutPreviewDialog({
  visible,
  onHide,
  layoutName,
  appKey,
  modal,
  sites,
}: LayoutPreviewProps) {
  const { t } = useTranslation();
  const catalog = useMemo(() => getFieldCatalog(appKey as AppLayoutAppKey), [appKey]);
  const rows = useMemo(() => sampleRows(appKey, sites), [appKey, sites]);

  const siteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const fieldLabel = (fieldKey: string) => {
    const def = catalog.find((f) => f.fieldKey === fieldKey);
    return def ? t(def.labelKey) : fieldKey;
  };

  const displayLabel = (col: Pick<ModalColumnDef, "fieldKey" | "label">) => {
    const custom = col.label?.trim();
    if (custom) return custom;
    if (col.fieldKey) return fieldLabel(col.fieldKey);
    return "";
  };

  const sample = rows[0];

  const renderModalField = (col: ModalColumnDef) => {
    if (!col.fieldKey) return null;
    const fieldKey = col.fieldKey;
    const widget = resolveColumnWidget(col, catalog);
    const value = sample ? (sample as Record<string, unknown>)[fieldKey] : "";
    const label = displayLabel(col);

    if (widget === "checkbox") {
      return (
        <label className="flex cursor-default items-center gap-3">
          <Checkbox
            checked={typeof value === "boolean" ? value : storageToCheckbox(value)}
            disabled
            readOnly
          />
          <span className="text-[11px] uppercase tracking-wide text-on-surface-variant">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </span>
        </label>
      );
    }

    if (widget === "siteDropdown") {
      return (
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wide text-outline">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Dropdown
            value={typeof value === "string" ? value : siteOptions[0]?.value}
            options={siteOptions}
            disabled
            className="w-full app-inline-icon-dropdown"
            appendTo={overlayAppendTo}
            itemTemplate={(option: { label: string; value: string }) => {
              const site = sites.find((s) => s.id === option.value);
              const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
              return (
                <span style={{ color: readableSiteColor(hex) }}>{option.label}</span>
              );
            }}
          />
        </div>
      );
    }

    if (widget === "datetime") {
      return (
        <div className="space-y-1.5">
          <label className="block text-[11px] uppercase tracking-wide text-outline">
            {label}
            {col.required ? <span className="app-required-marker">*</span> : null}
          </label>
          <Calendar
            value={storageToDate(value)}
            disabled
            showTime
            hourFormat="24"
            className="w-full"
            inputClassName="w-full"
            appendTo={overlayAppendTo}
          />
        </div>
      );
    }

    return (
      <div className="space-y-1.5">
        <label className="block text-[11px] uppercase tracking-wide text-outline">
          {label}
          {col.required ? <span className="app-required-marker">*</span> : null}
        </label>
        <InputText
          value={value == null ? "" : String(value)}
          className="w-full"
          disabled={col.readonly}
          readOnly
          type={widget === "email" ? "email" : "text"}
        />
      </div>
    );
  };

  const hasVisibleFields = modal.rows.some((r) =>
    r.columns.some((c) => c.visible && c.kind !== "spacer" && c.fieldKey),
  );

  return (
    <AppDialog
      header={
        layoutName
          ? t("layoutEditor.previewTitle", { name: layoutName })
          : t("layoutEditor.previewModalDialogTitle")
      }
      visible={visible}
      onHide={onHide}
      style={{ width: "min(32rem, 95vw)" }}
      modal
      dismissableMask
      draggable={false}
      resizable={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            label={t("layoutEditor.cancel")}
            severity="secondary"
            outlined
            onClick={onHide}
          />
          <Button
            type="button"
            label={t("layoutEditor.save")}
            disabled
            icon={<Check className="h-4 w-4" strokeWidth={1.75} />}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4 pt-1">
        {modal.rows.map((row) => (
          <div key={row.id} className="grid grid-cols-12 gap-3">
            {row.columns
              .filter((col) => col.visible && (col.kind === "spacer" || col.fieldKey))
              .map((col) => (
                <div
                  key={col.id}
                  style={{
                    gridColumn: `span ${Math.min(12, Math.max(1, col.span))} / span ${Math.min(12, Math.max(1, col.span))}`,
                  }}
                >
                  {col.kind === "spacer" ? <div aria-hidden /> : renderModalField(col)}
                </div>
              ))}
          </div>
        ))}
        {!hasVisibleFields && (
          <p className="m-0 text-sm text-on-surface-variant">
            {t("layoutEditor.previewModalEmpty")}
          </p>
        )}
      </div>
    </AppDialog>
  );
}
