export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type TokenGetter = () => Promise<string | null>;

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown; token?: TokenGetter } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.token) {
    const t = await init.token();
    if (t) headers.set("authorization", `Bearer ${t}`);
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "error", data.message ?? `Request failed (${res.status})`);
  return data as T;
}

/** Only follow `next` when it points inside our own spaces. */
export function safeNext(next: string | null): string | null {
  if (!next) return null;
  if (next.startsWith("/p/")) return next;
  try {
    const u = new URL(next);
    const root = location.hostname.replace(/^www\./, "");
    if (u.protocol === "https:" && u.hostname.endsWith(`.${root}`)) return u.href;
  } catch { /* ignore */ }
  return null;
}
