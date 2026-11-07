/** Bindings and settings for the portal. Configure in wrangler.toml (bindings,
 * plain vars) and as encrypted secrets in Cloudflare (keys, passwords). */
export interface Env {
  DB: D1Database;
  SITES: R2Bucket;
  ASSETS: Fetcher;

  /** Societyer DDCNorth's Better Auth / Convex HTTP origin (public JWT issuer). */
  ADMIN_AUTH_SITE_URL?: string;
  /** Who is an admin: exact emails and/or whole domains (comma-separated). */
  ADMIN_EMAILS?: string;
  ADMIN_EMAIL_DOMAINS?: string;

  /** e.g. ddcnorth.com - enables <slug>.ddcnorth.com mounts and the shared cookie domain. */
  PORTAL_ROOT_DOMAIN?: string;
  /** Public site origin used in emails and redirects, e.g. https://ddcnorth.com */
  PORTAL_ORIGIN?: string;

  /** Email for verification codes and notifications: graph | resend | log */
  EMAIL_PROVIDER?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  /** Where "first opened" notifications go (comma-separated). */
  NOTIFY_EMAIL?: string;

  /** PostHog project API key (phc_...). When set, portal events are mirrored to PostHog and
   * spaces can opt in to posthog-js. Public by design, but kept out of the repo per environment. */
  POSTHOG_KEY?: string;
  /** Ingestion host, default https://us.i.posthog.com (EU: https://eu.i.posthog.com, or a proxy). */
  POSTHOG_HOST?: string;
  /** PostHog app origin for admin links, default derived from POSTHOG_HOST. */
  POSTHOG_UI_HOST?: string;
  /** Numeric project id, enables "Open in PostHog" person links in the admin. */
  POSTHOG_PROJECT_ID?: string;

  /** Local development only: "1" enables the dev admin token on localhost and echoes email codes. */
  PORTAL_DEV?: string;
  PORTAL_DEV_ADMIN_TOKEN?: string;
}

export type Ctx = EventContext<Env, string, Record<string, unknown>>;
