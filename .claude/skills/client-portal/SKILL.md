---
name: client-portal
description: Work on the DDCNorth client portal in the website repo - share links with passwords, verified-email access, timers/expiry, visitor tracking, the Clerk-protected /admin, and deploying other GitHub repos (e.g. lovefutboler) into private spaces at /p/<slug>/ or <slug>.ddcnorth.com on Cloudflare Pages + D1 + R2. Use when adding a repo as a space, changing access/timing rules, editing the admin or /access pages, touching functions/ server/ portal/ migrations/ projects.json, or debugging why a client can or cannot open a shared page.
---

# DDCNorth client portal

Read `docs/portal/README.md` (architecture, access model) first. Setup steps are in
`docs/portal/SETUP.md`, and the reasons behind the design are in `docs/portal/RESEARCH.md`.

## Map

- `server/policy.ts`: **all** timing rules (pure; tested in `tests/policy.test.ts`). Change rules
  here, never inline elsewhere.
- `server/access.ts`: sessions, `unlockGrant` (starts countdowns, consumes opens, attaches the
  grant to the browser), email codes, `authorizeSpace` (runs for every gateway file).
- `server/gateway.ts`: serves `sites/<slug>/<version>/…` from R2 behind `authorizeSpace` and
  injects the tracker into HTML.
- `server/api.ts`: routes. Client: `/api/access/:token{,/unlock,/code,/verify}`,
  `/api/client/{code,verify,me,signout}`, `/api/track`. Admin: `/api/admin/*`, guarded by
  `requireAdmin`.
- `server/auth.ts`: Clerk token, then verified email, then `ADMIN_EMAILS`/`ADMIN_EMAIL_DOMAINS`.
- `functions/`: thin Pages Functions entry points only. Shared code lives in `server/`, outside
  `functions/`, so it doesn't become routes.
- `portal/`: React SPA served at `/portal/`. `_redirects` maps `/admin/*` and `/access/*` to it.
  The admin is lazy-loaded with Clerk.
- `migrations/NNNN_*.sql`: D1 schema. Add a new numbered file; never edit an applied one.
- `projects.json`, `scripts/publish-space.sh`, `.github/workflows/deploy-space.yml`: the repo →
  space pipeline.
- `scripts/build.sh`: copies the static site and writes `_routes.json`, `_redirects` and
  `_headers`. `npm run build` also builds the SPA.

## Invariants (do not break)

1. **Content checks happen server-side on every file.** Never ship private content in the public
   site, in `assets/`, or in a public repo. Never add a client-only check as protection.
2. **Opening a URL (GET) never starts a countdown or consumes an open.** Only a POST unlock,
   correct password or verified code does. Link loads are logged as `link_opened`.
3. **The first-open timestamp is written once** (`activations`, unique `(grant_id,
   recipient_key)`). Never derive countdowns from cookies or client time.
4. **Sessions never outlive access** (`sessionExpiry`). Re-entering never extends access; only
   admin Extend or Restart do.
5. **Tokens, passwords and codes are stored as hashes only.** Links and passwords are shown once.
6. **The dev admin token works only with `PORTAL_DEV=1` on localhost.** Never set `PORTAL_DEV` in
   production config.
7. **Keep history.** Revoke and restart mark rows; they don't delete `session_grants` or `events`.
8. **The marketing site** (`index.html`, `fr/index.html`, `assets/`) must not import portal code.
   Keep EN/FR in sync if you touch them (the footer has "Client access" / "Accès client").

## Common tasks

**Add another repo as a space**
1. Add an entry to `projects.json` with `slug`, `repo`, `ref`, `node`, `install`, `build` and
   `output`.
2. Make sure the project builds with a relative base: `base: './'` in its `vite.config`, or
   `process.env.VITE_BASE`. Hash routing works as is; history routing falls back to `index.html`.
3. Create the space with the same slug in `/admin`, or with `POST /api/admin/spaces`.
4. Run **Actions → Deploy space** with the slug. Optionally copy
   `docs/portal/templates/notify-portal.yml` into the project repo so that pushes redeploy.
5. Want a subdomain? Set the space's subdomain flag, add the Pages custom domain, and build with
   `PORTAL_SUBDOMAINS=1`.

**Change or add a timing control**
1. Edit `GrantTiming` and the functions in `server/policy.ts`.
2. Add tests to `tests/policy.test.ts`.
3. Add a migration if a column is needed.
4. Wire it through `POST/PATCH /api/admin/…/shares` in `server/api.ts`, `ShareDialog.tsx` and the
   rules column in `SpacePage.tsx`.

**Add an event type**
1. Extend `EventType` in `server/access.ts`.
2. Log it with `logEvent`.
3. Add a label in `portal/src/admin/tables.tsx` (`EVENT_LABELS`).

## Verify before committing

```bash
npm run typecheck && npm test
```

```bash
npm run build
```

`npm run build` must produce `_site/portal/`, `_site/_routes.json` and `_site/_redirects`.

For behaviour changes, run the local stack:
1. `cp .dev.vars.example .dev.vars`
2. `npm run db:migrate:local`
3. `npx wrangler pages dev _site --port 8788`

Restart wrangler after `rm -rf _site` rebuilds; it does not survive the directory being replaced.

Then exercise it with curl, using `-H "authorization: Bearer <PORTAL_DEV_ADMIN_TOKEN>"` for admin
calls and a cookie jar for the client:
1. Create a space, then a share, then `POST /api/access/<token>/unlock`.
2. `GET /p/<slug>/` must return 200 with the cookie and 302 to `/access/` without it. Assets
   without access must return 401.
3. Then test revoke and expiry.

Put a test site in local R2 with `sh scripts/publish-space.sh <slug> <dir> <version> --local`.
Use Playwright (preinstalled) for UI checks of `/admin` (the dev token gate appears when
`VITE_CLERK_PUBLISHABLE_KEY` is unset) and `/access/<token>`.

## Gotchas

- Pages `_routes.json` limits Functions to `/api/*` and `/p/*`. Subdomain mounts need `/*`
  (`PORTAL_SUBDOMAINS=1`).
- `wrangler.toml` becomes the source of truth for Pages bindings and plain vars. Secrets still go
  in the dashboard or `wrangler pages secret put`.
- Workers' PBKDF2 tops out at 100k iterations. Don't raise it.
- The deny redirect goes to `siteOrigin()`, which is the root domain even from a subdomain. Only
  `/p/…` or `https://*.ddcnorth.com` `next` values are followed (`safeNext`).
- Clerk `__session` cookie previews only work on the same domain as the Clerk instance. Admin
  previews skip tracking and are marked with the `x-portal-preview: admin` header.
