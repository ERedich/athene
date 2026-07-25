/**
 * Bulk-seed ~4000 work orders on site EY using existing assets / cost centers /
 * workgroups / leaders / order types so FKs stay consistent with live data.
 *
 * Run from backend/:  npx tsx scripts/seedPerfWorkOrders.ts
 * Optional:          npx tsx scripts/seedPerfWorkOrders.ts --count=4000
 * Idempotent: tops up until description marker count reaches target.
 */
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const SEED_MARKER = "[perf-seed]";
const DEFAULT_COUNT = 4000;
const BATCH_SIZE = 200;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("sslmode=")
    ? { rejectUnauthorized: false }
    : undefined,
});

type RefBundle = {
  siteId: string;
  adminUserId: string;
  assets: { id: string; key: string; name: string }[];
  costCenters: { id: string; key: string }[];
  workgroups: { id: string; key: string; leaderId: string }[];
  orderTypes: string[];
  classificationId: string | null;
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  maintenance: "Wartung",
  breakdown: "Störung",
  plannedRepair: "Instandsetzung",
  inspection: "Inspektion",
};

function pickOrderType(i: number, types: string[]): string {
  const roll = i % 20;
  const prefer = (key: string) => (types.includes(key) ? key : types[0]!);
  if (roll < 12) return prefer("maintenance");
  if (roll < 15) return prefer("breakdown");
  if (roll < 18) return prefer("plannedRepair");
  return prefer("inspection");
}

function pickStatus(i: number): string {
  const roll = i % 100;
  if (roll < 55) return "open";
  if (roll < 80) return "ended";
  if (roll < 90) return "assigned";
  if (roll < 94) return "started";
  if (roll < 96) return "continued";
  if (roll < 98) return "done";
  return "cancelled";
}

function parseCount(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith("--count="));
  if (!arg) return DEFAULT_COUNT;
  const n = Number(arg.slice("--count=".length));
  if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --count (got ${arg})`);
  return Math.trunc(n);
}

async function loadRefs(client: pg.PoolClient): Promise<RefBundle> {
  const site = await client.query<{ id: string }>(`SELECT id FROM site WHERE key = 'EY' LIMIT 1`);
  const siteId = site.rows[0]?.id;
  if (!siteId) throw new Error("Site EY not found");

  const admin = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE "loginName" = 'admin' LIMIT 1`,
  );
  const adminUserId = admin.rows[0]?.id;
  if (!adminUserId) throw new Error("User admin not found");

  const assets = await client.query<{ id: string; key: string; name: string }>(
    `SELECT id, key, name FROM asset WHERE "siteId" = $1::uuid ORDER BY key`,
    [siteId],
  );
  if (assets.rows.length === 0) throw new Error("No EY assets");

  const costCenters = await client.query<{ id: string; key: string }>(
    `SELECT id, key FROM "costCenter" WHERE "siteId" = $1::uuid ORDER BY key`,
    [siteId],
  );
  if (costCenters.rows.length === 0) throw new Error("No EY cost centers");

  const workgroups = await client.query<{ id: string; key: string; leaderId: string }>(
    `
    SELECT w.id, w.key, wu."employeeId" AS "leaderId"
    FROM workgroup w
    JOIN "workgroupUser" wu ON wu."workgroupId" = w.id AND wu."isLeader" = true
    WHERE w."siteId" = $1::uuid
    ORDER BY w.key
    `,
    [siteId],
  );
  if (workgroups.rows.length === 0) throw new Error("No EY workgroups with leaders");

  const orderTypes = await client.query<{ key: string }>(
    `
    SELECT key FROM "workOrderType"
    WHERE "siteId" = $1::uuid AND "isActive" = true
    ORDER BY key
    `,
    [siteId],
  );
  if (orderTypes.rows.length === 0) throw new Error("No active EY order types");

  const classification = await client.query<{ id: string }>(
    `
    SELECT id FROM classification
    WHERE "siteId" = $1::uuid AND "appliesToWorkOrder" = true
    ORDER BY key
    LIMIT 1
    `,
    [siteId],
  );

  return {
    siteId,
    adminUserId,
    assets: assets.rows,
    costCenters: costCenters.rows,
    workgroups: workgroups.rows,
    orderTypes: orderTypes.rows.map((r) => r.key),
    classificationId: classification.rows[0]?.id ?? null,
  };
}

async function countSeeded(client: pg.PoolClient): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM "workOrder" WHERE "description" LIKE $1`,
    [`${SEED_MARKER}%`],
  );
  return rows[0]?.n ?? 0;
}

async function withAudit<T>(
  client: pg.PoolClient,
  adminUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    await client.query(
      `SELECT
        set_config('app.current_user_id', $1, true),
        set_config('app.request_id', $2, true),
        set_config('app.change_reason', $3, true),
        set_config('app.source', $4, true),
        set_config('app.ip_address', '', true),
        set_config('app.user_agent', '', true)`,
      [adminUserId, `seed-perf-wo-${Date.now()}`, "bulk performance seed", "script"],
    );
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function seedBatch(
  client: pg.PoolClient,
  refs: RefBundle,
  startIndex: number,
  count: number,
): Promise<number> {
  const assetCount = refs.assets.length;
  const ccCount = refs.costCenters.length;
  const wgCount = refs.workgroups.length;
  const elektrikCc =
    refs.costCenters.find((c) => c.key === "EY-100001") ?? refs.costCenters[0]!;

  const names: string[] = [];
  const descriptions: string[] = [];
  const assetIds: string[] = [];
  const costCenterIds: string[] = [];
  const plannedStarts: string[] = [];
  const durations: number[] = [];
  const orderTypes: string[] = [];
  const workgroupIds: string[] = [];
  const classificationKeys: string[] = []; // '' => null
  const leaderIds: string[] = [];
  const statuses: string[] = [];
  const ordinals: number[] = [];

  for (let k = 0; k < count; k++) {
    const i = startIndex + k;
    const asset = refs.assets[i % assetCount]!;
    const wg = refs.workgroups[i % wgCount]!;
    const cc =
      wg.key === "EL"
        ? elektrikCc
        : refs.costCenters[ccCount > 1 ? 1 + (i % (ccCount - 1)) : 0]!;
    const orderType = pickOrderType(i, refs.orderTypes);
    const label = ORDER_TYPE_LABELS[orderType] ?? orderType;
    const dayOffset = (i % 150) - 90;
    const planned = new Date();
    planned.setUTCDate(planned.getUTCDate() + dayOffset);
    planned.setUTCHours(i % 24, (i * 7) % 60, 0, 0);

    names.push(`${label}: ${asset.name}`.slice(0, 200));
    descriptions.push(`${SEED_MARKER} #${i + 1} asset=${asset.key} wg=${wg.key}`);
    assetIds.push(asset.id);
    costCenterIds.push(cc.id);
    plannedStarts.push(planned.toISOString());
    durations.push(30 + (i % 8) * 30);
    orderTypes.push(orderType);
    workgroupIds.push(wg.id);
    classificationKeys.push(
      orderType === "inspection" && refs.classificationId && i % 3 === 0
        ? refs.classificationId
        : "",
    );
    leaderIds.push(wg.leaderId);
    statuses.push(pickStatus(i));
    ordinals.push(k);
  }

  const inserted = await client.query<{ id: string; ord: number }>(
    `
    WITH input AS (
      SELECT *
      FROM unnest(
        $1::int[],
        $2::text[],
        $3::text[],
        $4::uuid[],
        $5::uuid[],
        $6::timestamptz[],
        $7::integer[],
        $8::text[],
        $9::uuid[],
        $10::text[],
        $11::text[]
      ) AS t(
        ord, name, description, "assetId", "costCenterId", "plannedStart",
        "plannedDurationMinutes", "orderType", "workgroupId", "classificationKey", status
      )
    ),
    ins AS (
      INSERT INTO "workOrder" (
        "name", "description", "siteId", "assetId", "costCenterId",
        "plannedStart", "plannedDurationMinutes", "orderType", "status",
        "workgroupId", "classificationId"
      )
      SELECT
        i.name,
        i.description,
        $12::uuid,
        i."assetId",
        i."costCenterId",
        i."plannedStart",
        i."plannedDurationMinutes",
        i."orderType",
        'open',
        i."workgroupId",
        NULLIF(i."classificationKey", '')::uuid
      FROM input i
      ORDER BY i.ord
      RETURNING "id", "description"
    )
    SELECT ins."id", i.ord
    FROM ins
    JOIN input i ON i.description = ins.description
    ORDER BY i.ord
    `,
    [
      ordinals,
      names,
      descriptions,
      assetIds,
      costCenterIds,
      plannedStarts,
      durations,
      orderTypes,
      workgroupIds,
      classificationKeys,
      statuses,
      refs.siteId,
    ],
  );

  const ids = inserted.rows.map((r) => r.id);
  if (ids.length === 0) return 0;

  const leadersForIds = inserted.rows.map((r) => leaderIds[r.ord]!);
  await client.query(
    `
    INSERT INTO "workOrderResponsibleEmployee" ("workOrderId", "employeeId")
    SELECT * FROM unnest($1::uuid[], $2::uuid[])
    ON CONFLICT ("workOrderId", "employeeId") DO NOTHING
    `,
    [ids, leadersForIds],
  );

  const toUpdateIds: string[] = [];
  const toUpdateStatuses: string[] = [];
  for (const row of inserted.rows) {
    const status = statuses[row.ord]!;
    if (status !== "open") {
      toUpdateIds.push(row.id);
      toUpdateStatuses.push(status);
    }
  }
  if (toUpdateIds.length > 0) {
    await client.query(
      `
      UPDATE "workOrder" AS w
      SET status = v.status
      FROM (SELECT * FROM unnest($1::uuid[], $2::text[]) AS t(id, status)) AS v
      WHERE w.id = v.id
      `,
      [toUpdateIds, toUpdateStatuses],
    );
  }

  return ids.length;
}

async function main() {
  const target = parseCount(process.argv.slice(2));
  const client = await pool.connect();
  try {
    const refs = await loadRefs(client);
    const existing = await countSeeded(client);
    const remaining = Math.max(0, target - existing);
    console.log(
      JSON.stringify(
        {
          site: "EY",
          assets: refs.assets.length,
          costCenters: refs.costCenters.map((c) => c.key),
          workgroups: refs.workgroups.map((w) => w.key),
          orderTypes: refs.orderTypes,
          alreadySeeded: existing,
          target,
          willInsert: remaining,
        },
        null,
        2,
      ),
    );

    if (remaining === 0) {
      console.log("Nothing to do — target already reached.");
      return;
    }

    let inserted = 0;
    let startIndex = existing;
    while (inserted < remaining) {
      const batch = Math.min(BATCH_SIZE, remaining - inserted);
      const n = await withAudit(client, refs.adminUserId, () =>
        seedBatch(client, refs, startIndex, batch),
      );
      inserted += n;
      startIndex += n;
      console.log(`Inserted batch: +${n} (total this run ${inserted}/${remaining})`);
    }

    const total = await countSeeded(client);
    const { rows: totals } = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "workOrder"`,
    );
    const { rows: byStatus } = await client.query<{ status: string; n: number }>(
      `
      SELECT status, count(*)::int AS n
      FROM "workOrder"
      WHERE "description" LIKE $1
      GROUP BY status
      ORDER BY n DESC
      `,
      [`${SEED_MARKER}%`],
    );
    const { rows: sample } = await client.query(
      `
      SELECT w."orderNumber", w.name, w."orderType", w.status, a.key AS asset, cc.key AS cc, wg.key AS wg
      FROM "workOrder" w
      JOIN asset a ON a.id = w."assetId"
      JOIN "costCenter" cc ON cc.id = w."costCenterId"
      LEFT JOIN workgroup wg ON wg.id = w."workgroupId"
      WHERE w."description" LIKE $1
      ORDER BY w."orderNumber" DESC
      LIMIT 5
      `,
      [`${SEED_MARKER}%`],
    );
    console.log(
      JSON.stringify(
        {
          seededWithMarker: total,
          workOrdersTotal: totals[0]?.n ?? 0,
          seededByStatus: byStatus,
          sample,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
