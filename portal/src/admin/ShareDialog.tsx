import { useState, type FormEvent } from "react";
import { ApiError } from "../api";
import { fromLocalInput } from "../format";
import { useAdminApi } from "./context";

const DURATIONS = [
  ["", "No countdown"], ["60", "1 hour"], ["1440", "24 hours"], ["2880", "48 hours"], ["10080", "7 days"], ["43200", "30 days"],
] as const;
const SESSIONS = [["60", "1 hour"], ["720", "12 hours"], ["1440", "24 hours"], ["10080", "7 days"]] as const;

export interface Created { link: string; password: string | null; label: string }

/** Create a share: one link + access method + timing rules. */
export function ShareDialog({ spaceId, dialogRef, onCreated }: {
  spaceId: string;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onCreated: (c: Created) => void;
}) {
  const call = useAdminApi();
  const blank = {
    label: "", method: "link", password: "", emails: "", timer_scope: "recipient",
    duration_minutes: "2880", activate_by: "", expires_at: "", starts_at: "", session_minutes: "720",
    max_unlocks: "", notify_on_open: true, note: "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.type === "checkbox" ? !!e.target.checked : e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await call<{ link: string; password: string | null }>(`/api/admin/spaces/${spaceId}/shares`, {
        method: "POST",
        json: {
          ...f,
          starts_at: fromLocalInput(f.starts_at), activate_by: fromLocalInput(f.activate_by), expires_at: fromLocalInput(f.expires_at),
          duration_minutes: f.duration_minutes || null, max_unlocks: f.max_unlocks || null,
        },
      });
      dialogRef.current?.close();
      onCreated({ ...r, label: f.label });
      setF(blank);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the share.");
    } finally { setBusy(false); }
  }

  return (
    <dialog ref={dialogRef}>
      <form onSubmit={submit}>
        <div className="dialog-body stack">
          <h2>New share</h2>
          <label className="field"><span>Name</span>
            <input required value={f.label} onChange={set("label")} placeholder="Client A — proposal review" />
            <span className="hint">For you; also shown to the recipient. Make one share per client so activity is attributable.</span>
          </label>

          <fieldset>
            <legend>How they get in</legend>
            <div className="choices">
              <label className="choice"><input type="radio" name="method" value="link" checked={f.method === "link"} onChange={set("method")} />
                <span><strong>Link only</strong><br /><span className="hint">Anyone with the link presses “Open”. Simplest; the link can be forwarded.</span></span></label>
              <label className="choice"><input type="radio" name="method" value="password" checked={f.method === "password"} onChange={set("method")} />
                <span><strong>Link + password</strong><br /><span className="hint">Send the password separately (e.g. by text).</span></span></label>
              <label className="choice"><input type="radio" name="method" value="email" checked={f.method === "email"} onChange={set("method")} />
                <span><strong>Verified email</strong><br /><span className="hint">Only listed emails, confirmed with a one-time code. You see exactly who opened it.</span></span></label>
            </div>
          </fieldset>

          {f.method === "password" && (
            <label className="field"><span>Password</span>
              <input value={f.password} onChange={set("password")} placeholder="Leave blank to generate one" />
            </label>
          )}
          {f.method === "email" && (
            <>
              <label className="field"><span>Emails</span>
                <textarea rows={3} required value={f.emails} onChange={set("emails")} placeholder={"jane@client.com, sam@client.com\n@client.com (anyone at that domain)"} />
                <span className="hint">They can also sign in later at /access with the same email.</span>
              </label>
              <label className="field"><span>Countdown applies to</span>
                <select value={f.timer_scope} onChange={set("timer_scope")}>
                  <option value="recipient">Each person separately (starts when they first open it)</option>
                  <option value="grant">Everyone together (starts when the first person opens it)</option>
                </select>
              </label>
            </>
          )}

          <fieldset>
            <legend>Timing</legend>
            <div className="grid2">
              <label className="field"><span>Access lasts (after first open)</span>
                <select value={f.duration_minutes} onChange={set("duration_minutes")}>
                  {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="field"><span>Must be opened by</span>
                <input type="datetime-local" value={f.activate_by} onChange={set("activate_by")} />
                <span className="hint">Invitation deadline (optional).</span>
              </label>
              <label className="field"><span>Hard end for everyone</span>
                <input type="datetime-local" value={f.expires_at} onChange={set("expires_at")} />
              </label>
              <label className="field"><span>Available from</span>
                <input type="datetime-local" value={f.starts_at} onChange={set("starts_at")} />
              </label>
              <label className="field"><span>Re-enter after</span>
                <select value={f.session_minutes} onChange={set("session_minutes")}>
                  {SESSIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <span className="hint">Browser session length (never past the end of access).</span>
              </label>
              <label className="field"><span>Max opens</span>
                <input type="number" min={1} value={f.max_unlocks} onChange={set("max_unlocks")} placeholder="Unlimited" />
                <span className="hint">Successful unlocks (new browsers). 1 = single use.</span>
              </label>
            </div>
          </fieldset>

          <label className="row small"><input type="checkbox" checked={f.notify_on_open} onChange={set("notify_on_open")} /> Email me when it is first opened</label>
          <label className="field"><span>Private note</span><input value={f.note} onChange={set("note")} /></label>
          {error && <div className="alert error">{error}</div>}
        </div>
        <div className="dialog-foot">
          <button type="button" onClick={() => dialogRef.current?.close()}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? "Creating…" : "Create share"}</button>
        </div>
      </form>
    </dialog>
  );
}
