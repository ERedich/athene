import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { MultiSelect } from "primereact/multiselect";

import { DashboardSparkCard } from "../dashboard/DashboardSparkCard";
import { resolveCustomKpiView } from "../../lib/customDashboardKpiView";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../../lib/siteColor";
import {
  defaultKpiDefinition,
  defaultKpiStyle,
  previewCustomKpi,
  type CustomKpi,
  type CustomKpiWritePayload,
  type KpiDefinition,
  type KpiEntity,
  type KpiEvaluateEntry,
  type KpiEvaluateResult,
  type KpiFilter,
  type KpiFilterOp,
  type KpiMeasureOp,
  type KpiMeta,
  type KpiStyle,
  type KpiTimePreset,
} from "../../lib/kpiBuilderApi";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type Props = {
  editing: CustomKpi | null;
  sites: SiteOption[];
  meta: KpiMeta | null;
  siteFieldLocked: boolean;
  workingSiteId: string;
  saving: boolean;
  onSave: (payload: CustomKpiWritePayload) => void;
  onValidationError: (messageKey: string) => void;
};

export type KpiEditorPanelHandle = {
  save: () => void;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  definition: KpiDefinition;
  style: KpiStyle;
};

function emptyForm(workingSiteId: string): FormState {
  return {
    key: "",
    name: "",
    siteId: workingSiteId,
    isActive: true,
    definition: defaultKpiDefinition("workOrder"),
    style: defaultKpiStyle(),
  };
}

function normalizeDefinition(definition: KpiDefinition): KpiDefinition {
  return {
    ...definition,
    measure:
      definition.measure.op === "count"
        ? { op: "count" }
        : { op: definition.measure.op, field: definition.measure.field },
    filters: definition.filters.map((f) => {
      if (f.op === "isNull") return { field: f.field, op: f.op };
      if (f.op === "in" || f.op === "notIn") {
        const raw = Array.isArray(f.value)
          ? f.value
          : typeof f.value === "string"
            ? f.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        return { field: f.field, op: f.op, value: raw };
      }
      return f;
    }),
  };
}

export const KpiEditorPanel = forwardRef<KpiEditorPanelHandle, Props>(function KpiEditorPanel(
  {
    editing,
    sites,
    meta,
    siteFieldLocked,
    workingSiteId,
    saving,
    onSave,
    onValidationError,
  },
  ref,
) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<FormState>(() => emptyForm(workingSiteId));
  const [preview, setPreview] = useState<KpiEvaluateResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const previewSeqRef = useRef(0);

  useEffect(() => {
    setPreview(null);
    setPreviewError(false);
    if (editing) {
      setForm({
        key: editing.key,
        name: editing.name,
        siteId: editing.siteId,
        isActive: editing.isActive,
        definition: {
          ...editing.definition,
          filters: editing.definition.filters ?? [],
        },
        style: { ...defaultKpiStyle(), ...editing.style },
      });
    } else {
      setForm(emptyForm(workingSiteId));
    }
  }, [editing, workingSiteId]);

  const entityMeta = useMemo(
    () => meta?.entities.find((e) => e.id === form.definition.entity) ?? null,
    [meta, form.definition.entity],
  );

  const filterableFields = entityMeta?.fields.filter((f) => f.filterable) ?? [];
  const groupableFields = entityMeta?.fields.filter((f) => f.groupable) ?? [];
  const measurableFields = entityMeta?.fields.filter((f) => f.measurable) ?? [];
  const timeableFields = entityMeta?.fields.filter((f) => f.timeable) ?? [];

  const siteOptions = useMemo(
    () => sites.map((s) => ({ label: `${s.key} - ${s.name}`, value: s.id })),
    [sites],
  );

  const renderSiteOption = useCallback(
    (option: { label: string; value: string }) => {
      const site = sites.find((s) => s.id === option.value);
      const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
      return (
        <span className="truncate" style={{ color: readableSiteColor(hex) }} title={`${option.label} (${hex})`}>
          {option.label}
        </span>
      );
    },
    [sites],
  );

  const entityOptions = (meta?.entities ?? []).map((e) => ({
    label: t(`kpiBuilder.entity.${e.id}`),
    value: e.id,
  }));

  const measureOptions = (meta?.measureOps ?? ["count", "sum", "avg"]).map((op) => ({
    label: t(`kpiBuilder.measure.${op}`),
    value: op,
  }));

  const displayOptions = (meta?.displays ?? []).map((d) => ({
    label: t(`kpiBuilder.display.${d}`),
    value: d,
  }));

  const accentOptions = (meta?.accents ?? []).map((a) => ({
    label: t(`kpiBuilder.accent.${a}`),
    value: a,
  }));

  const categoryOptions = (meta?.categories ?? []).map((c) => ({
    label: t(`kpiBuilder.category.${c}`),
    value: c,
  }));

  const timePresetOptions = (meta?.timePresets ?? []).map((p) => ({
    label: t(`kpiBuilder.timePreset.${p}`),
    value: p,
  }));

  const filterOpOptions = (meta?.filterOps ?? []).map((op) => ({
    label: t(`kpiBuilder.filterOp.${op}`),
    value: op,
  }));

  const setDefinition = (patch: Partial<KpiDefinition>) => {
    setForm((prev) => ({ ...prev, definition: { ...prev.definition, ...patch } }));
  };

  const setStyle = (patch: Partial<KpiStyle>) => {
    setForm((prev) => ({ ...prev, style: { ...prev.style, ...patch } }));
  };

  const onEntityChange = (entity: KpiEntity) => {
    const nextMeta = meta?.entities.find((e) => e.id === entity);
    const timeField = nextMeta?.fields.find((f) => f.timeable)?.id ?? "createdAt";
    setForm((prev) => ({
      ...prev,
      definition: {
        ...defaultKpiDefinition(entity),
        timeRange: { field: timeField, preset: "last7d" },
        category: nextMeta?.defaultCategory ?? "workOrders",
      },
    }));
  };

  const updateFilter = (index: number, patch: Partial<KpiFilter>) => {
    setForm((prev) => {
      const filters = [...prev.definition.filters];
      filters[index] = { ...filters[index]!, ...patch };
      return { ...prev, definition: { ...prev.definition, filters } };
    });
  };

  const addFilter = () => {
    const field = filterableFields[0]?.id;
    if (!field) return;
    setForm((prev) => ({
      ...prev,
      definition: {
        ...prev.definition,
        filters: [...prev.definition.filters, { field, op: "eq" as KpiFilterOp, value: "" }],
      },
    }));
  };

  const removeFilter = (index: number) => {
    setForm((prev) => ({
      ...prev,
      definition: {
        ...prev.definition,
        filters: prev.definition.filters.filter((_, i) => i !== index),
      },
    }));
  };

  // Debounced live preview
  useEffect(() => {
    const seq = ++previewSeqRef.current;
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await previewCustomKpi({
            siteId: form.siteId || undefined,
            definition: normalizeDefinition(form.definition),
            style: form.style,
          });
          if (previewSeqRef.current !== seq) return;
          setPreview(result);
          setPreviewError(false);
        } catch {
          if (previewSeqRef.current !== seq) return;
          setPreview(null);
          setPreviewError(true);
        } finally {
          if (previewSeqRef.current === seq) setPreviewLoading(false);
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [form.definition, form.style, form.siteId]);

  const trySave = useCallback(() => {
    const key = form.key.trim();
    const name = form.name.trim();
    const siteId = form.siteId.trim();
    if (!key) {
      onValidationError("kpiBuilder.keyRequired");
      return;
    }
    if (!name) {
      onValidationError("kpiBuilder.nameRequired");
      return;
    }
    if (!siteId) {
      onValidationError("kpiBuilder.siteRequired");
      return;
    }
    onSave({
      key,
      name,
      siteId,
      isActive: form.isActive,
      definition: normalizeDefinition(form.definition),
      style: form.style,
    });
  }, [form, onSave, onValidationError]);

  useImperativeHandle(ref, () => ({ save: trySave }), [trySave]);

  const previewEntry = useMemo((): KpiEvaluateEntry | undefined => {
    if (!preview) return undefined;
    return {
      id: editing?.id ?? "preview",
      name: form.name.trim() || t("kpiBuilder.livePreviewUntitled"),
      style: form.style,
      definition: form.definition,
      result: preview,
    };
  }, [editing?.id, form.definition, form.name, form.style, preview, t]);

  const previewView = useMemo(() => {
    if (previewError) {
      return resolveCustomKpiView(
        {
          id: editing?.id ?? "preview",
          name: form.name.trim() || t("kpiBuilder.livePreviewUntitled"),
          style: form.style,
          definition: form.definition,
          result: null,
          error: "preview_failed",
        },
        t,
      );
    }
    return resolveCustomKpiView(previewEntry, t);
  }, [editing?.id, form.definition, form.name, form.style, previewEntry, previewError, t]);

  const sectionTitle = "label-sm mb-3 block text-on-surface-variant";
  const sectionDivider = "border-t border-[color-mix(in_srgb,var(--color-outline)_18%,transparent)] pt-6";
  const fieldLabel = "flex flex-col gap-1.5 text-sm";
  const fieldCaption = "label-sm text-on-surface-variant";

  const display = form.style.display;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-6">
      <div className="min-h-0 flex-1 overflow-auto lg:basis-[55%]">
        <div className="flex max-w-2xl flex-col gap-0 pb-8">
          {/* 1. Pflicht */}
          <section>
            <h2 className={sectionTitle}>{t("kpiBuilder.sectionBasics")}</h2>
            <div className="flex flex-col gap-3">
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldKey")}</span>
                <InputText
                  value={form.key}
                  onChange={(e) => setForm((p) => ({ ...p, key: e.target.value }))}
                  disabled={Boolean(editing) || saving}
                  className="w-full"
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldName")}</span>
                <InputText
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  disabled={saving}
                  className="w-full"
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldSite")}</span>
                <Dropdown
                  value={form.siteId}
                  options={siteOptions}
                  onChange={(e) => setForm((p) => ({ ...p, siteId: e.value as string }))}
                  disabled={siteFieldLocked || saving}
                  placeholder={t("kpiBuilder.sitePlaceholder")}
                  itemTemplate={renderSiteOption}
                  valueTemplate={renderSiteOption}
                  className="w-full"
                  appendTo={overlayAppendTo}
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.isActive}
                  onChange={(e) => setForm((p) => ({ ...p, isActive: Boolean(e.checked) }))}
                  disabled={saving}
                />
                <span>{t("kpiBuilder.fieldActive")}</span>
              </label>
            </div>
          </section>

          {/* 2. Darstellung */}
          <section className={`mt-6 ${sectionDivider}`}>
            <h2 className={sectionTitle}>{t("kpiBuilder.stepStyle")}</h2>
            <div className="flex flex-col gap-3">
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldDisplay")}</span>
                <Dropdown
                  value={form.style.display}
                  options={displayOptions}
                  onChange={(e) => setStyle({ display: e.value })}
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>

              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldAccent")}</span>
                <Dropdown
                  value={form.style.accent ?? "green"}
                  options={accentOptions}
                  onChange={(e) => setStyle({ accent: e.value })}
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>

              {display === "value" ? (
                <label className={fieldLabel}>
                  <span className={fieldCaption}>{t("kpiBuilder.fieldValueSuffix")}</span>
                  <InputText
                    value={form.style.valueSuffix ?? ""}
                    onChange={(e) => setStyle({ valueSuffix: e.target.value })}
                    disabled={saving}
                    className="w-full"
                    placeholder={t("kpiBuilder.fieldValueSuffixPlaceholder")}
                  />
                </label>
              ) : null}

              {display === "sparkline" ? (
                <>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.style.showAxes === true}
                      onChange={(e) => setStyle({ showAxes: Boolean(e.checked) })}
                      disabled={saving}
                    />
                    <span>{t("kpiBuilder.fieldShowAxes")}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.style.showTooltip === true}
                      onChange={(e) => setStyle({ showTooltip: Boolean(e.checked) })}
                      disabled={saving}
                    />
                    <span>{t("kpiBuilder.fieldShowTooltip")}</span>
                  </label>
                </>
              ) : null}

              {display === "bar" || display === "pie" ? (
                <>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.style.showLegend !== false}
                      onChange={(e) => setStyle({ showLegend: Boolean(e.checked) })}
                      disabled={saving}
                    />
                    <span>{t("kpiBuilder.fieldShowLegend")}</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.style.showTooltip === true}
                      onChange={(e) => setStyle({ showTooltip: Boolean(e.checked) })}
                      disabled={saving}
                    />
                    <span>{t("kpiBuilder.fieldShowTooltip")}</span>
                  </label>
                </>
              ) : null}

              {display === "table" ? (
                <label className={fieldLabel}>
                  <span className={fieldCaption}>{t("kpiBuilder.fieldRowLimit")}</span>
                  <Dropdown
                    value={form.style.rowLimit ?? 10}
                    options={[5, 10, 20, 30, 50].map((n) => ({ label: String(n), value: n }))}
                    onChange={(e) => setStyle({ rowLimit: e.value as number })}
                    className="w-full"
                    appendTo={overlayAppendTo}
                    disabled={saving}
                  />
                </label>
              ) : null}
            </div>
          </section>

          {/* 3. Daten */}
          <section className={`mt-6 ${sectionDivider}`}>
            <h2 className={sectionTitle}>{t("kpiBuilder.stepData")}</h2>
            <div className="flex flex-col gap-3">
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldEntity")}</span>
                <Dropdown
                  value={form.definition.entity}
                  options={entityOptions}
                  onChange={(e) => onEntityChange(e.value as KpiEntity)}
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldMeasure")}</span>
                <Dropdown
                  value={form.definition.measure.op}
                  options={measureOptions}
                  onChange={(e) => {
                    const op = e.value as KpiMeasureOp;
                    setDefinition({
                      measure:
                        op === "count"
                          ? { op }
                          : { op, field: form.definition.measure.field ?? measurableFields[0]?.id },
                    });
                  }}
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>
              {form.definition.measure.op !== "count" ? (
                <label className={fieldLabel}>
                  <span className={fieldCaption}>{t("kpiBuilder.fieldMeasureField")}</span>
                  <Dropdown
                    value={form.definition.measure.field}
                    options={measurableFields.map((f) => ({ label: f.id, value: f.id }))}
                    onChange={(e) =>
                      setDefinition({
                        measure: { op: form.definition.measure.op, field: e.value as string },
                      })
                    }
                    className="w-full"
                    appendTo={overlayAppendTo}
                    disabled={saving}
                  />
                </label>
              ) : null}
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldTimeField")}</span>
                <Dropdown
                  value={form.definition.timeRange?.field ?? timeableFields[0]?.id}
                  options={timeableFields.map((f) => ({ label: f.id, value: f.id }))}
                  onChange={(e) =>
                    setDefinition({
                      timeRange: {
                        field: e.value as string,
                        preset: form.definition.timeRange?.preset ?? "last7d",
                      },
                    })
                  }
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldTimePreset")}</span>
                <Dropdown
                  value={form.definition.timeRange?.preset ?? "last7d"}
                  options={timePresetOptions}
                  onChange={(e) =>
                    setDefinition({
                      timeRange: {
                        field:
                          form.definition.timeRange?.field ?? timeableFields[0]?.id ?? "createdAt",
                        preset: e.value as KpiTimePreset,
                      },
                    })
                  }
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldGroupBy")}</span>
                <Dropdown
                  value={form.definition.groupBy ?? null}
                  options={[
                    { label: t("kpiBuilder.groupByNone"), value: null },
                    ...groupableFields.map((f) => ({ label: f.id, value: f.id })),
                  ]}
                  onChange={(e) => setDefinition({ groupBy: (e.value as string | null) ?? null })}
                  className="w-full"
                  showClear
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>
              <label className={fieldLabel}>
                <span className={fieldCaption}>{t("kpiBuilder.fieldCategory")}</span>
                <Dropdown
                  value={form.definition.category}
                  options={categoryOptions}
                  onChange={(e) => setDefinition({ category: e.value })}
                  className="w-full"
                  appendTo={overlayAppendTo}
                  disabled={saving}
                />
              </label>

              <div className="mt-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className={fieldCaption}>{t("kpiBuilder.filters")}</span>
                  <Button
                    type="button"
                    size="small"
                    label={t("kpiBuilder.addFilter")}
                    onClick={addFilter}
                    disabled={saving}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  {form.definition.filters.map((filter, index) => {
                    const fieldDef = filterableFields.find((f) => f.id === filter.field);
                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 rounded-sm bg-surface-container-low p-3"
                      >
                        <Dropdown
                          value={filter.field}
                          options={filterableFields.map((f) => ({ label: f.id, value: f.id }))}
                          onChange={(e) => updateFilter(index, { field: e.value as string })}
                          placeholder={t("kpiBuilder.filterField")}
                          className="w-full"
                          appendTo={overlayAppendTo}
                          disabled={saving}
                        />
                        <Dropdown
                          value={filter.op}
                          options={filterOpOptions}
                          onChange={(e) => updateFilter(index, { op: e.value as KpiFilterOp })}
                          placeholder={t("kpiBuilder.filterOp")}
                          className="w-full"
                          appendTo={overlayAppendTo}
                          disabled={saving}
                        />
                        {filter.op === "isNull" ? null : fieldDef?.type === "enum" && fieldDef.enumValues ? (
                          filter.op === "in" || filter.op === "notIn" ? (
                            <MultiSelect
                              value={Array.isArray(filter.value) ? filter.value : []}
                              options={fieldDef.enumValues.map((v) => ({ label: v, value: v }))}
                              onChange={(e) => updateFilter(index, { value: e.value })}
                              className="w-full"
                              display="comma"
                              appendTo={overlayAppendTo}
                              disabled={saving}
                            />
                          ) : (
                            <Dropdown
                              value={filter.value}
                              options={fieldDef.enumValues.map((v) => ({ label: v, value: v }))}
                              onChange={(e) => updateFilter(index, { value: e.value })}
                              className="w-full"
                              appendTo={overlayAppendTo}
                              disabled={saving}
                            />
                          )
                        ) : (
                          <InputText
                            value={
                              Array.isArray(filter.value)
                                ? filter.value.join(", ")
                                : filter.value == null
                                  ? ""
                                  : String(filter.value)
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (filter.op === "in" || filter.op === "notIn") {
                                updateFilter(index, { value: v });
                              } else if (fieldDef?.type === "boolean") {
                                updateFilter(index, { value: v === "true" });
                              } else if (fieldDef?.type === "number") {
                                updateFilter(index, { value: v === "" ? "" : Number(v) });
                              } else {
                                updateFilter(index, { value: v });
                              }
                            }}
                            placeholder={t("kpiBuilder.filterValue")}
                            disabled={saving}
                            className="w-full"
                          />
                        )}
                        <Button
                          type="button"
                          size="small"
                          severity="danger"
                          outlined
                          label={t("kpiBuilder.removeFilter")}
                          onClick={() => removeFilter(index)}
                          disabled={saving}
                          className="self-start"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-3 lg:basis-[45%] lg:overflow-auto">
        <h2 className={sectionTitle}>{t("kpiBuilder.livePreview")}</h2>
        <div className="shrink-0 rounded-sm bg-surface-container-low p-3">
          <div className="mx-auto w-full max-w-md">
            <DashboardSparkCard
              title={previewView.title}
              display={previewView.display}
              value={previewLoading ? null : previewView.value}
              valueSuffix={previewView.valueSuffix}
              detail={previewLoading ? undefined : previewView.detail}
              locale={i18n.language}
              series={previewView.series}
              chart={previewView.chart}
              chartAnimationKey={`${form.style.display}-${form.definition.entity}-${form.name}-${form.style.showAxes}-${form.style.showTooltip}`}
              loading={previewLoading}
              accent={previewView.accent}
              sparklineOptions={previewView.sparklineOptions}
              footer={previewLoading ? null : previewView.footer}
            />
          </div>
        </div>
        {previewError ? (
          <p className="text-sm text-red-500">{t("kpiBuilder.previewError")}</p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-sm bg-surface-container-low p-3 text-sm">
          <h3 className={sectionTitle}>{t("kpiBuilder.contextTitle")}</h3>

          <div>
            <p className={fieldCaption}>{t("kpiBuilder.previewTotal")}</p>
            <p className="mt-1 text-lg font-medium text-on-surface">
              {previewLoading || !preview ? "—" : preview.total}
              {form.style.valueSuffix?.trim() ? (
                <span className="ml-1 text-sm text-on-surface-variant">{form.style.valueSuffix.trim()}</span>
              ) : null}
            </p>
          </div>

          {preview?.series && preview.series.length > 0 ? (
            <div>
              <p className={`mb-2 ${fieldCaption}`}>{t("kpiBuilder.contextSeries")}</p>
              <ul className="max-h-40 space-y-1 overflow-auto text-on-surface">
                {preview.series.slice(0, 12).map((s) => (
                  <li key={s.key} className="flex justify-between gap-3">
                    <span className="truncate">{s.label}</span>
                    <span className="shrink-0 tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className={`mb-2 ${fieldCaption}`}>{t("kpiBuilder.contextFilters")}</p>
            {form.definition.filters.length === 0 ? (
              <p className="text-on-surface-variant">{t("kpiBuilder.contextFiltersEmpty")}</p>
            ) : (
              <ul className="space-y-1 text-on-surface">
                {form.definition.filters.map((f, i) => (
                  <li key={i} className="truncate font-mono text-xs">
                    {f.field} {f.op}
                    {f.op !== "isNull"
                      ? ` ${Array.isArray(f.value) ? f.value.join(",") : String(f.value ?? "")}`
                      : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`mt-1 ${sectionDivider}`}>
            <p className={`mb-2 ${fieldCaption}`}>{t("kpiBuilder.contextHelp")}</p>
            <p className="text-on-surface-variant leading-relaxed">
              {t(`kpiBuilder.displayHelp.${form.style.display}`)}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
});
