/** PrimeReact / PrimeOne named palette at shade 500 — always offered as favorites. */
export const PRIME_COLOR_FAVORITES = [
  { key: "blue", hex: "#3b82f6" },
  { key: "green", hex: "#22c55e" },
  { key: "yellow", hex: "#eab308" },
  { key: "cyan", hex: "#06b6d4" },
  { key: "pink", hex: "#ec4899" },
  { key: "indigo", hex: "#6366f1" },
  { key: "teal", hex: "#14b8a6" },
  { key: "orange", hex: "#f97316" },
  { key: "bluegray", hex: "#64748b" },
  { key: "purple", hex: "#a855f7" },
  { key: "red", hex: "#ef4444" },
] as const;

export type PrimeColorFavoriteKey = (typeof PRIME_COLOR_FAVORITES)[number]["key"];

export const DEFAULT_PICKER_COLOR_HEX = "#64748b";

/** Strip `#` for PrimeReact ColorPicker `format="hex"` value binding. */
export function pickerValueFromStored(hex: string): string {
  return hex.replace(/^#/, "").toLowerCase();
}

/** Normalize picker / favorite input to `#rrggbb`. */
export function storedFromPickerValue(
  raw: string,
  fallback: string = DEFAULT_PICKER_COLOR_HEX,
): string {
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/i.exec(withHash);
  if (!m) return fallback;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h}`;
}

export function colorsEqualHex(a: string, b: string): boolean {
  return storedFromPickerValue(a) === storedFromPickerValue(b);
}
