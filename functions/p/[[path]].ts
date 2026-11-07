import type { Env } from "../../server/env";
import { serveSpace } from "../../server/gateway";

// /p/<slug>/<path...> - a deployed space mounted under the main domain.
export const onRequest: PagesFunction<Env> = (ctx) => {
  const parts = Array.isArray(ctx.params.path) ? ctx.params.path : [ctx.params.path].filter(Boolean);
  const [slug = "", ...rest] = parts as string[];
  const url = new URL(ctx.request.url);
  // Keep the trailing slash information (params drop it).
  const inner = rest.join("/") + (rest.length && url.pathname.endsWith("/") ? "/" : "");
  return serveSpace({ request: ctx.request, env: ctx.env, waitUntil: (p) => ctx.waitUntil(p), slug, innerPath: inner, mount: "path" });
};
