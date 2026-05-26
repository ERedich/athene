import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { PickList, type PickListChangeEvent } from "primereact/picklist";
import { TabPanel, TabView } from "primereact/tabview";

import {
  createTableLayout,
  patchTableLayout,
  type TableLayoutDetail,
} from "../../lib/tableLayoutApi";
import {
  getMonitoringColumnDef,
  hasVisibleLayoutColumns,
  isStandardMonitoringLayoutName,
  MONITORING_WORK_ORDERS_COLUMNS,
  type MonitoringColumnDef,
  type TableLayoutPayloadV1,
} from "../../lib/tableLayouts/tableLayoutPayload";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type SortEntry = { field: string; order: 1 | -1 };

type ColumnPoolItem = { id: string; label: string };

function toColumnPoolItem(id: string, label: string): ColumnPoolItem {
  return { id, label };
}

function payloadFromEditorState(
  columnOrder: string[],
  visibleIds: string[],
  sort: SortEntry[],
  columnWidths: Record<string, number>,
  frozenLeft: string[],
  frozenRight: string[],
): TableLayoutPayloadV1 {
  const visibleSet = new Set(visibleIds);
  const fullColumnOrder: string[] = [];
  const seen = new Set<string>();
  for (const id of columnOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    fullColumnOrder.push(id);
  }
  for (const id of MONITORING_WORK_ORDERS_COLUMNS.map((c) => c.id)) {
    if (!seen.has(id)) {
      seen.add(id);
      fullColumnOrder.push(id);
    }
  }

  const hidden = fullColumnOrder.filter((id) => !visibleSet.has(id));

  const allowedSortFields = new Set<string>();
  for (const id of visibleIds) {
    const def = getMonitoringColumnDef(id);
    if (def?.field) allowedSortFields.add(def.field);
    allowedSortFields.add(id);
  }

  const widths: Record<string, number> = {};
  for (const id of visibleIds) {
    const w = columnWidths[id];
    if (w != null) widths[id] = w;
  }

  return {
    version: 1,
    columnOrder: fullColumnOrder,
    sort: sort.filter((s) => allowedSortFields.has(s.field)),
    columnWidths: widths,
    frozenLeft: frozenLeft.filter((id) => visibleSet.has(id)),
    frozenRight: frozenRight.filter((id) => visibleSet.has(id)),
    hiddenColumns: hidden,
  };
}

export type TableLayoutEditorDialogProps = {
  visible: boolean;
  onHide: () => void;
  tableKey: string;
  layoutId: string | null;
  initialName: string;
  initialPayload: TableLayoutPayloadV1;
  onSaved: (detail: TableLayoutDetail) => void;
};

export function TableLayoutEditorDialog({
  visible,
  onHide,
  tableKey,
  layoutId,
  initialName,
  initialPayload,
  onSaved,
}: TableLayoutEditorDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [columnOrder, setColumnOrder] = useState<string[]>(initialPayload.columnOrder);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(initialPayload.hiddenColumns);
  const [sort, setSort] = useState<SortEntry[]>(initialPayload.sort);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({ ...initialPayload.columnWidths });
  const [frozenLeft, setFrozenLeft] = useState<string[]>(initialPayload.frozenLeft);
  const [frozenRight, setFrozenRight] = useState<string[]>(initialPayload.frozenRight);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [createFromStandardMode, setCreateFromStandardMode] = useState(false);
  const tabHostRef = useRef<HTMLDivElement>(null);

  const isLockedStandardLayout = Boolean(
    layoutId && isStandardMonitoringLayoutName(initialName),
  );
  const isReadOnlyStandardView = isLockedStandardLayout && !createFromStandardMode;

  const updateTabInk = useCallback(() => {
    const host = tabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  const resetEditorFromInitial = useCallback(() => {
    setName(initialName);
    setColumnOrder([...initialPayload.columnOrder]);
    setHiddenColumns([...initialPayload.hiddenColumns]);
    setSort([...initialPayload.sort]);
    setColumnWidths({ ...initialPayload.columnWidths });
    setFrozenLeft([...initialPayload.frozenLeft]);
    setFrozenRight([...initialPayload.frozenRight]);
  }, [initialName, initialPayload]);

  useEffect(() => {
    if (!visible) return;
    resetEditorFromInitial();
    setError(null);
    setActiveTabIndex(0);
    setCreateFromStandardMode(false);
  }, [visible, initialName, initialPayload, resetEditorFromInitial]);

  const startCreateFromStandard = useCallback(() => {
    setCreateFromStandardMode(true);
    setName("");
    setError(null);
  }, []);

  const cancelCreateFromStandard = useCallback(() => {
    setCreateFromStandardMode(false);
    resetEditorFromInitial();
    setError(null);
  }, [resetEditorFromInitial]);

  useLayoutEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTabIndex, visible, updateTabInk]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [visible, updateTabInk]);

  const visibleIds = useMemo(() => {
    const hidden = new Set(hiddenColumns);
    return columnOrder.filter((id) => !hidden.has(id));
  }, [columnOrder, hiddenColumns]);

  const pickListSource = useMemo(() => {
    const visible = new Set(visibleIds);
    return MONITORING_WORK_ORDERS_COLUMNS.filter((c) => !visible.has(c.id)).map((c) =>
      toColumnPoolItem(c.id, t(c.headerKey)),
    );
  }, [t, visibleIds]);

  const pickListTarget = useMemo(
    () =>
      visibleIds.map((id) => {
        const def = getMonitoringColumnDef(id);
        return toColumnPoolItem(id, def ? t(def.headerKey) : id);
      }),
    [t, visibleIds],
  );

  const applyColumnPools = useCallback(
    (source: ColumnPoolItem[], target: ColumnPoolItem[]) => {
      void source;
      const targetIds = target.map((item) => item.id);
      const visibleSet = new Set(targetIds);
      const hiddenIds = MONITORING_WORK_ORDERS_COLUMNS.map((c) => c.id).filter((id) => !visibleSet.has(id));
      const hiddenIdSet = new Set<string>(hiddenIds);
      setHiddenColumns(hiddenIds);
      const hiddenOrdered = columnOrder.filter((id) => hiddenIdSet.has(id));
      const hiddenMissing = hiddenIds.filter((id) => !hiddenOrdered.includes(id));
      setColumnOrder([...targetIds, ...hiddenOrdered, ...hiddenMissing]);
      setFrozenLeft((cur) => cur.filter((id) => visibleSet.has(id)));
      setFrozenRight((cur) => cur.filter((id) => visibleSet.has(id)));
      const allowedSortFields = new Set<string>();
      for (const id of targetIds) {
        const def = getMonitoringColumnDef(id);
        if (def?.field) allowedSortFields.add(def.field);
        allowedSortFields.add(id);
      }
      setSort((cur) => cur.filter((s) => allowedSortFields.has(s.field)));
    },
    [columnOrder],
  );

  const onColumnPickListChange = useCallback(
    (event: PickListChangeEvent) => {
      applyColumnPools((event.source as ColumnPoolItem[]) ?? [], (event.target as ColumnPoolItem[]) ?? []);
    },
    [applyColumnPools],
  );

  const setFrozen = useCallback((columnId: string, side: "left" | "right" | "none") => {
    setFrozenLeft((cur) => cur.filter((id) => id !== columnId));
    setFrozenRight((cur) => cur.filter((id) => id !== columnId));
    if (side === "left") setFrozenLeft((cur) => [...cur, columnId]);
    if (side === "right") setFrozenRight((cur) => [...cur, columnId]);
  }, []);

  const addSortRow = useCallback(() => {
    const firstVisible = visibleIds.find((id) => {
      const def = getMonitoringColumnDef(id);
      return def?.sortable && def.field;
    });
    if (!firstVisible) return;
    const def = getMonitoringColumnDef(firstVisible)!;
    const field = def.field!;
    if (sort.some((s) => s.field === field)) return;
    setSort((cur) => [...cur, { field, order: 1 }]);
  }, [sort, visibleIds]);

  const sortFieldOptions = useMemo(() => {
    return visibleIds
      .map((id) => getMonitoringColumnDef(id))
      .filter((d): d is MonitoringColumnDef => Boolean(d?.sortable && d.field))
      .map((d) => ({ label: t(d.headerKey), value: d.field! }));
  }, [t, visibleIds]);

  const save = useCallback(
    async (asNew: boolean) => {
      const forceCreate = asNew || createFromStandardMode;
      if (!forceCreate && isLockedStandardLayout) {
        setError(t("tableLayouts.standardLayoutLockedHint"));
        return;
      }
      const trimmed = name.trim();
      if (!trimmed) {
        setError(t("tableLayouts.editor.nameRequired"));
        return;
      }
      if (isStandardMonitoringLayoutName(trimmed)) {
        setError(t("tableLayouts.editor.reservedName"));
        return;
      }
      const payload = payloadFromEditorState(
        columnOrder,
        visibleIds,
        sort,
        columnWidths,
        frozenLeft,
        frozenRight,
      );
      if (!hasVisibleLayoutColumns(payload)) {
        setError(t("tableLayouts.editor.visibleRequired"));
        return;
      }
      setSaving(true);
      setError(null);
      try {
        let detail: TableLayoutDetail;
        if (forceCreate || !layoutId) {
          detail = await createTableLayout(trimmed, tableKey, payload);
        } else {
          detail = await patchTableLayout(layoutId, { name: trimmed, payload });
        }
        onSaved(detail);
        onHide();
      } catch {
        setError(t("tableLayouts.editor.saveError"));
      } finally {
        setSaving(false);
      }
    },
    [
      columnOrder,
      columnWidths,
      createFromStandardMode,
      frozenLeft,
      frozenRight,
      hiddenColumns,
      isLockedStandardLayout,
      layoutId,
      name,
      onHide,
      onSaved,
      sort,
      t,
      tableKey,
      visibleIds,
    ],
  );

  const footer = (() => {
    if (isReadOnlyStandardView) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" label={t("workOrders.no")} severity="secondary" onClick={onHide} />
          <Button
            type="button"
            label={t("tableLayouts.editor.createNew")}
            onClick={startCreateFromStandard}
          />
        </div>
      );
    }
    if (isLockedStandardLayout && createFromStandardMode) {
      return (
        <div className="flex w-full flex-col gap-2">
          {error ? <p className="m-0 w-full text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              label={t("tableLayouts.editor.backToView")}
              severity="secondary"
              onClick={cancelCreateFromStandard}
              disabled={saving}
            />
            <Button type="button" label={t("workOrders.no")} severity="secondary" onClick={onHide} disabled={saving} />
            <Button
              type="button"
              label={t("tableLayouts.editor.save")}
              onClick={() => void save(true)}
              loading={saving}
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex w-full flex-col gap-2">
        {error ? <p className="m-0 w-full text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" label={t("workOrders.no")} severity="secondary" onClick={onHide} disabled={saving} />
          {layoutId ? (
            <Button
              type="button"
              label={t("tableLayouts.editor.saveUpdate")}
              onClick={() => void save(false)}
              loading={saving}
            />
          ) : null}
          <Button
            type="button"
            label={layoutId ? t("tableLayouts.editor.saveAsNew") : t("tableLayouts.editor.save")}
            onClick={() => void save(Boolean(layoutId))}
            loading={saving}
          />
        </div>
      </div>
    );
  })();

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      onShow={updateTabInk}
      header={t("tableLayouts.editor.title")}
      className="app-big-modal-window app-tabbed-modal-window app-table-layout-editor-dialog"
      appendTo={overlayAppendTo}
      footer={footer}
      blockScroll
      modal
      dismissableMask
      draggable={false}
      resizable={false}
    >
      {isReadOnlyStandardView ? (
        <Message
          severity="info"
          className="mb-3 w-full"
          text={t("tableLayouts.standardLayoutLockedHint")}
        />
      ) : null}
      {isLockedStandardLayout && createFromStandardMode ? (
        <Message
          severity="info"
          className="mb-3 w-full"
          text={t("tableLayouts.editor.createNewHint")}
        />
      ) : null}
      <fieldset
        disabled={isReadOnlyStandardView}
        className="m-0 min-w-0 border-0 p-0"
      >
      <div ref={tabHostRef} className="app-tabview-with-ink">
        <TabView
          className="app-sticky-tabs"
          activeIndex={activeTabIndex}
          onTabChange={(e) => setActiveTabIndex(e.index)}
        >
        <TabPanel header={t("tableLayouts.editor.tabs.general")}>
          <div className="flex flex-col gap-1 pt-1">
            <label className="text-xs font-medium text-on-surface-variant" htmlFor="table-layout-name">
              {t("tableLayouts.editor.nameLabel")}
            </label>
            <InputText
              id="table-layout-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full max-w-xl"
              maxLength={200}
            />
          </div>
        </TabPanel>

        <TabPanel header={t("tableLayouts.editor.tabs.columns")}>
          <div className="flex flex-col gap-2 pt-1">
            <p className="m-0 text-xs text-on-surface-variant">{t("tableLayouts.editor.columnPoolsHint")}</p>
            <PickList
              dataKey="id"
              source={pickListSource}
              target={pickListTarget}
              onChange={onColumnPickListChange}
              itemTemplate={(item: ColumnPoolItem) => <span className="text-sm">{item.label}</span>}
              sourceHeader={t("tableLayouts.editor.columnPoolAvailable")}
              targetHeader={t("tableLayouts.editor.columnPoolActive")}
              showSourceControls={false}
              showTargetControls
              filter
              filterBy="label"
              sourceFilterPlaceholder={t("tableLayouts.editor.columnPoolFilterPlaceholder")}
              targetFilterPlaceholder={t("tableLayouts.editor.columnPoolFilterPlaceholder")}
              className="app-table-layout-editor-picklist w-full"
              sourceStyle={{ height: "min(24rem, 42vh)" }}
              targetStyle={{ height: "min(24rem, 42vh)" }}
              breakpoint="960px"
            />
          </div>
        </TabPanel>

        <TabPanel header={t("tableLayouts.editor.tabs.sort")}>
          <div className="flex flex-col gap-2 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-on-surface-variant">{t("tableLayouts.editor.sort")}</span>
              <Button
                type="button"
                size="small"
                label={t("tableLayouts.editor.addSort")}
                onClick={addSortRow}
                disabled={sortFieldOptions.length === 0}
              />
            </div>
            {sort.length === 0 ? (
              <p className="m-0 text-xs text-on-surface-variant">{t("tableLayouts.editor.sortEmpty")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {sort.map((entry, idx) => (
                  <li key={`${entry.field}-${idx}`} className="flex flex-wrap items-center gap-2">
                    <Dropdown
                      value={entry.field}
                      options={sortFieldOptions}
                      optionLabel="label"
                      optionValue="value"
                      onChange={(e) => {
                        const field = e.value as string;
                        setSort((cur) => cur.map((s, i) => (i === idx ? { ...s, field } : s)));
                      }}
                      className="min-w-[12rem] flex-1"
                      appendTo={overlayAppendTo}
                    />
                    <Dropdown
                      value={entry.order}
                      options={[
                        { label: t("tableLayouts.editor.sortAsc"), value: 1 },
                        { label: t("tableLayouts.editor.sortDesc"), value: -1 },
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      onChange={(e) => {
                        const order = e.value as 1 | -1;
                        setSort((cur) => cur.map((s, i) => (i === idx ? { ...s, order } : s)));
                      }}
                      className="w-36"
                      appendTo={overlayAppendTo}
                    />
                    <Button
                      type="button"
                      icon="pi pi-times"
                      severity="danger"
                      text
                      onClick={() => setSort((cur) => cur.filter((_, i) => i !== idx))}
                      aria-label={t("tableLayouts.editor.removeSort")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabPanel>

        <TabPanel header={t("tableLayouts.editor.tabs.frozen")}>
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-xs font-medium text-on-surface-variant">{t("tableLayouts.editor.frozen")}</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {visibleIds.map((id) => {
                const def = getMonitoringColumnDef(id);
                if (!def?.frozenAllowed) return null;
                const frozenValue = frozenLeft.includes(id) ? "left" : frozenRight.includes(id) ? "right" : "none";
                return (
                  <li key={id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-[8rem]">{t(def.headerKey)}</span>
                    <Dropdown
                      value={frozenValue}
                      options={[
                        { label: t("tableLayouts.editor.frozenNone"), value: "none" },
                        { label: t("tableLayouts.editor.frozenLeft"), value: "left" },
                        { label: t("tableLayouts.editor.frozenRight"), value: "right" },
                      ]}
                      optionLabel="label"
                      optionValue="value"
                      onChange={(e) => setFrozen(id, e.value as "left" | "right" | "none")}
                      className="w-40"
                      appendTo={overlayAppendTo}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </TabPanel>

        <TabPanel header={t("tableLayouts.editor.tabs.widths")}>
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-xs font-medium text-on-surface-variant">{t("tableLayouts.editor.widths")}</span>
            <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">
              {visibleIds.map((id) => {
                const def = getMonitoringColumnDef(id);
                if (!def) return null;
                const w = columnWidths[id] ?? def.defaultWidth ?? null;
                return (
                  <li key={id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-[7rem] shrink-0 truncate">{t(def.headerKey)}</span>
                    <InputNumber
                      value={w}
                      onValueChange={(e) => {
                        const v = e.value;
                        setColumnWidths((cur) => {
                          const next = { ...cur };
                          if (v == null) delete next[id];
                          else next[id] = v;
                          return next;
                        });
                      }}
                      min={40}
                      max={800}
                      suffix=" px"
                      className="w-full"
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        </TabPanel>
        </TabView>
      </div>
      </fieldset>
    </Dialog>
  );
}
