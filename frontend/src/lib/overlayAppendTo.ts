/**
 * Prime overlays (Dropdown, MultiSelect, Calendar, ColorPicker, …) default to
 * the component subtree. Inside a scrollable Dialog, the panel then moves with
 * the dialog when the wheel targets the backdrop or other scrollable areas.
 * Mount overlays on `document.body` so they stay aligned to the viewport.
 */
export const overlayAppendTo: HTMLElement | undefined =
  typeof document !== "undefined" ? document.body : undefined;
