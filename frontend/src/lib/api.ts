const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimTrailingSlashes(rawApiBaseUrl);

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
    const next = input.toString();
    return fetch(apiUrl(next), { credentials: "include", ...init });
  }
  return fetch(input, { credentials: "include", ...init });
}
