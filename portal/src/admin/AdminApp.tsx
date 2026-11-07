import { ClerkProvider, SignIn, useAuth, useClerk, UserButton } from "@clerk/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError, type TokenGetter } from "../api";
import { Brand } from "../Brand";
import { ActivityPage } from "./ActivityPage";
import { AdminContext } from "./context";
import { SpacePage } from "./SpacePage";
import { SpacesPage } from "./SpacesPage";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export default function AdminApp() {
  const navigate = useNavigate();
  if (!PUBLISHABLE_KEY) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) return <DevGate />;
    return <div className="access-shell"><header><Brand suffix="Admin" /></header><main className="access-card">
      <h1>Admin sign-in is being configured</h1>
      <p>Please contact DDCNorth for administrator access.</p>
    </main></div>;
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/admin"
      routerPush={(to) => navigate(to)} routerReplace={(to) => navigate(to, { replace: true })}>
      <ClerkGate />
    </ClerkProvider>
  );
}

/** Clerk sign-in (Microsoft 365 / your configured methods), then a server-side admin check. */
function ClerkGate() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const token = useCallback<TokenGetter>(() => getToken(), [getToken]);
  if (!isLoaded) return <div className="center muted">Loading…</div>;
  if (!isSignedIn) {
    return (
      <div className="access-shell">
        <header><Brand suffix="Admin" /></header>
        <main className="center"><SignIn routing="hash" /></main>
      </div>
    );
  }
  return <Verified token={token} signOut={() => signOut({ redirectUrl: "/admin" })} account={<UserButton />} />;
}

/** Local development without Clerk: paste PORTAL_DEV_ADMIN_TOKEN from .dev.vars (works on localhost only). */
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
          <p className="muted small">Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> to use Clerk. For local development, enter the
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
    api<{ email: string }>("/api/admin/me", { token })
      .then((me) => setState({ email: me.email }))
      .catch((e) => setState({ error: e instanceof ApiError ? e.message : "Could not reach the server." }));
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
