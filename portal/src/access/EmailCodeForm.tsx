import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api";

/** Two-step "email me a code" form. `base` is /api/access/<token> or /api/client. */
export function EmailCodeForm({ base, onVerified, submitLabel = "Continue" }: {
  base: string;
  onVerified: (data: { url?: string }) => void;
  submitLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ message: string; dev_code?: string }>(`${base}/code`, { method: "POST", json: { email } });
      setMessage(r.dev_code ? `${r.message} (dev code: ${r.dev_code})` : r.message);
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally { setBusy(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      onVerified(await api(`${base}/verify`, { method: "POST", json: { email, code } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify the code.");
    } finally { setBusy(false); }
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode}>
        <label className="field"><span>Your email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
      </form>
    );
  }
  return (
    <form onSubmit={verify}>
      {message && <div className="alert ok" role="status">{message}</div>}
      <label className="field"><span>6-digit code</span>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      </label>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? "Checking…" : submitLabel}</button>
      <div className="row small">
        <button type="button" className="link" onClick={() => sendCode()}>Send a new code</button>
        <button type="button" className="link" onClick={() => { setStep("email"); setCode(""); }}>Use a different email</button>
      </div>
    </form>
  );
}
