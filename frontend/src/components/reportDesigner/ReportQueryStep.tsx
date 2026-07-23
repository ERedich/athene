import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";
import { Plus, Trash2 } from "lucide-react";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import type {
  ReportFilter,
  ReportFilterOp,
  ReportMeta,
  ReportQueryDefinition,
  ReportQueryResult,
  ReportSortDir,
} from "../../lib/reportDesignerApi";

type Props = {
  query: ReportQueryDefinition;
  meta: ReportMeta | null;
  preview: ReportQueryResult | null;
  previewLoading: boolean;
  onChange: (next: ReportQueryDefinition) => void;
  onPreview: () => void;
};

export function ReportQueryStep({
  query,
  meta,
  preview,
  previewLoading,
  onChange,
  onPreview,
}: Props) {
  const { t } = useTranslation();

  const entityOptions = useMemo(
    () =>
      (meta?.entities ?? []).map((e) => ({
        label: t(`reportDesigner.entity.${e.id}`),
        value: e.id,
      })),
    [meta, t],
  );

  const entityMeta = meta?.entities.find((e) => e.id === query.entity) ?? null;
  const selectableFields = entityMeta?.fields.filter((f) => f.selectable) ?? [];
  const filterableFields = entityMeta?.fields.filter((f) => f.filterable) ?? [];
  const sortableFields = entityMeta?.fields.filter((f) => f.sortable) ?? [];

  const fieldOptions = selectableFields.map((f) => ({
    label: t(`reportDesigner.field.${query.entity}.${f.id}`, { defaultValue: f.id }),
    value: f.id,
  }));

  const filterFieldOptions = filterableFields.map((f) => ({
    label: t(`reportDesigner.field.${query.entity}.${f.id}`, { defaultValue: f.id }),
    value: f.id,
  }));

  const sortFieldOptions = sortableFields.map((f) => ({
    label: t(`reportDesigner.field.${query.entity}.${f.id}`, { defaultValue: f.id }),
    value: f.id,
  }));

  const filterOpOptions = (meta?.filterOps ?? []).map((op) => ({
    label: t(`reportDesigner.filterOp.${op}`),
    value: op,
  }));

  const sortDirOptions: { label: string; value: ReportSortDir }[] = [
    { label: t("reportDesigner.sortAsc"), value: "asc" },
    { label: t("reportDesigner.sortDesc"), value: "desc" },
  ];

  const updateFilter = (index: number, patch: Partial<ReportFilter>) => {
    const filters = query.filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
    onChange({ ...query, filters });
  };

  const removeFilter = (index: number) => {
    onChange({ ...query, filters: query.filters.filter((_, i) => i !== index) });
  };

  const addFilter = () => {
    const field = filterableFields[0]?.id;
    if (!field) return;
    onChange({
      ...query,
      filters: [...query.filters, { field, op: "eq" as ReportFilterOp, value: "" }],
    });
  };

  const previewColumns = (preview?.columns ?? []).filter((c) => c !== "id");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-1">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldEntity")}</span>
          <Dropdown
            value={query.entity}
            options={entityOptions}
            appendTo={overlayAppendTo}
            onChange={(e) => {
              const entity = e.value as ReportQueryDefinition["entity"];
              const nextMeta = meta?.entities.find((x) => x.id === entity);
              onChange({
                entity,
                fields: nextMeta?.defaultFields ?? [],
                filters: [],
                sort: [
                  {
                    field: nextMeta?.defaultFields[0] ?? nextMeta?.fields[0]?.id ?? "name",
                    dir: "desc",
                  },
                ],
                rowLimit: query.rowLimit,
              });
            }}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldFields")}</span>
          <MultiSelect
            value={query.fields}
            options={fieldOptions}
            display="comma"
            appendTo={overlayAppendTo}
            filter
            onChange={(e) => onChange({ ...query, fields: (e.value as string[]) ?? [] })}
            placeholder={t("reportDesigner.fieldsPlaceholder")}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldRowLimit")}</span>
          <InputNumber
            value={query.rowLimit}
            min={1}
            max={500}
            onValueChange={(e) =>
              onChange({ ...query, rowLimit: Math.max(1, Math.min(500, e.value ?? 50)) })
            }
          />
        </label>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldSort")}</span>
          <Dropdown
            value={query.sort[0]?.field}
            options={sortFieldOptions}
            appendTo={overlayAppendTo}
            onChange={(e) =>
              onChange({
                ...query,
                sort: [{ field: e.value as string, dir: query.sort[0]?.dir ?? "desc" }],
              })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldSortDir")}</span>
          <Dropdown
            value={query.sort[0]?.dir ?? "desc"}
            options={sortDirOptions}
            appendTo={overlayAppendTo}
            onChange={(e) =>
              onChange({
                ...query,
                sort: [{ field: query.sort[0]?.field ?? sortFieldOptions[0]?.value, dir: e.value }],
              })
            }
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-sm font-medium text-on-surface">{t("reportDesigner.filters")}</h3>
          <Button
            type="button"
            text
            size="small"
            icon={<Plus className="h-4 w-4" strokeWidth={1.75} />}
            label={t("reportDesigner.addFilter")}
            onClick={addFilter}
          />
        </div>
        {query.filters.length === 0 ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("reportDesigner.filtersEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {query.filters.map((filter, index) => {
              const fieldMeta = filterableFields.find((f) => f.id === filter.field);
              const needsValue = filter.op !== "isNull";
              const isList = filter.op === "in" || filter.op === "notIn";
              return (
                <div
                  key={`filter-${index}`}
                  className="grid items-end gap-2 rounded-sm bg-surface-container-low p-2 md:grid-cols-[1fr_1fr_1.4fr_auto]"
                >
                  <Dropdown
                    value={filter.field}
                    options={filterFieldOptions}
                    appendTo={overlayAppendTo}
                    onChange={(e) => updateFilter(index, { field: e.value as string })}
                  />
                  <Dropdown
                    value={filter.op}
                    options={filterOpOptions}
                    appendTo={overlayAppendTo}
                    onChange={(e) => updateFilter(index, { op: e.value as ReportFilterOp })}
                  />
                  {needsValue ? (
                    fieldMeta?.enumValues ? (
                      <MultiSelect
                        value={
                          Array.isArray(filter.value)
                            ? filter.value
                            : filter.value
                              ? [filter.value]
                              : []
                        }
                        options={fieldMeta.enumValues.map((v) => ({ label: v, value: v }))}
                        display="comma"
                        appendTo={overlayAppendTo}
                        onChange={(e) =>
                          updateFilter(index, {
                            value: isList ? e.value : (e.value as string[])?.[0],
                            op: isList ? filter.op : "eq",
                          })
                        }
                      />
                    ) : (
                      <InputText
                        value={
                          Array.isArray(filter.value)
                            ? filter.value.join(", ")
                            : String(filter.value ?? "")
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          updateFilter(index, {
                            value: isList
                              ? raw
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              : raw,
                          });
                        }}
                        placeholder={
                          isList
                            ? t("reportDesigner.filterListPlaceholder")
                            : t("reportDesigner.filterValue")
                        }
                      />
                    )
                  ) : (
                    <div />
                  )}
                  <Button
                    type="button"
                    text
                    severity="danger"
                    icon={<Trash2 className="h-4 w-4" strokeWidth={1.75} />}
                    onClick={() => removeFilter(index)}
                    aria-label={t("reportDesigner.removeFilter")}
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-medium text-on-surface">
            {t("reportDesigner.queryPreview")}
            {preview ? ` (${preview.total})` : ""}
          </h3>
          <Button
            type="button"
            size="small"
            label={previewLoading ? t("reportDesigner.previewLoading") : t("reportDesigner.runPreview")}
            disabled={previewLoading || query.fields.length === 0}
            onClick={onPreview}
          />
        </div>
        <div className="min-h-[220px] flex-1">
          <DataTable
            value={preview?.rows ?? []}
            emptyMessage={t("reportDesigner.previewEmpty")}
            className="app-data-table w-full"
            scrollable
            scrollHeight="280px"
            size="small"
          >
            {previewColumns.map((col) => (
              <Column
                key={col}
                field={col}
                header={t(`reportDesigner.field.${query.entity}.${col}`, { defaultValue: col })}
                style={{ minWidth: "7rem" }}
              />
            ))}
          </DataTable>
        </div>
      </section>
    </div>
  );
}
