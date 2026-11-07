import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, safeNext } from "../api";
import { fmtDate } from "../format";
import { EmailCodeForm } from "./EmailCodeForm";
import { AccessShell } from "./Shell";

interface Me { signed_in: boolean; email: string | null; spaces: { slug: string; title: string; description: string; url: string; expires_at: number | null }[] }

const REASONS: Record<string, string> = {
  expired: "Your access to that page has ended.",
  revoked: "Access to that page has been turned off.",
  not_started: "That page is not available yet.",
  session_expired: "Your session ended. Open your link again or sign in with your email.",
  activation_window_closed: "That invitation was not opened in time.",
  unlock_limit: "That link has already been used the maximum number of times.",
  no_access: "That page is private. Open the link you were sent, or sign in with your email.",
};

/** /access: client sign-in by email, and the list of pages shared with them. */
export default function ClientHome() {
  const [params] = useSearchParams();
  const [me, setMe] = useState<Me | null>(null);
  const reason = params.get("reason");
  const next = safeNext(params.get("next"));

  const load = () => api<Me>("/api/client/me").then(setMe).catch(() => setMe({ signed_in: false, email: null, spaces: [] }));
  useEffect(() => { load(); }, []);

  async function signOut() {
    await api("/api/client/signout", { method: "POST", json: {} });
    load();
  }

  return (
    <AccessShell>
      <div className="access-card">
        {reason && <div className="alert" role="status" style={{ marginBottom: 14 }}>{REASONS[reason] ?? REASONS.no_access}</div>}
        {!me ? <p className="muted">Loading…</p> : me.signed_in && (me.email || me.spaces.length) ? (
          <>
            <div className="label">Signed in{me.email ? ` as ${me.email}` : ""}</div>
            <h1>Shared with you</h1>
            {me.spaces.length === 0 && <p className="muted">Nothing is shared with you right now.</p>}
            <div className="stack" style={{ marginTop: 12 }}>
              {me.spaces.map((s) => (
                <a key={s.slug} className="card card-link" href={s.url}>
                  <strong>{s.title}</strong>
                  {s.description && <div className="small muted">{s.description}</div>}
                  {s.expires_at && <div className="small muted">Available until {fmtDate(s.expires_at)}</div>}
                </a>
              ))}
            </div>
            <p style={{ marginTop: 16 }}><button className="link" onClick={signOut}>Sign out</button></p>
          </>
        ) : (
          <>
            <div className="label">Client access</div>
            <h1>Sign in with your email</h1>
            <p className="muted small">If we have shared something with you, we will email you a one-time code. No password needed.</p>
            <EmailCodeForm base="/api/client" onVerified={() => (next ? location.assign(next) : load())} />
          </>
        )}
      </div>
    </AccessShell>
  );
}
