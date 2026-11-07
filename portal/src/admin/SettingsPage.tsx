import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { describeCountries } from "../countries";
import { fmtDevice } from "../format";
import { useAdmin, useAdminApi } from "./context";
import { CountryPicker } from "./CountryPicker";
import { When, Where } from "./ui";

interface PosthogForm {
  enabled: boolean; key: string; host: string; ui_host: string; project_id: string; track_new_shares: boolean; configured?: boolean;
}
interface SettingsResponse {
  settings: { posthog: PosthogForm; access: { allowed_countries: string[] } };
  env_posthog: boolean;
  signins: { id: number; ts: number; type: string; email: string | null; ip: string | null; city: string | null; region: string | null;
    country: string | null; as_org: string | null; user_agent: string | null }[];
}

type Msg = { ok: boolean; text: string } | null;

export function SettingsPage() {
  const call = useAdminApi();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => call<SettingsResponse>("/api/admin/settings").then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <div className="page stack">
      <div>
        <div className="label">Admin</div>
        <h1>Settings</h1>
        <p className="muted small">Integrations and the defaults new shares start with. Changing a default doesn’t change existing shares.</p>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data ? <p className="muted">Loading…</p> : (
        <>
          <PosthogCard initial={data.settings.posthog} fromEnv={data.env_posthog} onSaved={load} />
          <AccessCard initial={data.settings.access.allowed_countries} onSaved={load} />
          <SigninsCard rows={data.signins} />
        </>
      )}
    </div>
  );
}

function PosthogCard({ initial, fromEnv, onSaved }: { initial: PosthogForm; fromEnv: boolean; onSaved: () => void }) {
  const call = useAdminApi();
  const { refresh } = useAdmin();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PosthogForm>(k: K, v: PosthogForm[K]) => setF((s) => ({ ...s, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const { configured: _c, ...posthog } = f;
      await call("/api/admin/settings", { method: "PUT", json: { posthog } });
      setMsg({ ok: true, text: f.enabled ? "Saved. PostHog is on." : "Saved. PostHog is off; nothing is sent." });
      refresh(); onSaved();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not save." });
    } finally { setBusy(false); }
  }
  async function test() {
    setMsg(null);
    try {
      const r = await call<{ message: string }>("/api/admin/settings/posthog/test", { method: "POST", json: {} });
      setMsg({ ok: true, text: r.message });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : "The test event failed." });
    }
  }

  return (
    <form className="card stack" onSubmit={save}>
      <div className="section-head">
        <div>
          <h2>PostHog</h2>
          <p className="muted small" style={{ margin: 0 }}>Optional product analytics. The portal’s own activity log works without it.</p>
        </div>
        <span className={`badge ${initial.configured ? "active" : ""}`}>{initial.configured ? "On" : "Off"}</span>
      </div>

      <label className="switch">
        <input type="checkbox" role="switch" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
        <span><strong>Send portal activity to PostHog</strong>
          <span className="hint">Opens, page views, time spent, failed attempts. Visitors with a verified email are identified by it; link visitors stay anonymous.</span></span>
      </label>

      <div className={`stack ${f.enabled ? "" : "dimmed"}`}>
        <div className="grid2">
          <label className="field"><span>Project API key</span>
            <input value={f.key} onChange={(e) => set("key", e.target.value)} placeholder="phc_…" autoComplete="off" spellCheck={false} />
            <span className="hint">PostHog → Project settings → Project API key. It is public by design.</span>
          </label>
          <label className="field"><span>Region / host</span>
            <select value={["", "https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(f.host) ? f.host : "custom"}
              onChange={(e) => set("host", e.target.value === "custom" ? "https://" : e.target.value)}>
              <option value="">US cloud (default)</option>
              <option value="https://eu.i.posthog.com">EU cloud</option>
              <option value="custom">Self-hosted or proxy…</option>
            </select>
          </label>
          {!["", "https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(f.host) && (
            <label className="field"><span>Ingestion address</span><input value={f.host} onChange={(e) => set("host", e.target.value)} placeholder="https://ph.example.com" /></label>
          )}
          <label className="field"><span>Project ID (optional)</span>
            <input value={f.project_id} onChange={(e) => set("project_id", e.target.value)} inputMode="numeric" placeholder="12345" />
            <span className="hint">Adds “Open in PostHog” links to visitor details.</span>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={f.track_new_shares} onChange={(e) => set("track_new_shares", e.target.checked)} />
          <span>Track new shares in PostHog by default
            <span className="hint" style={{ display: "block" }}>Each share can still be switched on or off in its settings. Session replay is a per-space option.</span></span>
        </label>
      </div>

      {fromEnv && <p className="hint">POSTHOG_KEY is also set in the Cloudflare environment; values saved here take priority.</p>}
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div>}
      <div className="row">
        <button className="primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" onClick={test} disabled={!initial.configured}>Send test event</button>
      </div>
    </form>
  );
}

function AccessCard({ initial, onSaved }: { initial: string[]; onSaved: () => void }) {
  const call = useAdminApi();
  const { refresh } = useAdmin();
  const [countries, setCountries] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      await call("/api/admin/settings", { method: "PUT", json: { access: { allowed_countries: countries } } });
      setMsg({ ok: true, text: `Saved. New shares can be opened from: ${describeCountries(countries, 6)}.` });
      refresh(); onSaved();
    } catch (err) { setMsg({ ok: false, text: err instanceof ApiError ? err.message : "Could not save." }); }
  }
  return (
    <form className="card stack" onSubmit={save}>
      <div>
        <h2>Default countries for new shares</h2>
        <p className="muted small" style={{ margin: 0 }}>New shares start with this list; you can change it per share. Existing shares keep theirs.</p>
      </div>
      <CountryPicker value={countries} onChange={setCountries} />
      {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`} role="status">{msg.text}</div>}
      <div className="row"><button className="primary">Save</button></div>
    </form>
  );
}

function SigninsCard({ rows }: { rows: SettingsResponse["signins"] }) {
  return (
    <section className="card stack">
      <div>
        <h2>Admin sign-ins</h2>
        <p className="muted small" style={{ margin: 0 }}>The latest 20 sign-ins and sign-outs to this admin.</p>
      </div>
      {!rows.length ? <p className="muted small">None recorded yet.</p> : (
        <div className="table-wrap">
          <table className="responsive">
            <thead><tr><th>Who</th><th>When</th><th>Where</th><th>IP address</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td className="lead"><strong>{r.email ?? "—"}</strong>
                  <span className={`badge ${r.type === "admin_signin" ? "active" : ""}`} style={{ marginLeft: 6 }}>{r.type === "admin_signin" ? "signed in" : "signed out"}</span>
                  <span className="sub">{fmtDevice(r.user_agent)}</span></td>
                <td data-label="When"><When ms={r.ts} /></td>
                <td data-label="Where"><Where r={r} /></td>
                <td data-label="IP address" className="mono">{r.ip ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
