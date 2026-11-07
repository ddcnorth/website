/** Bindings and settings for the portal. Configure in wrangler.toml (bindings,
 * plain vars) and as encrypted secrets in Cloudflare (keys, passwords). */
export interface Env {
  DB: D1Database;
  SITES: R2Bucket;
  ASSETS: Fetcher;

  /** Clerk (admin sign-in). Secret key or PEM JWT key verifies session tokens. */
  CLERK_SECRET_KEY?: string;
  CLERK_JWT_KEY?: string;
  /** Comma-separated exact origins allowed to mint admin tokens, e.g. https://ddcnorth.com */
  CLERK_AUTHORIZED_PARTIES?: string;
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

  /** Local development only: "1" enables the dev admin token on localhost and echoes email codes. */
  PORTAL_DEV?: string;
  PORTAL_DEV_ADMIN_TOKEN?: string;
}

export type Ctx = EventContext<Env, string, Record<string, unknown>>;
