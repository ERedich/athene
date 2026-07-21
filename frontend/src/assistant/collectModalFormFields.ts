export type ModalFormFieldKind =
  | "text"
  | "textarea"
  | "number"
  | "dropdown"
  | "multiselect"
  | "checkbox"
  | "switch"
  | "calendar"
  | "radio"
  | "other";

export type ModalFormField = {
  label: string;
  kind: ModalFormFieldKind;
  name?: string;
};

export type ModalFormCatalog = {
  title: string;
  fields: ModalFormField[];
};

function normalizeLabel(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/\*+$/, "").trim();
}

function kindFromElement(el: Element): ModalFormFieldKind {
  if (el.classList.contains("p-dropdown") || el.getAttribute("data-pc-name") === "dropdown") {
    return "dropdown";
  }
  if (el.classList.contains("p-multiselect") || el.getAttribute("data-pc-name") === "multiselect") {
    return "multiselect";
  }
  if (el.classList.contains("p-calendar") || el.getAttribute("data-pc-name") === "calendar") {
    return "calendar";
  }
  if (el.classList.contains("p-inputswitch") || el.getAttribute("data-pc-name") === "inputswitch") {
    return "switch";
  }
  if (el.classList.contains("p-checkbox") || el.getAttribute("data-pc-name") === "checkbox") {
    return "checkbox";
  }
  if (el.classList.contains("p-radiobutton") || el.getAttribute("data-pc-name") === "radiobutton") {
    return "radio";
  }
  if (el.classList.contains("p-inputnumber") || el.getAttribute("data-pc-name") === "inputnumber") {
    return "number";
  }
  if (el.tagName === "TEXTAREA" || el.classList.contains("p-inputtextarea")) {
    return "textarea";
  }
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type?.toLowerCase() ?? "text";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "number") return "number";
    return "text";
  }
  if (el.tagName === "SELECT") return "dropdown";
  return "other";
}

function labelForControl(el: Element, root: HTMLElement): string | null {
  const aria = el.getAttribute("aria-label");
  if (aria?.trim()) return normalizeLabel(aria);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => root.querySelector(`#${CSS.escape(id)}`)?.textContent ?? "")
      .map(normalizeLabel)
      .filter(Boolean);
    if (parts.length) return parts.join(" ");
  }

  const id = el.getAttribute("id");
  if (id) {
    const forLabel = root.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (forLabel?.textContent) return normalizeLabel(forLabel.textContent);
  }

  const floatLabel = el.closest(".p-float-label");
  if (floatLabel) {
    const label = floatLabel.querySelector("label");
    if (label?.textContent) return normalizeLabel(label.textContent);
  }

  const fieldRoot =
    el.closest(".field") ??
    el.closest(".p-field") ??
    el.closest("[class*='field']") ??
    el.parentElement;
  if (fieldRoot) {
    const label = fieldRoot.querySelector(":scope > label, :scope > .p-label, label");
    if (label && !el.contains(label) && label.textContent) {
      return normalizeLabel(label.textContent);
    }
  }

  if (el.classList.contains("p-checkbox") || el.classList.contains("p-inputswitch")) {
    const wrap = el.closest("label") ?? el.parentElement;
    if (wrap) {
      const clone = wrap.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".p-checkbox, .p-inputswitch, input, .p-checkbox-box").forEach((n) => n.remove());
      const text = normalizeLabel(clone.textContent ?? "");
      if (text) return text;
    }
  }

  const name = el.getAttribute("name") || (el as HTMLInputElement).name;
  if (name?.trim()) return normalizeLabel(name);

  const placeholder = el.getAttribute("placeholder");
  if (placeholder?.trim()) return normalizeLabel(placeholder);

  return null;
}

const CONTROL_SELECTOR = [
  "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='file'])",
  "textarea",
  "select",
  ".p-dropdown",
  ".p-multiselect",
  ".p-calendar",
  ".p-inputswitch",
  ".p-checkbox",
  ".p-radiobutton",
  ".p-inputnumber",
  ".p-inputtextarea",
].join(", ");

/**
 * Collect visible form field labels/kinds from a PrimeReact dialog (or page shell).
 */
export function collectModalFormFields(root: HTMLElement | null): ModalFormCatalog {
  if (!root) return { title: "", fields: [] };

  const titleEl = root.querySelector(".p-dialog-title, .app-wo-dialog-title");
  const title = normalizeLabel(titleEl?.textContent ?? "");

  const seen = new Set<string>();
  const fields: ModalFormField[] = [];

  const controls = root.querySelectorAll(CONTROL_SELECTOR);
  for (const el of controls) {
    if (!(el instanceof HTMLElement)) continue;
    // Skip nested duplicates (e.g. input inside .p-dropdown / .p-inputnumber)
    if (
      el.matches("input, textarea, select") &&
      el.closest(".p-dropdown, .p-multiselect, .p-calendar, .p-inputnumber, .p-checkbox, .p-radiobutton, .p-inputswitch")
    ) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;

    const label = labelForControl(el, root);
    if (!label) continue;

    const kind = kindFromElement(el);
    const name = el.getAttribute("name") || (el as HTMLInputElement).name || undefined;
    const key = `${kind}|${label}|${name ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push({ label, kind, ...(name ? { name } : {}) });
  }

  return { title, fields };
}

export function findDialogRootFromEventTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return (
    target.closest<HTMLElement>(".p-dialog") ??
    target.closest<HTMLElement>(".app-wo-edit-page-view") ??
    null
  );
}
