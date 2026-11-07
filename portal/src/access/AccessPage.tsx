import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { fmtDate, fmtMinutes } from "../format";
import { EmailCodeForm } from "./EmailCodeForm";
import { AccessShell } from "./Shell";

interface LinkInfo {
  space: { title: string; description: string };
  label: string;
  method: "link" | "password" | "email";
  unlocked: boolean;
  url: string;
  available: boolean;
  message: string | null;
  starts_at: number | null;
  expires_at: number | null;
  duration_minutes: number | null;
  first_opened_at: number | null;
}

/**
 * /access/<token>: the landing page for a share link. Opening the URL alone does
 * not start any countdown (link previews and mail scanners also fetch URLs); the
 * visitor has to press the button, enter the password or verify their email.
 */
export default function AccessPage() {
  const { token = "" } = useParams();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<LinkInfo>(`/api/access/${encodeURIComponent(token)}`)
      .then((i) => {
        if (i.unlocked) location.replace(i.url);
        else setInfo(i);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "This link could not be loaded."));
  }, [token]);

  async function unlock(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ url: string }>(`/api/access/${encodeURIComponent(token)}/unlock`, {
        method: "POST", json: info?.method === "password" ? { password } : {},
      });
      location.assign(r.url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open this link.");
      setBusy(false);
    }
  }

  if (!info) {
    return (
      <AccessShell>
        <div className="access-card">
          {error ? (<><h1>Link unavailable</h1><p className="muted">{error}</p></>) : <p className="muted">Loading…</p>}
        </div>
      </AccessShell>
    );
  }

  return (
    <AccessShell>
      <div className="access-card">
        <div className="label">Shared with you</div>
        <h1>{info.space.title}</h1>
        {info.space.description && <p className="muted">{info.space.description}</p>}

        {(info.duration_minutes || info.expires_at || info.starts_at) && info.available && (
          <div className="meta">
            {info.starts_at && info.starts_at > Date.now() && <span>Available from {fmtDate(info.starts_at)}</span>}
            {info.duration_minutes && !info.first_opened_at && <span>Access lasts {fmtMinutes(info.duration_minutes)} from when you open it.</span>}
            {info.expires_at && <span>Available until {fmtDate(info.expires_at)}</span>}
          </div>
        )}

        {!info.available ? (
          <div className="alert error" role="alert">{info.message}</div>
        ) : info.method === "email" ? (
          <>
            <p className="small muted">Confirm your email address to open this page.</p>
            <EmailCodeForm base={`/api/access/${encodeURIComponent(token)}`} submitLabel="Verify and open"
              onVerified={(d) => d.url && location.assign(d.url)} />
          </>
        ) : info.method === "password" ? (
          <form onSubmit={unlock}>
            <label className="field"><span>Password</span>
              <input type="password" autoComplete="off" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? "Opening…" : "Open"}</button>
          </form>
        ) : (
          <form onSubmit={unlock}>
            {error && <div className="alert error" role="alert">{error}</div>}
            <button className="primary" disabled={busy}>{busy ? "Opening…" : "Open"}</button>
          </form>
        )}
      </div>
    </AccessShell>
  );
}
