import { Platform, type PressableProps } from "react-native";

/** Default dim on press (buttons, pickers, header actions). */
export const PRESSED_OPACITY_CONTROL = 0.85;

/** List rows and large tappable surfaces — slightly subtler dim on iOS. */
export const PRESSED_OPACITY_ROW = 0.9;

/** Stronger feedback (e.g. primary CTAs). */
export const PRESSED_OPACITY_STRONG = 0.92;

export function pressedOpacity(
  pressed: boolean,
  opacity: number = PRESSED_OPACITY_CONTROL,
): { opacity: number } | undefined {
  return pressed ? { opacity } : undefined;
}

/** Android Material ripple for full-width rows and cards (no-op on iOS). */
export function androidRippleProps(color: string, borderless = false): Partial<Pick<PressableProps, "android_ripple">> {
  if (Platform.OS !== "android") return {};
  return { android_ripple: { color, borderless } };
}

/** Theme-aware ripple tint for list rows / surfaces on Android. */
export function surfaceRippleColor(isDark: boolean): string {
  return isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.09)";
}
