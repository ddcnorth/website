import { createClerkClient, verifyToken } from "@clerk/backend";
import type { Env } from "./env";
import { getCookie, HttpError, isLocalHost, parseList, safeEqual } from "./util";

export interface Admin {
  userId: string;
  email: string;
}

const emailCache = new Map<string, { email: string | null; at: number }>();
const EMAIL_CACHE_MS = 5 * 60_000;

/**
 * Resolve the signed-in admin from a Clerk session token, sent either as
 * `Authorization: Bearer <token>` (admin API calls from the SPA) or as Clerk's
 * `__session` cookie (admin previews of private spaces on the same domain).
 * Returns null when there is no valid admin.
 */
export async function getAdmin(request: Request, env: Env): Promise<Admin | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;

  // Local development shortcut: never honoured unless PORTAL_DEV=1 AND the request is to localhost.
  if (env.PORTAL_DEV === "1" && env.PORTAL_DEV_ADMIN_TOKEN && bearer && isLocalHost(request)
      && safeEqual(bearer, env.PORTAL_DEV_ADMIN_TOKEN)) {
    return { userId: "dev-admin", email: "dev@localhost" };
  }

  const token = bearer ?? getCookie(request, "__session");
  if (!token || (!env.CLERK_SECRET_KEY && !env.CLERK_JWT_KEY)) return null;

  const parties = parseList(env.CLERK_AUTHORIZED_PARTIES).map((p) => p.replace(/\/$/, ""));
  let payload: Awaited<ReturnType<typeof verifyToken>>;
  try {
    payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: parties.length ? parties : undefined,
    });
  } catch {
    return null;
  }
  if (!payload?.sub || (payload as { sts?: string }).sts === "pending") return null;

  const email = await resolveEmail(payload as Record<string, unknown>, env);
  if (!email || !isAdminEmail(email, env)) return null;
  return { userId: payload.sub, email };
}

export async function requireAdmin(request: Request, env: Env): Promise<Admin> {
  const admin = await getAdmin(request, env);
  if (!admin) throw new HttpError(401, "admin_required", "Sign in with an administrator account.");
  return admin;
}

export function isAdminEmail(email: string, env: Env): boolean {
  const e = email.toLowerCase();
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return parseList(env.ADMIN_EMAILS).includes(e) || parseList(env.ADMIN_EMAIL_DOMAINS).includes(domain);
}

/**
 * Prefer an `email` claim (add `{"email": "{{user.primary_email_address}}"}` to the
 * Clerk session token in the dashboard - no network call). Otherwise look the
 * user up with the Backend API and use their verified primary email.
 */
async function resolveEmail(claims: Record<string, unknown>, env: Env): Promise<string | null> {
  if (typeof claims.email === "string" && claims.email) return claims.email.toLowerCase();
  const sub = claims.sub as string;
  const cached = emailCache.get(sub);
  if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return cached.email;
  if (!env.CLERK_SECRET_KEY) return null;
  let email: string | null = null;
  try {
    const user = await createClerkClient({ secretKey: env.CLERK_SECRET_KEY }).users.getUser(sub);
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
    if (primary && primary.verification?.status === "verified") email = primary.emailAddress.toLowerCase();
  } catch (err) {
    console.error("clerk user lookup failed", err);
  }
  emailCache.set(sub, { email, at: Date.now() });
  return email;
}
