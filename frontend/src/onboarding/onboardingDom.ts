/** Custom events so the shell can expand for spotlight targets without tight coupling. */

export const ONBOARDING_EXPAND_NAV_EVENT = "athene:onboarding:expand-nav";
export const ONBOARDING_ENSURE_SIDEBAR_EVENT = "athene:onboarding:ensure-sidebar";

export type OnboardingExpandNavDetail = {
  groupId: string;
};

export function requestExpandNavGroup(groupId: string): void {
  window.dispatchEvent(
    new CustomEvent<OnboardingExpandNavDetail>(ONBOARDING_EXPAND_NAV_EVENT, {
      detail: { groupId },
    }),
  );
}

export function requestEnsureSidebarExpanded(): void {
  window.dispatchEvent(new CustomEvent(ONBOARDING_ENSURE_SIDEBAR_EVENT));
}

export function queryOnboardingTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-onboarding="${target}"]`);
}

export function scrollOnboardingTargetIntoView(target: string): void {
  const el = queryOnboardingTarget(target);
  if (!el) return;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

