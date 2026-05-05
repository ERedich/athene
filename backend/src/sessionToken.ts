import { createHmac, timingSafeEqual } from "node:crypto";

import type { Request, Response } from "express";

const SESSION_COOKIE_NAME = "athene.sid";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
type SessionSameSite = "none" | "lax";

type SessionPayload = {
  uid: string;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadBase64Url: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadBase64Url).digest("base64url");
}

function signaturesMatch(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function parseCookies(rawCookieHeader: string | undefined): Record<string, string> {
  const pairs = (rawCookieHeader ?? "").split(";").map((part) => part.trim());
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieOptions(isProduction: boolean): {
  httpOnly: true;
  path: "/";
  sameSite: SessionSameSite;
  secure: boolean;
  maxAge: number;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
  };
}

export function createSessionToken(userId: string, secret: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadBase64Url = base64UrlEncode(JSON.stringify(payload));
  const sig = sign(payloadBase64Url, secret);
  return `${payloadBase64Url}.${sig}`;
}

function readSessionUserIdFromSignedTokenString(token: string, secret: string): string | undefined {
  const [payloadBase64Url, sig] = token.split(".", 2);
  if (!payloadBase64Url || !sig) return undefined;
  const expectedSig = sign(payloadBase64Url, secret);
  if (!signaturesMatch(sig, expectedSig)) return undefined;
  try {
    const parsed = JSON.parse(base64UrlDecode(payloadBase64Url)) as Partial<SessionPayload>;
    if (typeof parsed.uid !== "string" || typeof parsed.exp !== "number") return undefined;
    if (Date.now() > parsed.exp) return undefined;
    return parsed.uid;
  } catch {
    return undefined;
  }
}

function bearerTokenFromRequest(req: Request): string | undefined {
  const raw = req.headers.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !value.startsWith("Bearer ")) return undefined;
  const t = value.slice("Bearer ".length).trim();
  return t || undefined;
}

export function readSessionUserId(req: Request, secret: string): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  const fromCookie = cookies[SESSION_COOKIE_NAME];
  if (fromCookie) {
    const uid = readSessionUserIdFromSignedTokenString(fromCookie, secret);
    if (uid) return uid;
  }
  const bearer = bearerTokenFromRequest(req);
  if (bearer) {
    return readSessionUserIdFromSignedTokenString(bearer, secret);
  }
  return undefined;
}

export function readSessionUserIdFromCookieHeader(
  cookieHeader: string | undefined,
  secret: string,
): string | undefined {
  const cookies = parseCookies(cookieHeader);
  return readSessionUserIdFromCookies(cookies, secret);
}

function readSessionUserIdFromCookies(
  cookies: Record<string, string>,
  secret: string,
): string | undefined {
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return undefined;
  return readSessionUserIdFromSignedTokenString(token, secret);
}

export function writeSessionCookie(
  res: Response,
  userId: string,
  secret: string,
  isProduction: boolean,
): void {
  res.cookie(SESSION_COOKIE_NAME, createSessionToken(userId, secret), cookieOptions(isProduction));
}

export function clearSessionCookie(res: Response, isProduction: boolean): void {
  const { maxAge: _maxAge, ...opts } = cookieOptions(isProduction);
  res.clearCookie(SESSION_COOKIE_NAME, opts);
}
