import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { convexClient, crossDomainClient } from "@convex-dev/better-auth/client/plugins";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api, ApiError, type TokenGetter } from "../api";
import { Brand } from "../Brand";
import { initials } from "../format";
import { ActivityPage } from "./ActivityPage";
import { AdminContext, type AdminDefaults, type Integrations } from "./context";
import { SettingsPage } from "./SettingsPage";
import { SpacePage } from "./SpacePage";
import { SpacesPage } from "./SpacesPage";
import { Menu } from "./ui";

const createHostedClient = (siteUrl: string) => createAuthClient({
  baseURL: siteUrl,
  sessionOptions: { refetchInterval: 120, refetchOnWindowFocus: true },
  plugins: [convexClient(), crossDomainClient(), twoFactorClient()],
});
type HostedClient = ReturnType<typeof createHostedClient>;

// Sign-in/out bookkeeping across the reload-free gate transitions (per tab).
const JUST_SIGNED_IN = "portal-admin-signin";
const SIGNED_OUT = "portal-admin-signed-out";

/** Tell the server (so it lands in the activity log), then end the provider session. */
async function endAdminSession(token: TokenGetter, email: string | null, providerSignOut: () => Promise<unknown> | void) {
  await api("/api/admin/session", { method: "DELETE", token }).catch(() => undefined);
  await providerSignOut();
  sessionStorage.setItem(SIGNED_OUT, email ?? "1");
}

export default function AdminApp() {
  const [settings, setSettings] = useState<{ auth_site_url: string | null } | { error: string } | null>(null);
  useEffect(() => {
    let active = true;
    api<{ auth_site_url: string | null }>("/api/admin/config")
      .then(value => { if (active) setSettings(value); })
      .catch(() => { if (active) setSettings({ error: "Could not load sign-in. Please reload the page." }); });
    return () => { active = false; };
  }, []);
  if (!settings) return <div className="center muted">Loading…</div>;
  if ("error" in settings) return <SignInShell><h1>Sign-in unavailable</h1><p className="alert error" role="alert">{settings.error}</p></SignInShell>;
  if (!settings.auth_site_url) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return <DevGate />;
    return <SignInShell><h1>Admin sign-in is being configured</h1><p className="muted">Please contact DDCNorth for administrator access.</p></SignInShell>;
  }
  return <HostedGate siteUrl={settings.auth_site_url} />;
}

function SignInShell({ children, onSubmit }: { children: ReactNode; onSubmit?: (e: FormEvent) => void }) {
  return (
    <div className="access-shell">
      <header><Brand suffix="Admin" /></header>
      <main>
        {onSubmit
          ? <form className="access-card signin" onSubmit={onSubmit}>{children}</form>
          : <div className="access-card signin">{children}</div>}
      </main>
      <footer>Administrator access for DDCNorth staff. Sign-ins and sign-outs are recorded.</footer>
    </div>
  );
}

/** Shown on the sign-in screen right after signing out in this tab. */
function SignedOutNotice() {
  const [who] = useState(() => sessionStorage.getItem(SIGNED_OUT));
  useEffect(() => { sessionStorage.removeItem(SIGNED_OUT); }, []);
  if (!who) return null;
  return <div className="alert ok" role="status">You’re signed out{who !== "1" ? ` (${who})` : ""}.</div>;
}

/** Existing Societyer accounts, verified by the same hosted Better Auth broker. */
function HostedGate({ siteUrl }: { siteUrl: string }) {
  const authClient = useMemo(() => createHostedClient(siteUrl), [siteUrl]);
  const { data: session, isPending } = authClient.useSession();
  const token = useCallback<TokenGetter>(async () => {
    const result = await authClient.convex.token();
    return result.data?.token ?? null;
  }, [authClient]);
  if (isPending) return <div className="center muted">Loading…</div>;
  if (!session) return <HostedSignIn authClient={authClient} />;
  return <Verified token={token} signOut={(email) => endAdminSession(token, email, () => authClient.signOut())} />;
}

function HostedSignIn({ authClient }: { authClient: HostedClient }) {
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
      else sessionStorage.setItem(JUST_SIGNED_IN, "1");
    } catch {
      setError("Could not reach sign-in. Please try again.");
    } finally { setBusy(false); }
  }
  return (
    <SignInShell onSubmit={submit}>
      <SignedOutNotice />
      <div>
        <div className="label">Admin</div>
        <h1>{factor ? "Verify your sign-in" : "Sign in"}</h1>
        <p className="muted small">{factor ? "Enter the code from your authenticator app." : "Use your Societyer DDCNorth account."}</p>
      </div>
      {factor ? <label className="field"><span>{recovery ? "Recovery code" : "Authenticator code"}</span>
        <input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} required autoFocus />
      </label> : <>
        <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus /></label>
        <label className="field"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      </>}
      {error && <p className="alert error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Signing in…" : factor ? "Verify" : "Sign in"}</button>
      <div className="row spread small">
        {factor
          ? <button type="button" className="link" onClick={() => { setRecovery(!recovery); setCode(""); setError(null); }}>{recovery ? "Use authenticator" : "Use a recovery code"}</button>
          : <a href="https://societyer-ddcnorth.pages.dev/reset-password" target="_blank" rel="noreferrer">Forgot your password?</a>}
        <a href="/">ddcnorth.com</a>
      </div>
    </SignInShell>
  );
}

/** Local development only: paste PORTAL_DEV_ADMIN_TOKEN from .dev.vars. */
function DevGate() {
  const [value, setValue] = useState(() => sessionStorage.getItem("portal-dev-token") ?? "");
  const [saved, setSaved] = useState(() => sessionStorage.getItem("portal-dev-token"));
  const token = useCallback<TokenGetter>(async () => saved, [saved]);
  if (saved) {
    return <Verified token={token} dev signOut={(email) => endAdminSession(token, email, () => {
      sessionStorage.removeItem("portal-dev-token"); setSaved(null);
    })} />;
  }
  return (
    <SignInShell onSubmit={(e) => { e.preventDefault(); sessionStorage.setItem("portal-dev-token", value); sessionStorage.setItem(JUST_SIGNED_IN, "1"); setSaved(value); }}>
      <SignedOutNotice />
      <div>
        <div className="label">Local development</div>
        <h1>Admin sign-in is not configured</h1>
        <p className="muted small">Enter the <code>PORTAL_DEV_ADMIN_TOKEN</code> from <code>.dev.vars</code>.</p>
      </div>
      <label className="field"><span>Dev admin token</span><input value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></label>
      <button className="primary">Continue</button>
    </SignInShell>
  );
}

const NO_INTEGRATIONS: Integrations = { posthog: { enabled: false, app_url: null, person_links: false } };
const NO_DEFAULTS: AdminDefaults = { posthog: true, allowed_countries: [] };

type Me = { email: string; integrations?: Integrations; defaults?: AdminDefaults };
type GateState =
  | { kind: "checking" }
  | { kind: "ok"; email: string; integrations: Integrations; defaults: AdminDefaults }
  | { kind: "denied"; message: string }
  | { kind: "expired"; email: string };

function Verified({ token, signOut, dev }: { token: TokenGetter; signOut: (email: string | null) => Promise<void>; dev?: boolean }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });
  const [signingOut, setSigningOut] = useState(false);
  const emailRef = useRef<string | null>(null);

  const check = useCallback(async (first: boolean) => {
    const signin = first && sessionStorage.getItem(JUST_SIGNED_IN) === "1";
    try {
      const me = await api<Me>("/api/admin/session", { method: "POST", token, json: signin ? { signin: true } : {} });
      if (signin) sessionStorage.removeItem(JUST_SIGNED_IN);
      emailRef.current = me.email;
      setState({ kind: "ok", email: me.email, integrations: me.integrations ?? NO_INTEGRATIONS, defaults: me.defaults ?? NO_DEFAULTS });
    } catch (e) {
      const unauthorized = e instanceof ApiError && e.status === 401;
      if (!first && unauthorized && emailRef.current) setState({ kind: "expired", email: emailRef.current });
      else if (first) setState({ kind: "denied", message: e instanceof ApiError ? e.message : "Could not reach the server." });
      // A failed background re-check (offline, deploy in progress) keeps the admin where they are.
    }
  }, [token]);

  useEffect(() => {
    void check(true);
    const interval = setInterval(() => void check(false), 120_000);
    return () => clearInterval(interval);
  }, [check]);

  const doSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOut(emailRef.current);
  };

  if (state.kind === "checking") return <div className="center muted">Checking access…</div>;
  if (state.kind === "denied" || state.kind === "expired") {
    return (
      <SignInShell>
        <div>
          <div className="label">Admin</div>
          <h1>{state.kind === "expired" ? "Your session ended" : "No admin access"}</h1>
        </div>
        <p className="muted">{state.kind === "expired"
          ? `You were signed out as ${state.email}. Sign in again to continue; nothing you saved was lost.`
          : `${state.message} This account is not on the administrator list.`}</p>
        <button className="primary" onClick={doSignOut} disabled={signingOut}>{state.kind === "expired" ? "Sign in again" : "Use another account"}</button>
      </SignInShell>
    );
  }
  return (
    <AdminContext.Provider value={{ email: state.email, token, signOut: () => void doSignOut(), integrations: state.integrations, defaults: state.defaults, refresh: () => void check(false) }}>
      <header className="topbar">
        <Brand suffix="Admin" />
        <nav aria-label="Admin">
          <NavLink to="/admin" end>Spaces</NavLink>
          <NavLink to="/admin/activity">Activity</NavLink>
          <NavLink to="/admin/settings">Settings</NavLink>
        </nav>
        <Menu className="account" label={`Account: ${state.email}`} trigger={<>
          <span className="small muted account-email">{state.email}</span>
          {dev ? <span className="badge">dev</span> : <span className="avatar" aria-hidden="true">{initials(state.email)}</span>}
        </>}>
          <div className="menu-label small muted">Signed in as<br /><strong style={{ color: "var(--ink)" }}>{state.email}</strong></div>
          <hr />
          <NavLink to="/admin/settings">Settings</NavLink>
          {state.integrations.posthog.app_url && <a href={state.integrations.posthog.app_url} target="_blank" rel="noreferrer">Open PostHog ↗</a>}
          <a href="/access" target="_blank" rel="noreferrer">Client sign-in page ↗</a>
          <hr />
          <button onClick={doSignOut} disabled={signingOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
        </Menu>
      </header>
      <Routes>
        <Route index element={<SpacesPage />} />
        <Route path="spaces/:id" element={<SpacePage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </AdminContext.Provider>
  );
}
