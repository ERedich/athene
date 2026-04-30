import i18n from "../i18n";
import deBundle from "../locales/de.json";
import enBundle from "../locales/en.json";
import { apiFetch } from "./api";
import {
  cloneJsonTree,
  deepMergeTranslationTrees,
  flattenStringLeaves,
  unflattenToNested,
} from "./flattenTranslations";

type OverrideApiRow = { messageKey: string; locale: string; value: string };

function builtInFlatMaps(): { de: Record<string, string>; en: Record<string, string> } {
  return {
    de: flattenStringLeaves(deBundle as unknown as Record<string, unknown>),
    en: flattenStringLeaves(enBundle as unknown as Record<string, unknown>),
  };
}

/**
 * Recompute i18n bundles from built-in JSON + DB overrides. Safe to call when not authenticated (no-op on failure).
 */
export async function applyUiTranslationOverrides(): Promise<void> {
  try {
    const res = await apiFetch("/api/ui-translation-overrides");
    if (!res.ok) return;
    const data = (await res.json()) as { overrides?: OverrideApiRow[] };
    const deFlat: Record<string, string> = {};
    const enFlat: Record<string, string> = {};
    for (const row of data.overrides ?? []) {
      if (row.locale === "de") deFlat[row.messageKey] = row.value;
      else if (row.locale === "en") enFlat[row.messageKey] = row.value;
    }
    const baseDeRecord = cloneJsonTree(deBundle) as Record<string, unknown>;
    const baseEnRecord = cloneJsonTree(enBundle) as Record<string, unknown>;

    const nestedDe = unflattenToNested(deFlat);
    const nestedEn = unflattenToNested(enFlat);

    const mergedDe = deepMergeTranslationTrees(baseDeRecord, nestedDe);
    const mergedEn = deepMergeTranslationTrees(baseEnRecord, nestedEn);

    await i18n.addResourceBundle("de", "translation", mergedDe, true, true);
    await i18n.addResourceBundle("en", "translation", mergedEn, true, true);
    await i18n.changeLanguage(i18n.language);
  } catch {
    /* keep bundled defaults */
  }
}

/** Baseline flattened strings from shipped JSON (for the translation editor UI). */
export function getBuiltInFlattenedBundles(): {
  baselineDeFlat: Record<string, string>;
  baselineEnFlat: Record<string, string>;
} {
  const { de, en } = builtInFlatMaps();
  return { baselineDeFlat: de, baselineEnFlat: en };
}
