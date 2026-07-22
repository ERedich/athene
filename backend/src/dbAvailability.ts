type MaybeDbError = {
  code?: string;
  message?: string;
  cause?: unknown;
  errors?: unknown;
};

const transientDbCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
]);

function hasDbConnectivityCode(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as MaybeDbError).code;
  return typeof code === "string" && transientDbCodes.has(code);
}

function hasDbConnectivityMessage(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = (err as MaybeDbError).message;
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return (
    lower.includes("connect econnrefused") ||
    lower.includes("connection terminated unexpectedly") ||
    lower.includes("the database system is starting up")
  );
}

function hasNestedDbConnectivityError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as MaybeDbError;
  if (Array.isArray(e.errors) && e.errors.some((nested) => isDbUnavailableError(nested))) {
    return true;
  }
  if (e.cause && isDbUnavailableError(e.cause)) {
    return true;
  }
  return false;
}

export function isDbUnavailableError(err: unknown): boolean {
  return (
    hasDbConnectivityCode(err) ||
    hasDbConnectivityMessage(err) ||
    hasNestedDbConnectivityError(err)
  );
}

