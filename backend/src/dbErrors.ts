function getErrorCode(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const maybeCode = Reflect.get(value, "code");
  return typeof maybeCode === "string" ? maybeCode : null;
}

function collectCodes(error: unknown, into: Set<string>): void {
  const code = getErrorCode(error);
  if (code) {
    into.add(code);
  }
  if (!error || typeof error !== "object") {
    return;
  }

  const cause = Reflect.get(error, "cause");
  if (cause) {
    collectCodes(cause, into);
  }

  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      collectCodes(nested, into);
    }
    return;
  }

  const nestedErrors = Reflect.get(error, "errors");
  if (Array.isArray(nestedErrors)) {
    for (const nested of nestedErrors) {
      collectCodes(nested, into);
    }
  }
}

export function hasErrorCode(error: unknown, targetCode: string): boolean {
  const codes = new Set<string>();
  collectCodes(error, codes);
  return codes.has(targetCode);
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  return (
    hasErrorCode(error, "ECONNREFUSED") ||
    hasErrorCode(error, "ENOTFOUND") ||
    hasErrorCode(error, "EHOSTUNREACH")
  );
}
