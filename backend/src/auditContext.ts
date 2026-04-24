import type { PoolClient } from "pg";

import { pool } from "./db.js";

export type AuditSessionMeta = {
  userId: string;
  requestId: string;
  reason?: string;
  source?: string;
  ipAddress?: string;
  userAgent?: string;
};

/**
 * Runs `fn` inside a transaction with PostgreSQL session variables used by audit triggers.
 * `set_config(..., true)` = transaction-local (discarded after COMMIT/ROLLBACK).
 */
export async function withAuditContext<T>(
  meta: AuditSessionMeta,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT
        set_config('app.current_user_id', $1, true),
        set_config('app.request_id', $2, true),
        set_config('app.change_reason', $3, true),
        set_config('app.source', $4, true),
        set_config('app.ip_address', $5, true),
        set_config('app.user_agent', $6, true)`,
      [
        meta.userId,
        meta.requestId,
        meta.reason ?? "",
        meta.source ?? "api",
        meta.ipAddress ?? "",
        meta.userAgent ?? "",
      ],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
