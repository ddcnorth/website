# Client portal

Share parts of ddcnorth.com, including whole apps built in other GitHub repos, with clients.
Each share can be a link, a link with a password, or a list of verified emails, with its own
timing rules. You can see who opened what, when, from roughly where, and for how long.

- **Admin:** `https://ddcnorth.com/admin`. Clerk sign-in (Microsoft 365 tenant). Only
  `ADMIN_EMAILS` / `ADMIN_EMAIL_DOMAINS` get in.
- **Client links:** `https://ddcnorth.com/access/<token>`
- **Client sign-in by email:** `https://ddcnorth.com/access`, linked as "Client access" in the footer.
- **Shared spaces:** `https://ddcnorth.com/p/<slug>/`, and optionally `https://<slug>.ddcnorth.com/`

Setup steps are in [SETUP.md](SETUP.md). The options we evaluated and why we chose this design are in
[RESEARCH.md](RESEARCH.md). The day-to-day playbook for Claude is in
[`.claude/skills/client-portal/SKILL.md`](../../.claude/skills/client-portal/SKILL.md).

## Architecture

```
                         ddcnorth.com  (Cloudflare Pages project "ddcnorth-website")
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ static (no Functions)      /  /fr/  /assets/…         marketing site, unchanged       │
 │ static SPA                 /admin/*  /access/*  →  /portal/ (React + Vite, _redirects)│
 │ Pages Functions            /api/*   → server/api.ts      admin + client API          │
 │                            /p/<slug>/* → server/gateway.ts  checks access, serves R2 │
 │ (optional) _middleware     <slug>.ddcnorth.com/* → same gateway                       │
 └───────────────┬───────────────────────────────┬──────────────────────────────────────┘
                 │                               │
          D1 "ddcnorth-portal"           R2 "ddcnorth-portal-sites"
          spaces, grants (shares),       sites/<slug>/current.json  → {"version": "<sha>"}
          activations, sessions,         sites/<slug>/<sha>/index.html, assets/…
          session_grants, email_codes,         ▲
          events                               │ aws s3 sync (R2 S3 API)
                                               │
          GitHub: website repo  .github/workflows/deploy-space.yml
                  reads projects.json → checks out project repo → npm ci && npm run build → publish
                  triggered manually or by the project repo (repository_dispatch)
```

**Why R2 rather than a separate Pages project per repo?** If each repo has its own
`*.pages.dev` site, anyone who finds that address skips the access check, so it would also have to
be locked down with Cloudflare Access. Builds stored in a private R2 bucket can only be reached
through the gateway. Every request is checked, including JS, images and data files, so nothing can
be fetched directly. Each deploy is stored under its commit SHA and `current.json` is switched to
it, so deploys are atomic and a rollback is just a matter of pointing `current.json` at an older
SHA.

**Path or subdomain?**
- **`/p/<slug>/`** works with no DNS changes. Projects must build with a relative base
  (`base: './'` in Vite) or with `VITE_BASE`, which the workflow sets to `/p/<slug>/`. Hash routing
  (`#/route`) works as is. With history routing, a path that has no file falls back to the space's
  `index.html`.
- **`<slug>.ddcnorth.com`** gives the app its own origin, which some apps need for absolute paths
  or their own cookies or service workers. Turning it on takes three steps:
  1. Enable the space's subdomain option in the admin.
  2. Add the custom domain to the Pages project.
  3. Build with `PORTAL_SUBDOMAINS=1` so Functions run on every path.

  The access cookie is set on `.ddcnorth.com`, so one unlock covers both addresses.

## Access model

| Record | Meaning |
|---|---|
| **Space** | Something mounted on the domain, usually one repo's build. Private or public. |
| **Share** (`grants`) | One way in to one space: a link token, plus a password or an email list, plus timing rules. Make one per client so activity can be attributed. |
| **Activation** | When a countdown started. One per share, or one per verified email when "each person separately" is chosen. Written once on the server, so refreshing, using a new tab or browser, or clearing cookies never resets it. |
| **Session** | A browser that unlocked. It is an HttpOnly cookie holding a random token, and only the token's hash is stored. |
| **Event** | An append-only log: link loaded, opened, wrong password, code sent, page viewed, and so on. Each event has its time, approximate location from Cloudflare, device and page. |

### Timing controls

These are separate on purpose ([server/policy.ts](../../server/policy.ts) is the single source of
truth, with tests in `tests/policy.test.ts`):

| Control | Example | Behaviour |
|---|---|---|
| Available from | Mon 9:00 | Cannot be opened earlier |
| Must be opened by | within 7 days | No **new** countdown can start after this |
| Access lasts | 48 h | Countdown starts at the first successful open, not when the link is loaded |
| Hard end | Fri 17:00 | Ends for everyone; also caps the countdown |
| Re-enter after | 12 h | Browser session length; never past the end of access |
| Max opens | 1 | Successful unlocks (new browsers). 1 = single-use link |
| Revoke | now | Stops all access immediately; can be restored |

Example: open within 7 days, 48 h once opened, never after Friday 17:00. Someone who opens it
Tuesday keeps access until Thursday. Someone who opens it Friday morning keeps it only until Friday
17:00.

Loading the link does **not** start the clock. Email scanners and chat link previews fetch URLs,
so the visitor has to press **Open**, enter the password or verify an email code. Link loads are
logged separately ("Link loaded").

Admin actions on a share:
- **Extend:** pushes the duration and end date out; people already inside keep their access.
- **Restart timer:** the old countdown is kept in history, and the next open starts a new one.
- **New link:** the old URL stops working.
- **Revoke / Restore**

### What the tracking means

- **Opened:** a credential was accepted. The *first* open is flagged and can email `NOTIFY_EMAIL`.
- **Views:** HTML page loads, plus in-app route changes reported by a tiny script that the gateway
  injects into each shared HTML page.
- **Active time:** counted only while the page is visible *and* has had input in the last 60 s. It
  is evidence of engagement, not proof of reading.
- **Where:** Cloudflare's city, region and country estimate for the visitor's IP. VPNs move it,
  and it is never a street address.
- **Who:**
  - Email shares: the verified address.
  - Link and password shares: "Link visitor". Links can be forwarded, so use per-client links or
    email shares when attribution matters.

The client pages tell visitors that access is logged. Add a privacy page before relying on this
widely (see `docs/design-review.md`).

## Security properties

Checked in local end-to-end runs:
- **Private content stays private:**
  - It never ships in the public site. It lives in R2, and every file request is authorised. Asset
    requests without access get `401`; page requests are redirected to `/access`.
  - Private responses are `private`/`no-store` for HTML, with `X-Robots-Tag: noindex`.
- **Secrets are stored as hashes:**
  - Link tokens and session tokens are stored as SHA-256.
  - Passwords use PBKDF2 (100k iterations). Codes are 6 digits, expire after 10 minutes, and allow
    5 attempts each and 3 codes per 15 minutes per email.
- **Guessing is limited:**
  - Wrong passwords are throttled (10 per 15 minutes per IP per share).
  - Code requests give the same answer whether or not the email is on the list, so the list
    cannot be probed.
- **Write requests are protected:**
  - Cross-site writes are refused with an `Origin` check on top of `SameSite=Lax`.
  - Admin API calls need a Clerk session token (a Bearer token, verified with the Clerk backend
    SDK) whose verified email is on the admin list.
- **The dev shortcut cannot reach production:** `PORTAL_DEV_ADMIN_TOKEN` works only when
  `PORTAL_DEV=1` *and* the request host is localhost.
- **Expiry has limits:** it stops future delivery. It cannot claw back what someone already saw,
  downloaded or screenshotted.

## Code map

| Path | What |
|---|---|
| `functions/api/[[path]].ts` | → `server/api.ts`: client (`/api/access/*`, `/api/client/*`, `/api/track`) and admin (`/api/admin/*`) routes |
| `functions/p/[[path]].ts` | → `server/gateway.ts`: path mounts |
| `functions/_middleware.ts` | subdomain mounts |
| `server/access.ts` | sessions, unlocking, email codes, authorisation |
| `server/policy.ts` | pure timing rules |
| `server/auth.ts` | Clerk admin verification |
| `server/email.ts` | Microsoft Graph, Resend or log mail |
| `portal/` | React SPA: `src/access/*` for clients, `src/admin/*` (lazy, loads Clerk) for admins |
| `migrations/` | D1 schema |
| `projects.json` | repos that deploy into spaces |
| `scripts/publish-space.sh` | upload a build to R2 (CI or `--local`) |
| `.github/workflows/deploy-space.yml` | build and publish a project |

## Moving it to its own repo later

The portal is self-contained (`functions/`, `server/`, `portal/`, `migrations/`, `projects.json`,
the deploy workflow and `wrangler.toml` bindings), and the marketing site never imports any of it.
To split it out:
1. Move those paths into a new repo deployed as its own Pages project (or as a Worker on the route
   `ddcnorth.com/p/*`, `/api/*`, `/admin*`, `/access*`).
2. Keep the D1 and R2 bindings.
3. Remove the `_routes.json` and `_redirects` lines from this repo's `scripts/build.sh`.

Clients keep the same URLs.

## Roadmap ideas

- **Space groups:** one share covering several spaces, such as a client room with a proposal, a
  demo and a report.
- **More controls:**
  - Downloads on or off.
  - A watermark with the viewer's email.
  - A "request more time" button on the expired screen.
- **Admin conveniences:**
  - Admin "Deploy" button: call the GitHub `workflow_dispatch` API with a fine-grained token.
  - Rollback picker: list the versions under `sites/<slug>/` and rewrite `current.json`.
- **Visual page builder** ([Puck](https://github.com/puckeditor/puck)) for simple pages that don't
  need their own repo, stored in R2 as JSON and rendered by a shared viewer space.
- **Data upkeep:**
  - Daily digest email.
  - Data-retention job that deletes old `events`/`email_codes` with a Cron Trigger.
