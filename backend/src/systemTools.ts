import { Router, type Request, type Response } from "express";

import { countDueMaintenancePlans } from "./maintenancePlanGenerate.js";
import { SYSTEM_TOOLS } from "./systemToolCatalog.js";

const router = Router();

function sendPgError(res: Response, err: unknown) {
  const e = err as { code?: string; detail?: string; message?: string };
  if (e.code === "23505") {
    res.status(409).json({ error: "duplicate_key", message: e.detail ?? e.message });
    return;
  }
  if (e.code === "23503") {
    res.status(409).json({ error: "foreign_key_violation", message: e.detail ?? e.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal_error", message: e.message });
}

router.get("/catalog", async (req: Request, res: Response) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    let dueCount: number | null = null;
    const needsDue = SYSTEM_TOOLS.some(
      (t) => t.id === "maintenance-plan-generate-due" && t.enabled,
    );
    if (needsDue) {
      dueCount = await countDueMaintenancePlans(userId);
    }

    const items = SYSTEM_TOOLS.map((t) => ({
      id: t.id,
      enabled: t.enabled,
      dueCount: t.id === "maintenance-plan-generate-due" ? dueCount : null,
    }));

    res.json(items);
  } catch (err) {
    sendPgError(res, err);
  }
});

export { router as systemToolsRouter };
