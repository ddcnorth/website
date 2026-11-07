import { requireAdmin, type Admin } from "./auth";
import {
  clearSessionCookie, denyMessage, emailGrantsFor, getGrantByToken, getSpace, getSpaceBySlug, grantEmails, issueCode,
  loadSession, logEvent, passwordThrottled, sessionCookie, sessionHasGrant, unlockGrant, verifyCode,
  type ActivationRow, type GrantRow, type SpaceRow,
} from "./access";
import type { Env } from "./env";
import { getPointer } from "./gateway";
import { activationExpiry, canUnlock, grantStatus } from "./policy";
import { newSessionForEmail } from "./client-session";
import {
  emailAllowed, errorResponse, hashPassword, HttpError, json, newId, normalizeEmail, now, randomToken, readJson,
  sha256, siteOrigin, verifyPassword,
} from "./util";

type Handler = (c: { request: Request; env: Env; params: string[]; url: URL; waitUntil: (p: Promise<unknown>) => void }) => Promise<Response>;
type AdminHandler = (c: Parameters<Handler>[0] & { admin: Admin }) => Promise<Response>;

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:\w+/g, "([^/]+)")}$`), h]);
const admin = (method: string, pattern: string, h: AdminHandler) =>
  route(method, pattern, async (c) => h({ ...c, admin: await requireAdmin(c.request, c.env) }));

export async function handleApi(request: Request, env: Env, waitUntil: (p: Promise<unknown>) => void): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request, env);
    for (const [method, re, h] of routes) {
      if (method !== request.method) continue;
      const m = url.pathname.match(re);
      if (m) return await h({ request, env, params: m.slice(1).map(decodeURIComponent), url, waitUntil });
    }
    return json({ error: "not_found" }, { status: 404 });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Cookie-authenticated writes must come from our own pages (CSRF defence on top of SameSite=Lax). */
function assertSameOrigin(request: Request, env: Env) {
  const origin = request.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server) carry no ambient cookie risk
  const host = new URL(origin).hostname;
  const self = new URL(request.url).hostname;
  const root = env.PORTAL_ROOT_DOMAIN?.toLowerCase();
  if (host === self || (root && (host === root || host.endsWith(`.${root}`)))) return;
  throw new HttpError(403, "bad_origin", "Cross-site request refused.");
}

// ============================================================== client: share links

const shareUrl = (env: Env, request: Request, token: string) => `${siteOrigin(env, request)}/access/${token}`;

function spaceUrl(env: Env, request: Request, space: SpaceRow): string {
  if (space.subdomain && env.PORTAL_ROOT_DOMAIN) return `https://${space.slug}.${env.PORTAL_ROOT_DOMAIN}/`;
  return `${siteOrigin(env, request)}/p/${space.slug}/`;
}

async function grantForToken(env: Env, token: string) {
  const grant = await getGrantByToken(env, token);
  const space = grant ? await getSpace(env, grant.space_id) : null;
  if (!grant || !space || space.archived_at) throw new HttpError(404, "not_found", "This link is not valid.");
  return { grant, space };
}

function withCookie(res: Response, cookie: string | null) {
  if (cookie) res.headers.append("set-cookie", cookie);
  return res;
}

route("GET", "/api/access/:token", async ({ request, env, params }) => {
  const { grant, space } = await grantForToken(env, params[0]);
  const session = await loadSession(request, env);
  const unlocked = await sessionHasGrant(env, session, grant);
  // Countdown (if any) for link/password shares; email shares are per recipient.
  const activation = grant.timer_scope === "grant"
    ? await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? AND recipient_key = 'grant'").bind(grant.id).first<ActivationRow>()
    : null;
  const decision = canUnlock(grant, activation, now());
  if (!unlocked) await logEvent(env, request, "link_opened", { space_id: space.id, grant_id: grant.id, session_id: session?.id });
  return json({
    space: { title: space.title, description: space.description },
    label: grant.label,
    method: grant.method,
    unlocked,
    url: spaceUrl(env, request, space),
    available: decision.ok || unlocked,
    reason: decision.ok ? null : decision.reason,
    message: decision.ok ? null : denyMessage(decision.reason),
    starts_at: grant.starts_at,
    expires_at: activation?.expires_at ?? grant.expires_at,
    duration_minutes: activation ? null : grant.duration_minutes,
    first_opened_at: activation?.first_unlocked_at ?? null,
  });
});

route("POST", "/api/access/:token/unlock", async ({ request, env, params, waitUntil }) => {
  const { grant, space } = await grantForToken(env, params[0]);
  const session = await loadSession(request, env);
  if (await sessionHasGrant(env, session, grant)) return json({ url: spaceUrl(env, request, space) });
  if (grant.method === "email") throw new HttpError(400, "email_required", "Verify your email to open this link.");
  if (grant.method === "password") {
    if (await passwordThrottled(env, request, grant.id)) throw new HttpError(429, "too_many_attempts", "Too many attempts. Try again in 15 minutes.");
    const body = await readJson<{ password?: string }>(request);
    if (!(await verifyPassword(String(body.password ?? ""), grant.password_hash))) {
      await logEvent(env, request, "unlock_failed", { space_id: space.id, grant_id: grant.id });
      throw new HttpError(401, "wrong_password", "That password is not correct.");
    }
  }
  const r = await unlockGrant(env, request, grant, { session, waitUntil });
  return withCookie(json({ url: spaceUrl(env, request, space), expires_at: r.sessionExpiresAt }),
    r.newToken ? sessionCookie(request, env, r.newToken, r.session.expires_at) : null);
});

route("POST", "/api/access/:token/code", async ({ request, env, params }) => {
  const { grant, space } = await grantForToken(env, params[0]);
  if (grant.method !== "email") throw new HttpError(400, "not_email", "This link does not use email verification.");
  const email = normalizeEmail((await readJson<{ email?: string }>(request)).email);
  if (!email) throw new HttpError(400, "bad_email", "Enter a valid email address.");
  let devCode: string | null = null;
  if (emailAllowed(email, grantEmails(grant))) devCode = await issueCode(env, request, email, grant.id, space.title);
  else await logEvent(env, request, "code_failed", { space_id: space.id, grant_id: grant.id, email, detail: { reason: "not_on_list" } });
  // Same answer either way so the recipient list cannot be probed.
  return json({ sent: true, message: `If ${email} has access, a 6-digit code is on its way.`, ...(devCode ? { dev_code: devCode } : {}) });
});

route("POST", "/api/access/:token/verify", async ({ request, env, params, waitUntil }) => {
  const { grant, space } = await grantForToken(env, params[0]);
  const body = await readJson<{ email?: string; code?: string }>(request);
  const email = normalizeEmail(body.email);
  if (!email || grant.method !== "email") throw new HttpError(400, "bad_request");
  await verifyCode(env, request, email, String(body.code ?? ""), grant.id);
  if (!emailAllowed(email, grantEmails(grant))) throw new HttpError(403, "no_access", denyMessage("no_access"));
  let session = await loadSession(request, env);
  if (session && session.email !== email) session = null; // never mix identities in one session
  const r = await unlockGrant(env, request, grant, { email, session, waitUntil });
  if (!r.session.email) await env.DB.prepare("UPDATE sessions SET email = ? WHERE id = ?").bind(email, r.session.id).run();
  return withCookie(json({ url: spaceUrl(env, request, space) }), r.newToken ? sessionCookie(request, env, r.newToken, r.session.expires_at) : null);
});

// ============================================================== client: email sign-in (no link)

route("POST", "/api/client/code", async ({ request, env }) => {
  const email = normalizeEmail((await readJson<{ email?: string }>(request)).email);
  if (!email) throw new HttpError(400, "bad_email", "Enter a valid email address.");
  let devCode: string | null = null;
  if ((await emailGrantsFor(env, email)).length) devCode = await issueCode(env, request, email, null, "your shared pages");
  else await logEvent(env, request, "code_failed", { email, detail: { reason: "no_grants" } });
  return json({ sent: true, message: `If ${email} has access to anything, a 6-digit code is on its way.`, ...(devCode ? { dev_code: devCode } : {}) });
});

route("POST", "/api/client/verify", async ({ request, env }) => {
  const body = await readJson<{ email?: string; code?: string }>(request);
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, "bad_email");
  await verifyCode(env, request, email, String(body.code ?? ""), null);
  const grants = await emailGrantsFor(env, email);
  if (!grants.length) throw new HttpError(403, "no_access", "There is nothing shared with this email right now.");
  // A verified identity session. Countdowns start only when a space is actually opened.
  const { token, session } = await newSessionForEmail(env, request, email, grants);
  await logEvent(env, request, "signin_ok", { session_id: session.id, email });
  return withCookie(json({ ok: true }), sessionCookie(request, env, token, session.expires_at));
});

route("GET", "/api/client/me", async ({ request, env }) => {
  const session = await loadSession(request, env);
  if (!session) return json({ signed_in: false, email: null, spaces: [] });
  const spaces = new Map<string, { slug: string; title: string; description: string; url: string; expires_at: number | null }>();
  const { results } = await env.DB.prepare(
    `SELECT s.*, a.expires_at AS a_expires FROM session_grants sg JOIN grants g ON g.id = sg.grant_id
       JOIN spaces s ON s.id = g.space_id JOIN activations a ON a.id = sg.activation_id
      WHERE sg.session_id = ? AND sg.expires_at > ? AND g.revoked_at IS NULL AND s.archived_at IS NULL`,
  ).bind(session.id, now()).all<SpaceRow & { a_expires: number | null }>();
  for (const s of results) spaces.set(s.id, { slug: s.slug, title: s.title, description: s.description, url: spaceUrl(env, request, s), expires_at: s.a_expires });
  if (session.email) {
    for (const g of await emailGrantsFor(env, session.email)) {
      if (spaces.has(g.space_id)) continue;
      const s = await getSpace(env, g.space_id);
      if (s && !s.archived_at && canUnlock(g, await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? AND recipient_key = ?")
        .bind(g.id, g.timer_scope === "recipient" ? session.email : "grant").first<ActivationRow>(), now()).ok) {
        spaces.set(s.id, { slug: s.slug, title: s.title, description: s.description, url: spaceUrl(env, request, s), expires_at: g.expires_at });
      }
    }
  }
  return json({ signed_in: true, email: session.email, spaces: [...spaces.values()] });
});

route("POST", "/api/client/signout", async ({ request, env }) => {
  const session = await loadSession(request, env);
  if (session) await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(now(), session.id).run();
  return withCookie(json({ ok: true }), clearSessionCookie(request, env));
});

/** Engagement beacons from the injected tracker: in-app route changes and active time. */
route("POST", "/api/track", async ({ request, env }) => {
  const body = await readJson<{ slug?: string; type?: string; path?: string; seconds?: number }>(request);
  const session = await loadSession(request, env);
  const space = body.slug ? await getSpaceBySlug(env, String(body.slug)) : null;
  if (!session || !space) return json({ ok: false });
  const sg = await env.DB.prepare(
    `SELECT sg.grant_id, sg.last_seen_at FROM session_grants sg JOIN grants g ON g.id = sg.grant_id
      WHERE sg.session_id = ? AND g.space_id = ? AND sg.expires_at > ? ORDER BY sg.last_seen_at DESC LIMIT 1`,
  ).bind(session.id, space.id, now()).first<{ grant_id: string; last_seen_at: number }>();
  if (!sg) return json({ ok: false });
  const at = now();
  if (body.type === "beat") {
    // At most 15 s credited per beat and never faster than real time.
    const credit = Math.min(15, Math.max(0, Math.round((at - sg.last_seen_at) / 1000)), Number(body.seconds) || 0);
    await env.DB.prepare("UPDATE session_grants SET active_seconds = active_seconds + ?, last_seen_at = ? WHERE session_id = ? AND grant_id = ?")
      .bind(credit, at, session.id, sg.grant_id).run();
  } else if (body.type === "view") {
    await env.DB.prepare("UPDATE session_grants SET view_count = view_count + 1, last_seen_at = ? WHERE session_id = ? AND grant_id = ?")
      .bind(at, session.id, sg.grant_id).run();
    await logEvent(env, request, "view", { space_id: space.id, grant_id: sg.grant_id, session_id: session.id, email: session.email, path: String(body.path ?? "").slice(0, 300) });
  }
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(at, session.id).run();
  return json({ ok: true });
});

// ============================================================== admin

admin("GET", "/api/admin/me", async ({ admin }) => json(admin));

admin("GET", "/api/admin/spaces", async ({ env }) => {
  const { results } = await env.DB.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM grants g WHERE g.space_id = s.id AND g.revoked_at IS NULL) AS share_count,
            (SELECT MAX(e.ts) FROM events e WHERE e.space_id = s.id AND e.type IN ('view','unlock_ok')) AS last_activity
       FROM spaces s WHERE s.archived_at IS NULL ORDER BY s.created_at DESC`,
  ).all<SpaceRow & { share_count: number; last_activity: number | null }>();
  const spaces = await Promise.all(results.map(async (s) => ({ ...s, deployment: await getPointer(env, s.slug) })));
  return json({ spaces });
});

admin("POST", "/api/admin/spaces", async ({ request, env, admin }) => {
  const b = await readJson<Partial<SpaceRow>>(request);
  const slug = String(b.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) || ["www", "api", "admin", "access", "p"].includes(slug)) {
    throw new HttpError(400, "bad_slug", "Use lowercase letters, numbers and dashes (not www/api/admin/access/p).");
  }
  if (await getSpaceBySlug(env, slug)) throw new HttpError(409, "slug_taken", "That slug is already in use.");
  const at = now();
  const id = newId("spc");
  await env.DB.prepare(
    `INSERT INTO spaces (id, slug, title, description, visibility, subdomain, repo, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, slug, String(b.title || slug), String(b.description ?? ""), b.visibility === "public" ? "public" : "private",
    b.subdomain ? 1 : 0, b.repo ? String(b.repo) : null, admin.email, at, at).run();
  await logEvent(env, request, "admin_change", { space_id: id, email: admin.email, detail: { action: "space_created", slug } });
  return json({ space: await getSpace(env, id) }, { status: 201 });
});

admin("GET", "/api/admin/spaces/:id", async ({ request, env, params }) => {
  const space = await getSpace(env, params[0]);
  if (!space) throw new HttpError(404, "not_found");
  const { results: grants } = await env.DB.prepare("SELECT * FROM grants WHERE space_id = ? ORDER BY created_at DESC").bind(space.id).all<GrantRow>();
  return json({
    space, deployment: await getPointer(env, space.slug, true), url: spaceUrl(env, request, space),
    shares: await Promise.all(grants.map((g) => describeGrant(env, g))),
  });
});

admin("PATCH", "/api/admin/spaces/:id", async ({ request, env, params, admin }) => {
  const space = await getSpace(env, params[0]);
  if (!space) throw new HttpError(404, "not_found");
  const b = await readJson<Partial<SpaceRow> & { archived?: boolean }>(request);
  await env.DB.prepare(
    `UPDATE spaces SET title = ?, description = ?, visibility = ?, subdomain = ?, repo = ?, archived_at = ?, updated_at = ? WHERE id = ?`,
  ).bind(b.title ?? space.title, b.description ?? space.description,
    b.visibility ? (b.visibility === "public" ? "public" : "private") : space.visibility,
    b.subdomain === undefined ? space.subdomain : b.subdomain ? 1 : 0, b.repo === undefined ? space.repo : b.repo || null,
    b.archived === undefined ? space.archived_at : b.archived ? now() : null, now(), space.id).run();
  await logEvent(env, request, "admin_change", { space_id: space.id, email: admin.email, detail: { action: "space_updated", fields: Object.keys(b) } });
  return json({ space: await getSpace(env, space.id) });
});

interface GrantInput {
  label?: string; method?: string; password?: string; emails?: string[] | string; timer_scope?: string;
  starts_at?: number | string | null; activate_by?: number | string | null; expires_at?: number | string | null;
  duration_minutes?: number | null; session_minutes?: number | null; max_unlocks?: number | null;
  notify_on_open?: boolean; note?: string;
}

const toTime = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const t = typeof v === "number" ? v : Date.parse(String(v));
  if (!Number.isFinite(t)) throw new HttpError(400, "bad_time", `Invalid date: ${String(v)}`);
  return t;
};
const toPosInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 1) throw new HttpError(400, "bad_number", `Expected a positive number, got ${String(v)}`);
  return n;
};
function parseEmails(v: GrantInput["emails"]): string[] {
  const list = (Array.isArray(v) ? v : String(v ?? "").split(/[\s,;]+/)).map((e) => e.trim().toLowerCase()).filter(Boolean);
  for (const e of list) {
    if (!(e.startsWith("@") ? /^@[^\s@]+\.[^\s@]+$/.test(e) : normalizeEmail(e))) throw new HttpError(400, "bad_email", `Not an email or @domain: ${e}`);
  }
  return [...new Set(list)];
}

admin("POST", "/api/admin/spaces/:id/shares", async ({ request, env, params, admin }) => {
  const space = await getSpace(env, params[0]);
  if (!space) throw new HttpError(404, "not_found");
  const b = await readJson<GrantInput>(request);
  const method = b.method === "password" || b.method === "email" ? b.method : "link";
  const emails = method === "email" ? parseEmails(b.emails) : [];
  if (method === "email" && !emails.length) throw new HttpError(400, "emails_required", "Add at least one email or @domain.");
  let password: string | null = null;
  if (method === "password") {
    password = b.password?.trim() || randomPassword();
    if (password.length < 6) throw new HttpError(400, "weak_password", "Use at least 6 characters.");
  }
  const token = randomToken(18);
  const at = now();
  const id = newId("shr");
  const startsAt = toTime(b.starts_at), activateBy = toTime(b.activate_by), expiresAt = toTime(b.expires_at);
  if (expiresAt && expiresAt <= at) throw new HttpError(400, "bad_time", "The end date is in the past.");
  await env.DB.prepare(
    `INSERT INTO grants (id, space_id, label, method, token_hash, password_hash, emails, timer_scope, starts_at, activate_by,
       expires_at, duration_minutes, session_minutes, max_unlocks, notify_on_open, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, space.id, String(b.label || "Shared link").slice(0, 120), method, await sha256(token),
    password ? await hashPassword(password) : null, JSON.stringify(emails),
    method === "email" && b.timer_scope === "recipient" ? "recipient" : "grant",
    startsAt, activateBy, expiresAt, toPosInt(b.duration_minutes), toPosInt(b.session_minutes) ?? 720,
    toPosInt(b.max_unlocks), b.notify_on_open ? 1 : 0, String(b.note ?? "").slice(0, 2000), admin.email, at, at).run();
  await logEvent(env, request, "admin_change", { space_id: space.id, grant_id: id, email: admin.email, detail: { action: "share_created", method } });
  const grant = (await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(id).first<GrantRow>())!;
  // The link and password are shown once; only hashes are stored.
  return json({ share: await describeGrant(env, grant), link: shareUrl(env, request, token), password }, { status: 201 });
});

admin("PATCH", "/api/admin/shares/:id", async ({ request, env, params, admin }) => {
  const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(params[0]).first<GrantRow>();
  if (!g) throw new HttpError(404, "not_found");
  const b = await readJson<GrantInput & { revoked?: boolean; reset_timer?: boolean; reset_unlocks?: boolean }>(request);
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  const at = now();
  await env.DB.prepare(
    `UPDATE grants SET label = ?, note = ?, emails = ?, starts_at = ?, activate_by = ?, expires_at = ?, duration_minutes = ?,
       session_minutes = ?, max_unlocks = ?, notify_on_open = ?, revoked_at = ?, unlock_count = ?, password_hash = ?, updated_at = ? WHERE id = ?`,
  ).bind(
    has("label") ? String(b.label).slice(0, 120) : g.label,
    has("note") ? String(b.note).slice(0, 2000) : g.note,
    has("emails") && g.method === "email" ? JSON.stringify(parseEmails(b.emails)) : g.emails,
    has("starts_at") ? toTime(b.starts_at) : g.starts_at,
    has("activate_by") ? toTime(b.activate_by) : g.activate_by,
    has("expires_at") ? toTime(b.expires_at) : g.expires_at,
    has("duration_minutes") ? toPosInt(b.duration_minutes) : g.duration_minutes,
    has("session_minutes") ? toPosInt(b.session_minutes) ?? 720 : g.session_minutes,
    has("max_unlocks") ? toPosInt(b.max_unlocks) : g.max_unlocks,
    has("notify_on_open") ? (b.notify_on_open ? 1 : 0) : g.notify_on_open,
    has("revoked") ? (b.revoked ? at : null) : g.revoked_at,
    b.reset_unlocks ? 0 : g.unlock_count,
    has("password") && g.method === "password" && b.password ? await hashPassword(b.password) : g.password_hash,
    at, g.id,
  ).run();
  // Restarting the countdown: forget activations (and end current sessions so the new clock applies).
  if (b.reset_timer) {
    // Close current countdowns but keep them (and their visitor stats) for the record; the
    // next successful open starts a fresh countdown and re-points the browser session.
    await env.DB.batch([
      env.DB.prepare(`UPDATE activations SET recipient_key = recipient_key || '#reset-' || ?, expires_at = MIN(COALESCE(expires_at, ?), ?)
                       WHERE grant_id = ? AND recipient_key NOT LIKE '%#reset-%'`).bind(at, at, at, g.id),
      env.DB.prepare("UPDATE session_grants SET expires_at = MIN(expires_at, ?) WHERE grant_id = ?").bind(at, g.id),
    ]);
  } else if (has("expires_at") || has("duration_minutes")) {
    // Re-derive running countdowns from the new rules so "extend" works for people already inside.
    const updated = (await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(g.id).first<GrantRow>())!;
    const { results } = await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? AND recipient_key NOT LIKE '%#reset-%'").bind(g.id).all<ActivationRow>();
    for (const a of results) {
      const exp = activationExpiry(updated, a.first_unlocked_at);
      await env.DB.batch([
        env.DB.prepare("UPDATE activations SET expires_at = ? WHERE id = ?").bind(exp, a.id),
        env.DB.prepare("UPDATE session_grants SET expires_at = MIN(created_at + ? * 60000, COALESCE(?, 9e15)) WHERE activation_id = ?")
          .bind(updated.session_minutes, exp, a.id),
      ]);
    }
  }
  await logEvent(env, request, "admin_change", { space_id: g.space_id, grant_id: g.id, email: admin.email, detail: { action: "share_updated", fields: Object.keys(b) } });
  return json({ share: await describeGrant(env, (await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(g.id).first<GrantRow>())!) });
});

admin("POST", "/api/admin/shares/:id/rotate", async ({ request, env, params, admin }) => {
  const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(params[0]).first<GrantRow>();
  if (!g) throw new HttpError(404, "not_found");
  const token = randomToken(18);
  await env.DB.prepare("UPDATE grants SET token_hash = ?, updated_at = ? WHERE id = ?").bind(await sha256(token), now(), g.id).run();
  await logEvent(env, request, "admin_change", { space_id: g.space_id, grant_id: g.id, email: admin.email, detail: { action: "link_rotated" } });
  return json({ link: shareUrl(env, request, token) });
});

admin("DELETE", "/api/admin/shares/:id", async ({ request, env, params, admin }) => {
  const g = await env.DB.prepare("SELECT * FROM grants WHERE id = ?").bind(params[0]).first<GrantRow>();
  if (!g) throw new HttpError(404, "not_found");
  await env.DB.prepare("DELETE FROM grants WHERE id = ?").bind(g.id).run();
  await logEvent(env, request, "admin_change", { space_id: g.space_id, grant_id: g.id, email: admin.email, detail: { action: "share_deleted", label: g.label } });
  return json({ ok: true });
});

admin("GET", "/api/admin/activity", async ({ env, url }) => {
  const where: string[] = [];
  const binds: unknown[] = [];
  for (const k of ["space_id", "grant_id", "session_id", "type"] as const) {
    const v = url.searchParams.get(k);
    if (v) { where.push(`${k} = ?`); binds.push(v); }
  }
  if (!url.searchParams.get("include_admin")) where.push("type <> 'admin_change'");
  const before = Number(url.searchParams.get("before"));
  if (before) { where.push("id < ?"); binds.push(before); }
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 100);
  const { results } = await env.DB.prepare(
    `SELECT e.*, s.title AS space_title, g.label AS share_label FROM events e
       LEFT JOIN spaces s ON s.id = e.space_id LEFT JOIN grants g ON g.id = e.grant_id
     ${where.length ? `WHERE ${where.map((w) => `e.${w}`).join(" AND ")}` : ""} ORDER BY e.id DESC LIMIT ${limit}`,
  ).bind(...binds).all();
  return json({ events: results });
});

admin("GET", "/api/admin/visitors", async ({ env, url }) => {
  const binds: unknown[] = [];
  let where = "1 = 1";
  if (url.searchParams.get("space_id")) { where += " AND g.space_id = ?"; binds.push(url.searchParams.get("space_id")); }
  if (url.searchParams.get("grant_id")) { where += " AND sg.grant_id = ?"; binds.push(url.searchParams.get("grant_id")); }
  const { results } = await env.DB.prepare(
    `SELECT sg.session_id, sg.grant_id, g.label AS share_label, g.space_id, s.title AS space_title,
            COALESCE(sg.email, se.email) AS email, sg.created_at AS unlocked_at, sg.last_seen_at, sg.expires_at,
            sg.view_count, sg.active_seconds, se.ip, se.country, se.region, se.city, se.user_agent, se.revoked_at
       FROM session_grants sg JOIN sessions se ON se.id = sg.session_id
       JOIN grants g ON g.id = sg.grant_id JOIN spaces s ON s.id = g.space_id
      WHERE ${where} ORDER BY sg.last_seen_at DESC LIMIT 200`,
  ).bind(...binds).all();
  return json({ visitors: results });
});

admin("POST", "/api/admin/sessions/:id/revoke", async ({ request, env, params, admin }) => {
  await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(now(), params[0]).run();
  await logEvent(env, request, "admin_change", { session_id: params[0], email: admin.email, detail: { action: "session_revoked" } });
  return json({ ok: true });
});

async function describeGrant(env: Env, g: GrantRow) {
  const { results: activations } = await env.DB.prepare("SELECT * FROM activations WHERE grant_id = ? ORDER BY first_unlocked_at")
    .bind(g.id).all<ActivationRow>();
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(view_count), 0) AS views, COALESCE(SUM(active_seconds), 0) AS active_seconds,
            MAX(last_seen_at) AS last_seen_at FROM session_grants WHERE grant_id = ?`,
  ).bind(g.id).first<{ sessions: number; views: number; active_seconds: number; last_seen_at: number | null }>();
  const { token_hash: _t, password_hash: _p, ...rest } = g;
  const current = activations.filter((a) => !a.recipient_key.includes("#reset-"));
  return {
    ...rest,
    emails: grantEmails(g),
    status: grantStatus(g, current, now()),
    first_opened_at: current[0]?.first_unlocked_at ?? null,
    previously_opened_at: activations[0]?.first_unlocked_at ?? null,
    activations: current.map((a) => ({ recipient: a.recipient_key, first_unlocked_at: a.first_unlocked_at, expires_at: a.expires_at })),
    stats,
  };
}

function randomPassword(): string {
  const words = "amber birch cedar delta ember fjord glacier harbor island juniper kestrel lumen maple north orbit pine quartz river spruce tundra";
  const list = words.split(" ");
  const pick = () => list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
  return `${pick()}-${pick()}-${(crypto.getRandomValues(new Uint32Array(1))[0] % 90 + 10).toString()}`;
}
