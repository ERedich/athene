import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { FileText, Type, Trash2 } from "lucide-react";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  newElementId,
  type ReportDataMode,
  type ReportLayout,
  type ReportOrientation,
  type ReportPageSize,
  type ReportQueryDefinition,
  type ReportTextAlign,
  type ReportTextElement,
  type ReportFontWeight,
} from "../../lib/reportDesignerApi";
import { ReportCanvas } from "./ReportCanvas";

type Props = {
  layout: ReportLayout;
  query: ReportQueryDefinition;
  sampleRow: Record<string, unknown> | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: ReportLayout) => void;
};

export function ReportDesignStep({
  layout,
  query,
  sampleRow,
  selectedId,
  onSelect,
  onChange,
}: Props) {
  const { t } = useTranslation();

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;

  const pageSizeOptions = useMemo(
    () =>
      (["A4", "A5", "Letter"] as ReportPageSize[]).map((v) => ({
        label: t(`reportDesigner.pageSize.${v}`),
        value: v,
      })),
    [t],
  );

  const orientationOptions = useMemo(
    () =>
      (["portrait", "landscape"] as ReportOrientation[]).map((v) => ({
        label: t(`reportDesigner.orientation.${v}`),
        value: v,
      })),
    [t],
  );

  const dataModeOptions = useMemo(
    () =>
      (["onePagePerRow", "list"] as ReportDataMode[]).map((v) => ({
        label: t(`reportDesigner.dataMode.${v}`),
        value: v,
      })),
    [t],
  );

  const alignOptions = useMemo(
    () =>
      (["left", "center", "right"] as ReportTextAlign[]).map((v) => ({
        label: t(`reportDesigner.align.${v}`),
        value: v,
      })),
    [t],
  );

  const fieldOptions = useMemo(
    () =>
      query.fields.map((f) => ({
        label: t(`reportDesigner.field.${query.entity}.${f}`, { defaultValue: f }),
        value: f,
      })),
    [query.entity, query.fields, t],
  );

  const patchLayout = useCallback(
    (patch: Partial<ReportLayout>) => onChange({ ...layout, ...patch }),
    [layout, onChange],
  );

  const patchElement = useCallback(
    (id: string, patch: Partial<ReportTextElement>) => {
      onChange({
        ...layout,
        elements: layout.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)),
      });
    },
    [layout, onChange],
  );

  const addLabel = () => {
    const id = newElementId();
    const el: ReportTextElement = {
      id,
      type: "label",
      x: 20,
      y: 30 + layout.elements.length * 4,
      width: 60,
      height: 8,
      text: t("reportDesigner.newLabel"),
      fontSize: 11,
      fontWeight: "normal",
      align: "left",
      color: "#111827",
    };
    onChange({ ...layout, elements: [...layout.elements, el] });
    onSelect(id);
  };

  const addField = () => {
    const fieldId = query.fields[0];
    if (!fieldId) return;
    const id = newElementId();
    const el: ReportTextElement = {
      id,
      type: "field",
      x: 20,
      y: 40 + layout.elements.length * 4,
      width: 70,
      height: 8,
      fieldId,
      fontSize: 11,
      fontWeight: "normal",
      align: "left",
      color: "#111827",
    };
    onChange({ ...layout, elements: [...layout.elements, el] });
    onSelect(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    onChange({ ...layout, elements: layout.elements.filter((e) => e.id !== selected.id) });
    onSelect(null);
  };

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-auto rounded-sm bg-surface-container-low p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="small"
            outlined
            icon={<Type className="h-4 w-4" strokeWidth={1.75} />}
            label={t("reportDesigner.addLabel")}
            onClick={addLabel}
          />
          <Button
            type="button"
            size="small"
            outlined
            icon={<FileText className="h-4 w-4" strokeWidth={1.75} />}
            label={t("reportDesigner.addField")}
            disabled={query.fields.length === 0}
            onClick={addField}
          />
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldPageSize")}</span>
          <Dropdown
            value={layout.pageSize}
            options={pageSizeOptions}
            appendTo={overlayAppendTo}
            onChange={(e) => patchLayout({ pageSize: e.value as ReportPageSize })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">
            {t("reportDesigner.fieldOrientation")}
          </span>
          <Dropdown
            value={layout.orientation}
            options={orientationOptions}
            appendTo={overlayAppendTo}
            onChange={(e) => patchLayout({ orientation: e.value as ReportOrientation })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldDataMode")}</span>
          <Dropdown
            value={layout.dataMode}
            options={dataModeOptions}
            appendTo={overlayAppendTo}
            onChange={(e) => patchLayout({ dataMode: e.value as ReportDataMode })}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {(["top", "right", "bottom", "left"] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1 text-sm">
              <span className="label-sm text-on-surface-variant">
                {t(`reportDesigner.margin.${side}`)}
              </span>
              <InputNumber
                value={layout.marginMm[side]}
                min={0}
                max={80}
                onValueChange={(e) =>
                  patchLayout({
                    marginMm: {
                      ...layout.marginMm,
                      [side]: Math.max(0, Math.min(80, e.value ?? 0)),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>

        <div className="border-t border-[color-mix(in_srgb,var(--color-outline)_18%,transparent)] pt-3">
          <h3 className="m-0 mb-2 text-sm font-medium">{t("reportDesigner.elementProps")}</h3>
          {!selected ? (
            <p className="m-0 text-sm text-on-surface-variant">
              {t("reportDesigner.selectElementHint")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-xs uppercase tracking-wide text-on-surface-variant">
                {selected.type === "label"
                  ? t("reportDesigner.elementLabel")
                  : t("reportDesigner.elementField")}
              </div>
              {selected.type === "label" ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="label-sm text-on-surface-variant">
                    {t("reportDesigner.fieldText")}
                  </span>
                  <InputText
                    value={selected.text ?? ""}
                    onChange={(e) => patchElement(selected.id, { text: e.target.value })}
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="label-sm text-on-surface-variant">
                    {t("reportDesigner.fieldBind")}
                  </span>
                  <Dropdown
                    value={selected.fieldId}
                    options={fieldOptions}
                    appendTo={overlayAppendTo}
                    onChange={(e) => patchElement(selected.id, { fieldId: e.value as string })}
                  />
                </label>
              )}

              <label className="flex flex-col gap-1 text-sm">
                <span className="label-sm text-on-surface-variant">
                  {t("reportDesigner.fieldFontSize")}
                </span>
                <InputNumber
                  value={selected.fontSize}
                  min={6}
                  max={72}
                  onValueChange={(e) =>
                    patchElement(selected.id, {
                      fontSize: Math.max(6, Math.min(72, e.value ?? 11)),
                    })
                  }
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  inputId={`bold-${selected.id}`}
                  checked={selected.fontWeight === "bold"}
                  onChange={(e) =>
                    patchElement(selected.id, {
                      fontWeight: (e.checked ? "bold" : "normal") as ReportFontWeight,
                    })
                  }
                />
                <span>{t("reportDesigner.fieldBold")}</span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="label-sm text-on-surface-variant">
                  {t("reportDesigner.fieldAlign")}
                </span>
                <Dropdown
                  value={selected.align}
                  options={alignOptions}
                  appendTo={overlayAppendTo}
                  onChange={(e) =>
                    patchElement(selected.id, { align: e.value as ReportTextAlign })
                  }
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="label-sm text-on-surface-variant">
                  {t("reportDesigner.fieldColor")}
                </span>
                <InputText
                  value={selected.color}
                  onChange={(e) => patchElement(selected.id, { color: e.target.value })}
                />
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-1 text-sm">
                    <span className="label-sm text-on-surface-variant">
                      {t(`reportDesigner.geom.${key}`)}
                    </span>
                    <InputNumber
                      value={selected[key]}
                      min={key === "width" || key === "height" ? 2 : 0}
                      onValueChange={(e) =>
                        patchElement(selected.id, {
                          [key]: Math.round((e.value ?? 0) * 10) / 10,
                        })
                      }
                    />
                  </label>
                ))}
              </div>

              <Button
                type="button"
                size="small"
                severity="danger"
                text
                icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} />}
                label={t("reportDesigner.deleteElement")}
                onClick={removeSelected}
              />
            </div>
          )}
        </div>
      </aside>

      <ReportCanvas
        layout={layout}
        selectedId={selectedId}
        sampleRow={sampleRow}
        onSelect={onSelect}
        onChangeElement={patchElement}
      />
    </div>
  );
}
