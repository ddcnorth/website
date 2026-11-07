# Cloudflare deployment

Provisioned on 2026-11-07 in Cloudflare account `479e77f49d4ac5d7498529ee360f194b`.
The Pages project remains connected to `ddcnorth/website`, production branch `main`.

| Environment | Database | Private build bucket |
| --- | --- | --- |
| Production | `ddcnorth-portal` | `ddcnorth-portal-sites` |
| Preview | `ddcnorth-portal-preview` | `ddcnorth-portal-sites-preview` |

Both databases have migration `0001_portal.sql` applied. Resource IDs and bindings are in
`wrangler.toml`; previews have their own resources. Pages builds with `npm run build`, Node 22,
output `_site`. Both environments have `fail_open=false`.

## love.fútbol

The private repo `ahzs645/lovefutboler`, commit `bffaf067bb4b`, is built and uploaded to the
production bucket under `sites/lovefutbol/bffaf067bb4b/`. Its `current.json` points at that version.
The space at `https://ddcnorth.com/p/lovefutbol/` is private, with one password share.
The share link and generated password are held separately from Git, in the operator's private
credentials file. The browser session lasts 12 hours; the initial share has no hard end date.

R2 public access is disabled and there are no bucket custom domains. The project is delivered
through the existing Cloudflare Pages Functions gateway, which checks access for HTML, scripts,
images and data. Private responses use `private, no-store` so cached assets do not skip a later
expiry or revocation check. No separate public love.fútbol Pages origin is created.

## Remaining integrations

- Admin sign-in requires the intended production Clerk application, its publishable build key,
  and its server-side verification key. Microsoft 365 sign-in must be enabled in that application.
  Until configured, the admin API refuses anonymous requests and the production UI shows that
  administrator sign-in is being configured. The local development token is never enabled remotely.
- Email codes and notifications require Microsoft Graph credentials and a sender mailbox, or
  the documented Resend alternative. Password shares work independently of email.
- The **Deploy space** GitHub workflow needs the bucket-scoped R2 credentials and private-repo
  read token listed in `SETUP.md`. They are not present yet. The first project build was published
  using the authenticated local Wrangler CLI; automatic redeployment is not configured.

## Verification

- Portal: typecheck, all 8 timing tests, production build, Pages Functions compilation.
- love.fútbol: `npm ci` and production build (162 published files).
- Local gateway integration: anonymous HTML redirects, anonymous assets are refused, wrong
  passwords are refused, correct passwords issue HttpOnly sessions, unlocked content loads,
  private assets have no-store headers, revocation and expiry block existing sessions, and
  anonymous admin API requests are refused (9 checks).

Follow `SETUP.md` to finish sign-in, mail and automatic project publishing. Never put client
passwords, share tokens, Clerk secrets, or R2 credentials into this public repository.
