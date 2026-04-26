const rawApiBaseUrl = (
  typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE_URL
    ? process.env.EXPO_PUBLIC_API_BASE_URL
    : ""
).trim();

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimTrailingSlashes(rawApiBaseUrl || "http://localhost:3001");

function isRelativeApiPath(path: string): boolean {
  return /^\/api(?:\/|$)/.test(path);
}

export function apiUrl(path: string): string {
  if (!isRelativeApiPath(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === "string") {
    return fetch(apiUrl(input), { credentials: "include", ...init });
  }
  if (input instanceof URL) {
    return fetch(apiUrl(input.toString()), { credentials: "include", ...init });
  }
  return fetch(input, { credentials: "include", ...init });
}
