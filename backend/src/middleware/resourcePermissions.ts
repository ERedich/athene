import type { RequestHandler } from "express";

import { permissionKey } from "../permissionCatalog.js";
import { userHasPermission } from "./requirePermission.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Work-order router guard: CRUD on work-orders.* plus process extras on workOrder.*.
 */
export const requireWorkOrdersPermissions: RequestHandler = async (req, res, next) => {
  try {
    const method = req.method.toUpperCase();
    const parts = (req.path || "/").split("/").filter(Boolean);

    let key: string;

    if (method === "GET" || method === "HEAD") {
      key = permissionKey("work-orders", "view");
    } else if (method === "POST" && parts.length === 0) {
      key = permissionKey("work-orders", "create");
    } else if (method === "DELETE" && parts.length === 1 && UUID_RE.test(parts[0]!)) {
      key = permissionKey("work-orders", "delete");
    } else if (parts.length >= 2 && UUID_RE.test(parts[0]!)) {
      const action = parts[1]!;
      const extraMap: Record<string, string> = {
        start: "workOrder.start",
        pause: "workOrder.pause",
        cancel: "workOrder.cancel",
        done: "workOrder.complete",
        feedback: "workOrder.feedback",
        assignments: "workOrder.assign",
      };
      if (method === "POST" && extraMap[action]) {
        key = extraMap[action]!;
      } else if (method === "DELETE" && action === "assignments") {
        key = "workOrder.assign";
      } else {
        key = permissionKey("work-orders", "update");
      }
    } else {
      key = permissionKey("work-orders", "update");
    }

    const ok = await userHasPermission(req, key);
    if (!ok) {
      res.status(403).json({ error: "forbidden", permission: key });
      return;
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
};

/** Subscriptions router → workOrder.subscribe for writes; view via monitoring or work-orders. */
export const requireSubscriptionPermissions: RequestHandler = async (req, res, next) => {
  try {
    const method = req.method.toUpperCase();
    const key =
      method === "GET" || method === "HEAD"
        ? permissionKey("monitoring", "view")
        : "workOrder.subscribe";
    const ok = await userHasPermission(req, key);
    if (!ok) {
      // Accept work-orders.view for GET as alternative
      if (method === "GET" || method === "HEAD") {
        const alt = await userHasPermission(req, permissionKey("work-orders", "view"));
        if (alt) {
          next();
          return;
        }
      }
      res.status(403).json({ error: "forbidden", permission: key });
      return;
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
};

/** Maintenance plans: generate-due needs generateDue extra. */
export const requireMaintenancePlansPermissions: RequestHandler = async (req, res, next) => {
  try {
    const method = req.method.toUpperCase();
    const parts = (req.path || "/").split("/").filter(Boolean);
    let key: string;
    if (method === "POST" && parts[0] === "generate-due") {
      key = "maintenance-plans.generateDue";
    } else if (method === "GET" || method === "HEAD") {
      key = "maintenance-plans.view";
    } else if (method === "POST" && parts.length === 0) {
      key = "maintenance-plans.create";
    } else if (method === "DELETE" && parts.length === 1) {
      key = "maintenance-plans.delete";
    } else {
      key = "maintenance-plans.update";
    }
    const ok = await userHasPermission(req, key);
    if (!ok) {
      res.status(403).json({ error: "forbidden", permission: key });
      return;
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
};

/** System tools: execute for POST, view for GET. */
export const requireSystemToolsPermissions: RequestHandler = async (req, res, next) => {
  try {
    const method = req.method.toUpperCase();
    const key =
      method === "GET" || method === "HEAD" ? "system-tools.view" : "system-tools.execute";
    const ok = await userHasPermission(req, key);
    if (!ok) {
      res.status(403).json({ error: "forbidden", permission: key });
      return;
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
};
