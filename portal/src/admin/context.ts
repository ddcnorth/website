import { createContext, useContext } from "react";
import { api, type TokenGetter } from "../api";

export interface AdminCtx {
  email: string;
  token: TokenGetter;
  signOut: () => void;
}

export const AdminContext = createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin outside AdminContext");
  return ctx;
}

/** Admin API helper bound to the signed-in admin's token. */
export function useAdminApi() {
  const { token } = useAdmin();
  return <T = any>(path: string, init: RequestInit & { json?: unknown } = {}) => api<T>(path, { ...init, token });
}
