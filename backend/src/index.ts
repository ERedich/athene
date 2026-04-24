import "dotenv/config";
import cors from "cors";
import express from "express";
import session from "express-session";

import { auditLogRouter } from "./auditLog.js";
import { authRouter } from "./auth.js";
import { costCentersRouter } from "./costCenters.js";
import { requireAuth } from "./middleware/requireAuth.js";
import { sitesRouter } from "./sites.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
  console.warn(
    "[athene-backend] SESSION_SECRET is missing or short; set a strong secret in production.",
  );
}

app.set("trust proxy", 1);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(
  session({
    name: "athene.sid",
    secret: sessionSecret ?? "dev-only-insecure-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "athene-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/cost-centers", requireAuth, costCentersRouter);
app.use("/api/sites", requireAuth, sitesRouter);
app.use("/api/audit-log", requireAuth, auditLogRouter);

app.listen(port, () => {
  console.log(`backend listening on http://localhost:${port}`);
});
