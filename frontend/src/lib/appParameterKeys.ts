/** Must match backend `APP_PARAM_KEY_ALLOW_SITE_CHANGE`. */
export const APP_PARAM_KEY_ALLOW_SITE_CHANGE = "GN-ASC" as const;

/** Must match backend `APP_PARAM_KEY_ASSET_TYPES`. */
export const APP_PARAM_KEY_ASSET_TYPES = "GN-ATYP" as const;

/** Must match backend `APP_PARAM_KEY_DEFAULT_WORKGROUP` (WO-DWG). */
export const APP_PARAM_KEY_DEFAULT_WORKGROUP = "WO-DWG" as const;

/** Must match backend `APP_PARAM_KEY_ENABLE_CLEVER_SEARCH` (WO-ECS). */
export const APP_PARAM_KEY_ENABLE_CLEVER_SEARCH = "WO-ECS" as const;

/** Must match backend `APP_PARAM_KEY_WO_MODAL_VIEW` (GN-WOMD). */
export const APP_PARAM_KEY_WO_MODAL_VIEW = "GN-WOMD" as const;

/** Must match backend `APP_PARAM_KEY_ASSET_KEY_GEN`. */
export const APP_PARAM_KEY_ASSET_KEY_GEN = "GN-AAKG" as const;

/** Must match backend `APP_PARAM_KEY_SHOW_ASSET_KEY_PATH`. */
export const APP_PARAM_KEY_SHOW_ASSET_KEY_PATH = "GN-SAKP" as const;

/** Must match backend `APP_PARAM_KEY_COLORED_ASSET_TREE` (GN-CATR). */
export const APP_PARAM_KEY_COLORED_ASSET_TREE = "GN-CATR" as const;

/** Must match backend `APP_PARAM_KEY_PRIMARY_COLOR` (GN-PRIM). */
export const APP_PARAM_KEY_PRIMARY_COLOR = "GN-PRIM" as const;

/** Must match backend `APP_PARAM_KEY_INTRO` (GN-INTRO). */
export const APP_PARAM_KEY_INTRO = "GN-INTRO" as const;

/** Default when GN-PRIM is missing; must match backend `DEFAULT_PRIMARY_COLOR_HEX`. */
export const DEFAULT_PRIMARY_COLOR_HEX = "#f97316" as const;

/** Must match backend `APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA` (MT-ACSD). */
export const APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA = "MT-ACSD" as const;

/** Must match backend `APP_PARAM_KEY_DEFAULT_SHIFT_HOURS` (SH-DSH). */
export const APP_PARAM_KEY_DEFAULT_SHIFT_HOURS = "SH-DSH" as const;

/** Must match backend `APP_PARAM_KEY_GENERATE_WO_FROM_MP` (WO-GNWO). */
export const APP_PARAM_KEY_GENERATE_WO_FROM_MP = "WO-GNWO" as const;

/** Must match backend `APP_PARAM_KEY_CALENDAR_MIN_DURATION` (WO-CLMD). */
export const APP_PARAM_KEY_CALENDAR_MIN_DURATION = "WO-CLMD" as const;

/** Must match backend `DEFAULT_CALENDAR_MIN_DURATION_HOURS`. */
export const DEFAULT_CALENDAR_MIN_DURATION_HOURS = 4;

export function parseCalendarMinDurationHours(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const i = Math.round(raw);
    if (i >= 0 && i <= 100 && Math.abs(raw - i) < 1e-9) return i;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    return parseCalendarMinDurationHours(Number(raw));
  }
  return DEFAULT_CALENDAR_MIN_DURATION_HOURS;
}

/** Must match backend `SITE_APP_PARAM_KEY_WO_PCR` (site-scoped). */
export const SITE_APP_PARAM_KEY_WO_PCR = "WO-PCR" as const;

export type AppParameterAssetKeyMode = "manual" | "auto_incremental";
