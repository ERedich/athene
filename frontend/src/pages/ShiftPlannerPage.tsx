import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { ShiftWeekCalendar } from "../components/shiftPlanner/ShiftWeekCalendar";
import type { AppShellOutletContext } from "../layout/AppShellLayout";

const TAB_OVERVIEW = 0;

export function ShiftPlannerPage() {
  const { t } = useTranslation();
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [activeTab, setActiveTab] = useState(TAB_OVERVIEW);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    setHeaderRowCount(null);
    return () => {
      setHeaderRowCount(null);
    };
  }, [setHeaderRowCount]);

  useEffect(() => {
    setHeaderActions(
      <ul className="flex list-none flex-wrap items-center gap-2 p-0 m-0">
        <li className="ml-auto">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("schichtplaner.searchPlaceholder")}
              className="app-header-search-input h-9 w-56"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [searchTerm, setHeaderActions, t]);

  const updateTabInk = useCallback(() => {
    const host = tabHostRef.current;
    if (!host) return;
    const nav = host.querySelector<HTMLElement>(".p-tabview-nav");
    const active = nav?.querySelector<HTMLElement>("li.p-highlight .p-tabview-nav-link");
    if (!nav || !active) return;
    nav.style.setProperty("--app-ink-x", `${active.offsetLeft}px`);
    nav.style.setProperty("--app-ink-w", `${active.offsetWidth}px`);
  }, []);

  useLayoutEffect(() => {
    const raf = requestAnimationFrame(updateTabInk);
    return () => cancelAnimationFrame(raf);
  }, [activeTab, updateTabInk]);

  useEffect(() => {
    window.addEventListener("resize", updateTabInk);
    return () => window.removeEventListener("resize", updateTabInk);
  }, [updateTabInk]);

  const handleTabChange = useCallback((event: { index: number }) => {
    setActiveTab(event.index);
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="app-tabbed-page-shell min-h-0 flex flex-1 flex-col">
        <div ref={tabHostRef} className="app-tabview-with-ink">
          <TabView className="app-sticky-tabs" activeIndex={activeTab} onTabChange={handleTabChange}>
            <TabPanel header={t("schichtplaner.tabOverview")}>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ShiftWeekCalendar
                  anchorDate={anchorDate}
                  searchTerm={searchTerm}
                  onAnchorDateChange={setAnchorDate}
                />
              </div>
            </TabPanel>
            <TabPanel header={t("schichtplaner.tabPlan")}>
              <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant">
                {t("schichtplaner.comingSoon")}
              </div>
            </TabPanel>
            <TabPanel header={t("schichtplaner.tabReports")}>
              <div className="flex flex-1 items-center justify-center p-8 text-on-surface-variant">
                {t("schichtplaner.comingSoon")}
              </div>
            </TabPanel>
          </TabView>
        </div>
      </div>
    </div>
  );
}
