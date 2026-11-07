import { useEffect, useState } from "react";
import { fmtDate, fmtDevice, fmtDuration, fmtPlace, fmtSpan, fmtStamp } from "../format";
import { useAdminApi } from "./context";
import { EVENT_LABELS, eventDetail, type EventRow } from "./tables";
import { Modal, Stat } from "./ui";

interface Detail {
  session: {
    id: string; email: string | null; created_at: number; expires_at: number; last_seen_at: number; ip: string | null;
    country: string | null; region: string | null; city: string | null; as_org: string | null; timezone: string | null;
    user_agent: string | null; revoked_at: number | null;
  };
  shares: { grant_id: string; share_label: string; method: string; space_title: string; unlocked_at: number; last_seen_at: number;
    expires_at: number; view_count: number; active_seconds: number }[];
  events: EventRow[];
  posthog_url: string | null;
}

/** Everything known about one browser: where it came from, how long it stayed, what it looked at. */
export function VisitorDialog({ sessionId, onClose, onChanged }: { sessionId: string | null; onClose: () => void; onChanged?: () => void }) {
  const call = useAdminApi();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    if (!sessionId) return;
    setD(null); setError(null);
    call<Detail>(`/api/admin/sessions/${sessionId}`).then(setD).catch((e) => setError(e.message));
  };
  useEffect(load, [sessionId]);

  async function revoke() {
    if (!confirm("Sign this browser out? They can get back in only if their share is still valid.")) return;
    await call(`/api/admin/sessions/${sessionId}/revoke`, { method: "POST", json: {} });
    load(); onChanged?.();
  }

  const s = d?.session;
  const views = d?.shares.reduce((n, x) => n + x.view_count, 0) ?? 0;
  const active = d?.shares.reduce((n, x) => n + x.active_seconds, 0) ?? 0;
  const lastActive = s ? Math.max(s.last_seen_at, ...(d?.shares.map((x) => x.last_seen_at) ?? [])) : null;
  const ips = d ? [...new Set(d.events.map((e) => e.ip).filter(Boolean))] : [];

  return (
    <Modal open={!!sessionId} onClose={onClose} wide label="Visitor details">
      <div className="dialog-body stack">
        <div className="dialog-head">
          <div>
            <div className="label">Visitor</div>
            <h2>{s ? s.email ?? "Link visitor" : "Loading…"}</h2>
            {s && <div className="small muted">{fmtDevice(s.user_agent)} · {fmtPlace(s)}</div>}
          </div>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error && <div className="alert error">{error}</div>}
        {s && d && (<>
          {s.revoked_at && <div className="alert">Signed out {fmtDate(s.revoked_at)}.</div>}
          <div className="stats">
            <Stat label="Active time" value={fmtDuration(active)} hint="Visible and in use" />
            <Stat label="Visit span" value={fmtSpan(s.created_at, lastActive)} hint="First open → last activity" />
            <Stat label="Page views" value={views} />
            <Stat label="Shares opened" value={d.shares.length} />
          </div>

          <dl className="kv">
            <dt>IP address</dt><dd className="mono">{s.ip ?? "—"}{ips.length > 1 && <span className="muted"> · also {ips.filter((i) => i !== s.ip).join(", ")}</span>}</dd>
            <dt>Location</dt><dd>{fmtPlace(s)} <span className="muted small">(approximate, from the network)</span></dd>
            <dt>Network</dt><dd>{s.as_org ?? "—"}</dd>
            {s.timezone && <><dt>Time zone</dt><dd>{s.timezone}</dd></>}
            <dt>First opened</dt><dd>{fmtDate(s.created_at)}</dd>
            <dt>Last active</dt><dd>{fmtDate(lastActive)}</dd>
            <dt>Session ends</dt><dd>{fmtDate(s.expires_at)}</dd>
            <dt>Browser</dt><dd className="small muted">{s.user_agent ?? "—"}</dd>
          </dl>

          {d.shares.length > 0 && (
            <div className="table-wrap">
              <table className="responsive">
                <thead><tr><th>Share</th><th>Opened</th><th>Last active</th><th>Active</th><th>Views</th></tr></thead>
                <tbody>{d.shares.map((x) => (
                  <tr key={x.grant_id}>
                    <td className="lead">{x.share_label}<span className="sub">{x.space_title}</span></td>
                    <td data-label="Opened">{fmtStamp(x.unlocked_at)}</td>
                    <td data-label="Last active">{fmtStamp(x.last_seen_at)}</td>
                    <td data-label="Active">{fmtDuration(x.active_seconds)}</td>
                    <td data-label="Views">{x.view_count}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          <div>
            <h3>Timeline</h3>
            {d.events.length === 0 ? <p className="muted small">No events recorded.</p> : (
              <ol className="timeline">
                {d.events.map((e) => (
                  <li key={e.id} className={e.type === "unlock_ok" || e.type === "signin_ok" ? "key" : ""}>
                    <strong>{EVENT_LABELS[e.type] ?? e.type}</strong>
                    {e.path && <span className="mono"> {e.path}</span>}
                    {eventDetail(e) && <span className="muted"> · {eventDetail(e)}</span>}
                    <div className="small muted">{fmtDate(e.ts)}{e.ip && e.ip !== s.ip ? ` · ${e.ip}` : ""}{e.share_label ? ` · ${e.share_label}` : ""}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>)}
      </div>
      <div className="dialog-foot">
        {d?.posthog_url && <a className="btn" href={d.posthog_url} target="_blank" rel="noreferrer">Open in PostHog ↗</a>}
        {s && !s.revoked_at && <button className="danger" onClick={revoke}>Sign out this browser</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
