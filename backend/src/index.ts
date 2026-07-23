import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";

import { auditLogRouter } from "./auditLog.js";
import { assistantRouter } from "./assistant.js";
import { configuredSessionSecret, sessionSecret } from "./authSessionConfig.js";
import { appFeedbackRouter } from "./appFeedback.js";
import { appParametersRouter } from "./appParameters.js";
import { assetsRouter } from "./assets.js";
import { authRouter } from "./auth.js";
import inspectionRoundsRouter from "./inspectionRounds.js";
import { dashboardRouter } from "./dashboard.js";
import { atheneBriefingRouter } from "./atheneBriefing.js";
import { classificationsRouter } from "./classifications.js";
import { costCentersRouter } from "./costCenters.js";
import { suppliersRouter } from "./suppliers.js";
import { shiftsRouter } from "./shifts.js";
import { shiftPlannerRouter } from "./shiftPlanner.js";
import { sparePartsRouter } from "./spareParts.js";
import { warehousesRouter } from "./warehouses.js";
import { storageLocationsRouter } from "./storageLocations.js";
import { employeesRouter } from "./employees.js";
import { dbMetaRouter } from "./dbMeta.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { readSessionUserId } from "./sessionToken.js";
import { sitesRouter } from "./sites.js";
import { transactionsRouter } from "./transactions.js";
import { translationsRouter } from "./translations.js";
import { usersRouter } from "./users.js";
import { createWorkOrderWebSocketServer, registerWorkOrderRealtime } from "./workOrderRealtime.js";
import { workgroupsRouter } from "./workgroups.js";
import { workOrdersRouter } from "./workOrders.js";
import { workOrderSearchPresetsRouter } from "./workOrderSearchPresets.js";
import { notificationCenterRouter } from "./notificationCenter.js";
import { workOrderSubscriptionsRouter } from "./workOrderSubscriptions.js";
import { customKpisRouter } from "./customKpis.js";
import { appLayoutsRouter } from "./appLayouts.js";
import { maintenancePlansRouter } from "./maintenancePlans.js";
import { workOrderTypesRouter } from "./workOrderTypes.js";
import { siteAppParametersRouter } from "./siteAppParameters.js";
import { problemsRouter } from "./problems.js";
import { causesRouter } from "./causes.js";
import { remediesRouter } from "./remedies.js";
import { startMaintenancePlanDailyGenerate } from "./maintenancePlanGenerate.js";
import { publicLoginKpisRouter } from "./publicLoginKpis.js";
import { reportDesignerRouter } from "./reportDesigner.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const listenHost = process.env.LISTEN_HOST ?? "0.0.0.0";

if (!configuredSessionSecret || configuredSessionSecret.length < 16) {
  console.warn(
    "[athene-backend] SESSION_SECRET is missing or short; set a strong secret in production.",
  );
}

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use((req, _res, next) => {
  const userId = readSessionUserId(req, sessionSecret);
  // Keep legacy `req.session.userId` access pattern without server-side session storage.
  const reqWithSession = req as unknown as {
    session: {
      userId?: string;
      destroy: (cb?: (err?: unknown) => void) => void;
    };
  };
  reqWithSession.session = {
    userId,
    destroy: (cb) => {
      cb?.(undefined);
    },
  };
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "athene-backend" });
});

app.use("/api/public", publicLoginKpisRouter);
app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/cost-centers", requireAuth, costCentersRouter);
app.use("/api/suppliers", requireAuth, suppliersRouter);
app.use("/api/warehouses", requireAuth, warehousesRouter);
app.use("/api/storage-locations", requireAuth, storageLocationsRouter);
app.use("/api/shifts", requireAuth, shiftsRouter);
app.use("/api/shift-planner", requireAuth, shiftPlannerRouter);
app.use("/api/spare-parts", requireAuth, sparePartsRouter);
app.use("/api/classifications", requireAuth, classificationsRouter);
app.use("/api/workgroups", requireAuth, workgroupsRouter);
app.use("/api/employees", requireAuth, employeesRouter);
app.use("/api/assets", requireAuth, assetsRouter);
app.use("/api/inspection-rounds", requireAuth, inspectionRoundsRouter);
app.use("/api/maintenance-plans", requireAuth, maintenancePlansRouter);
app.use("/api/work-order-types", requireAuth, workOrderTypesRouter);
app.use("/api/site-app-parameters", requireAuth, siteAppParametersRouter);
app.use("/api/problems", requireAuth, problemsRouter);
app.use("/api/causes", requireAuth, causesRouter);
app.use("/api/remedies", requireAuth, remediesRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/dashboard", requireAuth, atheneBriefingRouter);
app.use("/api/work-orders", requireAuth, workOrdersRouter);
app.use("/api/work-order-search-presets", requireAuth, workOrderSearchPresetsRouter);
app.use("/api/work-order-subscriptions", requireAuth, workOrderSubscriptionsRouter);
app.use("/api/notification-center", requireAuth, notificationCenterRouter);
app.use("/api/custom-kpis", requireAuth, customKpisRouter);
app.use("/api/app-layouts", requireAuth, appLayoutsRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/ui-translation-overrides", requireAuth, translationsRouter);
app.use("/api/app-parameters", requireAuth, appParametersRouter);
app.use("/api/app-feedback", requireAuth, appFeedbackRouter);
app.use("/api/audit-log", requireAuth, auditLogRouter);
app.use("/api/db-meta", requireAuth, dbMetaRouter);
app.use("/api/assistant", requireAuth, assistantRouter);
app.use("/api/report-designer", requireAuth, reportDesignerRouter);

const server = createServer(app);
const workOrdersWss = createWorkOrderWebSocketServer("/api/work-orders/events");

server.on("upgrade", (req, socket, head) => {
  const pathname = req.url ? new URL(req.url, "http://localhost").pathname : "";
  if (pathname !== "/api/work-orders/events") {
    socket.destroy();
    return;
  }
  workOrdersWss.handleUpgrade(req, socket, head, (ws) => {
    const ok = registerWorkOrderRealtime(req, ws, sessionSecret);
    if (!ok) {
      ws.close(1008, "unauthorized");
      return;
    }
    ws.send(JSON.stringify({ type: "connected" }));
  });
});

server.listen(port, listenHost, () => {
  console.log(
    `backend listening on http://localhost:${port} (bound to ${listenHost}, use http://<this-machine-ip>:${port} on LAN)`,
  );
  startMaintenancePlanDailyGenerate();
});
