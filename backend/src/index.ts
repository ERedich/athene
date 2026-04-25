import "dotenv/config";
import cors from "cors";
import express from "express";

import { auditLogRouter } from "./auditLog.js";
import { configuredSessionSecret, sessionSecret } from "./authSessionConfig.js";
import { assetsRouter } from "./assets.js";
import { authRouter } from "./auth.js";
import { costCentersRouter } from "./costCenters.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { readSessionUserId } from "./sessionToken.js";
import { sitesRouter } from "./sites.js";
import { usersRouter } from "./users.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

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
app.use("/api/assets", requireAuth, assetsRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/audit-log", requireAuth, auditLogRouter);

app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`);
});
