# Cloudflare deployment

Configured on 2026-11-07 in Cloudflare account `479e77f49d4ac5d7498529ee360f194b`.
The Pages project is connected to `ddcnorth/website`, production branch `main`.

| Environment | Database | Private build bucket |
| --- | --- | --- |
| Production | `ddcnorth-portal` | `ddcnorth-portal-sites` |
| Preview | `ddcnorth-portal-preview` | `ddcnorth-portal-sites-preview` |

Both databases have migration `0001_portal.sql` applied. Resource IDs and bindings are in
`wrangler.toml`; previews have their own resources. Pages builds with `npm run build`, Node 22,
output `_site`. Both environments have `fail_open=false`.

## Accounts and email

Production administration reuses Societyer DDCNorth's Better Auth broker at
`https://industrious-cricket-610.convex.site`, with its existing verified DDCNorth accounts.
The broker retains its original Societyer trusted origin and now also allows `ddcnorth.com`
and `www.ddcnorth.com`. The portal checks signed JWT issuer, audience, expiry and verified email
before granting administration. `/admin` supports password and authenticator/recovery-code flows.
An actual account sign-in must be verified by the account owner; no user password was reset or
account created as part of provisioning.

Microsoft 365 delivery reuses `societyer@ddcnorth.com` and its existing single-mailbox-scoped
application. The three mail credentials are encrypted Pages secrets. The Microsoft token
exchange was accepted; inbox delivery must be checked in a recipient's real code/notification
flow. Credential rotation must update both the existing Societyer backend and the portal.

Preview uses the separate development auth broker and has no production mail credentials.
Its permitted frontend origins and development users can be configured when interactive
preview sign-in is needed.

## love.fútbol

`ahzs645/lovefutboler` is registered as the private space
`https://ddcnorth.com/p/lovefutbol/`. Its password share link and generated password are held
outside Git in the operator's private credentials file. Browser sessions last 12 hours; the
initial share has no hard end date. Administrators can add expiry/countdown limits or revoke it.

The project repository publishes main-branch builds through `deploy-portal.yml`. GitHub OIDC
pins repository and owner IDs, branch, subject, workflow and audience. Files are uploaded to a
commit-SHA prefix in private R2 storage, then `current.json` switches the live build. No stored
GitHub read token or R2 credential is needed by that workflow. The old public GitHub Pages
publisher is replaced; the public mirror is retired during activation.

R2 public access is disabled and there are no bucket custom domains. Every project file is
served through the existing Cloudflare Pages Functions gateway, with access checks for HTML,
scripts, images and data. Private responses use `private, no-store` so a cached asset cannot
skip a later expiry or revocation check. There is no separate public love.fútbol Pages origin.

MapLibre is updated to patched 6.4.1 for GHSA-jrc7-96c5-q579, with the v6 ESM import, Vite worker
bundle and typed paint properties. The production project build and dependency audit pass.

## Verification

- Portal typecheck, 28 timing/authentication/deployment identity tests, production frontend
  build, Pages Functions compilation.
- Admin identity checks reject wrong issuer/audience, expired or unsigned claims, unverified
  emails, foreign email domains, forged signatures and remote use of the local developer token.
- GitHub deployment checks reject wrong repository/owner IDs, branches, subjects, workflows,
  audiences, pull-request events and unregistered spaces.
- love.fútbol TypeScript/Vite production build and dependency audit (zero reported issues).
- Nine local gateway checks: anonymous HTML redirects, anonymous assets refused, wrong
  passwords refused, correct password issues an HttpOnly session, unlocked content loads,
  private asset no-store headers, revocation and expiry stop existing sessions, and anonymous
  administrator API requests refused.

See `SETUP.md` for operational instructions. Keep passwords, share tokens and server credentials
out of this public repository.
