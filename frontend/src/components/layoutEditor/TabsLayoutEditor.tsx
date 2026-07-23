import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";

import { AppTabHeader } from "../tabs/AppTabHeader";
import { applyTabsLayoutCssVars } from "../../lib/tabs/applyTabsLayoutCssVars";
import { STANDARD_TAB_HOST_CLASS, STANDARD_TAB_VIEW_CLASS, useTabInk } from "../../lib/tabs";
import type { TabsLayoutPayload } from "../../lib/layoutEditor/types";
import { overlayAppendTo } from "../../lib/overlayAppendTo";

type Props = {
  value: TabsLayoutPayload;
  onChange: (next: TabsLayoutPayload) => void;
  readOnly?: boolean;
};

const TEXT_TRANSFORM_OPTIONS = [
  { label: "uppercase", value: "uppercase" },
  { label: "none", value: "none" },
  { label: "capitalize", value: "capitalize" },
  { label: "lowercase", value: "lowercase" },
] as const;

export function TabsLayoutEditor({ value, onChange, readOnly = false }: Props) {
  const { t } = useTranslation();
  const previewHostRef = useRef<HTMLDivElement>(null);
  const [previewTab, setPreviewTab] = useState(0);
  const updateTabInk = useTabInk(previewHostRef, [previewTab, value]);

  useEffect(() => {
    if (previewHostRef.current) {
      applyTabsLayoutCssVars(previewHostRef.current, value);
    }
  }, [value]);

  const patch = (partial: Partial<TabsLayoutPayload>) => {
    if (readOnly) return;
    onChange({ ...value, ...partial });
  };

  const patchLabel = (partial: Partial<TabsLayoutPayload["label"]>) => {
    if (readOnly) return;
    onChange({ ...value, label: { ...value.label, ...partial } });
  };

  const patchBadge = (partial: Partial<TabsLayoutPayload["badge"]>) => {
    if (readOnly) return;
    onChange({ ...value, badge: { ...value.badge, ...partial } });
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.tabsEditorHint")}</p>

        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5 sm:col-span-2">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.tabsHostClass")}
            </label>
            <InputText
              value={value.hostClass}
              disabled={readOnly}
              className="w-full"
              onChange={(e) => patch({ hostClass: e.target.value })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.tabsTabViewClass")}
            </label>
            <InputText
              value={value.tabViewClass}
              disabled={readOnly}
              className="w-full"
              onChange={(e) => patch({ tabViewClass: e.target.value })}
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <label className="block text-[11px] uppercase tracking-wide text-outline">
              {t("layoutEditor.tabsBadgeClass")}
            </label>
            <InputText
              value={value.badgeClass}
              disabled={readOnly}
              className="w-full"
              onChange={(e) => patch({ badgeClass: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox
              inputId="tabs-sticky"
              checked={value.sticky}
              disabled={readOnly}
              onChange={(e) => patch({ sticky: Boolean(e.checked) })}
            />
            <label htmlFor="tabs-sticky" className="text-sm">
              {t("layoutEditor.tabsSticky")}
            </label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox
              inputId="tabs-ink"
              checked={value.ink}
              disabled={readOnly}
              onChange={(e) => patch({ ink: Boolean(e.checked) })}
            />
            <label htmlFor="tabs-ink" className="text-sm">
              {t("layoutEditor.tabsInk")}
            </label>
          </div>
        </div>

        <div className="border-t border-[color-mix(in_srgb,var(--color-on-surface)_12%,transparent)] pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            {t("layoutEditor.tabsLabelTokens")}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5 sm:col-span-2">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsFontFamily")}
              </label>
              <InputText
                value={value.label.fontFamily}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => patchLabel({ fontFamily: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsFontSize")}
              </label>
              <InputText
                value={value.label.fontSize}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => patchLabel({ fontSize: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsFontWeight")}
              </label>
              <InputNumber
                value={value.label.fontWeight}
                disabled={readOnly}
                className="w-full"
                inputClassName="w-full"
                onValueChange={(e) =>
                  patchLabel({ fontWeight: typeof e.value === "number" ? e.value : value.label.fontWeight })
                }
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsLetterSpacing")}
              </label>
              <InputText
                value={value.label.letterSpacing}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => patchLabel({ letterSpacing: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsTextTransform")}
              </label>
              <Dropdown
                value={value.label.textTransform}
                options={[...TEXT_TRANSFORM_OPTIONS]}
                disabled={readOnly}
                className="w-full"
                appendTo={overlayAppendTo}
                onChange={(e) =>
                  patchLabel({
                    textTransform: e.value as TabsLayoutPayload["label"]["textTransform"],
                  })
                }
              />
            </div>
          </div>
        </div>

        <div className="border-t border-[color-mix(in_srgb,var(--color-on-surface)_12%,transparent)] pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            {t("layoutEditor.tabsBadgeTokens")}
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsBadgeFontSize")}
              </label>
              <InputText
                value={value.badge.fontSize}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => patchBadge({ fontSize: e.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <label className="block text-[11px] uppercase tracking-wide text-outline">
                {t("layoutEditor.tabsBadgeRadius")}
              </label>
              <InputText
                value={value.badge.borderRadius}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => patchBadge({ borderRadius: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2 pt-2 sm:col-span-2">
              <Checkbox
                inputId="tabs-hide-zero"
                checked={value.badge.hideZero}
                disabled={readOnly}
                onChange={(e) => patchBadge({ hideZero: Boolean(e.checked) })}
              />
              <label htmlFor="tabs-hide-zero" className="text-sm">
                {t("layoutEditor.tabsHideZero")}
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {t("layoutEditor.tabsPreview")}
        </div>
        <div
          ref={previewHostRef}
          className={`${STANDARD_TAB_HOST_CLASS} rounded-sm border border-[color-mix(in_srgb,var(--color-on-surface)_14%,transparent)] bg-surface-container-low p-2`}
        >
          <TabView
            className={STANDARD_TAB_VIEW_CLASS}
            activeIndex={previewTab}
            onTabChange={(e) => {
              setPreviewTab(e.index);
              requestAnimationFrame(updateTabInk);
            }}
          >
            <TabPanel header={<AppTabHeader label={t("layoutEditor.tabsPreviewGeneral")} />}>
              <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.tabsPreviewPanel")}</p>
            </TabPanel>
            <TabPanel
              header={
                <AppTabHeader
                  label={t("layoutEditor.tabsPreviewDocuments")}
                  count={4}
                  hideZero={value.badge.hideZero}
                />
              }
            >
              <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.tabsPreviewPanel")}</p>
            </TabPanel>
            <TabPanel
              header={
                <AppTabHeader
                  label={t("layoutEditor.tabsPreviewMessages")}
                  count={0}
                  hideZero={value.badge.hideZero}
                />
              }
            >
              <p className="m-0 text-sm text-on-surface-variant">{t("layoutEditor.tabsPreviewPanel")}</p>
            </TabPanel>
          </TabView>
        </div>
      </div>
    </div>
  );
}
