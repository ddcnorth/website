import type { GrantRow } from "./access";
import type { Env } from "./env";
import { newId, now, randomToken, requestMeta, sha256 } from "./util";

/** Create a browser session bound to a verified email (no grant attached yet). */
export async function newSessionForEmail(env: Env, request: Request, email: string, grants: GrantRow[]) {
  const at = now();
  const minutes = Math.max(...grants.map((g) => g.session_minutes || 720));
  const expiresAt = at + minutes * 60_000;
  const token = randomToken(32);
  const m = requestMeta(request);
  const session = { id: newId("ses"), expires_at: expiresAt };
  await env.DB.prepare(
    `INSERT INTO sessions (id, token_hash, email, created_at, expires_at, last_seen_at, ip, country, region, city, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(session.id, await sha256(token), email, at, expiresAt, at, m.ip, m.country, m.region, m.city, m.user_agent).run();
  return { token, session };
}
