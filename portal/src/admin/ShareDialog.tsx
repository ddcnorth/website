import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { fmtMinutes, fromLocalInput, toLocalInput } from "../format";
import { CountryPicker } from "./CountryPicker";
import { useAdmin, useAdminApi, type AdminDefaults } from "./context";
import { Modal } from "./ui";

const DURATIONS: [string, string][] = [
  ["", "No countdown"], ["60", "1 hour"], ["1440", "24 hours"], ["2880", "48 hours"], ["10080", "7 days"], ["43200", "30 days"],
];
const SESSIONS: [string, string][] = [["60", "1 hour"], ["720", "12 hours"], ["1440", "24 hours"], ["10080", "7 days"]];

export interface Created { link: string; password: string | null; label: string }

export interface Share {
  id: string; label: string; method: "link" | "password" | "email"; emails: string[]; timer_scope: string;
  status: string; starts_at: number | null; activate_by: number | null; expires_at: number | null;
  duration_minutes: number | null; session_minutes: number; max_unlocks: number | null; unlock_count: number;
  notify_on_open: number; note: string; allowed_countries: string[]; posthog: number; revoked_at: number | null; created_by: string | null; created_at: number;
  first_opened_at: number | null;
  activations: { recipient: string; first_unlocked_at: number; expires_at: number | null }[];
  stats: { sessions: number; views: number; active_seconds: number; last_seen_at: number | null };
}

type Mode = "link" | "password" | "people" | "domain";

const MODES: [Mode, string, string][] = [
  ["link", "Link only", "Anyone with the link presses “Open”. Simplest; the link can be forwarded."],
  ["password", "Link + password", "Send the password separately (e.g. by text)."],
  ["people", "Specific people", "Only listed emails, confirmed with a one-time code. You see exactly who opened it."],
  ["domain", "Anyone at a domain", "Anyone who verifies an address at the domains you list, e.g. everyone @unbc.ca."],
];

const splitList = (v: string) => v.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

function initial(defaults: AdminDefaults, share?: Share) {
  const people = share?.emails.filter((e) => !e.startsWith("@")) ?? [];
  const domains = share?.emails.filter((e) => e.startsWith("@")).map((e) => e.slice(1)) ?? [];
  const mode: Mode = !share ? "link" : share.method !== "email" ? share.method : domains.length && !people.length ? "domain" : "people";
  return {
    label: share?.label ?? "", mode, password: "", people: people.join(", "), domains: domains.join(", "),
    timer_scope: share?.timer_scope ?? "recipient",
    duration_minutes: share ? String(share.duration_minutes ?? "") : "2880",
    activate_by: toLocalInput(share?.activate_by), expires_at: toLocalInput(share?.expires_at), starts_at: toLocalInput(share?.starts_at),
    session_minutes: String(share?.session_minutes ?? 720), max_unlocks: share?.max_unlocks ? String(share.max_unlocks) : "",
    notify_on_open: share ? !!share.notify_on_open : true, note: share?.note ?? "",
    allowed_countries: share?.allowed_countries ?? defaults.allowed_countries,
    posthog: share ? !!share.posthog : defaults.posthog,
  };
}

/** Create a share, or edit one (`share` given): access method, recipients and timing rules. */
export function ShareDialog({ spaceId, share, open, onClose, onCreated, onSaved }: {
  spaceId: string; share?: Share; open: boolean; onClose: () => void;
  onCreated?: (c: Created) => void; onSaved?: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label={share ? "Edit share" : "New share"}>
      <ShareForm key={share?.id ?? "new"} spaceId={spaceId} share={share} onClose={onClose} onCreated={onCreated} onSaved={onSaved} />
    </Modal>
  );
}

function ShareForm({ spaceId, share, onClose, onCreated, onSaved }: {
  spaceId: string; share?: Share; onClose: () => void; onCreated?: (c: Created) => void; onSaved?: () => void;
}) {
  const call = useAdminApi();
  const { defaults, integrations } = useAdmin();
  const [start] = useState(() => initial(defaults, share));
  const [f, setF] = useState(start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editing = !!share;
  const isEmail = f.mode === "people" || f.mode === "domain";
  const set = (k: keyof typeof start) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? !!e.target.checked : e.target.value }));

  const durations = [...DURATIONS];
  if (f.duration_minutes && !durations.some(([v]) => v === f.duration_minutes)) durations.push([f.duration_minutes, fmtMinutes(Number(f.duration_minutes))]);
  const sessions = [...SESSIONS];
  if (!sessions.some(([v]) => v === f.session_minutes)) sessions.push([f.session_minutes, fmtMinutes(Number(f.session_minutes))]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const emails = isEmail ? splitList(f.people) : [];
    const domains = isEmail ? splitList(f.domains) : [];
    if (f.mode === "people" && !emails.length && !domains.length) return setError("Add at least one email.");
    if (f.mode === "domain" && !domains.length) return setError("Add at least one domain, e.g. unbc.ca.");
    const body: Record<string, unknown> = {
      label: f.label, note: f.note, notify_on_open: f.notify_on_open, allowed_countries: f.allowed_countries, posthog: f.posthog,
      starts_at: fromLocalInput(f.starts_at), activate_by: fromLocalInput(f.activate_by), expires_at: fromLocalInput(f.expires_at),
      duration_minutes: f.duration_minutes || null, session_minutes: f.session_minutes, max_unlocks: f.max_unlocks || null,
      ...(isEmail ? { emails, domains } : {}),
      ...(f.password ? { password: f.password } : {}),
    };
    setBusy(true); setError(null);
    try {
      if (editing) {
        // Send only what changed so running countdowns are re-derived only when timing changed.
        const before: Record<string, unknown> = {
          label: share.label, note: share.note, notify_on_open: !!share.notify_on_open, starts_at: share.starts_at,
          activate_by: share.activate_by, expires_at: share.expires_at, duration_minutes: share.duration_minutes,
          session_minutes: share.session_minutes, max_unlocks: share.max_unlocks,
          allowed_countries: share.allowed_countries, posthog: !!share.posthog,
        };
        const sameMinute = (x: unknown, y: unknown) => Math.floor(Number(x) / 60_000) === Math.floor(Number(y) / 60_000);
        const changed = Object.fromEntries(Object.entries(body).filter(([k, v]) => {
          if (k === "emails" || k === "domains" || k === "password") return true;
          if (["starts_at", "activate_by", "expires_at"].includes(k) && v && before[k]) return !sameMinute(v, before[k]);
          if (k === "allowed_countries") return JSON.stringify(v) !== JSON.stringify(before[k]);
          return String(v ?? "") !== String(before[k] ?? "");
        }));
        if (isEmail && JSON.stringify([...emails, ...domains.map((d) => `@${d.replace(/^@/, "")}`)].map((x) => x.toLowerCase())) === JSON.stringify(share.emails)) {
          delete changed.emails; delete changed.domains;
        }
        if (Object.keys(changed).length) await call(`/api/admin/shares/${share.id}`, { method: "PATCH", json: changed });
        onSaved?.();
        onClose();
      } else {
        const r = await call<{ link: string; password: string | null }>(`/api/admin/spaces/${spaceId}/shares`, {
          method: "POST",
          json: { ...body, method: isEmail ? "email" : f.mode, timer_scope: f.timer_scope },
        });
        onCreated?.({ ...r, label: f.label });
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the share.");
    } finally { setBusy(false); }
  }

  const peopleField = (
    <label className="field"><span>{f.mode === "domain" ? "Also allow these addresses (optional)" : "Emails"}</span>
      <textarea rows={3} value={f.people} onChange={set("people")} placeholder="jane@client.com, sam@client.com" />
    </label>
  );
  const domainField = (
    <label className="field"><span>{f.mode === "domain" ? "Domains" : "Also allow whole domains (optional)"}</span>
      <input value={f.domains} onChange={set("domains")} placeholder="unbc.ca, client.com" />
      <span className="hint">Anyone who verifies an address ending in @domain gets in. Exact match: “unbc.ca” does not include “mail.unbc.ca”.</span>
    </label>
  );

  return (
    <form onSubmit={submit}>
      <div className="dialog-body stack">
        <div className="dialog-head">
          <h2>{editing ? `Edit “${share.label}”` : "New share"}</h2>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label className="field"><span>Name</span>
          <input required value={f.label} onChange={set("label")} placeholder="Client A — proposal review" />
          <span className="hint">For you; also shown to the recipient. Make one share per client so activity is attributable.</span>
        </label>

        {editing ? (
          <div className="small muted">Access method: <strong>{MODES.find(([m]) => m === start.mode)?.[1]}</strong> (create a new share to change it).</div>
        ) : (
          <fieldset>
            <legend>How they get in</legend>
            <div className="choices">
              {MODES.map(([m, title, hint]) => (
                <label key={m} className="choice"><input type="radio" name="mode" value={m} checked={f.mode === m} onChange={set("mode")} />
                  <span><strong>{title}</strong><br /><span className="hint">{hint}</span></span></label>
              ))}
            </div>
          </fieldset>
        )}

        {f.mode === "password" && (
          <label className="field"><span>{editing ? "New password" : "Password"}</span>
            <input value={f.password} onChange={set("password")} placeholder={editing ? "Leave blank to keep the current one" : "Leave blank to generate one"} />
          </label>
        )}
        {isEmail && (
          <>
            {f.mode === "domain" ? <>{domainField}{peopleField}</> : <>{peopleField}{domainField}</>}
            <p className="hint" style={{ marginBottom: 0 }}>They can also sign in later at /access with the same email.</p>
            {!editing && (
              <label className="field"><span>Countdown applies to</span>
                <select value={f.timer_scope} onChange={set("timer_scope")}>
                  <option value="recipient">Each person separately (starts when they first open it)</option>
                  <option value="grant">Everyone together (starts when the first person opens it)</option>
                </select>
              </label>
            )}
          </>
        )}

        <fieldset>
          <legend>Timing</legend>
          <div className="grid2">
            <label className="field"><span>Access lasts (after first open)</span>
              <select value={f.duration_minutes} onChange={set("duration_minutes")}>
                {durations.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field"><span>Re-enter after</span>
              <select value={f.session_minutes} onChange={set("session_minutes")}>
                {sessions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field"><span>Available from</span>
              <input type="datetime-local" value={f.starts_at} onChange={set("starts_at")} />
            </label>
            <label className="field"><span>Must be opened by</span>
              <input type="datetime-local" value={f.activate_by} onChange={set("activate_by")} />
            </label>
            <label className="field"><span>Hard end for everyone</span>
              <input type="datetime-local" value={f.expires_at} onChange={set("expires_at")} />
            </label>
            <label className="field"><span>Max opens</span>
              <input type="number" min={1} value={f.max_unlocks} onChange={set("max_unlocks")} placeholder="Unlimited" />
            </label>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>“Re-enter after” is the browser session length (never past the end of access). “Max opens” counts successful unlocks from new browsers; 1 = single use.</p>
        </fieldset>

        <fieldset>
          <legend>Where it can be opened from</legend>
          <CountryPicker value={f.allowed_countries} onChange={(v) => setF((s) => ({ ...s, allowed_countries: v }))} />
          <p className="hint" style={{ marginBottom: 0 }}>Checked on every request from the visitor’s network location. Unknown locations are refused when a list is set; a VPN can get around it.</p>
        </fieldset>

        <fieldset>
          <legend>Tracking</legend>
          <div className="stack" style={{ gap: 8 }}>
            <label className="check"><input type="checkbox" checked={f.notify_on_open} onChange={set("notify_on_open")} /> Email me when it is first opened</label>
            <label className="check"><input type="checkbox" checked={f.posthog} onChange={set("posthog")} />
              <span>Send this share’s visits to PostHog
                <span className="hint" style={{ display: "block" }}>{integrations.posthog.enabled
                  ? "Opens, page views and time spent appear in PostHog. The portal’s own log records them either way."
                  : "PostHog is off (Settings). This choice applies once it is turned on."}</span></span>
            </label>
          </div>
        </fieldset>
        <label className="field"><span>Private note</span><input value={f.note} onChange={set("note")} /></label>
        {error && <div className="alert error" role="alert">{error}</div>}
      </div>
      <div className="dialog-foot">
        <button type="button" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create share"}</button>
      </div>
    </form>
  );
}
