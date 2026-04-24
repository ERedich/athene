import type { RequestHandler } from "express";

export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};
