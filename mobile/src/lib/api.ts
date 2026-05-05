import Constants from "expo-constants";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined;
  const fromExtra = typeof extra?.apiBaseUrl === "string" ? extra.apiBaseUrl.trim() : "";
  const fromEnv =
    typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE_URL
      ? String(process.env.EXPO_PUBLIC_API_BASE_URL).trim()
      : "";
  const fallback = "http://localhost:3001";
  return trimTrailingSlashes(fromExtra || fromEnv || fallback);
}

export const API_BASE_URL = resolveApiBaseUrl();

if (__DEV__) {
  console.log("[athene-mobile] API_BASE_URL =", API_BASE_URL);
}

/** Persisted when "Remember" is on (native). */
export const MOBILE_SESSION_STORAGE_KEY = "athene.mobileSession";

let mobileBearerToken: string | null = null;

export function getMobileBearerToken(): string | null {
  return mobileBearerToken;
}

export function setMobileBearerToken(token: string | null): void {
  mobileBearerToken = token;
}

function isRelativeApiPath(path: string): boolean {
  return /^\/api(?:\/|$)/.test(path);
}

export function apiUrl(path: string): string {
  if (!isRelativeApiPath(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function mergeFetchInit(baseUrl: string, init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers ?? undefined);
  if (mobileBearerToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${mobileBearerToken}`);
  }
  return { credentials: "include", ...init, headers };
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === "string") {
    return fetch(apiUrl(input), mergeFetchInit(input, init));
  }
  if (input instanceof URL) {
    const next = input.toString();
    return fetch(apiUrl(next), mergeFetchInit(next, init));
  }
  return fetch(input, init);
}
