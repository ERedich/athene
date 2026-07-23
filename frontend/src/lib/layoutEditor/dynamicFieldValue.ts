import type { FieldWidget } from "./types";

/** Persist checkbox/datetime/text as text|null (supplier dynamicField* storage). */
export function coerceWidgetValueToStorage(
  widget: FieldWidget,
  value: unknown,
): string | null {
  if (widget === "checkbox") {
    if (value === true || value === "true" || value === "1") return "true";
    if (value === false || value === "false" || value === "0") return "false";
    return null;
  }
  if (widget === "datetime") {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const d = new Date(trimmed);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value == null) return null;
  return String(value);
}

export function storageToCheckbox(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

export function storageToDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatStorageForTable(
  widget: FieldWidget | undefined,
  value: unknown,
  locale: string,
): string {
  if (value == null || value === "") return "";
  if (widget === "checkbox") {
    return storageToCheckbox(value) ? "✓" : "";
  }
  if (widget === "datetime" || (!widget && typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value))) {
    const d = storageToDate(value);
    if (!d) return String(value);
    return d.toLocaleString(locale);
  }
  return String(value);
}
