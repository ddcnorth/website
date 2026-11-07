import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api";
import { fmtDate, fmtDuration, fmtMinutes, fmtRelative } from "../format";
import { useAdminApi } from "./context";
import { Secret } from "./Copy";
import { ShareDialog, type Created } from "./ShareDialog";
import type { Space } from "./SpacesPage";
import { ActivityTable, VisitorsTable, type EventRow, type Visitor } from "./tables";

interface Share {
  id: string; label: string; method: "link" | "password" | "email"; emails: string[]; timer_scope: string;
  status: string; starts_at: number | null; activate_by: number | null; expires_at: number | null;
  duration_minutes: number | null; session_minutes: number; max_unlocks: number | null; unlock_count: number;
  notify_on_open: number; note: string; revoked_at: number | null; created_by: string | null; created_at: number;
  first_opened_at: number | null;
  activations: { recipient: string; first_unlocked_at: number; expires_at: number | null }[];
  stats: { sessions: number; views: number; active_seconds: number; last_seen_at: number | null };
}

interface Detail { space: Space; deployment: Space["deployment"]; url: string; shares: Share[] }

type Tab = "shares" | "visitors" | "activity" | "settings";

export function SpacePage() {
  const { id = "" } = useParams();
  const call = useAdminApi();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("shares");
  const [created, setCreated] = useState<Created | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(() => {
    call<Detail>(`/api/admin/spaces/${id}`).then(setD).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!d) return <div className="page muted">Loading…</div>;
  const { space } = d;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label"><Link to="/admin">Spaces</Link> / {space.slug}</div>
          <h1>{space.title}</h1>
          <div className="row small muted">
            <span className={`badge ${space.visibility}`}>{space.visibility}</span>
            <span className="mono">{d.url}</span>
            <span>{d.deployment ? `Deployed ${d.deployment.version.slice(0, 7)}${d.deployment.deployed_at ? ` · ${fmtRelative(Date.parse(d.deployment.deployed_at))}` : ""}` : "Not deployed yet"}</span>
          </div>
        </div>
        <div className="row">
          <a className="btn" href={d.url} target="_blank" rel="noreferrer">Preview</a>
          <button className="primary" onClick={() => dialog.current?.showModal()}>New share</button>
        </div>
      </div>

      {created && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>“{created.label}” is ready</h2>
            <button className="btn-sm" onClick={() => setCreated(null)}>Done</button>
          </div>
          <p className="small muted">Copy these now — for security only a fingerprint is stored, so they cannot be shown again (you can issue a new link later).</p>
          <Secret value={created.link} />
          {created.password && (<><div className="label">Password (send separately)</div><Secret value={created.password} /></>)}
        </div>
      )}

      <div className="tabs" role="tablist">
        {(["shares", "visitors", "activity", "settings"] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </div>

      {tab === "shares" && <SharesTab shares={d.shares} reload={load} onLink={(link) => setCreated({ link, password: null, label: "New link" })} />}
      {tab === "visitors" && <VisitorsTab spaceId={space.id} />}
      {tab === "activity" && <ActivityTab spaceId={space.id} />}
      {tab === "settings" && <SettingsTab space={space} reload={load} />}

      <ShareDialog spaceId={space.id} dialogRef={dialog} onCreated={(c) => { setCreated(c); load(); }} />
    </div>
  );
}

function SharesTab({ shares, reload, onLink }: { shares: Share[]; reload: () => void; onLink: (link: string) => void }) {
  const call = useAdminApi();
  if (!shares.length) return <p className="muted">No shares yet. Create one to send this space to a client.</p>;

  const patch = async (s: Share, body: Record<string, unknown>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    await call(`/api/admin/shares/${s.id}`, { method: "PATCH", json: body });
    reload();
  };
  const extend = (s: Share) => {
    const hours = Number(prompt("Extend access by how many hours?", "24"));
    if (!hours) return;
    const add = hours * 3_600_000;
    const body: Record<string, unknown> = {};
    if (s.duration_minutes) body.duration_minutes = s.duration_minutes + hours * 60;
    if (s.expires_at) body.expires_at = Math.max(s.expires_at, Date.now()) + add;
    if (s.activate_by && s.activate_by < Date.now()) body.activate_by = Date.now() + add;
    if (!Object.keys(body).length) return alert("This share has no time limit.");
    patch(s, body);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Share</th><th>Status</th><th>Rules</th><th>Opened</th><th>Engagement</th><th /></tr></thead>
        <tbody>
          {shares.map((s) => {
            const running = s.activations.find((a) => a.expires_at && a.expires_at > Date.now());
            return (
              <tr key={s.id}>
                <td>
                  <strong>{s.label}</strong>
                  <div className="small muted">{s.method === "email" ? s.emails.join(", ") : s.method === "password" ? "Link + password" : "Link only"}</div>
                  {s.note && <div className="small muted">{s.note}</div>}
                </td>
                <td><span className={`badge ${s.status}`}>{s.status.replace("_", " ")}</span>
                  {running?.expires_at && <div className="small muted">ends {fmtRelative(running.expires_at)}</div>}</td>
                <td className="small">
                  {s.duration_minutes && <div>{fmtMinutes(s.duration_minutes)} after first open{s.method === "email" && s.timer_scope === "recipient" ? " (per person)" : ""}</div>}
                  {s.activate_by && <div>Open by {fmtDate(s.activate_by)}</div>}
                  {s.expires_at && <div>Ends {fmtDate(s.expires_at)}</div>}
                  {s.starts_at && <div>From {fmtDate(s.starts_at)}</div>}
                  {s.max_unlocks && <div>{s.unlock_count}/{s.max_unlocks} opens used</div>}
                  <div className="muted">Re-enter after {fmtMinutes(s.session_minutes)}</div>
                </td>
                <td className="small">
                  {s.first_opened_at ? <span title={fmtDate(s.first_opened_at)}>{fmtRelative(s.first_opened_at)}</span> : <span className="muted">Not yet</span>}
                  {s.activations.length > 1 && <div className="muted">{s.activations.length} people</div>}
                </td>
                <td className="small">
                  {s.stats.views} views · {fmtDuration(s.stats.active_seconds)}<br />
                  <span className="muted">{s.stats.sessions} browser{s.stats.sessions === 1 ? "" : "s"}{s.stats.last_seen_at ? ` · ${fmtRelative(s.stats.last_seen_at)}` : ""}</span>
                </td>
                <td>
                  <div className="actions">
                    {s.revoked_at
                      ? <button className="btn-sm" onClick={() => patch(s, { revoked: false })}>Restore</button>
                      : <button className="btn-sm danger" onClick={() => patch(s, { revoked: true }, `Turn off “${s.label}” now? Anyone using it loses access.`)}>Revoke</button>}
                    <button className="btn-sm" onClick={() => extend(s)}>Extend</button>
                    <button className="btn-sm" onClick={async () => {
                      if (!confirm("Issue a new link? The old link stops working; people already inside keep access.")) return;
                      const r = await call<{ link: string }>(`/api/admin/shares/${s.id}/rotate`, { method: "POST", json: {} });
                      onLink(r.link);
                    }}>New link</button>
                    {s.first_opened_at && <button className="btn-sm" onClick={() => patch(s, { reset_timer: true, reset_unlocks: true }, "Restart the countdown? Current viewers are signed out and the timer starts again at the next open.")}>Restart timer</button>}
                    <button className="btn-sm danger" onClick={async () => {
                      if (!confirm(`Delete “${s.label}” and its history?`)) return;
                      await call(`/api/admin/shares/${s.id}`, { method: "DELETE" });
                      reload();
                    }}>Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function VisitorsTab({ spaceId }: { spaceId: string }) {
  const call = useAdminApi();
  const [rows, setRows] = useState<Visitor[] | null>(null);
  const load = () => call<{ visitors: Visitor[] }>(`/api/admin/visitors?space_id=${spaceId}`).then((r) => setRows(r.visitors));
  useEffect(() => { load(); }, [spaceId]);
  if (!rows) return <p className="muted">Loading…</p>;
  return <VisitorsTable visitors={rows} onRevoke={async (sid) => {
    if (!confirm("Sign this browser out? They can get back in only if their share is still valid.")) return;
    await call(`/api/admin/sessions/${sid}/revoke`, { method: "POST", json: {} });
    load();
  }} />;
}

function ActivityTab({ spaceId }: { spaceId: string }) {
  const call = useAdminApi();
  const [rows, setRows] = useState<EventRow[] | null>(null);
  useEffect(() => { call<{ events: EventRow[] }>(`/api/admin/activity?space_id=${spaceId}&limit=200`).then((r) => setRows(r.events)); }, [spaceId]);
  return rows ? <ActivityTable events={rows} /> : <p className="muted">Loading…</p>;
}

function SettingsTab({ space, reload }: { space: Space; reload: () => void }) {
  const call = useAdminApi();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: space.title, description: space.description, repo: space.repo ?? "", visibility: space.visibility, subdomain: !!space.subdomain });
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await call(`/api/admin/spaces/${space.id}`, { method: "PATCH", json: f });
      setMsg("Saved."); reload();
    } catch (err) { setMsg(err instanceof ApiError ? err.message : "Could not save."); }
  }
  return (
    <form className="card stack" onSubmit={save} style={{ maxWidth: 640 }}>
      <label className="field"><span>Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className="field"><span>Description (shown to clients)</span><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="field"><span>Source repo</span><input value={f.repo} onChange={(e) => setF({ ...f, repo: e.target.value })} placeholder="owner/repo" /></label>
      <label className="field"><span>Visibility</span>
        <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Space["visibility"] })}>
          <option value="private">Private — only people with a share</option>
          <option value="public">Public — anyone with the address</option>
        </select>
      </label>
      <label className="row small"><input type="checkbox" checked={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.checked })} /> Also serve at {space.slug}.&lt;domain&gt; (add the custom domain in Cloudflare Pages too)</label>
      {msg && <div className="alert ok">{msg}</div>}
      <div className="row">
        <button className="primary">Save</button>
        <button type="button" className="danger" onClick={async () => {
          if (!confirm("Archive this space? It stops being served; shares stop working.")) return;
          await call(`/api/admin/spaces/${space.id}`, { method: "PATCH", json: { archived: true } });
          navigate("/admin");
        }}>Archive space</button>
      </div>
    </form>
  );
}
