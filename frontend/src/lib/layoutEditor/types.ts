/** App layout payload types and suppliers field catalog (mirrors backend). */

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

export type SupplierDynamicFieldKey = (typeof SUPPLIER_DYNAMIC_FIELD_KEYS)[number];

export function isDynamicFieldKey(fieldKey: string | null | undefined): boolean {
  return (
    typeof fieldKey === "string" &&
    (SUPPLIER_DYNAMIC_FIELD_KEYS as readonly string[]).includes(fieldKey)
  );
}

export function resolveColumnWidget(
  col: { widget?: FieldWidget | null; fieldKey: string | null },
  catalog: AppFieldDef[],
): FieldWidget {
  if (col.widget) return col.widget;
  const def = col.fieldKey ? catalog.find((f) => f.fieldKey === col.fieldKey) : undefined;
  return def?.widget ?? "text";
}

/** Fill defaults for layouts saved before label/widget/kind existed. */
export function normalizeModalPayload(modal: ModalLayoutPayload): ModalLayoutPayload {
  return {
    version: 1,
    rows: (modal.rows ?? []).map((row) => ({
      id: row.id,
      columns: (row.columns ?? []).map((col) => ({
        id: col.id,
        fieldKey: col.fieldKey ?? null,
        kind: col.kind === "spacer" ? "spacer" : "field",
        label: col.label ?? null,
        widget: col.widget ?? null,
        span: col.span,
        required: Boolean(col.required),
        readonly: Boolean(col.readonly),
        visible: col.visible === undefined ? true : Boolean(col.visible),
      })),
    })),
  };
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

export function defaultTabsPayload(): TabsLayoutPayload {
  return structuredClone(DEFAULT_TABS_LAYOUT);
}

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
  design: [],
};

export const KNOWN_APP_KEYS: AppLayoutAppKey[] = ["suppliers", "design"];

export function isAppLayoutAppKey(value: string): value is AppLayoutAppKey {
  return (KNOWN_APP_KEYS as string[]).includes(value);
}

export function getFieldCatalog(appKey: string): AppFieldDef[] {
  if (!isAppLayoutAppKey(appKey)) return [];
  return CATALOGS[appKey];
}

export function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultContextMenuPayload(): ContextMenuLayoutPayload {
  return {
    version: 1,
    items: [
      { action: "create", enabled: true },
      { action: "edit", enabled: true },
      { action: "delete", enabled: true },
    ],
  };
}

export function emptyEditorState(appKey: AppLayoutAppKey, siteId: string): {
  key: string;
  name: string;
  siteId: string;
  appKey: AppLayoutAppKey;
  modal: ModalLayoutPayload;
  table: TableLayoutPayload;
  contextMenu: ContextMenuLayoutPayload;
  tabs: TabsLayoutPayload;
} {
  const catalog = getFieldCatalog(appKey);
  return {
    key: "",
    name: "",
    siteId,
    appKey,
    modal: {
      version: 1,
      rows: [],
    },
    table: {
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
    },
    contextMenu: defaultContextMenuPayload(),
    tabs: defaultTabsPayload(),
  };
}
