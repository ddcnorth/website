import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { fmtRelative } from "../format";
import { useAdminApi } from "./context";
import { Modal } from "./ui";

export interface Space {
  id: string; slug: string; title: string; description: string; visibility: "private" | "public";
  subdomain: number; repo: string | null; posthog?: number; created_at: number;
  share_count?: number; last_activity?: number | null;
  deployment?: { version: string; repo?: string; ref?: string; deployed_at?: string } | null;
}

export function SpacesPage() {
  const call = useAdminApi();
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    call<{ spaces: Space[] }>("/api/admin/spaces").then((r) => setSpaces(r.spaces)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="label">Client portal</div>
          <h1>Spaces</h1>
          <p className="muted small">A space is a page or app (usually built from its own GitHub repo) mounted at <code>/p/&lt;slug&gt;/</code>. Share it with links, passwords or verified emails.</p>
        </div>
        <button className="primary" onClick={() => setCreating(true)}>New space</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!spaces ? <p className="muted">Loading…</p> : spaces.length === 0 ? (
        <div className="card"><p>No spaces yet.</p><p className="muted small">Create one, then deploy a repo to it with the <code>Deploy space</code> GitHub workflow (see docs/portal).</p>
          <button className="primary" onClick={() => setCreating(true)}>New space</button></div>
      ) : (
        <div className="grid2">
          {spaces.map((s) => (
            <Link key={s.id} to={`/admin/spaces/${s.id}`} className="card card-link">
              <div className="row spread">
                <strong>{s.title}</strong>
                <span className={`badge ${s.visibility}`}>{s.visibility}</span>
              </div>
              <div className="mono muted">/p/{s.slug}/{s.subdomain ? ` · ${s.slug}.<domain>` : ""}</div>
              {s.description && <p className="small muted" style={{ marginTop: 8 }}>{s.description}</p>}
              <div className="small muted" style={{ marginTop: 8 }}>
                {s.deployment ? `Deployed ${s.deployment.version.slice(0, 7)}` : "Not deployed yet"} · {s.share_count ?? 0} active share{s.share_count === 1 ? "" : "s"}
                {s.last_activity ? ` · last opened ${fmtRelative(s.last_activity)}` : ""}
              </div>
            </Link>
          ))}
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} label="New space"><NewSpaceForm onClose={() => setCreating(false)} /></Modal>
    </div>
  );
}

function NewSpaceForm({ onClose }: { onClose: () => void }) {
  const call = useAdminApi();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: "", slug: "", description: "", repo: "", visibility: "private", subdomain: false });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await call<{ space: Space }>("/api/admin/spaces", { method: "POST", json: form });
      onClose();
      navigate(`/admin/spaces/${r.space.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the space.");
    }
  }

  return (
      <form onSubmit={submit}>
        <div className="dialog-body stack">
          <div className="dialog-head">
            <h2>New space</h2>
            <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <label className="field"><span>Title</span><input required value={form.title} onChange={set("title")} placeholder="love.fútbol atlas" /></label>
          <label className="field"><span>Slug</span>
            <input required pattern="[a-z0-9][a-z0-9\-]*" value={form.slug} onChange={set("slug")} placeholder="lovefutbol" />
            <span className="hint">Its address: /p/{form.slug || "slug"}/ — must match the slug in projects.json used by the deploy workflow.</span>
          </label>
          <label className="field"><span>Description (shown to clients)</span><textarea rows={2} value={form.description} onChange={set("description")} /></label>
          <label className="field"><span>Source repo (optional)</span><input value={form.repo} onChange={set("repo")} placeholder="ahzs645/lovefutboler" /></label>
          <label className="field"><span>Visibility</span>
            <select value={form.visibility} onChange={set("visibility")}>
              <option value="private">Private — only people with a share</option>
              <option value="public">Public — anyone with the address</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={form.subdomain} onChange={set("subdomain")} /> Also serve at its own subdomain (&lt;slug&gt;.ddcnorth.com)</label>
          {error && <div className="alert error" role="alert">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Create space</button>
        </div>
      </form>
  );
}
