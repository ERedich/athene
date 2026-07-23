import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { FileDown } from "lucide-react";

import { overlayAppendTo } from "../../lib/overlayAppendTo";
import {
  defaultReportLayout,
  defaultReportQuery,
  previewReportPdf,
  previewReportQuery,
  type ReportDefinition,
  type ReportDefinitionWritePayload,
  type ReportLayout,
  type ReportMeta,
  type ReportQueryDefinition,
  type ReportQueryResult,
} from "../../lib/reportDesignerApi";
import { ReportDesignStep } from "./ReportDesignStep";
import { ReportQueryStep } from "./ReportQueryStep";

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type Props = {
  editing: ReportDefinition | null;
  sites: SiteOption[];
  meta: ReportMeta | null;
  siteFieldLocked: boolean;
  workingSiteId: string;
  saving: boolean;
  onSave: (payload: ReportDefinitionWritePayload) => void;
  onValidationError: (messageKey: string) => void;
};

export type ReportEditorPanelHandle = {
  save: () => void;
};

type FormState = {
  key: string;
  name: string;
  siteId: string;
  isActive: boolean;
  queryDefinition: ReportQueryDefinition;
  layout: ReportLayout;
};

type WizardStep = "general" | "query" | "design";

function emptyForm(workingSiteId: string): FormState {
  return {
    key: "",
    name: "",
    siteId: workingSiteId,
    isActive: true,
    queryDefinition: defaultReportQuery("workOrder"),
    layout: defaultReportLayout(),
  };
}

export const ReportEditorPanel = forwardRef<ReportEditorPanelHandle, Props>(
  function ReportEditorPanel(
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
    const { t } = useTranslation();
    const [step, setStep] = useState<WizardStep>("general");
    const [form, setForm] = useState<FormState>(() => emptyForm(workingSiteId));
    const [preview, setPreview] = useState<ReportQueryResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

    useEffect(() => {
      if (editing) {
        setForm({
          key: editing.key,
          name: editing.name,
          siteId: editing.siteId,
          isActive: editing.isActive,
          queryDefinition: editing.queryDefinition,
          layout: editing.layout,
        });
      } else {
        setForm(emptyForm(workingSiteId));
      }
      setStep("general");
      setPreview(null);
      setSelectedElementId(null);
    }, [editing, workingSiteId]);

    const siteOptions = useMemo(
      () =>
        sites.map((s) => ({
          label: `${s.key} - ${s.name}`,
          value: s.id,
        })),
      [sites],
    );

    const sampleRow = preview?.rows[0] ?? null;

    const runPreview = useCallback(async () => {
      if (!form.siteId || form.queryDefinition.fields.length === 0) {
        onValidationError("reportDesigner.fieldsRequired");
        return;
      }
      setPreviewLoading(true);
      try {
        const result = await previewReportQuery({
          siteId: form.siteId,
          queryDefinition: form.queryDefinition,
        });
        setPreview(result);
      } catch {
        onValidationError("reportDesigner.previewError");
      } finally {
        setPreviewLoading(false);
      }
    }, [form.queryDefinition, form.siteId, onValidationError]);

    const runPdfPreview = useCallback(async () => {
      if (!form.siteId || form.queryDefinition.fields.length === 0) {
        onValidationError("reportDesigner.fieldsRequired");
        return;
      }
      setPdfLoading(true);
      try {
        const blob = await previewReportPdf({
          siteId: form.siteId,
          name: form.name || "Report",
          queryDefinition: form.queryDefinition,
          layout: form.layout,
        });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch {
        onValidationError("reportDesigner.pdfError");
      } finally {
        setPdfLoading(false);
      }
    }, [form.layout, form.name, form.queryDefinition, form.siteId, onValidationError]);

    const save = useCallback(() => {
      const key = form.key.trim();
      const name = form.name.trim();
      if (!key) {
        onValidationError("reportDesigner.keyRequired");
        setStep("general");
        return;
      }
      if (!name) {
        onValidationError("reportDesigner.nameRequired");
        setStep("general");
        return;
      }
      if (!form.siteId) {
        onValidationError("reportDesigner.siteRequired");
        setStep("general");
        return;
      }
      if (form.queryDefinition.fields.length === 0) {
        onValidationError("reportDesigner.fieldsRequired");
        setStep("query");
        return;
      }
      // Drop field bindings that are no longer selected
      const allowed = new Set(form.queryDefinition.fields);
      const layout: ReportLayout = {
        ...form.layout,
        elements: form.layout.elements.filter(
          (el) => el.type === "label" || (el.fieldId && allowed.has(el.fieldId)),
        ),
      };
      onSave({
        key,
        name,
        siteId: form.siteId,
        queryDefinition: form.queryDefinition,
        layout,
        isActive: form.isActive,
      });
    }, [form, onSave, onValidationError]);

    useImperativeHandle(ref, () => ({ save }), [save]);

    const steps: { id: WizardStep; label: string }[] = [
      { id: "general", label: t("reportDesigner.stepGeneral") },
      { id: "query", label: t("reportDesigner.stepQuery") },
      { id: "design", label: t("reportDesigner.stepDesign") },
    ];

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            {steps.map((s, index) => {
              const active = s.id === step;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-[var(--color-primary)]"
                      : "text-on-surface-variant hover:bg-surface-container-high"
                  }`}
                  onClick={() => setStep(s.id)}
                >
                  <span className="mr-1 opacity-60">{index + 1}.</span>
                  {s.label}
                </button>
              );
            })}
          </div>
          <Button
            type="button"
            size="small"
            outlined
            icon={<FileDown className="h-4 w-4" strokeWidth={1.75} />}
            label={pdfLoading ? t("reportDesigner.pdfLoading") : t("reportDesigner.previewPdf")}
            disabled={pdfLoading || saving}
            onClick={() => void runPdfPreview()}
          />
        </div>

        {step === "general" ? (
          <div className="grid max-w-3xl gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldKey")}</span>
              <InputText
                value={form.key}
                onChange={(e) => setForm((prev) => ({ ...prev, key: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldName")}</span>
              <InputText
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="label-sm text-on-surface-variant">{t("reportDesigner.fieldSite")}</span>
              <Dropdown
                value={form.siteId}
                options={siteOptions}
                appendTo={overlayAppendTo}
                disabled={siteFieldLocked || saving}
                onChange={(e) => setForm((prev) => ({ ...prev, siteId: e.value as string }))}
                placeholder={t("reportDesigner.sitePlaceholder")}
              />
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox
                inputId="report-active"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: Boolean(e.checked) }))}
                disabled={saving}
              />
              <span>{t("reportDesigner.fieldActive")}</span>
            </label>
            <p className="m-0 text-sm text-on-surface-variant md:col-span-2">
              {t("reportDesigner.generalHint")}
            </p>
          </div>
        ) : null}

        {step === "query" ? (
          <ReportQueryStep
            query={form.queryDefinition}
            meta={meta}
            preview={preview}
            previewLoading={previewLoading}
            onChange={(queryDefinition) => setForm((prev) => ({ ...prev, queryDefinition }))}
            onPreview={() => void runPreview()}
          />
        ) : null}

        {step === "design" ? (
          <ReportDesignStep
            layout={form.layout}
            query={form.queryDefinition}
            sampleRow={sampleRow}
            selectedId={selectedElementId}
            onSelect={setSelectedElementId}
            onChange={(layout) => setForm((prev) => ({ ...prev, layout }))}
          />
        ) : null}

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            text
            label={t("reportDesigner.back")}
            disabled={step === "general" || saving}
            onClick={() =>
              setStep((prev) => (prev === "design" ? "query" : prev === "query" ? "general" : prev))
            }
          />
          <Button
            type="button"
            label={step === "design" ? t("reportDesigner.save") : t("reportDesigner.next")}
            disabled={saving}
            onClick={() => {
              if (step === "general") setStep("query");
              else if (step === "query") setStep("design");
              else save();
            }}
          />
        </div>
      </div>
    );
  },
);
