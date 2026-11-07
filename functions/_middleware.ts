import type { Env } from "../server/env";
import { serveSpace } from "../server/gateway";

/**
 * Subdomain mounts: <slug>.<PORTAL_ROOT_DOMAIN> serves the space <slug>.
 * Only runs for paths listed in _routes.json; when subdomain mounts are
 * enabled the build widens that to "/*" (see scripts/build.sh).
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const root = ctx.env.PORTAL_ROOT_DOMAIN?.toLowerCase();
  const url = new URL(ctx.request.url);
  const host = url.hostname.toLowerCase();
  if (root && host.endsWith(`.${root}`) && host !== `www.${root}` && !url.pathname.startsWith("/api/")) {
    const slug = host.slice(0, -(root.length + 1));
    if (!slug.includes(".")) {
      return serveSpace({
        request: ctx.request, env: ctx.env, waitUntil: (p) => ctx.waitUntil(p),
        slug, innerPath: url.pathname.replace(/^\//, ""), mount: "subdomain",
      });
    }
  }
  return ctx.next();
};
