# Portal setup (Cloudflare + Societyer accounts + Microsoft 365)

The deployed portal uses the same verified email/password accounts as
https://societyer-ddcnorth.pages.dev/login. Better Auth runs on that app's Convex backend;
Cloudflare Pages Functions keep portal spaces, shares and activity in D1 and project files in R2.
Clerk is not required. `DEPLOYMENT.md` records the current resources.

## Cloudflare resources and build

- Pages project: `ddcnorth-website`, linked to `ddcnorth/website`, production branch `main`.
- Build: `npm run build`, Node 22, output `_site`.
- Production bindings: `DB` → `ddcnorth-portal`, `SITES` → `ddcnorth-portal-sites`.
- Preview bindings use `ddcnorth-portal-preview` and `ddcnorth-portal-sites-preview`.
- Both environments fail closed. Both buckets must remain private, with public R2 URLs and
  direct bucket custom domains disabled.
- Apply migrations with `npm run db:migrate:remote`; use the named preview database and
  `--env preview --remote` for preview migrations. Never apply preview tests to production.

Wrangler configuration is the source of truth for runtime bindings and plain variables.
Encrypted credentials remain in Pages secrets, outside Git.

## Administrator sign-in

Production uses `https://industrious-cricket-610.convex.site`:

- `ADMIN_AUTH_SITE_URL` in Wrangler identifies the exact JWT issuer.
- `/api/admin/config` supplies that public issuer to the admin UI at runtime; no build-time
  authentication variable is required.
- `ADMIN_EMAIL_DOMAINS=ddcnorth.com` allows only verified DDCNorth accounts. Use `ADMIN_EMAILS`
  for additional individual administrators when explicitly intended.
- The existing broker's `SITE_URL` includes its original Societyer origin, `https://ddcnorth.com`
  and `https://www.ddcnorth.com`. Preserve all existing origins when adding one.
- Sign in at `/admin` with an existing Societyer account. Authenticator/recovery-code prompts
  are supported for accounts with two-factor authentication. Password recovery uses Societyer's
  existing reset flow and Microsoft 365 delivery.
- The portal verifies JWT signature, exact issuer, `convex` audience, expiry, and
  `emailVerified=true`. A short-lived HttpOnly host-only cookie enables administrator previews.
  The UI refreshes it while signed in and clears it on sign-out.

Preview points at the separate development broker `https://gallant-anteater-27.convex.site`.
It needs its own permitted frontend origins and development accounts for interactive sign-in.
No production accounts, mail credentials or portal database are copied into preview.

## Client email codes and notifications

Production reuses the existing single-mailbox Microsoft 365 sender:

- `EMAIL_PROVIDER=graph`
- `EMAIL_FROM=societyer@ddcnorth.com`
- `EMAIL_FROM_NAME=DDCNorth`
- Encrypted secrets: `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`.

The app credential is restricted to the existing sender mailbox. Do not change the sender to
another mailbox without provisioning the corresponding Exchange scope. Rotation of that shared
credential must update both Societyer and the portal. Do not add a broad Graph mail grant.
`NOTIFY_EMAIL` is optional and controls first-open notification recipients.

Clients use share links, passwords, or email codes. They do not need Societyer administrator
accounts. Password access works independently of mail. Local `EMAIL_PROVIDER=log` is for
localhost only. Real inbox delivery must be verified by the recipient during a client flow.

## Automatic private project publishing

For love.fútbol, `.github/workflows/deploy-portal.yml` lives in `ahzs645/lovefutboler`.
It builds on `main` pushes (or manual dispatch), then `scripts/deploy-portal.mjs`:

1. Obtains a short-lived GitHub OIDC token with audience `https://ddcnorth.com`.
2. Uploads each build file to `PUT /api/deploy/lovefutbol/file?path=...`.
3. Activates the completed build with `POST /api/deploy/lovefutbol/activate`.

The backend pins repository name, immutable repository/owner IDs, registered branch,
workflow path, subject and audience. Uploaded files can only enter that space's commit-SHA
prefix. No long-lived GitHub read token or R2 credential is needed for this workflow.

To add another repo:

1. Add it to `projects.json`, including `repo_id` and `owner_id` from GitHub metadata.
2. Create a private space with the same slug and repository in `/admin`.
3. Add the publishing workflow and script to the project repo; update its slug and keep the
   workflow path `.github/workflows/deploy-portal.yml`.
4. Build with relative asset paths, or a base matching `/p/<slug>/`.
5. Deploy, create a password/email share, and verify the access controls.

The older website-repo `Deploy space` S3 workflow is an optional manual alternative and still
requires its documented R2 and private-repo credentials. love.fútbol does not depend on it.

Do not also publish a public Pages or GitHub Pages copy that bypasses the gateway.

## Optional subdomain

Enable the space's subdomain option, add `<slug>.ddcnorth.com` to the Pages custom domains, and
set `PORTAL_SUBDOMAINS=1` before building. The default path `/p/<slug>/` needs no DNS changes.

## Local verification

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local admin token works only with `PORTAL_DEV=1` on localhost. Never set those variables in
production. Run `npm run typecheck`, `npm test`, `npm run build` and Pages Functions compilation
before merging. Gateway checks should cover anonymous HTML/assets, wrong/correct passwords,
expiry, revocation and authenticated administration.
