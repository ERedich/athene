/**
 * Dokument-Kategorien (alle Apps). Muss mit Backend `DocumentCategory` übereinstimmen.
 * Prefer importing from `./documentCategory` for new code.
 * Farben sind bewusst hardcoded; später z. B. aus Standort-/Mandanten-Konfiguration oder API.
 */
export const ASSET_DOCUMENT_CATEGORY_ORDER = [
  "general",
  "protocols",
  "drawings",
  "instructions",
  "nameplates",
  "certificates",
] as const;

export type AssetDocumentCategory = (typeof ASSET_DOCUMENT_CATEGORY_ORDER)[number];

export function isAssetDocumentCategory(v: string): v is AssetDocumentCategory {
  return (ASSET_DOCUMENT_CATEGORY_ORDER as readonly string[]).includes(v);
}

/** Chip-/Badge-Klassen (Tailwind): Text + dezenter Hintergrund. */
export const DOCUMENT_CATEGORY_BADGE_CLASS: Record<AssetDocumentCategory, string> = {
  general: "bg-slate-500/15 text-slate-800 dark:bg-slate-400/20 dark:text-slate-100",
  protocols: "bg-sky-500/15 text-sky-900 dark:bg-sky-400/20 dark:text-sky-50",
  drawings: "bg-violet-500/15 text-violet-900 dark:bg-violet-400/20 dark:text-violet-50",
  instructions: "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-50",
  nameplates: "bg-amber-500/18 text-amber-950 dark:bg-amber-400/20 dark:text-amber-50",
  certificates: "bg-rose-500/15 text-rose-900 dark:bg-rose-400/18 dark:text-rose-50",
};

export function documentCategoryBadgeClass(category: string): string {
  if (isAssetDocumentCategory(category)) return DOCUMENT_CATEGORY_BADGE_CLASS[category];
  return DOCUMENT_CATEGORY_BADGE_CLASS.general;
}
