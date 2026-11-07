import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../api";
import { fmtDate, fmtDuration, fmtMinutes, fmtRelative } from "../format";
import { EventLog, MapPanel, PeriodChips, StatsPanel } from "./ActivityPage";
import { useAdmin, useAdminApi } from "./context";
import { Secret } from "./Copy";
import { ShareDialog, type Created, type Share } from "./ShareDialog";
import type { Space } from "./SpacesPage";
import { VisitorsTable, type Visitor } from "./tables";
import { ShareCard } from "./ShareCard";
import { Menu } from "./ui";
import { VisitorDialog } from "./VisitorDialog";

interface Detail { space: Space; deployment: Space["deployment"]; url: string; shares: Share[] }

type Tab = "shares" | "visitors" | "activity" | "settings";
const TABS: [Tab, string][] = [["shares", "Shares"], ["visitors", "Visitors"], ["activity", "Activity"], ["settings", "Settings"]];

export function SpacePage() {
  const { id = "" } = useParams();
  const call = useAdminApi();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("shares");
  const [created, setCreated] = useState<Created | null>(null);
  const [dialog, setDialog] = useState<{ share?: Share } | null>(null);

  const load = useCallback(() => {
    call<Detail>(`/api/admin/spaces/${id}`).then(setD).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!d) return <div className="page muted">Loading…</div>;
  const { space } = d;
  const activeShares = d.shares.filter((s) => s.status !== "revoked" && s.status !== "expired").length;

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="label"><Link to="/admin">Spaces</Link> / {space.slug}</div>
          <h1>{space.title}</h1>
          <div className="row small muted">
            <span className={`badge ${space.visibility}`}>{space.visibility}</span>
            <span className="mono url">{d.url}</span>
            <span>{d.deployment ? `Deployed ${d.deployment.version.slice(0, 7)}${d.deployment.deployed_at ? ` · ${fmtRelative(Date.parse(d.deployment.deployed_at))}` : ""}` : "Not deployed yet"}</span>
          </div>
        </div>
        <div className="row">
          <a className="btn" href={d.url} target="_blank" rel="noreferrer">Preview ↗</a>
          <button className="primary" onClick={() => setDialog({})}>New share</button>
        </div>
      </div>

      {created && (
        <div className="card stack" role="status">
          <div className="row spread">
            <h2>“{created.label}” is ready</h2>
            <button className="btn-sm" onClick={() => setCreated(null)}>Done</button>
          </div>
          <p className="small muted">Copy these now. Only a fingerprint is stored, so they cannot be shown again (you can issue a new link later).</p>
          <Secret value={created.link} />
          {created.password && (<><div className="label">Password (send separately)</div><Secret value={created.password} /></>)}
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {l}{t === "shares" && d.shares.length ? <span className="muted"> {activeShares}</span> : null}
          </button>
        ))}
      </div>

      {tab === "shares" && <SharesTab shares={d.shares} reload={load} onEdit={(share) => setDialog({ share })}
        onCreate={() => setDialog({})} onLink={(link, label) => setCreated({ link, password: null, label })} />}
      {tab === "visitors" && <VisitorsTab spaceId={space.id} />}
      {tab === "activity" && <ActivityTab spaceId={space.id} />}
      {tab === "settings" && <SettingsTab space={space} reload={load} />}

      <ShareDialog spaceId={space.id} share={dialog?.share} open={!!dialog} onClose={() => setDialog(null)}
        onCreated={(c) => { setCreated(c); load(); }} onSaved={load} />
    </div>
  );
}

const EXTEND: [string, number][] = [["1 day", 24], ["3 days", 72], ["1 week", 168], ["30 days", 720]];

function SharesTab({ shares, reload, onLink, onEdit, onCreate }: {
  shares: Share[]; reload: () => void; onLink: (link: string, label: string) => void; onEdit: (s: Share) => void; onCreate: () => void;
}) {
  const call = useAdminApi();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState<"current" | "inactive" | "all">("current");
  if (!shares.length) {
    return <div className="card"><p>No shares yet.</p><p className="muted small">Create one to send this space to a client.</p>
      <button className="primary" onClick={onCreate}>New share</button></div>;
  }

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); reload(); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : "That did not work." }); }
  };
  const patch = (s: Share, body: Record<string, unknown>, ok: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    void run(() => call(`/api/admin/shares/${s.id}`, { method: "PATCH", json: body }), ok);
  };
  const extend = (s: Share, hours: number, label: string) => {
    const add = hours * 3_600_000;
    const body: Record<string, unknown> = {};
    if (s.duration_minutes) body.duration_minutes = s.duration_minutes + hours * 60;
    if (s.expires_at) body.expires_at = Math.max(s.expires_at, Date.now()) + add;
    if (s.activate_by && s.activate_by < Date.now()) body.activate_by = Date.now() + add;
    patch(s, body, `“${s.label}” extended by ${label}.`);
  };
  const hasLimit = (s: Share) => !!(s.duration_minutes || s.expires_at || (s.activate_by && s.activate_by < Date.now()));

  const counts = shares.reduce<Record<string, number>>((m, s) => ({ ...m, [s.status]: (m[s.status] ?? 0) + 1 }), {});
  const visible = filter === "all" ? shares : shares.filter((s) => filter === "inactive" ? s.status === "expired" || s.status === "revoked" : s.status !== "expired" && s.status !== "revoked");
  const inactive = (counts.expired ?? 0) + (counts.revoked ?? 0);

  return (
    <div className="stack">
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div>}
      {inactive > 0 && (
        <div className="chips" role="group" aria-label="Show shares">
          <button aria-pressed={filter === "current"} onClick={() => setFilter("current")}>Current {shares.length - inactive}</button>
          <button aria-pressed={filter === "inactive"} onClick={() => setFilter("inactive")}>Expired or off {inactive}</button>
          <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All {shares.length}</button>
        </div>
      )}
      <div className="share-list">
        {visible.map((s) => (
          <ShareCard key={s.id} share={s} actions={<>
            <button className="btn-sm" onClick={() => onEdit(s)}>Edit</button>
            <Menu label={`More actions for ${s.label}`} buttonClass="btn-sm" trigger={<>More ▾</>}>
              {hasLimit(s) && <>
                <div className="menu-label label">Extend access by</div>
                {EXTEND.map(([l, h]) => <button key={h} onClick={() => extend(s, h, l)}>+ {l}</button>)}
                <hr />
              </>}
              <button onClick={() => {
                if (!confirm("Issue a new link? The old link stops working; people already inside keep access.")) return;
                void run(async () => {
                  const r = await call<{ link: string }>(`/api/admin/shares/${s.id}/rotate`, { method: "POST", json: {} });
                  onLink(r.link, `${s.label} (new link)`);
                });
              }}>New link</button>
              {s.first_opened_at && <button onClick={() => patch(s, { reset_timer: true, reset_unlocks: true }, "Countdown restarted.",
                "Restart the countdown? Current viewers are signed out and the timer starts again at the next open.")}>Restart timer</button>}
              {s.revoked_at
                ? <button onClick={() => patch(s, { revoked: false }, `“${s.label}” restored.`)}>Restore access</button>
                : <button className="danger" onClick={() => patch(s, { revoked: true }, `“${s.label}” turned off.`, `Turn off “${s.label}” now? Anyone using it loses access.`)}>Revoke access</button>}
              <hr />
              <button className="danger" onClick={() => {
                if (!confirm(`Delete “${s.label}” and its history? Revoking keeps the history.`)) return;
                void run(() => call(`/api/admin/shares/${s.id}`, { method: "DELETE" }), `“${s.label}” deleted.`);
              }}>Delete…</button>
            </Menu>
          </>} />
        ))}
      </div>
    </div>
  );
}

function VisitorsTab({ spaceId }: { spaceId: string }) {
  const call = useAdminApi();
  const [rows, setRows] = useState<Visitor[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const load = () => call<{ visitors: Visitor[] }>(`/api/admin/visitors?space_id=${spaceId}`).then((r) => setRows(r.visitors));
  useEffect(() => { load(); }, [spaceId]);
  return (
    <div className="stack">
      <PeriodChips days={days} onChange={setDays} />
      <StatsPanel spaceId={spaceId} days={days} />
      <MapPanel spaceId={spaceId} days={days} />
      {rows ? <VisitorsTable visitors={rows} onSelect={setSelected} /> : <p className="muted">Loading…</p>}
      <VisitorDialog sessionId={selected} onClose={() => setSelected(null)} onChanged={load} />
    </div>
  );
}

function ActivityTab({ spaceId }: { spaceId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <>
      <EventLog spaceId={spaceId} onSelect={setSelected} />
      <VisitorDialog sessionId={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SettingsTab({ space, reload }: { space: Space; reload: () => void }) {
  const call = useAdminApi();
  const { integrations } = useAdmin();
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: space.title, description: space.description, repo: space.repo ?? "", visibility: space.visibility,
    subdomain: !!space.subdomain, posthog: space.posthog ?? 0,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await call(`/api/admin/spaces/${space.id}`, { method: "PATCH", json: f });
      setMsg({ ok: true, text: "Saved." }); reload();
    } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not save." }); }
  }
  return (
    <form className="card stack" onSubmit={save} style={{ maxWidth: 680 }}>
      <label className="field"><span>Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className="field"><span>Description (shown to clients)</span><textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <label className="field"><span>Source repo</span><input value={f.repo} onChange={(e) => setF({ ...f, repo: e.target.value })} placeholder="owner/repo" /></label>
      <label className="field"><span>Visibility</span>
        <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value as Space["visibility"] })}>
          <option value="private">Private — only people with a share</option>
          <option value="public">Public — anyone with the address</option>
        </select>
      </label>
      <label className="check"><input type="checkbox" checked={f.subdomain} onChange={(e) => setF({ ...f, subdomain: e.target.checked })} />
        <span>Also serve at <code>{space.slug}.&lt;domain&gt;</code><span className="hint" style={{ display: "block" }}>Add the custom domain in Cloudflare Pages too.</span></span></label>
      <label className="field"><span>PostHog in this space</span>
        <select value={f.posthog} disabled={!integrations.posthog.enabled && !f.posthog} onChange={(e) => setF({ ...f, posthog: Number(e.target.value) })}>
          <option value={0}>Off — portal events only</option>
          <option value={1}>Page views and clicks</option>
          <option value={2}>Page views, clicks and session replay</option>
        </select>
        <span className="hint">
          {integrations.posthog.enabled
            ? "Adds posthog-js to this space’s pages for people with a share, using the same visitor id as the portal log. Session replay records what visitors see (inputs masked), so only use it with client consent."
            : "Set POSTHOG_KEY in the Cloudflare project to enable PostHog. Portal events (opens, views, failed attempts) are then sent automatically."}
        </span>
      </label>
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div>}
      <div className="row spread">
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
