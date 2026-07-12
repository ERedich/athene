/**
 * Bottom sheets / action sheets (context menus, pickers, feedback forms).
 * Render via [`BottomSheetModal`](../components/BottomSheetModal.tsx).
 *
 * Behaviour:
 * - Backdrop fades in (`Modal` `animationType="fade"`), does not slide with the sheet.
 * - Sheet slides up from the bottom.
 * - Tap on the dimmed backdrop dismisses (unless `dismissOnBackdropPress={false}`).
 */

export const BOTTOM_SHEET_BACKDROP_COLOR = "rgba(0,0,0,0.45)";
export const BOTTOM_SHEET_SLIDE_OFFSET = 360;
export const BOTTOM_SHEET_SLIDE_DURATION_MS = 280;

export function bottomSheetBackdropStyle() {
  return {
    flex: 1,
    backgroundColor: BOTTOM_SHEET_BACKDROP_COLOR,
    justifyContent: "flex-end" as const,
  };
}
