import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { NavLink, useLocation } from "react-router-dom";
import { Ripple } from "primereact/ripple";

import {
  ONBOARDING_EXPAND_NAV_EVENT,
  type OnboardingExpandNavDetail,
} from "../onboarding/onboardingDom";
import { useNavLayout } from "./NavLayoutContext";
import {
  activeNavGroupIds,
  isNavGroupActive,
} from "./navModel";

const navIconClass = "h-[1.125rem] w-[1.125rem] shrink-0";

const navBtnBase =
  "app-sidebar-nav-link p-ripple relative overflow-hidden w-full flex items-center text-left text-sm text-on-surface-variant rounded-lg transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] hover:text-[var(--color-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const navGroupBtnExpanded = "relative gap-3 px-3 py-2.5 pr-9";
const navBtnCollapsed = "justify-center px-0 py-2.5";

const navChildBtn = "app-sidebar-nav-sublink gap-2 py-2 pr-3 pl-2";
const navChildBtnCollapsed = "justify-center px-0 py-2";

/** Spotlight targets for first-login tour (sidebar child links). */
const ONBOARDING_ITEM_TARGETS: Record<string, string> = {
  "/employees": "employees",
  "/monitoring": "monitoring",
};

const activeNavBtn =
  "bg-[color-mix(in_srgb,var(--color-primary)_18%,transparent)] text-[var(--color-primary)]";

const activeGroupBtn =
  "text-[var(--color-primary)] font-semibold";

type SidebarNavProps = {
  collapsed: boolean;
};

export function SidebarNav({ collapsed }: SidebarNavProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { sidebarGroups } = useNavLayout();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(activeNavGroupIds(pathname, sidebarGroups)),
  );

  useEffect(() => {
    const activeIds = activeNavGroupIds(pathname, sidebarGroups);
    if (activeIds.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of activeIds) {
        next.add(id);
      }
      return next;
    });
  }, [pathname, sidebarGroups]);

  useEffect(() => {
    const onExpand = (event: Event) => {
      const detail = (event as CustomEvent<OnboardingExpandNavDetail>).detail;
      const groupId = detail?.groupId;
      if (!groupId) return;
      setExpanded((prev) => {
        if (prev.has(groupId)) return prev;
        const next = new Set(prev);
        next.add(groupId);
        return next;
      });
    };
    window.addEventListener(ONBOARDING_EXPAND_NAV_EVENT, onExpand);
    return () => window.removeEventListener(ONBOARDING_EXPAND_NAV_EVENT, onExpand);
  }, []);

  const toggleGroup = (groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div className="app-sidebar-nav space-y-1">
      {sidebarGroups.map((group) => {
        const groupLabel =
          "label" in group && typeof group.label === "string" && group.label
            ? group.label
            : t(group.labelKey);
        const isOpen = expanded.has(group.id);
        const groupActive = isNavGroupActive(pathname, group);
        const { Icon: GroupIcon } = group;

        if (group.items.length === 0 && group.to) {
          const isFeedback = group.id === "feedback";
          return (
            <div
              key={group.id}
              className="app-sidebar-nav-group"
              data-onboarding={group.id}
            >
              <NavLink
                to={group.to}
                end={group.end}
                title={collapsed ? groupLabel : undefined}
                aria-label={collapsed ? groupLabel : undefined}
                className={({ isActive }) =>
                  `${navBtnBase} ${
                    collapsed ? navBtnCollapsed : "gap-3 px-3 py-2.5"
                  } ${isActive ? activeNavBtn : ""} ${
                    isFeedback ? "app-sidebar-nav-link--feedback" : ""
                  }`
                }
              >
                <GroupIcon
                  className={navIconClass}
                  strokeWidth={1.75}
                  aria-hidden
                />
                {collapsed ? null : (
                  <span className="min-w-0 flex-1 text-left leading-snug">
                    {groupLabel}
                  </span>
                )}
                <Ripple />
              </NavLink>
            </div>
          );
        }

        return (
          <div
            key={group.id}
            className="app-sidebar-nav-group"
            data-onboarding={group.id}
          >
            <button
              type="button"
              className={`${navBtnBase} ${
                collapsed ? navBtnCollapsed : navGroupBtnExpanded
              } ${groupActive ? activeGroupBtn : ""}`}
              aria-expanded={isOpen}
              aria-controls={`sidebar-nav-${group.id}`}
              title={collapsed ? groupLabel : undefined}
              onClick={() => toggleGroup(group.id)}
            >
              <GroupIcon
                className={navIconClass}
                strokeWidth={1.75}
                aria-hidden
              />
              {collapsed ? null : (
                <span className="min-w-0 flex-1 pr-0.5 text-left leading-snug">
                  {groupLabel}
                </span>
              )}
              {collapsed ? null : (
                <ChevronRight
                  className={`app-sidebar-nav-chevron pointer-events-none absolute right-1.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-70 ${
                    isOpen ? "app-sidebar-nav-chevron--open" : ""
                  }`}
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
              <Ripple />
            </button>
            <div
              id={`sidebar-nav-${group.id}`}
              className={`app-sidebar-nav-submenu ${
                isOpen ? "app-sidebar-nav-submenu--open" : ""
              }`}
              role="group"
              aria-label={groupLabel}
              aria-hidden={!isOpen}
            >
              <div
                className={`app-sidebar-nav-submenu-inner space-y-0.5 ${
                  collapsed
                    ? "flex flex-col items-center pt-0.5"
                    : isOpen
                      ? "app-sidebar-nav-submenu-inner--expanded pt-0.5"
                      : "pt-0.5"
                }`}
              >
                {group.items.map((item) => {
                  const { Icon } = item;
                  const itemLabel =
                    "label" in item && typeof item.label === "string" && item.label
                      ? item.label
                      : t(item.labelKey);
                  const onboardingTarget = ONBOARDING_ITEM_TARGETS[item.to];
                  return (
                    <NavLink
                      key={String(("id" in item && item.id) || item.to)}
                      to={item.to}
                      end={item.end}
                      tabIndex={isOpen ? undefined : -1}
                      title={collapsed ? itemLabel : undefined}
                      aria-label={collapsed ? itemLabel : undefined}
                      data-onboarding={onboardingTarget}
                      className={({ isActive }) =>
                        `${navBtnBase} ${
                          collapsed ? navChildBtnCollapsed : navChildBtn
                        } ${isActive ? activeNavBtn : ""}`
                      }
                    >
                      <Icon
                        className={navIconClass}
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      {collapsed ? null : (
                        <span className="truncate">{itemLabel}</span>
                      )}
                      <Ripple />
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
