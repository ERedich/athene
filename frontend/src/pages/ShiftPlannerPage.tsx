import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";
import { IconField } from "primereact/iconfield";
import { InputText } from "primereact/inputtext";
import { TabPanel, TabView } from "primereact/tabview";

import { LucideInputSearchIcon } from "../components/LucideInputSearchIcon";
import { ShiftPlannerViewToggle } from "../components/shiftPlanner/ShiftPlannerViewToggle";
import { ShiftWeekCalendar } from "../components/shiftPlanner/ShiftWeekCalendar";
import { ShiftWeekCalendarToolbar } from "../components/shiftPlanner/ShiftWeekCalendarToolbar";
import { shiftWeekAnchor } from "../components/shiftPlanner/ShiftWeekCalendarGrid";
import type { AppShellOutletContext } from "../layout/AppShellLayout";
import {
  formatPeriodTitle,
  getWeekStart,
  isoWeekNumberForWeekStart,
} from "../lib/calendar/calendarDates";
import type { ShiftPlannerViewMode } from "../lib/shiftPlanner/shiftPlannerViewMode";

const TAB_OVERVIEW = 0;

export function ShiftPlannerPage() {
  const { t, i18n } = useTranslation();
  const tabHostRef = useRef<HTMLDivElement | null>(null);
  const { setHeaderActions, setHeaderRowCount } = useOutletContext<AppShellOutletContext>();

  const [activeTab, setActiveTab] = useState(TAB_OVERVIEW);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ShiftPlannerViewMode>("complex");

  const weekStart = useMemo(() => getWeekStart(anchorDate), [anchorDate]);

  const periodTitle = useMemo(() => {
    const base = formatPeriodTitle(anchorDate, "week", i18n.language);
    const weekNum = isoWeekNumberForWeekStart(weekStart);
    return `${t("schichtplaner.calendarWeekShort", { week: weekNum })} · ${base}`;
  }, [anchorDate, i18n.language, t, weekStart]);

  const handlePrev = useCallback(() => {
    setAnchorDate((current) => shiftWeekAnchor(current, -1));
  }, []);

  const handleNext = useCallback(() => {
    setAnchorDate((current) => shiftWeekAnchor(current, 1));
  }, []);

  const handleToday = useCallback(() => {
    setAnchorDate(new Date());
  }, []);

  useEffect(() => {
    setHeaderRowCount(null);
    return () => {
      setHeaderRowCount(null);
    };
  }, [setHeaderRowCount]);

  useEffect(() => {
    setHeaderActions(
      <ul className="m-0 flex w-full list-none items-center gap-1 p-0">
        {activeTab === TAB_OVERVIEW ? (
          <>
            <ShiftPlannerViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            <li className="flex items-center" aria-hidden>
              <span className="app-shift-planner-toolbar-divider" />
            </li>
            <li className="min-w-0 flex-1">
              <ShiftWeekCalendarToolbar
                periodTitle={periodTitle}
                onPrev={handlePrev}
                onNext={handleNext}
                onToday={handleToday}
              />
            </li>
          </>
        ) : null}
        <li className="ml-auto shrink-0">
          <IconField iconPosition="left">
            <LucideInputSearchIcon />
            <InputText
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("schichtplaner.searchPlaceholder")}
              className="app-header-search-input h-9 w-56 !rounded-sm text-sm"
            />
          </IconField>
        </li>
      </ul>,
    );
    return () => setHeaderActions(null);
  }, [
    activeTab,
    handleNext,
    handlePrev,
    handleToday,
    periodTitle,
    searchTerm,
    setHeaderActions,
    t,
    viewMode,
  ]);

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
                  viewMode={viewMode}
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
