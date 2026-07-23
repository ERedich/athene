import { useMemo } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { MultiSelect } from "primereact/multiselect";

import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  getFieldCatalog,
  type AppLayoutAppKey,
  type TableColumnDef,
  type TableFrozen,
  type TableLayoutPayload,
} from "../../lib/layoutEditor/types";

type Props = {
  appKey: string;
  value: TableLayoutPayload;
  onChange: (next: TableLayoutPayload) => void;
  readOnly?: boolean;
};

const FREEZE_OPTIONS: { labelKey: string; value: TableFrozen }[] = [
  { labelKey: "layoutEditor.freezeNone", value: false },
  { labelKey: "layoutEditor.freezeLeft", value: "left" },
  { labelKey: "layoutEditor.freezeRight", value: "right" },
];

export function LayoutTableEditorPanel({ appKey, value, onChange, readOnly = false }: Props) {
  const { t } = useTranslation();
  const catalog = useMemo(() => getFieldCatalog(appKey as AppLayoutAppKey), [appKey]);

  const used = useMemo(() => new Set(value.columns.map((c) => c.fieldKey)), [value.columns]);

  const available = useMemo(
    () => catalog.filter((f) => f.allowedIn.includes("table") && !used.has(f.fieldKey)),
    [catalog, used],
  );

  const fieldLabel = (fieldKey: string) => {
    const def = catalog.find((f) => f.fieldKey === fieldKey);
    return def ? t(def.labelKey) : fieldKey;
  };

  const updateColumns = (columns: TableColumnDef[]) =>
    onChange({ ...value, version: 1, columns });

  const move = (index: number, dir: -1 | 1) => {
    if (readOnly) return;
    const next = [...value.columns];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    updateColumns(next);
  };

  const patch = (index: number, patchVal: Partial<TableColumnDef>) => {
    if (readOnly) return;
    updateColumns(
      value.columns.map((col, i) => (i === index ? { ...col, ...patchVal } : col)),
    );
  };

  const remove = (index: number) => {
    if (readOnly) return;
    const removed = value.columns[index]?.fieldKey;
    const columns = value.columns.filter((_, i) => i !== index);
    onChange({
      version: 1,
      columns,
      sort: value.sort.filter((s) => s.fieldKey !== removed),
      groupBy: value.groupBy.filter((g) => g !== removed),
    });
  };

  const addColumn = (fieldKey: string) => {
    if (readOnly || !fieldKey) return;
    updateColumns([
      ...value.columns,
      {
        fieldKey,
        width: null,
        visible: true,
        sortable: true,
        frozen: false,
      },
    ]);
  };

  const previewRows = useMemo(() => [{}], []);

  const sortFieldOptions = value.columns.map((c) => ({
    label: fieldLabel(c.fieldKey),
    value: c.fieldKey,
  }));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-auto">
      <div className="rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-medium text-on-surface">{t("layoutEditor.tableColumns")}</h3>
          {!readOnly && available.length > 0 && (
            <Dropdown
              value={null}
              options={available.map((f) => ({ label: t(f.labelKey), value: f.fieldKey }))}
              onChange={(e) => {
                if (e.value) addColumn(String(e.value));
              }}
              placeholder={t("layoutEditor.addColumn")}
              className="w-56"
              appendTo={overlayAppendTo}
            />
          )}
        </div>

        <div className="flex flex-col gap-2">
          {value.columns.map((col, index) => (
            <div
              key={col.fieldKey}
              className="grid grid-cols-1 items-center gap-2 rounded-sm border border-outline-variant/30 bg-surface px-2 py-2 md:grid-cols-[auto_minmax(8rem,1fr)_5rem_7rem_auto_auto_auto]"
            >
              <div className="flex gap-1">
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container"
                  disabled={readOnly || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t("layoutEditor.moveUp")}
                >
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-on-surface-variant hover:bg-surface-container"
                  disabled={readOnly || index === value.columns.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t("layoutEditor.moveDown")}
                >
                  <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              </div>
              <span className="truncate text-sm text-on-surface" title={fieldLabel(col.fieldKey)}>
                {fieldLabel(col.fieldKey)}
              </span>
              <InputNumber
                value={col.width}
                onValueChange={(e) =>
                  patch(index, {
                    width: typeof e.value === "number" && e.value > 0 ? Math.round(e.value) : null,
                  })
                }
                placeholder={t("layoutEditor.widthAuto")}
                disabled={readOnly}
                className="w-full"
                inputClassName="w-full"
                min={40}
                max={800}
              />
              <Dropdown
                value={col.frozen}
                options={FREEZE_OPTIONS.map((o) => ({ label: t(o.labelKey), value: o.value }))}
                onChange={(e) => patch(index, { frozen: e.value as TableFrozen })}
                disabled={readOnly}
                className="w-full"
                appendTo={overlayAppendTo}
              />
              <label className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
                <Checkbox
                  checked={col.sortable}
                  onChange={(e) => patch(index, { sortable: Boolean(e.checked) })}
                  disabled={readOnly}
                />
                {t("layoutEditor.sortable")}
              </label>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1 rounded-sm px-2 text-xs text-on-surface-variant hover:bg-surface-container"
                disabled={readOnly}
                onClick={() => patch(index, { visible: !col.visible })}
              >
                {col.visible ? (
                  <Eye className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                {col.visible ? t("layoutEditor.visible") : t("layoutEditor.hidden")}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-red-500/10 hover:text-red-500"
                  onClick={() => remove(index)}
                  aria-label={t("layoutEditor.removeColumn")}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                </button>
              )}
            </div>
          ))}
          {value.columns.length === 0 && (
            <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.tableEmpty")}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
          <h3 className="mb-2 mt-0 text-sm font-medium text-on-surface">{t("layoutEditor.sortRules")}</h3>
          <div className="flex flex-col gap-2">
            {value.sort.map((s, index) => (
              <div key={`${s.fieldKey}-${index}`} className="flex items-center gap-2">
                <Dropdown
                  value={s.fieldKey}
                  options={sortFieldOptions}
                  onChange={(e) => {
                    if (readOnly) return;
                    const sort = value.sort.map((item, i) =>
                      i === index ? { ...item, fieldKey: String(e.value) } : item,
                    );
                    onChange({ ...value, sort });
                  }}
                  disabled={readOnly}
                  className="min-w-0 flex-1"
                  appendTo={overlayAppendTo}
                />
                <Dropdown
                  value={s.order}
                  options={[
                    { label: t("layoutEditor.sortAsc"), value: 1 },
                    { label: t("layoutEditor.sortDesc"), value: -1 },
                  ]}
                  onChange={(e) => {
                    if (readOnly) return;
                    const sort = value.sort.map((item, i) =>
                      i === index ? { ...item, order: e.value as 1 | -1 } : item,
                    );
                    onChange({ ...value, sort });
                  }}
                  disabled={readOnly}
                  className="w-32"
                  appendTo={overlayAppendTo}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-on-surface-variant hover:bg-red-500/10 hover:text-red-500"
                    onClick={() =>
                      onChange({
                        ...value,
                        sort: value.sort.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            ))}
            {!readOnly && value.columns.length > 0 && (
              <Button
                type="button"
                size="small"
                outlined
                label={t("layoutEditor.addSort")}
                icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
                onClick={() =>
                  onChange({
                    ...value,
                    sort: [...value.sort, { fieldKey: value.columns[0]!.fieldKey, order: 1 }],
                  })
                }
              />
            )}
          </div>
        </div>

        <div className="rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
          <h3 className="mb-2 mt-0 text-sm font-medium text-on-surface">{t("layoutEditor.groupBy")}</h3>
          <MultiSelect
            value={value.groupBy}
            options={sortFieldOptions}
            onChange={(e) => {
              if (readOnly) return;
              onChange({ ...value, groupBy: (e.value as string[]) ?? [] });
            }}
            disabled={readOnly}
            placeholder={t("layoutEditor.groupByPlaceholder")}
            className="w-full"
            display="chip"
            appendTo={overlayAppendTo}
          />
        </div>
      </div>

      <div className="flex min-h-[12rem] flex-col rounded-sm border border-outline-variant/40 bg-surface-container-lowest p-3">
        <h3 className="mb-2 mt-0 text-sm font-medium text-on-surface">{t("layoutEditor.tablePreview")}</h3>
        <DataTable
          className="app-data-table w-full"
          value={previewRows}
          dataKey="__preview"
          showGridlines
          stripedRows
          scrollable
          scrollHeight="14rem"
          emptyMessage={t("layoutEditor.previewEmpty")}
        >
          {value.columns
            .filter((c) => c.visible)
            .map((col) => (
              <Column
                key={col.fieldKey}
                field={col.fieldKey}
                header={fieldLabel(col.fieldKey)}
                sortable={col.sortable}
                style={col.width ? { width: `${col.width}px` } : undefined}
                frozen={col.frozen === "left" || col.frozen === "right"}
                alignFrozen={col.frozen === "right" ? "right" : "left"}
              />
            ))}
        </DataTable>
      </div>
    </div>
  );
}
