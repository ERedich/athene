import { describe, expect, it } from "vitest";
import { LayoutGrid, Settings, History, Menu } from "lucide-react";

import type { NavGroup } from "../layout/navModel";
import {
  NAV_LAYOUT_LOCKED_TO,
  addCustomGroup,
  addCustomLeaf,
  addCustomSubItem,
  catalogToWebNavLayout,
  moveItem,
  parseWebNavLayout,
  removeCustomGroup,
  resolveWebNavLayout,
  resolvedToWebNavLayout,
  toSidebarNavGroups,
  toggleItemHidden,
} from "./navLayout";

const miniCatalog: NavGroup[] = [
  {
    id: "dashboard",
    labelKey: "dashboard.navDashboard",
    Icon: LayoutGrid,
    items: [],
    to: "/dashboard",
    end: true,
  },
  {
    id: "system",
    labelKey: "shell.navSystem",
    Icon: Settings,
    items: [
      { to: "/audit-log", Icon: History, labelKey: "auditLog.navAudit" },
      { to: "/customize-menu", Icon: Menu, labelKey: "customizeMenu.nav" },
    ],
  },
];

describe("resolveWebNavLayout default", () => {
  it("resolves null layout to catalog order", () => {
    const resolved = resolveWebNavLayout(miniCatalog, null);
    expect(resolved.map((g) => g.id)).toEqual(["dashboard", "system"]);
    expect(resolved[0].role).toBe("leaf");
    expect(resolved[1].items.map((i) => i.to)).toContain("/customize-menu");
  });
});

describe("administration catalog includes berechtigungswesen", () => {
  it("lists /berechtigungswesen after /users in navModel", async () => {
    const { navGroups } = await import("../layout/navModel");
    const admin = navGroups.find((g) => g.id === "administration");
    expect(admin).toBeTruthy();
    const tos = admin!.items.map((i) => i.to);
    expect(tos).toContain("/berechtigungswesen");
    expect(tos.indexOf("/berechtigungswesen")).toBeGreaterThan(tos.indexOf("/users"));
  });
});

describe("administration catalog includes zuweisungen", () => {
  it("lists /zuweisungen after /users in navModel", async () => {
    const { navGroups } = await import("../layout/navModel");
    const admin = navGroups.find((g) => g.id === "administration");
    expect(admin).toBeTruthy();
    const tos = admin!.items.map((i) => i.to);
    expect(tos).toContain("/zuweisungen");
    expect(tos.indexOf("/zuweisungen")).toBeGreaterThan(tos.indexOf("/users"));
  });
});

describe("system catalog includes systemwerkzeuge", () => {
  it("lists /systemwerkzeuge after /customize-menu in navModel", async () => {
    const { navGroups } = await import("../layout/navModel");
    const system = navGroups.find((g) => g.id === "system");
    expect(system).toBeTruthy();
    const tos = system!.items.map((i) => i.to);
    expect(tos).toContain("/systemwerkzeuge");
    expect(tos.indexOf("/systemwerkzeuge")).toBeGreaterThan(
      tos.indexOf("/customize-menu"),
    );
  });
});

describe("custom items", () => {
  it("adds custom group and sub item", () => {
    let resolved = resolveWebNavLayout(miniCatalog, null);
    resolved = addCustomGroup(resolved, "Meine Gruppe");
    const custom = resolved.find((g) => g.source === "custom");
    expect(custom?.name).toBe("Meine Gruppe");
    resolved = addCustomSubItem(
      resolved,
      custom!.id,
      "Audit copy",
      "/audit-log",
      miniCatalog,
    );
    const again = resolved.find((g) => g.id === custom!.id)!;
    expect(again.items.some((i) => i.name === "Audit copy" && i.to === "/audit-log")).toBe(
      true,
    );
  });

  it("adds custom leaf and removes custom group", () => {
    let resolved = resolveWebNavLayout(miniCatalog, null);
    resolved = addCustomLeaf(resolved, "Reports", "/report-designer", miniCatalog);
    const leaf = resolved.find((g) => g.source === "custom" && g.role === "leaf");
    expect(leaf?.to).toBe("/report-designer");
    resolved = removeCustomGroup(resolved, leaf!.id);
    expect(resolved.some((g) => g.id === leaf!.id)).toBe(false);
  });
});

describe("hide and move", () => {
  it("hides catalog item from sidebar", () => {
    let resolved = resolveWebNavLayout(miniCatalog, null);
    const audit = resolved[1].items.find((i) => i.to === "/audit-log")!;
    resolved = toggleItemHidden(resolved, "system", audit.id);
    const sidebar = toSidebarNavGroups(resolved);
    expect(
      sidebar.find((g) => g.id === "system")?.items.map((i) => i.to),
    ).not.toContain("/audit-log");
  });

  it("moves item into leaf group", () => {
    let resolved = resolveWebNavLayout(miniCatalog, null);
    const auditIdx = resolved[1].items.findIndex((i) => i.to === "/audit-log");
    resolved = moveItem(resolved, "system", auditIdx, "dashboard", 1);
    const dash = resolved.find((g) => g.id === "dashboard")!;
    expect(dash.role).toBe("group");
    expect(dash.items.map((i) => i.to)).toContain("/audit-log");
  });
});

describe("serialize", () => {
  it("roundtrips custom layout", () => {
    let resolved = resolveWebNavLayout(miniCatalog, null);
    resolved = addCustomGroup(resolved, "X");
    const layout = resolvedToWebNavLayout(resolved);
    expect(layout.version).toBe(2);
    const again = resolveWebNavLayout(miniCatalog, layout);
    expect(again.some((g) => g.name === "X")).toBe(true);
  });

  it("parses legacy v1", () => {
    const parsed = parseWebNavLayout({
      version: 1,
      groups: [
        { id: "dashboard", hidden: false, items: [] },
        {
          id: "system",
          hidden: false,
          items: [{ to: NAV_LAYOUT_LOCKED_TO, hidden: false }],
        },
      ],
    });
    expect(parsed?.version).toBe(2);
    expect(parsed?.groups[1].items[0].id).toContain("catalog:");
  });
});

describe("catalog default builder", () => {
  it("builds web default", () => {
    const layout = catalogToWebNavLayout(miniCatalog);
    expect(layout.platform).toBe("web");
    expect(layout.groups).toHaveLength(2);
  });
});
