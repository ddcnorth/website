import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, ApiError, type TokenGetter } from "../api";
import { Brand } from "../Brand";
import { ActivityPage } from "./ActivityPage";
import { AdminContext } from "./context";
import { SpacePage } from "./SpacePage";
import { SpacesPage } from "./SpacesPage";

const AUTH_SITE_URL = import.meta.env.VITE_ADMIN_AUTH_SITE_URL as string | undefined;
const authClient = createAuthClient({
  baseURL: AUTH_SITE_URL,
  sessionOptions: { refetchInterval: 120, refetchOnWindowFocus: true },
  plugins: [convexClient(), crossDomainClient(), twoFactorClient()],
});

export default function AdminApp() {
  if (!AUTH_SITE_URL) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return <DevGate />;
    return <div className="access-shell"><header><Brand suffix="Admin" /></header><main className="access-card">
      <h1>Admin sign-in is being configured</h1>
      <p>Please contact DDCNorth for administrator access.</p>
    </main></div>;
  }
  return <HostedGate />;
}

/** Existing Societyer accounts, verified by the same hosted Better Auth broker. */
function HostedGate() {
  const { data: session, isPending } = authClient.useSession();
  const token = useCallback<TokenGetter>(async () => {
    const result = await authClient.convex.token();
    return result.data?.token ?? null;
  }, []);
  const signOut = async () => {
    await fetch("/api/admin/session", { method: "DELETE" });
    await authClient.signOut();
  };
  if (isPending) return <div className="center muted">Loading…</div>;
  if (!session) return <HostedSignIn />;
  return <Verified token={token} signOut={() => { void signOut(); }} account={<span className="small muted">{session.user.email}</span>} />;
}

function HostedSignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factor, setFactor] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const result = factor
        ? recovery ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code })
        : await authClient.signIn.email({ email, password });
      if (result.error) setError(result.error.message ?? "Could not sign in. Please try again.");
      else if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) setFactor(true);
    } catch {
      setError("Could not reach sign-in. Please try again.");
    } finally { setBusy(false); }
  }
  return <div className="access-shell"><header><Brand suffix="Admin" /></header><main>
    <form className="access-card" onSubmit={submit}>
      <h1>{factor ? "Verify your sign-in" : "Administrator sign-in"}</h1>
      <p className="muted small">Use your existing Societyer DDCNorth account.</p>
      {factor ? <label className="field"><span>{recovery ? "Recovery code" : "Authenticator code"}</span>
        <input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" required autoFocus />
      </label> : <>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      </>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Signing in…" : factor ? "Verify" : "Sign in"}</button>
      {factor && <button type="button" onClick={() => { setRecovery(!recovery); setCode(""); setError(null); }}>{recovery ? "Use authenticator" : "Use a recovery code"}</button>}
      <p className="small muted"><a href="https://societyer-ddcnorth.pages.dev/reset-password" target="_blank" rel="noreferrer">Forgot your password?</a></p>
    </form>
  </main></div>;
}

/** Local development only: paste PORTAL_DEV_ADMIN_TOKEN from .dev.vars. */
function DevGate() {
  const [value, setValue] = useState(() => sessionStorage.getItem("portal-dev-token") ?? "");
  const [saved, setSaved] = useState(() => sessionStorage.getItem("portal-dev-token"));
  const token = useCallback<TokenGetter>(async () => saved, [saved]);
  if (saved) {
    return <Verified token={token} signOut={() => { sessionStorage.removeItem("portal-dev-token"); setSaved(null); }} account={<span className="badge">dev</span>} />;
  }
  return (
    <div className="access-shell">
      <header><Brand suffix="Admin" /></header>
      <main>
        <form className="access-card" onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem("portal-dev-token", value); setSaved(value); }}>
          <h1>Admin sign-in is not configured</h1>
          <p className="muted small">For local development, enter the
            <code> PORTAL_DEV_ADMIN_TOKEN</code> from <code>.dev.vars</code>.</p>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Dev admin token" />
          <button className="primary">Continue</button>
        </form>
      </main>
    </div>
  );
}

function Verified({ token, signOut, account }: { token: TokenGetter; signOut: () => void; account: ReactNode }) {
  const [state, setState] = useState<{ email: string } | { error: string } | null>(null);
  useEffect(() => {
    let active = true;
    const check = () => api<{ email: string }>("/api/admin/session", { method: "POST", token })
      .then((me) => { if (active) setState({ email: me.email }); })
      .catch((e) => { if (active) setState({ error: e instanceof ApiError ? e.message : "Could not reach the server." }); });
    void check();
    const interval = setInterval(check, 120_000);
    return () => { active = false; clearInterval(interval); };
  }, [token]);

  if (!state) return <div className="center muted">Checking access…</div>;
  if ("error" in state) {
    return (
      <div className="center">
        <div className="access-card">
          <h1>No admin access</h1>
          <p className="muted">{state.error} This account is not on the administrator list.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>
    );
  }
  return (
    <AdminContext.Provider value={{ email: state.email, token, signOut }}>
      <div className="topbar">
        <Brand suffix="Admin" />
        <nav>
          <NavLink to="/admin" end>Spaces</NavLink>
          <NavLink to="/admin/activity">Activity</NavLink>
        </nav>
        <span className="small muted">{state.email}</span>
        {account}
      </div>
      <Routes>
        <Route index element={<SpacesPage />} />
        <Route path="spaces/:id" element={<SpacePage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Routes>
    </AdminContext.Provider>
  );
}
