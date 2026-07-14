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

/** Must match backend `APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA` (MT-ACSD). */
export const APP_PARAM_KEY_ALLOW_CHANGE_STOCKDATA = "MT-ACSD" as const;

/** Must match backend `APP_PARAM_KEY_DEFAULT_SHIFT_HOURS` (SH-DSH). */
export const APP_PARAM_KEY_DEFAULT_SHIFT_HOURS = "SH-DSH" as const;

export type AppParameterAssetKeyMode = "manual" | "auto_incremental";
