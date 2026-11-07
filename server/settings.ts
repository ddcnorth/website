import type { Env } from "./env";
import { now } from "./util";

/**
 * Settings an administrator can change from /admin, stored in D1 (`settings`). Environment
 * variables are the fallback, so a deployment configured only through Cloudflare keeps working.
 */
export interface PosthogSettings {
  /** Master switch. Off = nothing is sent anywhere and no space loads posthog-js. */
  enabled: boolean;
  /** Project API key (phc_…). Public by design: it is also embedded in posthog-js. */
  key: string;
  host: string;
  ui_host: string;
  project_id: string;
  /** Whether new shares send their visitors' events to PostHog unless switched off per share. */
  track_new_shares: boolean;
}

export interface AccessDefaults {
  /** Countries new shares are limited to ([] = anywhere). */
  allowed_countries: string[];
}

export interface PortalSettings {
  posthog: PosthogSettings;
  access: AccessDefaults;
}

const TTL = 30_000;
let cache: { value: PortalSettings; at: number } | null = null;

function envDefaults(env: Env): PortalSettings {
  return {
    posthog: {
      enabled: !!env.POSTHOG_KEY,
      key: env.POSTHOG_KEY ?? "",
      host: env.POSTHOG_HOST ?? "",
      ui_host: env.POSTHOG_UI_HOST ?? "",
      project_id: env.POSTHOG_PROJECT_ID ?? "",
      track_new_shares: true,
    },
    access: { allowed_countries: [] },
  };
}

export async function getSettings(env: Env, fresh = false): Promise<PortalSettings> {
  if (!fresh && cache && Date.now() - cache.at < TTL) return cache.value;
  const value = envDefaults(env);
  try {
    const { results } = await env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
    for (const row of results) {
      if (row.key === "posthog") value.posthog = { ...value.posthog, ...JSON.parse(row.value) };
      if (row.key === "access") value.access = { ...value.access, ...JSON.parse(row.value) };
    }
  } catch (e) {
    console.error("settings unavailable", e); // table missing before migrations: env only
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSetting<K extends keyof PortalSettings>(env: Env, key: K, value: PortalSettings[K], by: string) {
  await env.DB.prepare(
    `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).bind(key, JSON.stringify(value), by, now()).run();
  cache = null;
}
