import { getAdmin } from "./auth";
import { authorizeSpace, getSpaceBySlug, logEvent, type SpaceRow } from "./access";
import type { Env } from "./env";
import { bindWaitUntil, posthogConfig, posthogSnippet } from "./posthog";
import { now, siteOrigin } from "./util";

/**
 * Serves a deployed space (a GitHub repo's build output stored in R2) at
 * /p/<slug>/... or <slug>.<PORTAL_ROOT_DOMAIN>/..., after checking access.
 *
 * R2 layout (written by .github/workflows/deploy-space.yml):
 *   sites/<slug>/current.json        {"version": "<git sha>", "repo": "...", "ref": "...", "deployed_at": "..."}
 *   sites/<slug>/<version>/<files>   the build output (index.html, assets/...)
 */

interface Pointer { version: string; repo?: string; ref?: string; deployed_at?: string }
const pointerCache = new Map<string, { value: Pointer | null; at: number }>();
const POINTER_TTL = 30_000;

export async function getPointer(env: Env, slug: string, fresh = false): Promise<Pointer | null> {
  const hit = pointerCache.get(slug);
  if (!fresh && hit && Date.now() - hit.at < POINTER_TTL) return hit.value;
  const obj = await env.SITES.get(`sites/${slug}/current.json`);
  let value: Pointer | null = null;
  if (obj) {
    try { value = (await obj.json()) as Pointer; } catch { value = null; }
  }
  pointerCache.set(slug, { value, at: Date.now() });
  return value;
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", txt: "text/plain; charset=utf-8", xml: "application/xml", pdf: "application/pdf",
  mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg", wasm: "application/wasm", geojson: "application/geo+json",
  pbf: "application/x-protobuf", csv: "text/csv; charset=utf-8", webmanifest: "application/manifest+json",
};
const ext = (p: string) => p.slice(p.lastIndexOf(".") + 1).toLowerCase();
const hasExt = (p: string) => /\.[a-z0-9]+$/i.test(p.slice(p.lastIndexOf("/") + 1));

function isNavigation(request: Request, innerPath: string): boolean {
  const dest = request.headers.get("sec-fetch-dest");
  if (dest) return dest === "document" || dest === "iframe";
  return !hasExt(innerPath) || /\.html?$/i.test(innerPath) || (request.headers.get("accept") ?? "").includes("text/html");
}

export interface ServeOptions {
  request: Request;
  env: Env;
  waitUntil: (p: Promise<unknown>) => void;
  slug: string;
  /** Path inside the space, without a leading slash ("" for the root). */
  innerPath: string;
  /** "path" for /p/<slug>/, "subdomain" for <slug>.<root>/ */
  mount: "path" | "subdomain";
}

export async function serveSpace(o: ServeOptions): Promise<Response> {
  const { request, env, slug, mount } = o;
  bindWaitUntil(request, o.waitUntil);
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

  const space = /^[a-z0-9][a-z0-9-]{0,62}$/.test(slug) ? await getSpaceBySlug(env, slug) : null;
  if (!space || (mount === "subdomain" && !space.subdomain)) return notFound(env, request);

  // /p/<slug> -> /p/<slug>/ so relative asset URLs resolve inside the space.
  if (mount === "path" && url.pathname === `/p/${slug}`) {
    return Response.redirect(`${url.origin}/p/${slug}/${url.search}`, 301);
  }

  let innerPath: string;
  try {
    innerPath = decodeURIComponent(o.innerPath);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (innerPath.split("/").some((s) => s === ".." || s === ".")) return new Response("Bad request", { status: 400 });

  let adminMemo: Promise<boolean> | null = null;
  const isAdmin = () => (adminMemo ??= getAdmin(request, env).then(Boolean));
  const auth = await authorizeSpace(request, env, space, isAdmin, o.waitUntil);

  if (!auth.ok) {
    if (isNavigation(request, innerPath)) {
      const next = mount === "path" ? url.pathname + url.search + url.hash : url.href;
      const to = new URL(`${siteOrigin(env, request)}/access/`);
      to.searchParams.set("space", slug);
      to.searchParams.set("reason", auth.reason);
      to.searchParams.set("next", next);
      return new Response(null, { status: 302, headers: { location: to.toString(), "cache-control": "no-store" } });
    }
    return new Response("Access required", { status: 401, headers: { "cache-control": "no-store" } });
  }

  const pointer = await getPointer(env, slug);
  if (!pointer) {
    return new Response(`"${space.title}" has not been deployed yet.`, { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const base = `sites/${slug}/${pointer.version}/`;

  // Resolve: exact file -> directory index -> SPA fallback (index.html) for extensionless paths.
  const candidates = innerPath === "" || innerPath.endsWith("/")
    ? [`${innerPath}index.html`]
    : hasExt(innerPath) ? [innerPath] : [innerPath, `${innerPath}/index.html`, "index.html"];

  let key: string | null = null;
  let object: R2ObjectBody | R2Object | null = null;
  for (const c of candidates) {
    const isHtml = /\.html?$/i.test(c);
    object = await env.SITES.get(base + c, isHtml ? {} : { onlyIf: request.headers, range: request.headers });
    if (object) { key = c; break; }
  }
  if (!object || !key) return notFound(env, request);

  // Directory index for a path without trailing slash: redirect so relative URLs work.
  if (key === `${innerPath}/index.html`) {
    return Response.redirect(`${url.origin}${url.pathname}/${url.search}`, 301);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", TYPES[ext(key)] ?? headers.get("content-type") ?? "application/octet-stream");
  headers.set("etag", object.httpEtag);
  headers.set("referrer-policy", "same-origin");
  headers.set("x-content-type-options", "nosniff");
  if (space.visibility === "private") headers.set("x-robots-tag", "noindex, nofollow");
  const html = /\.html?$/i.test(key);
  // Browsers must check access again after expiry or revocation, including for assets.
  headers.set("cache-control", html || space.visibility === "private" ? "private, no-store" : "public, max-age=3600");

  if (!("body" in object)) return new Response(null, { status: 304, headers });
  const status = (object as R2ObjectBody).range && request.headers.has("range") ? 206 : 200;

  if (!html || auth.mode !== "grant") {
    if (html && auth.mode === "admin") headers.set("x-portal-preview", "admin");
    return new Response(request.method === "HEAD" ? null : object.body, { status, headers });
  }

  // Record the page view for this share and inject the engagement tracker.
  o.waitUntil(recordView(env, request, space, auth.session.id, auth.grantId, "/" + innerPath));
  const page = new Response(object.body, { status: 200, headers });
  let inject = trackerScript(slug);
  const ph = space.posthog && auth.analytics ? await posthogConfig(env) : null;
  if (ph) {
    const email = auth.session.email;
    inject += posthogSnippet(ph, {
      distinctId: email ?? auth.session.id, identified: !!email, email, slug, shareId: auth.grantId, replay: space.posthog >= 2,
    });
  }
  return new HTMLRewriter()
    .on("head", { element(el) { el.append(inject, { html: true }); } })
    .transform(page);
}

async function recordView(env: Env, request: Request, space: SpaceRow, sessionId: string, grantId: string, path: string) {
  const at = now();
  await env.DB.batch([
    env.DB.prepare("UPDATE session_grants SET view_count = view_count + 1, last_seen_at = ? WHERE session_id = ? AND grant_id = ?")
      .bind(at, sessionId, grantId),
    env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").bind(at, sessionId),
  ]);
  const session = await env.DB.prepare("SELECT email FROM sessions WHERE id = ?").bind(sessionId).first<{ email: string | null }>();
  await logEvent(env, request, "view", { space_id: space.id, grant_id: grantId, session_id: sessionId, email: session?.email, path });
}

/** Small inline script: reports in-app route changes and active (visible + recently interacted) time. */
function trackerScript(slug: string): string {
  return `<script>(function(){var S=${JSON.stringify(slug)},L=Date.now(),P=location.pathname+location.hash;
function send(d){d.slug=S;try{fetch("/api/track",{method:"POST",credentials:"same-origin",keepalive:true,headers:{"content-type":"application/json"},body:JSON.stringify(d)})}catch(e){}}
function route(){var p=location.pathname+location.hash;if(p!==P){P=p;send({type:"view",path:p})}}
["pointerdown","keydown","scroll","pointermove","touchstart","wheel"].forEach(function(e){addEventListener(e,function(){L=Date.now()},{passive:true,capture:true})});
addEventListener("hashchange",route);addEventListener("popstate",route);
var ps=history.pushState;history.pushState=function(){var r=ps.apply(this,arguments);setTimeout(route,0);return r};
setInterval(function(){if(document.visibilityState==="visible"&&Date.now()-L<60000)send({type:"beat",seconds:15})},15000);
})();</script>`;
}

async function notFound(env: Env, request: Request): Promise<Response> {
  try {
    const page = await env.ASSETS.fetch(new URL("/404.html", request.url));
    return new Response(page.body, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
