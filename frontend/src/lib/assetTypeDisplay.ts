/** Must match backend `ASSET_TYPE_KEYS` / `AssetTypeSlug`. */
export const ASSET_TYPE_SLUGS = ["site", "structure", "line", "maintenanceObject"] as const;
export type AssetTypeSlug = (typeof ASSET_TYPE_SLUGS)[number];

export type AssetTypeDisplayEntry = {
  nameDe: string;
  nameEn: string;
  colorHex: string;
};

export type AssetTypeDisplayConfig = Record<AssetTypeSlug, AssetTypeDisplayEntry>;

/** Default when DB row missing or invalid (must match migration `016_app_parameter_gn_atyp_json.sql`). */
export const DEFAULT_ASSET_TYPE_DISPLAY_CONFIG: AssetTypeDisplayConfig = {
  site: { nameDe: "Location", nameEn: "Location", colorHex: "#f97316" },
  structure: { nameDe: "Struktur", nameEn: "Structure", colorHex: "#ea580c" },
  line: { nameDe: "Linie", nameEn: "Line", colorHex: "#78716c" },
  maintenanceObject: {
    nameDe: "Instandhaltungsobjekt",
    nameEn: "Maintenance object",
    colorHex: "#ef4444",
  },
};

function parseColorHexStrict(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toLowerCase()}`;
}

export function parseAssetTypeDisplayConfig(raw: unknown): AssetTypeDisplayConfig | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out = {} as Partial<AssetTypeDisplayConfig>;
  for (const k of ASSET_TYPE_SLUGS) {
    const v = o[k];
    if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
    const e = v as Record<string, unknown>;
    const nameDe = typeof e.nameDe === "string" ? e.nameDe.trim() : "";
    const nameEn = typeof e.nameEn === "string" ? e.nameEn.trim() : "";
    if (!nameDe || !nameEn || nameDe.length > 160 || nameEn.length > 160) return null;
    const colorHex = parseColorHexStrict(e.colorHex);
    if (!colorHex) return null;
    out[k] = { nameDe, nameEn, colorHex };
  }
  return out as AssetTypeDisplayConfig;
}
