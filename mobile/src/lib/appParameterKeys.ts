/** Must match backend `APP_PARAM_KEY_ALLOW_SITE_CHANGE`. */
export const APP_PARAM_KEY_ALLOW_SITE_CHANGE = "GN-ASC" as const;

/** Must match backend `APP_PARAM_KEY_ASSET_KEY_GEN`. */
export const APP_PARAM_KEY_ASSET_KEY_GEN = "GN-AAKG" as const;

/** Must match backend `APP_PARAM_KEY_SHOW_ASSET_KEY_PATH`. */
export const APP_PARAM_KEY_SHOW_ASSET_KEY_PATH = "GN-SAKP" as const;

/** Must match backend `APP_PARAM_KEY_COLORED_ASSET_TREE` (GN-CATR). */
export const APP_PARAM_KEY_COLORED_ASSET_TREE = "GN-CATR" as const;

export type AppParameterAssetKeyMode = "manual" | "auto_incremental";
