import "dotenv/config";
import cors from "cors";
import express from "express";
import { createServer } from "node:http";

import { auditLogRouter } from "./auditLog.js";
import { assistantRouter } from "./assistant.js";
import { configuredSessionSecret, sessionSecret } from "./authSessionConfig.js";
import { appParametersRouter } from "./appParameters.js";
import { assetsRouter } from "./assets.js";
import { authRouter } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { classificationsRouter } from "./classifications.js";
import { costCentersRouter } from "./costCenters.js";
import { sparePartsRouter } from "./spareParts.js";
import { warehousesRouter } from "./warehouses.js";
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
import { workOrderSubscriptionsRouter } from "./workOrderSubscriptions.js";
import { tableLayoutsRouter } from "./tableLayouts.js";

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

app.use("/api/auth", authRouter);
app.use("/api/users", requireAuth, usersRouter);
app.use("/api/cost-centers", requireAuth, costCentersRouter);
app.use("/api/warehouses", requireAuth, warehousesRouter);
app.use("/api/spare-parts", requireAuth, sparePartsRouter);
app.use("/api/classifications", requireAuth, classificationsRouter);
app.use("/api/workgroups", requireAuth, workgroupsRouter);
app.use("/api/employees", requireAuth, employeesRouter);
app.use("/api/assets", requireAuth, assetsRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/work-orders", requireAuth, workOrdersRouter);
app.use("/api/work-order-search-presets", requireAuth, workOrderSearchPresetsRouter);
app.use("/api/work-order-subscriptions", requireAuth, workOrderSubscriptionsRouter);
app.use("/api/table-layouts", requireAuth, tableLayoutsRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/transactions", requireAuth, transactionsRouter);
app.use("/api/ui-translation-overrides", requireAuth, translationsRouter);
app.use("/api/app-parameters", requireAuth, appParametersRouter);
app.use("/api/audit-log", requireAuth, auditLogRouter);
app.use("/api/db-meta", requireAuth, dbMetaRouter);
app.use("/api/assistant", requireAuth, assistantRouter);

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
});
