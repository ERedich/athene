import type { TabsLayoutPayload } from "../layoutEditor/types";
import { DEFAULT_TABS_LAYOUT } from "../layoutEditor/types";

const VAR_PREFIX = "--app-tab";

/** Apply LY_STANDARD_TABS tokens as CSS variables on an element (typically documentElement). */
export function applyTabsLayoutCssVars(
  target: HTMLElement,
  tabs: TabsLayoutPayload | null | undefined,
): void {
  const t = tabs ?? DEFAULT_TABS_LAYOUT;
  target.style.setProperty(`${VAR_PREFIX}-font-family`, `"${t.label.fontFamily}", sans-serif`);
  target.style.setProperty(`${VAR_PREFIX}-font-size`, t.label.fontSize);
  target.style.setProperty(`${VAR_PREFIX}-font-weight`, String(t.label.fontWeight));
  target.style.setProperty(`${VAR_PREFIX}-letter-spacing`, t.label.letterSpacing);
  target.style.setProperty(`${VAR_PREFIX}-text-transform`, t.label.textTransform);
  target.style.setProperty(`${VAR_PREFIX}-badge-font-size`, t.badge.fontSize);
  target.style.setProperty(`${VAR_PREFIX}-badge-radius`, t.badge.borderRadius);
}

export function clearTabsLayoutCssVars(target: HTMLElement): void {
  for (const name of [
    "font-family",
    "font-size",
    "font-weight",
    "letter-spacing",
    "text-transform",
    "badge-font-size",
    "badge-radius",
  ]) {
    target.style.removeProperty(`${VAR_PREFIX}-${name}`);
  }
}
