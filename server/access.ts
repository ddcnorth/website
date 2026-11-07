import type { Env } from "./env";
import { codeEmail, sendMail } from "./email";
import { canUnlock, isActive, sessionExpiry, type ActivationTiming, type GrantTiming } from "./policy";
import {
  emailAllowed, getCookie, HttpError, newId, now, parseList, randomCode, randomToken, requestMeta, sha256, siteOrigin,
} from "./util";

export const SESSION_COOKIE = "ddc_access";

export interface SpaceRow {
  id: string; slug: string; title: string; description: string;
  visibility: "private" | "public"; subdomain: number; repo: string | null;
  archived_at: number | null; created_by: string | null; created_at: number; updated_at: number;
}

export interface GrantRow extends GrantTiming {
  id: string; space_id: string; label: string; method: "link" | "password" | "email";
  token_hash: string; password_hash: string | null; emails: string; timer_scope: "grant" | "recipient";
  notify_on_open: number; note: string; created_by: string | null; created_at: number; updated_at: number;
}

export interface ActivationRow extends ActivationTiming { id: string; grant_id: string; recipient_key: string }

export interface SessionRow {
  id: string; token_hash: string; email: string | null; created_at: number; expires_at: number;
  last_seen_at: number; ip: string | null; country: string | null; region: string | null; city: string | null;
  user_agent: string | null; revoked_at: number | null;
}

export type EventType =
  | "link_opened" | "unlock_ok" | "unlock_failed" | "unlock_denied" | "code_sent" | "code_failed"
  | "signin_ok" | "view" | "denied" | "admin_preview" | "admin_change";

export async function logEvent(
  env: Env, request: Request | null, type: EventType,
  f: { space_id?: string | null; grant_id?: string | null; session_id?: string | null; email?: string | null; path?: string | null; detail?: unknown } = {},
) {
  const m = request ? requestMeta(request) : { ip: null, country: null, region: null, city: null, user_agent: null, referer: null };
  await env.DB.prepare(
    `INSERT INTO events (ts, type, space_id, grant_id, session_id, email, path, ip, country, region, city, user_agent, referer, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(now(), type, f.space_id ?? null, f.grant_id ?? null, f.session_id ?? null, f.email ?? null, f.path ?? null,
    m.ip, m.country, m.region, m.city, m.user_agent, m.referer, f.detail === undefined ? null : JSON.stringify(f.detail)).run();
}

// ---------------------------------------------------------------- lookups

export const getSpaceBySlug = (env: Env, slug: string) =>
  env.DB.prepare("SELECT * FROM spaces WHERE slug = ? AND archived_at IS NULL").bind(slug).first<SpaceRow>();

export const getSpace = (env: Env, id: string) =>
  env.DB.prepare("SELECT * FROM spaces WHERE id = ?").bind(id).first<SpaceRow>();

export async function getGrantByToken(env: Env, token: string) {
  if (!token || token.length > 100) return null;
  return env.DB.prepare("SELECT * FROM grants WHERE token_hash = ?").bind(await sha256(token)).first<GrantRow>();
}

export const grantEmails = (g: GrantRow): string[] => {
  try { return JSON.parse(g.emails) as string[]; } catch { return []; }
};

export async function loadSession(request: Request, env: Env): Promise<SessionRow | null> {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  return env.DB.prepare("SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?")
    .bind(await sha256(token), now()).first<SessionRow>();
}

// ---------------------------------------------------------------- cookies

export function cookieDomain(request: Request, env: Env): string | null {
  const root = env.PORTAL_ROOT_DOMAIN?.toLowerCase();
  const host = new URL(request.url).hostname;
  return root && (host === root || host.endsWith(`.${root}`)) ? root : null;
}

export function sessionCookie(request: Request, env: Env, token: string, expiresAt: number): string {
  const url = new URL(request.url);
  const domain = cookieDomain(request, env);
  return [
    `${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
    ...(url.protocol === "https:" ? ["Secure"] : []),
    ...(domain ? [`Domain=${domain}`] : []),
  ].join("; ");
}

export function clearSessionCookie(request: Request, env: Env): string {
  return sessionCookie(request, env, "", 0);
}

// ---------------------------------------------------------------- unlocking

export interface UnlockResult {
  session: SessionRow;
  /** Present when a new browser session was created and the cookie must be set. */
  newToken: string | null;
  sessionExpiresAt: number;
  firstOpen: boolean;
}

/** Has this browser session already unlocked this grant (and is it still valid)? */
export async function sessionHasGrant(env: Env, session: SessionRow | null, grant: GrantRow): Promise<boolean> {
  if (!session) return false;
  const row = await env.DB.prepare(
    `SELECT sg.expires_at AS sg_expires, a.first_unlocked_at, a.expires_at
       FROM session_grants sg JOIN activations a ON a.id = sg.activation_id
      WHERE sg.session_id = ? AND sg.grant_id = ?`,
  ).bind(session.id, grant.id).first<{ sg_expires: number } & ActivationTiming>();
  const at = now();
  return !!row && row.sg_expires > at && isActive(grant, row, at) === null;
}

/**
 * Turn a verified credential (link click, correct password, or verified email)
 * into access: start the countdown if this is the first unlock, consume one
 * unlock, and attach the grant to the browser session.
 */
export async function unlockGrant(
  env: Env, request: Request, grant: GrantRow, opts: { email?: string | null; session?: SessionRow | null; waitUntil?: (p: Promise<unknown>) => void; quiet?: boolean },
): Promise<UnlockResult> {
  const at = now();
  const email = opts.email ?? null;
  const recipientKey = grant.timer_scope === "recipient" && email ? email : "grant";
  let activation = await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? AND recipient_key = ?")
    .bind(grant.id, recipientKey).first<ActivationRow>();

  const decision = canUnlock(grant, activation, at);
  if (!decision.ok) {
    if (!opts.quiet) await logEvent(env, request, "unlock_denied", { space_id: grant.space_id, grant_id: grant.id, email, detail: { reason: decision.reason } });
    throw new HttpError(403, decision.reason, denyMessage(decision.reason));
  }

  const consumed = await env.DB.prepare(
    `UPDATE grants SET unlock_count = unlock_count + 1, updated_at = ?
      WHERE id = ? AND (max_unlocks IS NULL OR unlock_count < max_unlocks)`,
  ).bind(at, grant.id).run();
  if (!consumed.meta.changes) throw new HttpError(403, "unlock_limit", denyMessage("unlock_limit"));

  if (decision.newActivation) {
    // The first unlock timestamp is written exactly once; a race keeps the earliest row.
    await env.DB.prepare(
      `INSERT INTO activations (id, grant_id, recipient_key, first_unlocked_at, expires_at)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT (grant_id, recipient_key) DO NOTHING`,
    ).bind(newId("act"), grant.id, recipientKey, at, decision.activationExpiresAt).run();
    activation = await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? AND recipient_key = ?")
      .bind(grant.id, recipientKey).first<ActivationRow>();
  }
  if (!activation) throw new HttpError(500, "activation_failed");

  const sessionExpiresAt = sessionExpiry(grant, activation.expires_at, at);
  const meta = requestMeta(request);
  let session = opts.session ?? null;
  let newToken: string | null = null;
  if (!session) {
    newToken = randomToken(32);
    session = {
      id: newId("ses"), token_hash: await sha256(newToken), email, created_at: at, expires_at: sessionExpiresAt,
      last_seen_at: at, ip: meta.ip, country: meta.country, region: meta.region, city: meta.city,
      user_agent: meta.user_agent, revoked_at: null,
    };
    await env.DB.prepare(
      `INSERT INTO sessions (id, token_hash, email, created_at, expires_at, last_seen_at, ip, country, region, city, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(session.id, session.token_hash, email, at, sessionExpiresAt, at, meta.ip, meta.country, meta.region, meta.city, meta.user_agent).run();
  } else if (session.expires_at < sessionExpiresAt) {
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE id = ?").bind(sessionExpiresAt, session.id).run();
    session.expires_at = sessionExpiresAt;
  }

  await env.DB.prepare(
    `INSERT INTO session_grants (session_id, grant_id, activation_id, email, created_at, expires_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, grant_id) DO UPDATE SET activation_id = excluded.activation_id,
       email = excluded.email, expires_at = excluded.expires_at, last_seen_at = excluded.last_seen_at`,
  ).bind(session.id, grant.id, activation.id, email, at, sessionExpiresAt, at).run();

  await logEvent(env, request, "unlock_ok", {
    space_id: grant.space_id, grant_id: grant.id, session_id: session.id, email,
    detail: { first: decision.newActivation, method: grant.method },
  });

  if (decision.newActivation && grant.notify_on_open && env.NOTIFY_EMAIL) {
    const p = notifyFirstOpen(env, request, grant, email).catch((e) => console.error("notify failed", e));
    opts.waitUntil ? opts.waitUntil(p) : await p;
  }
  return { session, newToken, sessionExpiresAt, firstOpen: decision.newActivation };
}

async function notifyFirstOpen(env: Env, request: Request, grant: GrantRow, email: string | null) {
  const space = await getSpace(env, grant.space_id);
  const m = requestMeta(request);
  const where = [m.city, m.region, m.country].filter(Boolean).join(", ") || "unknown location";
  const who = email ?? "someone with the link";
  await sendMail(env, {
    to: parseList(env.NOTIFY_EMAIL),
    subject: `Opened: ${grant.label} (${space?.title ?? "space"})`,
    text: `${who} opened "${space?.title}" via "${grant.label}" from ${where}.\n\n${siteOrigin(env, request)}/admin/spaces/${grant.space_id}`,
  });
}

export function denyMessage(reason: string): string {
  switch (reason) {
    case "revoked": return "This link has been turned off.";
    case "not_started": return "This link is not available yet.";
    case "expired": return "This link has expired.";
    case "activation_window_closed": return "This invitation was not opened in time and has expired.";
    case "unlock_limit": return "This link has already been used the maximum number of times.";
    default: return "You do not have access to this page.";
  }
}

// ---------------------------------------------------------------- email codes

const CODE_TTL = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;

export async function issueCode(
  env: Env, request: Request, email: string, grantId: string | null, title: string,
): Promise<string | null> {
  const at = now();
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_codes WHERE email = ? AND created_at > ?")
    .bind(email, at - 15 * 60_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) throw new HttpError(429, "too_many_codes", "Too many codes requested. Try again in 15 minutes.");
  const code = randomCode();
  await env.DB.prepare(
    "INSERT INTO email_codes (id, email, code_hash, grant_id, created_at, expires_at, ip) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).bind(newId("code"), email, await sha256(`${email}:${code}`), grantId, at, at + CODE_TTL, requestMeta(request).ip).run();
  const mail = codeEmail(code, title, env.EMAIL_FROM_NAME ?? "DDCNorth");
  await sendMail(env, { ...mail, to: [email] });
  await logEvent(env, request, "code_sent", { grant_id: grantId, email });
  return env.PORTAL_DEV === "1" ? code : null;
}

/** Check the newest unused code for this email. Throws on failure. */
export async function verifyCode(env: Env, request: Request, email: string, code: string, grantId: string | null) {
  const at = now();
  const row = await env.DB.prepare(
    `SELECT * FROM email_codes WHERE email = ? AND consumed_at IS NULL AND expires_at > ?
       AND (grant_id IS ? OR grant_id IS NULL) ORDER BY created_at DESC LIMIT 1`,
  ).bind(email, at, grantId).first<{ id: string; code_hash: string; attempts: number }>();
  const fail = async (msg: string) => {
    await logEvent(env, request, "code_failed", { grant_id: grantId, email });
    throw new HttpError(400, "invalid_code", msg);
  };
  if (!row) return fail("That code has expired. Request a new one.");
  if (row.attempts >= MAX_CODE_ATTEMPTS) return fail("Too many attempts. Request a new code.");
  const ok = row.code_hash === (await sha256(`${email}:${String(code).trim()}`));
  if (!ok) {
    await env.DB.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return fail("That code is not correct.");
  }
  await env.DB.prepare("UPDATE email_codes SET consumed_at = ? WHERE id = ?").bind(at, row.id).run();
}

/** Too many wrong passwords from this IP for this grant in the last 15 minutes? */
export async function passwordThrottled(env: Env, request: Request, grantId: string): Promise<boolean> {
  const ip = requestMeta(request).ip;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM events WHERE type = 'unlock_failed' AND grant_id = ? AND ip IS ? AND ts > ?",
  ).bind(grantId, ip, now() - 15 * 60_000).first<{ n: number }>();
  return (row?.n ?? 0) >= 10;
}

/** Email grants (for a space, or all) that list this email and are not revoked/expired. */
export async function emailGrantsFor(env: Env, email: string, spaceId?: string): Promise<GrantRow[]> {
  const at = now();
  const q = spaceId
    ? env.DB.prepare(`SELECT * FROM grants WHERE method = 'email' AND space_id = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).bind(spaceId, at)
    : env.DB.prepare(`SELECT * FROM grants WHERE method = 'email' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).bind(at);
  const { results } = await q.all<GrantRow>();
  return results.filter((g) => emailAllowed(email, grantEmails(g)));
}

// ---------------------------------------------------------------- authorization

export type Authorization =
  | { ok: true; mode: "public" | "admin"; session: SessionRow | null; grantId: null }
  | { ok: true; mode: "grant"; session: SessionRow; grantId: string }
  | { ok: false; reason: string };

/**
 * Decide whether this request may read content from a space. Called for every
 * file the gateway serves, so it must stay cheap: two or three indexed queries.
 */
export async function authorizeSpace(
  request: Request, env: Env, space: SpaceRow, isAdmin: () => Promise<boolean>, waitUntil?: (p: Promise<unknown>) => void,
): Promise<Authorization> {
  if (space.visibility === "public") return { ok: true, mode: "public", session: await loadSession(request, env), grantId: null };

  const session = await loadSession(request, env);
  const at = now();
  if (session) {
    const { results } = await env.DB.prepare(
      `SELECT g.*, sg.expires_at AS sg_expires, a.first_unlocked_at AS a_first, a.expires_at AS a_expires
         FROM session_grants sg
         JOIN grants g ON g.id = sg.grant_id
         JOIN activations a ON a.id = sg.activation_id
        WHERE sg.session_id = ? AND g.space_id = ?`,
    ).bind(session.id, space.id).all<GrantRow & { sg_expires: number; a_first: number; a_expires: number | null }>();
    let reason: string | null = null;
    for (const row of results) {
      const r = isActive(row, { first_unlocked_at: row.a_first, expires_at: row.a_expires }, at);
      if (!r && row.sg_expires > at) return { ok: true, mode: "grant", session, grantId: row.id };
      reason = r ?? "session_expired";
    }
    // Verified-email visitors pick up any email share for this space on first visit.
    if (session.email) {
      for (const grant of await emailGrantsFor(env, session.email, space.id)) {
        try {
          await unlockGrant(env, request, grant, { email: session.email, session, waitUntil, quiet: true });
          return { ok: true, mode: "grant", session, grantId: grant.id };
        } catch (e) {
          reason = e instanceof HttpError ? e.code : "denied";
        }
      }
    }
    if (await isAdmin()) return { ok: true, mode: "admin", session, grantId: null };
    return { ok: false, reason: reason ?? "no_access" };
  }
  if (await isAdmin()) return { ok: true, mode: "admin", session: null, grantId: null };
  return { ok: false, reason: "no_access" };
}
