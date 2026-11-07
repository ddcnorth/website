import type { Env } from "./env";

export const now = () => Date.now();
export const MINUTE = 60_000;

const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const newId = (prefix: string) => `${prefix}_${randomToken(12)}`;

/** Six digits, uniformly distributed. */
export function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function sha256(value: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

/** Constant-time comparison of two strings of equal expected length. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum.

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iter, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iter || !salt || !hash) return false;
  const candidate = await pbkdf2(password, b64urlDecode(salt), Number(iter));
  return safeEqual(candidate, hash);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return b64url(bits);
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, { status: err.status });
  console.error(err);
  return json({ error: "server_error", message: "Something went wrong." }, { status: 500 });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "bad_json", "Expected a JSON body.");
  }
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** Request metadata recorded with events. Location comes from Cloudflare's edge (approximate). */
export function requestMeta(request: Request) {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return {
    ip: request.headers.get("cf-connecting-ip") ?? null,
    country: (cf?.country as string | undefined) ?? null,
    region: (cf?.region as string | undefined) ?? null,
    city: (cf?.city as string | undefined) ?? null,
    user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    referer: request.headers.get("referer")?.slice(0, 400) ?? null,
  };
}

export function isLocalHost(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Origin of the main site (where /access/ and /admin/ live), also when called from a subdomain mount. */
export function siteOrigin(env: Env, request: Request): string {
  if (env.PORTAL_ORIGIN) return env.PORTAL_ORIGIN.replace(/\/$/, "");
  const url = new URL(request.url);
  const root = env.PORTAL_ROOT_DOMAIN?.toLowerCase();
  if (root && url.hostname.endsWith(`.${root}`)) return `${url.protocol}//${root}`;
  return url.origin;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** Recipient list entries are exact emails or "@domain.com". */
export function emailAllowed(email: string, list: string[]): boolean {
  const domain = email.slice(email.lastIndexOf("@"));
  return list.some((entry) => {
    const e = entry.trim().toLowerCase();
    return e === email || (e.startsWith("@") && e === domain);
  });
}

export function parseList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}
