import { insertSession, type GrantRow } from "./access";
import type { Env } from "./env";
import { newId, now, randomToken, requestMeta, sha256 } from "./util";

/** Create a browser session bound to a verified email (no grant attached yet). */
export async function newSessionForEmail(env: Env, request: Request, email: string, grants: GrantRow[]) {
  const at = now();
  const minutes = Math.max(...grants.map((g) => g.session_minutes || 720));
  const expiresAt = at + minutes * 60_000;
  const token = randomToken(32);
  const session = { id: newId("ses"), expires_at: expiresAt };
  await insertSession(env, { id: session.id, token_hash: await sha256(token), email, created_at: at, expires_at: expiresAt }, requestMeta(request));
  return { token, session };
}
