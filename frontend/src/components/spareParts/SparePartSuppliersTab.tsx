import { useCallback, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { IconField } from "primereact/iconfield";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";

import { LucideInputSearchIcon } from "../LucideInputSearchIcon";
import { lucidePrimeBtnIcon } from "../../icons/lucide";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

export type SupplierCatalogRow = {
  id: string;
  key: string;
  name: string;
};

export type SupplierFormLine = {
  localId: string;
  supplierId: string;
  supplierArticleNumber: string;
  supplierArticleText: string;
  supplierArticleLongText: string;
  unitPrice: number | null;
  currency: string;
  priceValidFrom: Date | null;
  minOrderQuantity: number | null;
  orderMultiple: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  isActive: boolean;
  remark: string;
};

type SupplierDropdownOption = {
  label: string;
  value: string;
};

type SparePartSuppliersTabSearchPortalProps = {
  tabHostRef: RefObject<HTMLElement | null>;
  visible: boolean;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
};

function SparePartSuppliersTabSearchPortal({
  tabHostRef,
  visible,
  searchTerm,
  onSearchChange,
  placeholder,
}: SparePartSuppliersTabSearchPortalProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!visible) {
      setPortalTarget(null);
      return;
    }
    const host = tabHostRef.current;
    if (!host) {
      setPortalTarget(null);
      return;
    }
    const container = host.querySelector<HTMLElement>(".p-tabview-nav-container");
    setPortalTarget(container);
  }, [visible, tabHostRef]);

  if (!visible || !portalTarget) return null;

  return createPortal(
    <div
      className="app-sp-suppliers-tab-search"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <IconField iconPosition="left">
        <LucideInputSearchIcon />
        <InputText
          value={searchTerm}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
          autoComplete="off"
        />
      </IconField>
    </div>,
    portalTarget,
  );
}

function supplierMatchesSearch(
  line: SupplierFormLine,
  catalog: SupplierCatalogRow[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const supplier = catalog.find((row) => row.id === line.supplierId);
  const haystack = [
    supplier?.key,
    supplier?.name,
    line.supplierArticleNumber,
    line.supplierArticleText,
    line.supplierArticleLongText,
    line.remark,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

type SupplierAccordionItemProps = {
  line: SupplierFormLine;
  supplierLabel: string;
  supplierDropdownOptions: SupplierDropdownOption[];
  siteId: string;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<SupplierFormLine>) => void;
  onRemove: () => void;
};

function SupplierAccordionItem({
  line,
  supplierLabel,
  supplierDropdownOptions,
  siteId,
  expanded,
  onToggle,
  onUpdate,
  onRemove,
}: SupplierAccordionItemProps) {
  const { t } = useTranslation();

  return (
    <div className="app-sp-supplier-accordion rounded-sm border border-outline-variant/40">
      <div className="flex items-center gap-2 border-b border-outline-variant/30 px-3 py-2">
        <button
          type="button"
          className="app-sp-supplier-accordion-header flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
          aria-controls={`sp-supplier-panel-${line.localId}`}
          onClick={onToggle}
        >
          <ChevronRight
            className={`app-sp-supplier-accordion-chevron h-4 w-4 shrink-0 opacity-70 ${
              expanded ? "app-sp-supplier-accordion-chevron--open" : ""
            }`}
            strokeWidth={1.75}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-on-surface">
            {supplierLabel}
          </span>
          {line.isPreferred ? (
            <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              {t("spareParts.isPreferred")}
            </span>
          ) : null}
          {!line.isActive ? (
            <span className="shrink-0 rounded-sm bg-outline-variant/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-on-surface-variant">
              {t("spareParts.supplierInactive")}
            </span>
          ) : null}
          {line.supplierArticleNumber ? (
            <span className="hidden shrink-0 text-xs text-on-surface-variant sm:inline">
              {line.supplierArticleNumber}
            </span>
          ) : null}
        </button>
        <Button
          type="button"
          severity="danger"
          text
          rounded
          className="shrink-0"
          aria-label={t("spareParts.removeSupplier")}
          icon={<Trash2 className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
          onClick={onRemove}
        />
      </div>
      <div
        id={`sp-supplier-panel-${line.localId}`}
        className={`app-sp-supplier-accordion-body ${expanded ? "app-sp-supplier-accordion-body--open" : ""}`}
        aria-hidden={!expanded}
      >
        <div className="app-sp-supplier-accordion-body-inner">
          <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-12">
            <div className="space-y-2 md:col-span-8">
              <label
                htmlFor={`sp-supplier-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.supplier")}
              </label>
              <Dropdown
                inputId={`sp-supplier-${line.localId}`}
                value={line.supplierId || null}
                options={supplierDropdownOptions}
                onChange={(e) => onUpdate({ supplierId: String(e.value ?? "") })}
                placeholder={t("spareParts.supplierPlaceholder")}
                className="w-full app-inline-icon-dropdown"
                filter
                disabled={!siteId}
                appendTo={overlayAppendTo}
              />
            </div>
            <div className="flex flex-wrap items-end gap-4 md:col-span-4">
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  inputId={`sp-supplier-preferred-${line.localId}`}
                  checked={line.isPreferred}
                  onChange={(e) => onUpdate({ isPreferred: Boolean(e.checked) })}
                />
                <label
                  htmlFor={`sp-supplier-preferred-${line.localId}`}
                  className="text-[11px] text-outline uppercase tracking-[0.1em]"
                >
                  {t("spareParts.isPreferred")}
                </label>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  inputId={`sp-supplier-active-${line.localId}`}
                  checked={line.isActive}
                  onChange={(e) => onUpdate({ isActive: Boolean(e.checked) })}
                />
                <label
                  htmlFor={`sp-supplier-active-${line.localId}`}
                  className="text-[11px] text-outline uppercase tracking-[0.1em]"
                >
                  {t("spareParts.supplierActive")}
                </label>
              </div>
            </div>
            <div className="space-y-2 md:col-span-4">
              <label
                htmlFor={`sp-supplier-artnr-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.supplierArticleNumber")}
              </label>
              <InputText
                id={`sp-supplier-artnr-${line.localId}`}
                value={line.supplierArticleNumber}
                onChange={(e) => onUpdate({ supplierArticleNumber: e.target.value })}
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 md:col-span-8">
              <label
                htmlFor={`sp-supplier-arttext-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.supplierArticleText")}
              </label>
              <InputText
                id={`sp-supplier-arttext-${line.localId}`}
                value={line.supplierArticleText}
                onChange={(e) => onUpdate({ supplierArticleText: e.target.value })}
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label
                htmlFor={`sp-supplier-price-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.unitPrice")}
              </label>
              <InputNumber
                inputId={`sp-supplier-price-${line.localId}`}
                value={line.unitPrice}
                onValueChange={(e) => onUpdate({ unitPrice: e.value ?? null })}
                min={0}
                minFractionDigits={0}
                maxFractionDigits={4}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label
                htmlFor={`sp-supplier-currency-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.currency")}
              </label>
              <InputText
                id={`sp-supplier-currency-${line.localId}`}
                value={line.currency}
                onChange={(e) => onUpdate({ currency: e.target.value })}
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <label
                htmlFor={`sp-supplier-valid-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.priceValidFrom")}
              </label>
              <Calendar
                inputId={`sp-supplier-valid-${line.localId}`}
                value={line.priceValidFrom}
                onChange={(e) =>
                  onUpdate({ priceValidFrom: e.value instanceof Date ? e.value : null })
                }
                dateFormat="yy-mm-dd"
                showIcon
                className="w-full"
                appendTo={overlayAppendTo}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <label
                htmlFor={`sp-supplier-lead-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.leadTimeDays")}
              </label>
              <InputNumber
                inputId={`sp-supplier-lead-${line.localId}`}
                value={line.leadTimeDays}
                onValueChange={(e) =>
                  onUpdate({
                    leadTimeDays: typeof e.value === "number" ? Math.trunc(e.value) : null,
                  })
                }
                min={0}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
            <div className="space-y-2 md:col-span-6">
              <label
                htmlFor={`sp-supplier-minqty-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.minOrderQuantity")}
              </label>
              <InputNumber
                inputId={`sp-supplier-minqty-${line.localId}`}
                value={line.minOrderQuantity}
                onValueChange={(e) => onUpdate({ minOrderQuantity: e.value ?? null })}
                min={0}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
            <div className="space-y-2 md:col-span-6">
              <label
                htmlFor={`sp-supplier-mult-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.orderMultiple")}
              </label>
              <InputNumber
                inputId={`sp-supplier-mult-${line.localId}`}
                value={line.orderMultiple}
                onValueChange={(e) => onUpdate({ orderMultiple: e.value ?? null })}
                min={0}
                className="w-full"
                inputClassName="w-full"
              />
            </div>
            <div className="space-y-2 md:col-span-12">
              <label
                htmlFor={`sp-supplier-longtext-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.supplierArticleLongText")}
              </label>
              <InputTextarea
                id={`sp-supplier-longtext-${line.localId}`}
                value={line.supplierArticleLongText}
                onChange={(e) => onUpdate({ supplierArticleLongText: e.target.value })}
                rows={2}
                className="w-full"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2 md:col-span-12">
              <label
                htmlFor={`sp-supplier-remark-${line.localId}`}
                className="block text-[11px] text-outline uppercase tracking-[0.1em]"
              >
                {t("spareParts.supplierRemark")}
              </label>
              <InputText
                id={`sp-supplier-remark-${line.localId}`}
                value={line.remark}
                onChange={(e) => onUpdate({ remark: e.target.value })}
                className="w-full"
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export type SparePartSuppliersTabProps = {
  tabHostRef: RefObject<HTMLElement | null>;
  suppliersTabActive: boolean;
  supplierLines: SupplierFormLine[];
  supplierDropdownOptions: SupplierDropdownOption[];
  suppliersCatalog: SupplierCatalogRow[];
  siteId: string;
  loading: boolean;
  editingId: string | null;
  onAddLine: () => string;
  onUpdateLine: (localId: string, patch: Partial<SupplierFormLine>) => void;
  onRemoveLine: (localId: string) => void;
};

export function SparePartSuppliersTab({
  tabHostRef,
  suppliersTabActive,
  supplierLines,
  supplierDropdownOptions,
  suppliersCatalog,
  siteId,
  loading,
  editingId,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
}: SparePartSuppliersTabProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const catalogById = useMemo(() => {
    const map = new Map<string, SupplierCatalogRow>();
    for (const row of suppliersCatalog) {
      map.set(row.id, row);
    }
    return map;
  }, [suppliersCatalog]);

  const filteredLines = useMemo(
    () => supplierLines.filter((line) => supplierMatchesSearch(line, suppliersCatalog, searchTerm)),
    [supplierLines, suppliersCatalog, searchTerm],
  );

  const resolveSupplierLabel = useCallback(
    (line: SupplierFormLine) => {
      if (!line.supplierId) return t("spareParts.supplierUntitled");
      const supplier = catalogById.get(line.supplierId);
      if (!supplier) return t("spareParts.supplierUntitled");
      return `${supplier.key} - ${supplier.name}`;
    },
    [catalogById, t],
  );

  const toggleExpanded = useCallback((localId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  }, []);

  const handleAddLine = useCallback(() => {
    const localId = onAddLine();
    setSearchTerm("");
    setExpandedIds(new Set([localId]));
  }, [onAddLine]);

  const handleRemoveLine = useCallback(
    (localId: string) => {
      onRemoveLine(localId);
      setExpandedIds((prev) => {
        if (!prev.has(localId)) return prev;
        const next = new Set(prev);
        next.delete(localId);
        return next;
      });
    },
    [onRemoveLine],
  );

  if (loading && editingId) {
    return (
      <>
        <SparePartSuppliersTabSearchPortal
          tabHostRef={tabHostRef}
          visible={suppliersTabActive}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          placeholder={t("spareParts.suppliersSearchPlaceholder")}
        />
        <p className="m-0 pt-1 text-sm text-on-surface-variant">{t("spareParts.loadError")}</p>
      </>
    );
  }

  return (
    <>
      <SparePartSuppliersTabSearchPortal
        tabHostRef={tabHostRef}
        visible={suppliersTabActive}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        placeholder={t("spareParts.suppliersSearchPlaceholder")}
      />
      <div className="flex flex-col gap-3 pt-1">
        <div>
          <Button
            type="button"
            label={t("spareParts.addSupplier")}
            icon={<Plus className={lucidePrimeBtnIcon} strokeWidth={1.75} />}
            severity="secondary"
            outlined
            disabled={!siteId}
            onClick={handleAddLine}
          />
        </div>
        {supplierLines.length === 0 ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("spareParts.suppliersEmpty")}</p>
        ) : filteredLines.length === 0 ? (
          <p className="m-0 text-sm text-on-surface-variant">{t("spareParts.suppliersSearchEmpty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredLines.map((line) => (
              <SupplierAccordionItem
                key={line.localId}
                line={line}
                supplierLabel={resolveSupplierLabel(line)}
                supplierDropdownOptions={supplierDropdownOptions}
                siteId={siteId}
                expanded={expandedIds.has(line.localId)}
                onToggle={() => toggleExpanded(line.localId)}
                onUpdate={(patch) => onUpdateLine(line.localId, patch)}
                onRemove={() => handleRemoveLine(line.localId)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
