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
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";

import { ContextMenuEditor } from "./ContextMenuEditor";
import { LayoutPreviewDialog } from "./LayoutPreviewDialog";
import { ModalFormBuilder } from "./ModalFormBuilder";
import { TabsLayoutEditor } from "./TabsLayoutEditor";
import type { AppLayout, AppLayoutWritePayload } from "../../lib/layoutEditor/api";
import {
  defaultTabsPayload,
  emptyEditorState,
  isAppLayoutAppKey,
  KNOWN_APP_KEYS,
  normalizeModalPayload,
  type AppLayoutAppKey,
  type ContextMenuLayoutPayload,
  type ModalLayoutPayload,
  type TableLayoutPayload,
  type TabsLayoutPayload,
} from "../../lib/layoutEditor/types";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS, useTabInk } from "../../lib/tabs";
import { DEFAULT_SITE_COLOR_HEX, readableSiteColor } from "../../lib/siteColor";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

export type LayoutEditorPanelHandle = {
  save: () => void;
  openPreview: () => void;
};

type SiteOption = {
  id: string;
  key: string;
  name: string;
  colorHex: string;
};

type SiteDropdownOption = { label: string; value: string };

type Props = {
  editing: AppLayout | null;
  sites: SiteOption[];
  siteFieldLocked: boolean;
  workingSiteId: string;
  saving: boolean;
  canEditSystem: boolean;
  onSave: (payload: AppLayoutWritePayload) => void;
  onValidationError: (messageKey: string) => void;
  onOpenTableEditor: (draft: {
    key: string;
    name: string;
    siteId: string;
    appKey: string;
    modal: ModalLayoutPayload;
    table: TableLayoutPayload;
    contextMenu: ContextMenuLayoutPayload;
    tabs: TabsLayoutPayload;
    isSystem: boolean;
  }) => void;
};

export const LayoutEditorPanel = forwardRef<LayoutEditorPanelHandle, Props>(
  function LayoutEditorPanel(
    {
      editing,
      sites,
      siteFieldLocked,
      workingSiteId,
      saving,
      canEditSystem,
      onSave,
      onValidationError,
      onOpenTableEditor,
    },
    ref,
  ) {
    const { t } = useTranslation();
    const readOnly = Boolean(editing?.isSystem && !canEditSystem);

    const [key, setKey] = useState("");
    const [name, setName] = useState("");
    const [siteId, setSiteId] = useState(workingSiteId);
    const [appKey, setAppKey] = useState<AppLayoutAppKey>("suppliers");
    const [modal, setModal] = useState<ModalLayoutPayload>({ version: 1, rows: [] });
    const [table, setTable] = useState<TableLayoutPayload>({
      version: 1,
      columns: [],
      sort: [],
      groupBy: [],
    });
    const [contextMenu, setContextMenu] = useState<ContextMenuLayoutPayload>({
      version: 1,
      items: [],
    });
    const [tabs, setTabs] = useState<TabsLayoutPayload>(() => defaultTabsPayload());
    const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState(0);
    const [previewVisible, setPreviewVisible] = useState(false);
    const tabHostRef = useRef<HTMLDivElement>(null);
    const updateTabInk = useTabInk(tabHostRef, [activeTab, appKey]);
    const isDesignApp = appKey === "design";

    useEffect(() => {
      if (editing) {
        setKey(editing.key);
        setName(editing.name);
        setSiteId(editing.siteId);
        setAppKey(isAppLayoutAppKey(editing.appKey) ? editing.appKey : "suppliers");
        setModal(normalizeModalPayload(editing.modal));
        setTable(editing.table);
        setContextMenu(editing.contextMenu);
        setTabs(editing.tabs ?? defaultTabsPayload());
      } else {
        const empty = emptyEditorState("suppliers", workingSiteId);
        setKey(empty.key);
        setName(empty.name);
        setSiteId(empty.siteId);
        setAppKey(empty.appKey);
        setModal(empty.modal);
        setTable(empty.table);
        setContextMenu(empty.contextMenu);
        setTabs(empty.tabs);
      }
      setSelectedColumnId(null);
      setActiveTab(0);
    }, [editing, workingSiteId]);

    const siteDropdownOptions = useMemo<SiteDropdownOption[]>(
      () => sites.map((site) => ({ label: `${site.key} - ${site.name}`, value: site.id })),
      [sites],
    );

    const renderSiteDropdownOption = useCallback(
      (option: SiteDropdownOption) => {
        const site = sites.find((s) => s.id === option.value);
        const hex = site?.colorHex || DEFAULT_SITE_COLOR_HEX;
        return (
          <span className="truncate" style={{ color: readableSiteColor(hex) }} title={option.label}>
            {option.label}
          </span>
        );
      },
      [sites],
    );

    const renderSiteDropdownValue = useCallback(
      (option: SiteDropdownOption | null) => {
        if (!option) return <span className="text-on-surface-variant">{t("layoutEditor.sitePlaceholder")}</span>;
        return renderSiteDropdownOption(option);
      },
      [renderSiteDropdownOption, t],
    );

    const save = useCallback(() => {
      if (readOnly) {
        onValidationError("layoutEditor.systemReadOnly");
        return;
      }
      const trimmedKey = key.trim();
      const trimmedName = name.trim();
      if (!trimmedKey || !trimmedName || !siteId) {
        onValidationError("layoutEditor.validationRequired");
        return;
      }
      onSave({
        key: trimmedKey,
        name: trimmedName,
        siteId,
        appKey,
        modal,
        table,
        contextMenu,
        tabs,
      });
    }, [
      appKey,
      contextMenu,
      key,
      modal,
      name,
      onSave,
      onValidationError,
      readOnly,
      siteId,
      table,
      tabs,
    ]);

    useImperativeHandle(
      ref,
      () => ({
        save,
        openPreview: () => setPreviewVisible(true),
      }),
      [save],
    );

    const appKeyOptions = KNOWN_APP_KEYS.map((k) => ({
      label: t(`layoutEditor.appKey.${k}`),
      value: k,
    }));

    return (
      <>
      <div className="app-tabbed-page-shell min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden">
        <div ref={tabHostRef} className={`${STANDARD_TAB_HOST_CLASS} min-h-0 flex flex-1 flex-col`}>
          <TabView
            activeIndex={activeTab}
            onTabChange={(e) => {
              setActiveTab(e.index);
              requestAnimationFrame(updateTabInk);
            }}
            className={STANDARD_TAB_VIEW_CLASS}
          >
            <TabPanel header={t("layoutEditor.tabBasic")}>
              <div className="app-parameters-tab-panel-inner">
                <div className="flex max-w-4xl flex-col gap-4">
                  {readOnly && (
                    <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-on-surface">
                      {t("layoutEditor.systemReadOnlyBanner")}
                    </div>
                  )}

                  <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-[11px] leading-normal uppercase tracking-wide text-outline">
                        {t("layoutEditor.columnKey")}
                        <span className="app-required-marker">*</span>
                      </label>
                      <InputText
                        value={key}
                        onChange={(e) => setKey(e.target.value)}
                        className="w-full max-w-full"
                        disabled={readOnly || Boolean(editing?.isSystem)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-[11px] leading-normal uppercase tracking-wide text-outline">
                        {t("layoutEditor.columnName")}
                        <span className="app-required-marker">*</span>
                      </label>
                      <InputText
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full max-w-full"
                        disabled={readOnly}
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-[11px] leading-normal uppercase tracking-wide text-outline">
                        {t("layoutEditor.columnSite")}
                        <span className="app-required-marker">*</span>
                      </label>
                      <Dropdown
                        value={siteId}
                        options={siteDropdownOptions}
                        onChange={(e) => setSiteId(String(e.value ?? ""))}
                        className="w-full max-w-full app-inline-icon-dropdown"
                        itemTemplate={renderSiteDropdownOption}
                        valueTemplate={renderSiteDropdownValue}
                        filter
                        disabled={readOnly || siteFieldLocked}
                        appendTo={overlayAppendTo}
                      />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <label className="block text-[11px] leading-normal uppercase tracking-wide text-outline">
                        {t("layoutEditor.columnApp")}
                      </label>
                      <Dropdown
                        value={appKey}
                        options={appKeyOptions}
                        onChange={(e) => {
                          if (editing) return;
                          const next = e.value as AppLayoutAppKey;
                          const empty = emptyEditorState(next, siteId || workingSiteId);
                          setAppKey(next);
                          setModal(empty.modal);
                          setTable(empty.table);
                          setContextMenu(empty.contextMenu);
                          setTabs(empty.tabs);
                          setSelectedColumnId(null);
                        }}
                        className="w-full max-w-full"
                        disabled={Boolean(editing) || readOnly}
                        appendTo={overlayAppendTo}
                      />
                    </div>
                  </div>

                  {editing?.isSystem && (
                    <p className="m-0 text-xs text-on-surface-variant">
                      {t("layoutEditor.systemBadgeHint")}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {!isDesignApp ? (
                      <Button
                        type="button"
                        outlined
                        label={t("layoutEditor.openTableEditor")}
                        disabled={saving}
                        onClick={() =>
                          onOpenTableEditor({
                            key,
                            name,
                            siteId,
                            appKey,
                            modal,
                            table,
                            contextMenu,
                            tabs,
                            isSystem: Boolean(editing?.isSystem),
                          })
                        }
                      />
                    ) : null}
                    <Button
                      type="button"
                      outlined
                      label={t("layoutEditor.preview")}
                      disabled={saving || isDesignApp}
                      onClick={() => setPreviewVisible(true)}
                    />
                  </div>
                </div>
              </div>
            </TabPanel>
            <TabPanel header={t("layoutEditor.tabTabs")}>
              <div className="app-parameters-tab-panel-inner">
                <TabsLayoutEditor value={tabs} onChange={setTabs} readOnly={readOnly} />
              </div>
            </TabPanel>
            {!isDesignApp ? (
              <TabPanel header={t("layoutEditor.tabModal")}>
                <div className="app-parameters-tab-panel-inner !overflow-hidden !p-3">
                  <ModalFormBuilder
                    appKey={appKey}
                    value={modal}
                    onChange={setModal}
                    selectedColumnId={selectedColumnId}
                    onSelectColumn={setSelectedColumnId}
                    sites={sites}
                    readOnly={readOnly}
                  />
                </div>
              </TabPanel>
            ) : null}
            {!isDesignApp ? (
              <TabPanel header={t("layoutEditor.tabContextMenu")}>
                <div className="app-parameters-tab-panel-inner">
                  <ContextMenuEditor
                    value={contextMenu}
                    onChange={setContextMenu}
                    readOnly={readOnly}
                  />
                </div>
              </TabPanel>
            ) : null}
          </TabView>
        </div>
      </div>
      <LayoutPreviewDialog
        visible={previewVisible}
        onHide={() => setPreviewVisible(false)}
        layoutName={name}
        appKey={appKey}
        modal={modal}
        table={table}
        contextMenu={contextMenu}
        sites={sites}
      />
      </>
    );
  },
);
