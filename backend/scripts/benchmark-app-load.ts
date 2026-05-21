import "dotenv/config";

import {
  APP_IDS,
  APP_LOAD_PROFILES,
  type AppId,
  type AppLoadProfile,
  type LoadPhaseSpec,
  type RequestSpec,
  isAppId,
} from "./appLoadProfiles.js";

type CliOptions = {
  baseUrl: string;
  loginName: string;
  password: string;
  apps: AppId[];
  iterations: number;
  verbose: boolean;
  includeAuthMe: boolean;
  warmup: boolean;
};

type EndpointTiming = {
  label: string;
  path: string;
  status: number;
  ttfbMs: number;
  bodyMs: number;
  totalMs: number;
  bytes: number;
  rowCount: number | null;
  totalCount: number | null;
  payload?: unknown;
  error?: string;
};

type PhaseTiming = {
  label: string;
  mode: "parallel" | "sequential";
  endpoints: EndpointTiming[];
  wallMs: number;
};

type AppLoadResult = {
  appId: AppId;
  label: string;
  route: string;
  phases: PhaseTiming[];
  totalMs: number;
  endpointCount: number;
};

type AuthSession = {
  cookieHeader: string;
};

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    baseUrl: process.env.BENCH_BASE_URL ?? "http://localhost:3001",
    loginName: process.env.BENCH_LOGIN ?? "admin",
    password: process.env.BENCH_PASSWORD ?? "admin",
    apps: ["monitoring"],
    iterations: 1,
    verbose: false,
    includeAuthMe: false,
    warmup: false,
  };
  let appsExplicit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--all") {
      opts.apps = [...APP_IDS];
      appsExplicit = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
      continue;
    }
    if (arg === "--with-auth-me") {
      opts.includeAuthMe = true;
      continue;
    }
    if (arg === "--warmup") {
      opts.warmup = true;
      continue;
    }
    if (arg === "--base-url") {
      opts.baseUrl = argv[++i] ?? opts.baseUrl;
      continue;
    }
    if (arg === "--login") {
      opts.loginName = argv[++i] ?? opts.loginName;
      continue;
    }
    if (arg === "--password") {
      opts.password = argv[++i] ?? opts.password;
      continue;
    }
    if (arg === "--iterations") {
      opts.iterations = Math.max(1, Number.parseInt(argv[++i] ?? "1", 10) || 1);
      continue;
    }
    if (arg === "--app") {
      const raw = argv[++i];
      if (!raw) throw new Error("Missing value for --app");
      if (raw === "all") {
        opts.apps = [...APP_IDS];
        appsExplicit = true;
      } else if (isAppId(raw)) {
        if (!appsExplicit) {
          opts.apps = [];
          appsExplicit = true;
        }
        if (!opts.apps.includes(raw)) opts.apps.push(raw);
      } else {
        throw new Error(`Unknown app "${raw}". Valid: ${APP_IDS.join(", ")}`);
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (opts.apps.length === 0) opts.apps = ["monitoring"];
  return opts;
}

function printHelp(): void {
  console.log(`Athene app load benchmark

Measures the API calls each desktop app performs on initial load (mirrors frontend Promise.all batches).

Usage:
  npm run athene:bench-load -w backend -- [options]

Note: the extra \`--\` is required so npm forwards flags to the script.

Options:
  --app <id>           App to benchmark (repeatable). Default: monitoring
  --all                Benchmark all apps
  --base-url <url>     Backend base URL (default: http://localhost:3001)
  --login <name>       Login name (default: admin, env BENCH_LOGIN)
  --password <pass>    Password (default: admin, env BENCH_PASSWORD)
  --iterations <n>     Repeat each app n times and show min/avg/max (default: 1)
  --with-auth-me       Include GET /api/auth/me (shell session bootstrap)
  --warmup             Run one untimed warmup iteration before measuring
  --verbose, -v        Show per-endpoint payload stats
  --help, -h           Show this help

Apps:
  ${APP_IDS.join(", ")}
`);
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function countRows(payload: unknown): { rowCount: number | null; totalCount: number | null } {
  if (Array.isArray(payload)) {
    return { rowCount: payload.length, totalCount: payload.length };
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.rows)) {
      const total = typeof obj.total === "number" ? obj.total : obj.rows.length;
      return { rowCount: obj.rows.length, totalCount: total };
    }
  }
  return { rowCount: null, totalCount: null };
}

async function fetchTimed(
  baseUrl: string,
  session: AuthSession,
  spec: RequestSpec,
): Promise<EndpointTiming> {
  const url = `${baseUrl}${spec.path}`;
  const started = performance.now();
  try {
    const res = await fetch(url, {
      headers: { cookie: session.cookieHeader },
    });
    const ttfbMs = performance.now() - started;
    const bodyStarted = performance.now();
    const text = await res.text();
    const bodyMs = performance.now() - bodyStarted;
    const totalMs = performance.now() - started;
    const bytes = Buffer.byteLength(text, "utf8");

    let rowCount: number | null = null;
    let totalCount: number | null = null;
    let payload: unknown;
    if (res.ok && text.length > 0) {
      try {
        payload = JSON.parse(text) as unknown;
        const counts = countRows(payload);
        rowCount = counts.rowCount;
        totalCount = counts.totalCount;
      } catch {
        // non-json body
      }
    }

    return {
      label: spec.label,
      path: spec.path,
      status: res.status,
      ttfbMs,
      bodyMs,
      totalMs,
      bytes,
      rowCount,
      totalCount,
      payload,
      error: res.ok ? undefined : text.slice(0, 120),
    };
  } catch (err) {
    const totalMs = performance.now() - started;
    return {
      label: spec.label,
      path: spec.path,
      status: 0,
      ttfbMs: totalMs,
      bodyMs: 0,
      totalMs,
      bytes: 0,
      rowCount: null,
      totalCount: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function login(baseUrl: string, loginName: string, password: string): Promise<AuthSession> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginName, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = res.headers.get("set-cookie");
  const cookieParts = setCookie.length > 0 ? setCookie : raw ? [raw] : [];
  const sid = cookieParts
    .map((part) => part.split(";")[0]?.trim())
    .find((part) => part?.startsWith("athene.sid="));
  if (!sid) {
    throw new Error("Login succeeded but no athene.sid cookie was returned");
  }
  return { cookieHeader: sid };
}

function defaultPresetDetailRequest(
  bootstrapEndpoints: EndpointTiming[],
  presetKey: "monitoringPresetId" | "workOrdersPresetId",
  label: string,
): RequestSpec | null {
  const defaults = bootstrapEndpoints.find((e) => e.label === "search-presets/defaults" && e.status === 200);
  const presets = bootstrapEndpoints.find((e) => e.label === "search-presets" && e.status === 200);
  if (!defaults?.payload || !presets?.payload) return null;

  const presetId =
    typeof defaults.payload === "object" && defaults.payload !== null && presetKey in defaults.payload
      ? ((defaults.payload as Record<string, string | null>)[presetKey] ?? null)
      : null;
  if (!presetId) return null;

  const presetIds = Array.isArray(presets.payload)
    ? presets.payload
        .map((p) =>
          typeof p === "object" && p !== null && "id" in p ? String((p as { id: unknown }).id ?? "") : "",
        )
        .filter(Boolean)
        .map((id) => id.toLowerCase())
    : [];
  if (!presetIds.includes(presetId.toLowerCase())) return null;

  return {
    label,
    path: `/api/work-order-search-presets/${encodeURIComponent(presetId)}`,
  };
}

async function runPhase(
  baseUrl: string,
  session: AuthSession,
  phase: LoadPhaseSpec,
): Promise<PhaseTiming> {
  const started = performance.now();
  let endpoints: EndpointTiming[];

  if (phase.mode === "parallel") {
    endpoints = await Promise.all(phase.requests.map((req) => fetchTimed(baseUrl, session, req)));
  } else {
    endpoints = [];
    for (const req of phase.requests) {
      endpoints.push(await fetchTimed(baseUrl, session, req));
    }
  }

  return {
    label: phase.label,
    mode: phase.mode,
    endpoints,
    wallMs: performance.now() - started,
  };
}

async function runAppLoad(
  baseUrl: string,
  session: AuthSession,
  profile: AppLoadProfile,
  includeAuthMe: boolean,
): Promise<AppLoadResult> {
  const phases: PhaseTiming[] = [];
  const totalStarted = performance.now();

  if (includeAuthMe) {
    phases.push(
      await runPhase(baseUrl, session, {
        label: "shell auth",
        mode: "sequential",
        requests: [{ label: "auth/me", path: "/api/auth/me" }],
      }),
    );
  }

  for (const phase of profile.phases) {
    const result = await runPhase(baseUrl, session, phase);
    phases.push(result);

    const presetDetailByApp: Partial<Record<AppId, { key: "monitoringPresetId" | "workOrdersPresetId"; label: string }>> =
      {
        monitoring: {
          key: "monitoringPresetId",
          label: "search-presets/detail (monitoring default)",
        },
        workOrders: {
          key: "workOrdersPresetId",
          label: "search-presets/detail (work orders default)",
        },
      };
    const presetDetail = presetDetailByApp[profile.id];
    const isSearchBootstrap = phase.label === "search-presets bootstrap" && phase.mode === "parallel";
    if (isSearchBootstrap && presetDetail) {
      const detailRequest = defaultPresetDetailRequest(result.endpoints, presetDetail.key, presetDetail.label);
      if (detailRequest) {
        const detailStarted = performance.now();
        const detail = await fetchTimed(baseUrl, session, detailRequest);
        phases.push({
          label: presetDetail.label,
          mode: "sequential",
          endpoints: [detail],
          wallMs: performance.now() - detailStarted,
        });
      }
    }
  }

  const endpointCount = phases.reduce((sum, phase) => sum + phase.endpoints.length, 0);
  return {
    appId: profile.id,
    label: profile.label,
    route: profile.route,
    phases,
    totalMs: performance.now() - totalStarted,
    endpointCount,
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function printResult(result: AppLoadResult, verbose: boolean): void {
  console.log(`\n${result.label} (${result.route})`);
  console.log(`  total: ${formatMs(result.totalMs)} · ${result.endpointCount} request(s)`);

  for (const phase of result.phases) {
    console.log(`  phase "${phase.label}" [${phase.mode}]: ${formatMs(phase.wallMs)}`);
    const sorted = [...phase.endpoints].sort((a, b) => b.totalMs - a.totalMs);
    for (const ep of sorted) {
      const status = ep.status > 0 ? String(ep.status) : "ERR";
      const rowInfo =
        ep.rowCount != null
          ? ep.totalCount != null && ep.totalCount !== ep.rowCount
            ? ` · rows ${ep.rowCount}/${ep.totalCount}`
            : ` · rows ${ep.rowCount}`
          : "";
      const err = ep.error ? ` · ${ep.error}` : "";
      console.log(
        `    ${ep.label.padEnd(28)} ${formatMs(ep.totalMs).padStart(10)}  HTTP ${status}${rowInfo}${verbose ? ` · ${formatBytes(ep.bytes)} · ttfb ${formatMs(ep.ttfbMs)} + body ${formatMs(ep.bodyMs)}` : ""}${err}`,
      );
    }
  }

  const slowest = result.phases
    .flatMap((p) => p.endpoints)
    .sort((a, b) => b.totalMs - a.totalMs)[0];
  if (slowest) {
    console.log(`  slowest endpoint: ${slowest.label} (${formatMs(slowest.totalMs)})`);
  }
}

function summarizeRuns(results: AppLoadResult[]): void {
  const byApp = new Map<AppId, number[]>();
  for (const result of results) {
    const list = byApp.get(result.appId) ?? [];
    list.push(result.totalMs);
    byApp.set(result.appId, list);
  }

  if (byApp.size <= 1 && (byApp.get("monitoring")?.length ?? 0) <= 1) return;

  console.log("\nSummary (total load time per app):");
  const rows = [...byApp.entries()]
    .map(([appId, totals]) => {
      const min = Math.min(...totals);
      const max = Math.max(...totals);
      const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
      return {
        appId,
        label: APP_LOAD_PROFILES[appId].label,
        min,
        max,
        avg,
        runs: totals.length,
      };
    })
    .sort((a, b) => b.avg - a.avg);

  for (const row of rows) {
    const stats =
      row.runs === 1
        ? formatMs(row.avg)
        : `${formatMs(row.min)} / ${formatMs(row.avg)} avg / ${formatMs(row.max)} (${row.runs} runs)`;
    console.log(`  ${row.label.padEnd(18)} ${stats}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = normalizeBaseUrl(opts.baseUrl);

  console.log(`Athene app load benchmark`);
  console.log(`  base URL: ${baseUrl}`);
  console.log(`  login: ${opts.loginName}`);
  console.log(`  apps: ${opts.apps.join(", ")}`);
  console.log(`  iterations: ${opts.iterations}`);

  const session = await login(baseUrl, opts.loginName, opts.password);
  console.log("  session: ok");

  const measured: AppLoadResult[] = [];

  if (opts.warmup) {
    console.log("\nWarmup…");
    for (const appId of opts.apps) {
      await runAppLoad(baseUrl, session, APP_LOAD_PROFILES[appId], opts.includeAuthMe);
    }
  }

  for (let iteration = 1; iteration <= opts.iterations; iteration += 1) {
    if (opts.iterations > 1) {
      console.log(`\n=== iteration ${iteration}/${opts.iterations} ===`);
    }
    for (const appId of opts.apps) {
      const result = await runAppLoad(baseUrl, session, APP_LOAD_PROFILES[appId], opts.includeAuthMe);
      measured.push(result);
      printResult(result, opts.verbose);
    }
  }

  summarizeRuns(measured);

  const failed = measured.flatMap((r) => r.phases.flatMap((p) => p.endpoints)).filter((e) => e.status === 0 || e.status >= 400);
  if (failed.length > 0) {
    console.error(`\n${failed.length} request(s) failed.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
