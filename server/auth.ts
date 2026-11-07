import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";
import { getCookie, HttpError, isLocalHost, normalizeEmail, parseList, safeEqual } from "./util";

export interface Admin { userId: string; email: string; expiresAt?: number }
export const ADMIN_COOKIE = "__Host-ddc_admin";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify the same short-lived, signed identity used by Societyer DDCNorth. */
export async function verifyHostedAdminToken(token: string, env: Env): Promise<Admin | null> {
  if (!env.ADMIN_AUTH_SITE_URL) return null;
  try {
    const issuer = new URL(env.ADMIN_AUTH_SITE_URL).origin;
    if (!issuer.startsWith("https://")) return null;
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/api/auth/convex/jwks`));
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: "convex", algorithms: ["RS256", "ES256"],
      requiredClaims: ["sub", "exp", "iat", "email", "emailVerified"],
      maxTokenAge: "10m", clockTolerance: 5,
    });
    const email = normalizeEmail(payload.email);
    if (!payload.sub || payload.emailVerified !== true || !email || !isAdminEmail(email, env)) return null;
    return { userId: payload.sub, email, expiresAt: payload.exp! * 1000 };
  } catch {
    return null;
  }
}

export async function getAdmin(request: Request, env: Env): Promise<Admin | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (env.PORTAL_DEV === "1" && env.PORTAL_DEV_ADMIN_TOKEN && bearer && isLocalHost(request)
      && safeEqual(bearer, env.PORTAL_DEV_ADMIN_TOKEN)) {
    return { userId: "dev-admin", email: "dev@localhost" };
  }
  const token = bearer ?? getCookie(request, ADMIN_COOKIE);
  return token ? verifyHostedAdminToken(token, env) : null;
}

export async function requireAdmin(request: Request, env: Env): Promise<Admin> {
  const admin = await getAdmin(request, env);
  if (!admin) throw new HttpError(401, "admin_required", "Sign in with an administrator account.");
  return admin;
}

export function isAdminEmail(email: string, env: Env): boolean {
  const e = email.toLowerCase();
  return parseList(env.ADMIN_EMAILS).includes(e) || parseList(env.ADMIN_EMAIL_DOMAINS).includes(e.slice(e.lastIndexOf("@") + 1));
}
