import type { Env } from "./env";
import { getSettings, type PosthogSettings } from "./settings";
import { sha256 } from "./util";

/**
 * Optional PostHog integration.
 *
 * Configured from /admin → Settings (or POSTHOG_* environment variables), and off unless enabled.
 *
 * - Server side: every portal event (link loaded, opened, code sent, page viewed, ...) is mirrored
 *   to PostHog as `portal_<type>`, except for shares where PostHog is switched off. The D1 event log stays the source of
 *   truth; PostHog is for funnels, dashboards and alerts.
 * - Browser side: a space can opt in to posthog-js (page views and clicks, optionally session
 *   replay). The gateway injects the snippet with the same distinct id the server uses, so both
 *   streams join on one person.
 *
 * Distinct ids: the verified email when known, otherwise the portal session id (link visitors),
 * otherwise a hash of the IP. Only email visitors get person profiles.
 */

const DEFAULT_HOST = "https://us.i.posthog.com";

/** Effective PostHog configuration: admin settings first, then environment variables. */
export interface PosthogConfig { key: string; host: string; appUrl: string; projectId: string | null }

export function resolvePosthog(p: PosthogSettings): PosthogConfig | null {
  const key = p.key.trim();
  if (!p.enabled || !key) return null;
  const host = (p.host.trim() || DEFAULT_HOST).replace(/\/$/, "");
  const appUrl = (p.ui_host.trim() || host.replace("://us.i.", "://us.").replace("://eu.i.", "://eu.")).replace(/\/$/, "");
  return { key, host, appUrl, projectId: p.project_id.trim() || null };
}

export async function posthogConfig(env: Env): Promise<PosthogConfig | null> {
  return resolvePosthog((await getSettings(env)).posthog);
}

/** Deep link to a person in PostHog, when the project id is configured. */
export function posthogPersonUrl(c: PosthogConfig | null, distinctId: string): string | null {
  if (!c?.projectId) return null;
  return `${c.appUrl}/project/${encodeURIComponent(c.projectId)}/person/${encodeURIComponent(distinctId)}`;
}

export function distinctIdFor(f: { email?: string | null; session_id?: string | null }): string | null {
  return f.email || f.session_id || null;
}

// Requests are registered with their waitUntil so events can be sent after the response.
const waiters = new WeakMap<Request, (p: Promise<unknown>) => void>();
export function bindWaitUntil(request: Request, waitUntil: (p: Promise<unknown>) => void) {
  waiters.set(request, waitUntil);
}

export interface CaptureInput {
  event: string;
  /** The share the event belongs to; shares can opt out of PostHog. */
  grant_id?: string | null;
  email?: string | null;
  session_id?: string | null;
  ip?: string | null;
  properties?: Record<string, unknown>;
  timestamp?: number;
}

export function buildCapture(c: PosthogConfig, input: CaptureInput, anonId: string) {
  const distinct = distinctIdFor(input) ?? anonId;
  const props: Record<string, unknown> = { ...input.properties, $lib: "ddcnorth-portal" };
  if (input.ip) props.$ip = input.ip;
  if (input.email) props.$set = { email: input.email };
  else props.$process_person_profile = false;
  return {
    api_key: c.key,
    event: input.event,
    distinct_id: distinct,
    timestamp: new Date(input.timestamp ?? Date.now()).toISOString(),
    properties: props,
  };
}

/** Fire-and-forget capture; never throws into the request path. */
export function capture(env: Env, request: Request | null, input: CaptureInput): void {
  const send = (async () => {
    const c = await posthogConfig(env);
    if (!c) return;
    if (input.grant_id) {
      const g = await env.DB.prepare("SELECT posthog FROM grants WHERE id = ?").bind(input.grant_id).first<{ posthog: number }>();
      if (g && !g.posthog) return;
    }
    await sendCapture(c, buildCapture(c, input, `anon_${(await sha256(input.ip ?? "unknown")).slice(0, 16)}`));
  })().catch((e) => console.error("posthog capture failed", e));
  const wait = request ? waiters.get(request) : undefined;
  if (wait) wait(send);
}

export async function sendCapture(c: PosthogConfig, body: ReturnType<typeof buildCapture>) {
  const res = await fetch(`${c.host}/i/v0/e/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PostHog answered ${res.status}`);
}

/** posthog-js loader for a space page. `replay` turns on session recording. */
export function posthogSnippet(c: PosthogConfig, o: { distinctId: string; identified: boolean; email: string | null; slug: string; shareId: string; replay: boolean }): string {
  const config = {
    api_host: c.host,
    ui_host: c.appUrl,
    person_profiles: "identified_only",
    persistence: "localStorage",
    disable_session_recording: !o.replay,
    session_recording: { maskAllInputs: true },
    bootstrap: { distinctID: o.distinctId, isIdentifiedID: o.identified },
  };
  const props = { portal_space: o.slug, portal_share: o.shareId };
  // JSON in <script> needs "<" escaped so a value cannot close the tag.
  const j = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");
  return `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias set_config reset opt_in_capturing opt_out_capturing get_distinct_id onFeatureFlags getFeatureFlag isFeatureEnabled startSessionRecording stopSessionRecording".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${j(c.key)},${j(config)});posthog.register(${j(props)});${o.email ? `posthog.identify(${j(o.distinctId)},${j({ email: o.email })});` : ""}</script>`;
}
