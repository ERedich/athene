/** Flatten nested locale JSON to dot-path string leaves only. */
export function flattenStringLeaves(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[path] = v;
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenStringLeaves(v as Record<string, unknown>, path));
    }
  }
  return out;
}

/** Turns dot paths into nested objects suitable for i18next resource merging. */
export function unflattenToNested(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!;
      const next = cur[p];
      if (
        next === undefined ||
        next === null ||
        typeof next !== "object" ||
        Array.isArray(next)
      ) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1]!;
    cur[leaf] = value;
  }
  return root;
}

/** Deep-merge translation trees (plain objects → string leaves). */
export function deepMergeTranslationTrees(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const b = base[k];
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      b !== null &&
      typeof b === "object" &&
      !Array.isArray(b)
    ) {
      out[k] = deepMergeTranslationTrees(
        b as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function cloneJsonTree<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
