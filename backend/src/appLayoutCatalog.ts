/** Field catalog and payload validators for app layouts. */

export type AppLayoutAppKey = "suppliers" | "design";

export type FieldValueType = "text" | "email" | "checkbox" | "siteDropdown" | "datetime" | "user";

export type FieldWidget = "text" | "email" | "checkbox" | "siteDropdown" | "datetime";

export const FIELD_WIDGETS: FieldWidget[] = [
  "text",
  "email",
  "checkbox",
  "siteDropdown",
  "datetime",
];

export const DYNAMIC_FIELD_WIDGETS: FieldWidget[] = ["text", "checkbox", "datetime"];

export type FieldAllowedIn = "modal" | "table";

export type AppFieldDef = {
  fieldKey: string;
  labelKey: string;
  valueType: FieldValueType;
  allowedIn: FieldAllowedIn[];
  widget?: FieldWidget;
};

export type ModalColumnKind = "field" | "spacer";

export type ModalColumnDef = {
  id: string;
  /** null = empty field slot (when kind is "field") */
  fieldKey: string | null;
  kind: ModalColumnKind;
  /** Custom label; null = catalog i18n labelKey */
  label: string | null;
  /** Override catalog widget; null = catalog default */
  widget: FieldWidget | null;
  span: number;
  required: boolean;
  readonly: boolean;
  visible: boolean;
};

export const SUPPLIER_DYNAMIC_FIELD_KEYS = [
  "dynamicField0",
  "dynamicField1",
  "dynamicField2",
  "dynamicField3",
  "dynamicField4",
  "dynamicField5",
  "dynamicField6",
  "dynamicField7",
  "dynamicField8",
  "dynamicField9",
  "dynamicField10",
] as const;

export function isDynamicFieldKey(fieldKey: string | null | undefined): boolean {
  return (
    typeof fieldKey === "string" &&
    (SUPPLIER_DYNAMIC_FIELD_KEYS as readonly string[]).includes(fieldKey)
  );
}

export function isFieldWidget(value: unknown): value is FieldWidget {
  return typeof value === "string" && (FIELD_WIDGETS as string[]).includes(value);
}

export type ModalRowDef = {
  id: string;
  columns: ModalColumnDef[];
};

export type ModalLayoutPayload = {
  version: 1;
  rows: ModalRowDef[];
};

export type TableFrozen = false | "left" | "right";

export type TableColumnDef = {
  fieldKey: string;
  width: number | null;
  visible: boolean;
  sortable: boolean;
  frozen: TableFrozen;
};

export type TableSortDef = {
  fieldKey: string;
  order: 1 | -1;
};

export type TableLayoutPayload = {
  version: 1;
  columns: TableColumnDef[];
  sort: TableSortDef[];
  groupBy: string[];
};

export type ContextMenuAction = "create" | "edit" | "delete";

export type ContextMenuItemDef = {
  action: ContextMenuAction;
  enabled: boolean;
};

export type ContextMenuLayoutPayload = {
  version: 1;
  items: ContextMenuItemDef[];
};

/** Tab chrome tokens for LY_STANDARD_TABS (appKey design). */
export type TabsLayoutPayload = {
  version: 1;
  preset: "standard";
  hostClass: string;
  tabViewClass: string;
  badgeClass: string;
  sticky: boolean;
  ink: boolean;
  label: {
    fontFamily: string;
    fontSize: string;
    fontWeight: number;
    letterSpacing: string;
    textTransform: "uppercase" | "none" | "capitalize" | "lowercase";
  };
  badge: {
    fontSize: string;
    borderRadius: string;
    hideZero: boolean;
  };
};

export const DEFAULT_TABS_LAYOUT: TabsLayoutPayload = {
  version: 1,
  preset: "standard",
  hostClass: "app-standard-tabs",
  tabViewClass: "app-sticky-tabs",
  badgeClass: "app-tab-badge",
  sticky: true,
  ink: true,
  label: {
    fontFamily: "Space Grotesk",
    fontSize: "0.75rem",
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  badge: {
    fontSize: "10px",
    borderRadius: "2px",
    hideZero: true,
  },
};

export const SUPPLIERS_FIELD_CATALOG: AppFieldDef[] = [
  {
    fieldKey: "key",
    labelKey: "suppliers.key",
    valueType: "text",
    allowedIn: ["modal", "table"],
    widget: "text",
  },
  {
    fieldKey: "name",
    labelKey: "suppliers.name",
    valueType: "text",
    allowedIn: ["modal", "table"],
    widget: "text",
  },
  {
    fieldKey: "customerNumber",
    labelKey: "suppliers.customerNumber",
    valueType: "text",
    allowedIn: ["modal", "table"],
    widget: "text",
  },
  {
    fieldKey: "address",
    labelKey: "suppliers.address",
    valueType: "text",
    allowedIn: ["modal"],
    widget: "text",
  },
  {
    fieldKey: "phone",
    labelKey: "suppliers.phone",
    valueType: "text",
    allowedIn: ["modal", "table"],
    widget: "text",
  },
  {
    fieldKey: "email",
    labelKey: "suppliers.email",
    valueType: "email",
    allowedIn: ["modal", "table"],
    widget: "email",
  },
  {
    fieldKey: "siteId",
    labelKey: "suppliers.site",
    valueType: "siteDropdown",
    allowedIn: ["modal"],
    widget: "siteDropdown",
  },
  {
    fieldKey: "siteName",
    labelKey: "suppliers.site",
    valueType: "text",
    allowedIn: ["table"],
  },
  {
    fieldKey: "isActive",
    labelKey: "suppliers.active",
    valueType: "checkbox",
    allowedIn: ["modal", "table"],
    widget: "checkbox",
  },
  ...SUPPLIER_DYNAMIC_FIELD_KEYS.map(
    (fieldKey): AppFieldDef => ({
      fieldKey,
      labelKey: `suppliers.${fieldKey}`,
      valueType: "text",
      allowedIn: ["modal", "table"],
      widget: "text",
    }),
  ),
  {
    fieldKey: "createdAt",
    labelKey: "suppliers.createdAt",
    valueType: "datetime",
    allowedIn: ["table"],
  },
  {
    fieldKey: "createdBy",
    labelKey: "suppliers.createdBy",
    valueType: "user",
    allowedIn: ["table"],
  },
  {
    fieldKey: "updatedAt",
    labelKey: "suppliers.updatedAt",
    valueType: "datetime",
    allowedIn: ["table"],
  },
  {
    fieldKey: "updatedBy",
    labelKey: "suppliers.updatedBy",
    valueType: "user",
    allowedIn: ["table"],
  },
];

const CATALOGS: Record<AppLayoutAppKey, AppFieldDef[]> = {
  suppliers: SUPPLIERS_FIELD_CATALOG,
  /** Design system LYs (e.g. LY-STANDARD-TABS) — no entity fields. */
  design: [],
};

export const KNOWN_APP_KEYS: AppLayoutAppKey[] = ["suppliers", "design"];

export function isAppLayoutAppKey(value: string): value is AppLayoutAppKey {
  return (KNOWN_APP_KEYS as string[]).includes(value);
}

export function getFieldCatalog(appKey: string): AppFieldDef[] | null {
  if (!isAppLayoutAppKey(appKey)) return null;
  return CATALOGS[appKey];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function fieldAllowed(catalog: AppFieldDef[], fieldKey: string, where: FieldAllowedIn): boolean {
  const def = catalog.find((f) => f.fieldKey === fieldKey);
  return Boolean(def?.allowedIn.includes(where));
}

export function parseModalPayload(
  value: unknown,
  catalog: AppFieldDef[],
): ModalLayoutPayload | null {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.rows)) return null;
  const rows: ModalRowDef[] = [];
  const usedFields = new Set<string>();
  for (const rowRaw of value.rows) {
    if (!isPlainObject(rowRaw) || !isNonEmptyString(rowRaw.id) || !Array.isArray(rowRaw.columns)) {
      return null;
    }
    const columns: ModalColumnDef[] = [];
    for (const colRaw of rowRaw.columns) {
      if (!isPlainObject(colRaw)) return null;
      const id = typeof colRaw.id === "string" ? colRaw.id.trim() : "";
      const span = typeof colRaw.span === "number" ? colRaw.span : NaN;
      if (!id || !Number.isInteger(span) || span < 1 || span > 12) return null;

      let fieldKey: string | null = null;
      if (colRaw.fieldKey === null || colRaw.fieldKey === undefined || colRaw.fieldKey === "") {
        fieldKey = null;
      } else if (typeof colRaw.fieldKey === "string") {
        fieldKey = colRaw.fieldKey.trim() || null;
      } else {
        return null;
      }

      const kind: ModalColumnKind = colRaw.kind === "spacer" ? "spacer" : "field";

      if (kind === "spacer") {
        fieldKey = null;
      } else if (fieldKey !== null) {
        if (!fieldAllowed(catalog, fieldKey, "modal")) return null;
        if (usedFields.has(fieldKey)) return null;
        usedFields.add(fieldKey);
      }

      let label: string | null = null;
      if (typeof colRaw.label === "string") {
        const trimmed = colRaw.label.trim();
        label = trimmed.length > 0 ? trimmed : null;
      } else if (colRaw.label === null || colRaw.label === undefined) {
        label = null;
      } else {
        return null;
      }

      let widget: FieldWidget | null = null;
      if (colRaw.widget === null || colRaw.widget === undefined || colRaw.widget === "") {
        widget = null;
      } else if (isFieldWidget(colRaw.widget)) {
        widget = colRaw.widget;
        if (isDynamicFieldKey(fieldKey) && !DYNAMIC_FIELD_WIDGETS.includes(widget)) {
          return null;
        }
      } else {
        return null;
      }

      columns.push({
        id,
        fieldKey,
        kind,
        label,
        widget,
        span,
        required: Boolean(colRaw.required),
        readonly: Boolean(colRaw.readonly),
        visible: colRaw.visible === undefined ? true : Boolean(colRaw.visible),
      });
    }
    const spanSum = columns.reduce((acc, c) => acc + c.span, 0);
    if (spanSum > 12) return null;
    rows.push({ id: rowRaw.id.trim(), columns });
  }
  return { version: 1, rows };
}

export function parseTablePayload(
  value: unknown,
  catalog: AppFieldDef[],
): TableLayoutPayload | null {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.columns)) return null;
  if (!Array.isArray(value.sort) || !Array.isArray(value.groupBy)) return null;
  const columns: TableColumnDef[] = [];
  const usedFields = new Set<string>();
  for (const colRaw of value.columns) {
    if (!isPlainObject(colRaw)) return null;
    const fieldKey = typeof colRaw.fieldKey === "string" ? colRaw.fieldKey.trim() : "";
    if (!fieldKey || !fieldAllowed(catalog, fieldKey, "table")) return null;
    if (usedFields.has(fieldKey)) return null;
    usedFields.add(fieldKey);
    let width: number | null = null;
    if (colRaw.width === null || colRaw.width === undefined) {
      width = null;
    } else if (typeof colRaw.width === "number" && Number.isFinite(colRaw.width) && colRaw.width > 0) {
      width = Math.round(colRaw.width);
    } else {
      return null;
    }
    let frozen: TableFrozen;
    if (colRaw.frozen === "left" || colRaw.frozen === "right") {
      frozen = colRaw.frozen;
    } else if (colRaw.frozen === false || colRaw.frozen == null) {
      frozen = false;
    } else {
      return null;
    }
    columns.push({
      fieldKey,
      width,
      visible: colRaw.visible === undefined ? true : Boolean(colRaw.visible),
      sortable: colRaw.sortable === undefined ? true : Boolean(colRaw.sortable),
      frozen,
    });
  }
  const sort: TableSortDef[] = [];
  for (const sortRaw of value.sort) {
    if (!isPlainObject(sortRaw)) return null;
    const fieldKey = typeof sortRaw.fieldKey === "string" ? sortRaw.fieldKey.trim() : "";
    const order = sortRaw.order === 1 || sortRaw.order === -1 ? sortRaw.order : null;
    if (!fieldKey || order == null) return null;
    if (!usedFields.has(fieldKey)) return null;
    sort.push({ fieldKey, order });
  }
  const groupBy: string[] = [];
  for (const g of value.groupBy) {
    if (typeof g !== "string" || !g.trim()) return null;
    const fieldKey = g.trim();
    if (!usedFields.has(fieldKey)) return null;
    groupBy.push(fieldKey);
  }
  return { version: 1, columns, sort, groupBy };
}

const CONTEXT_ACTIONS: ContextMenuAction[] = ["create", "edit", "delete"];

export function parseContextMenuPayload(value: unknown): ContextMenuLayoutPayload | null {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.items)) return null;
  const items: ContextMenuItemDef[] = [];
  const seen = new Set<string>();
  for (const itemRaw of value.items) {
    if (!isPlainObject(itemRaw)) return null;
    const action = itemRaw.action;
    if (typeof action !== "string" || !CONTEXT_ACTIONS.includes(action as ContextMenuAction)) {
      return null;
    }
    if (seen.has(action)) return null;
    seen.add(action);
    items.push({ action: action as ContextMenuAction, enabled: Boolean(itemRaw.enabled) });
  }
  for (const action of CONTEXT_ACTIONS) {
    if (!seen.has(action)) {
      items.push({ action, enabled: true });
    }
  }
  items.sort(
    (a, b) => CONTEXT_ACTIONS.indexOf(a.action) - CONTEXT_ACTIONS.indexOf(b.action),
  );
  return { version: 1, items };
}

export function defaultModalPayload(catalog: AppFieldDef[]): ModalLayoutPayload {
  const modalFields = catalog.filter((f) => f.allowedIn.includes("modal"));
  return {
    version: 1,
    rows: modalFields.map((f) => ({
      id: `r-${f.fieldKey}`,
      columns: [
        {
          id: `c-${f.fieldKey}`,
          fieldKey: f.fieldKey,
          kind: "field",
          label: null,
          widget: null,
          span: 12,
          required: false,
          readonly: false,
          visible: true,
        },
      ],
    })),
  };
}

export function defaultTablePayload(catalog: AppFieldDef[]): TableLayoutPayload {
  return {
    version: 1,
    columns: catalog
      .filter((f) => f.allowedIn.includes("table"))
      .map((f) => ({
        fieldKey: f.fieldKey,
        width: null,
        visible: true,
        sortable: true,
        frozen: false as const,
      })),
    sort: [],
    groupBy: [],
  };
}

export function defaultContextMenuPayload(): ContextMenuLayoutPayload {
  return {
    version: 1,
    items: CONTEXT_ACTIONS.map((action) => ({ action, enabled: true })),
  };
}

const TEXT_TRANSFORMS = ["uppercase", "none", "capitalize", "lowercase"] as const;

function parseNonEmptyString(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseTabsPayload(value: unknown): TabsLayoutPayload | null {
  if (!isPlainObject(value) || value.version !== 1) return null;
  const preset = value.preset === "standard" || value.preset === undefined ? "standard" : null;
  if (!preset) return null;

  const hostClass = parseNonEmptyString(value.hostClass, DEFAULT_TABS_LAYOUT.hostClass);
  const tabViewClass = parseNonEmptyString(value.tabViewClass, DEFAULT_TABS_LAYOUT.tabViewClass);
  const badgeClass = parseNonEmptyString(value.badgeClass, DEFAULT_TABS_LAYOUT.badgeClass);
  if (!hostClass || !tabViewClass || !badgeClass) return null;

  const sticky = value.sticky === undefined ? true : Boolean(value.sticky);
  const ink = value.ink === undefined ? true : Boolean(value.ink);

  const labelRaw = isPlainObject(value.label) ? value.label : {};
  const fontFamily = parseNonEmptyString(labelRaw.fontFamily, DEFAULT_TABS_LAYOUT.label.fontFamily);
  const fontSize = parseNonEmptyString(labelRaw.fontSize, DEFAULT_TABS_LAYOUT.label.fontSize);
  const letterSpacing = parseNonEmptyString(
    labelRaw.letterSpacing,
    DEFAULT_TABS_LAYOUT.label.letterSpacing,
  );
  if (!fontFamily || !fontSize || !letterSpacing) return null;

  let fontWeight = DEFAULT_TABS_LAYOUT.label.fontWeight;
  if (labelRaw.fontWeight !== undefined && labelRaw.fontWeight !== null) {
    if (typeof labelRaw.fontWeight !== "number" || !Number.isFinite(labelRaw.fontWeight)) {
      return null;
    }
    fontWeight = Math.round(labelRaw.fontWeight);
  }

  let textTransform: TabsLayoutPayload["label"]["textTransform"] =
    DEFAULT_TABS_LAYOUT.label.textTransform;
  if (labelRaw.textTransform !== undefined && labelRaw.textTransform !== null) {
    if (
      typeof labelRaw.textTransform !== "string" ||
      !(TEXT_TRANSFORMS as readonly string[]).includes(labelRaw.textTransform)
    ) {
      return null;
    }
    textTransform = labelRaw.textTransform as TabsLayoutPayload["label"]["textTransform"];
  }

  const badgeRaw = isPlainObject(value.badge) ? value.badge : {};
  const badgeFontSize = parseNonEmptyString(badgeRaw.fontSize, DEFAULT_TABS_LAYOUT.badge.fontSize);
  const borderRadius = parseNonEmptyString(
    badgeRaw.borderRadius,
    DEFAULT_TABS_LAYOUT.badge.borderRadius,
  );
  if (!badgeFontSize || !borderRadius) return null;
  const hideZero = badgeRaw.hideZero === undefined ? true : Boolean(badgeRaw.hideZero);

  return {
    version: 1,
    preset: "standard",
    hostClass,
    tabViewClass,
    badgeClass,
    sticky,
    ink,
    label: {
      fontFamily,
      fontSize,
      fontWeight,
      letterSpacing,
      textTransform,
    },
    badge: {
      fontSize: badgeFontSize,
      borderRadius,
      hideZero,
    },
  };
}

export function defaultTabsPayload(): TabsLayoutPayload {
  return structuredClone(DEFAULT_TABS_LAYOUT);
}
