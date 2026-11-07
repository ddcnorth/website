# Portal setup (Cloudflare + Clerk + Microsoft 365)

This is a one-time setup. You need Cloudflare access to the `ddcnorth-website` Pages project, the
Clerk dashboard and the Microsoft 365 / Entra admin centre. Nothing below puts a secret in the repo.

## 1. Cloudflare resources

```bash
npx wrangler login
```

```bash
npx wrangler d1 create ddcnorth-portal
```

Copy the printed `database_id` into `wrangler.toml`.

```bash
npm run db:migrate:remote
```

```bash
npx wrangler r2 bucket create ddcnorth-portal-sites
```

The bucket stays private. Do **not** enable public access or an r2.dev URL.

## 2. Pages project settings

In Cloudflare dashboard → Workers & Pages → `ddcnorth-website` → Settings:

- **Build command:** `npm run build`. This was `sh scripts/build.sh`; it now also builds the portal
  SPA. Output directory stays `_site`.
- **Bindings:** read from `wrangler.toml` (`DB` → D1 `ddcnorth-portal`, `SITES` → R2
  `ddcnorth-portal-sites`). Once a `wrangler.toml` exists, Pages treats it as the source of truth
  for bindings and plain variables, so edit them there.
- **Build variables:**
  - `VITE_CLERK_PUBLISHABLE_KEY` = `pk_live_…`. It is public and baked into the admin bundle.
  - Optional: `PORTAL_SUBDOMAINS=1`, only if any space uses `<slug>.ddcnorth.com`.
- **Secrets** (Variables and secrets → *Encrypt*):

| Secret | Value |
|---|---|
| `CLERK_SECRET_KEY` | `sk_live_…` from Clerk → API keys |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | from step 4 (only for `EMAIL_PROVIDER=graph`) |
| `RESEND_API_KEY` | only if you use `EMAIL_PROVIDER=resend` instead |
| `NOTIFY_EMAIL` | where "first opened" alerts go, e.g. `fryderyk@ddcnorth.com` (can also be a plain var) |

Plain variables in `wrangler.toml` `[vars]`:

| Variable | Value |
|---|---|
| `PORTAL_ROOT_DOMAIN` | `ddcnorth.com` |
| `CLERK_AUTHORIZED_PARTIES` | `https://ddcnorth.com,https://www.ddcnorth.com` |
| `ADMIN_EMAIL_DOMAINS` | `ddcnorth.com` |
| `ADMIN_EMAILS` | specific addresses outside the domain (optional) |
| `EMAIL_PROVIDER` | `graph` |
| `EMAIL_FROM` | `noreply@ddcnorth.com` |
| `EMAIL_FROM_NAME` | `DDCNorth` |

Preview deployments (`*.ddcnorth-website.pages.dev`) run the same code. Admin sign-in there only
works if that origin is also added to Clerk and to `CLERK_AUTHORIZED_PARTIES`.

## 3. Clerk (admin sign-in with the Microsoft 365 tenant)

Use the same Clerk setup as Societyer (`societyer/docs/clerk-setup.md`).

1. **Choose the Clerk instance:**
   - If the existing Clerk **production** instance is already on `ddcnorth.com` (e.g.
     `clerk.ddcnorth.com`), reuse it. Sessions then work across `ddcnorth.com` subdomains.
   - Otherwise create an application for `ddcnorth.com` and add its DNS records.
2. **Sign-in method:** enable **Microsoft** with your own Entra app registration (custom
   credentials) for the tenant, and turn off sign-up methods you don't want.
   - **Restrictions** → allowlist `ddcnorth.com`, so only tenant accounts can create Clerk users.
   - The server **also** checks `ADMIN_EMAIL_DOMAINS` / `ADMIN_EMAILS`, so a stray Clerk account
     still cannot reach `/api/admin`.
3. **Optional, saves one API call per admin request:** Sessions → Customize session token → add
   `{"email": "{{user.primary_email_address}}"}`.
4. **Domains:** add `https://ddcnorth.com` as an allowed origin and redirect URL.

Clients never use Clerk. They use share links or the email-code sign-in, so they don't count
toward Clerk's monthly active users.

## 4. Email for client codes (Microsoft Graph, from your own tenant)

1. In Entra admin centre → App registrations → **New registration** `ddcnorth-portal-mail`
   (single tenant).
2. API permissions → Microsoft Graph → **Application** → `Mail.Send` → *Grant admin consent*.
3. Certificates & secrets → new client secret. Store it as `MS_CLIENT_SECRET`, along with the
   tenant ID as `MS_TENANT_ID` and the app ID as `MS_CLIENT_ID`.
4. **Limit the app to the one sending mailbox.** By default `Mail.Send` can send as anyone in the
   tenant. In Exchange Online PowerShell, use an RBAC for Applications scope or an application
   access policy, e.g.

   ```powershell
   New-ApplicationAccessPolicy -AppId <MS_CLIENT_ID> -PolicyScopeGroupId noreply@ddcnorth.com -AccessRight RestrictAccess -Description "Portal mail"
   ```

5. Create the `noreply@ddcnorth.com` mailbox, or a shared mailbox, and set `EMAIL_FROM` to it.

**Alternative:** use `EMAIL_PROVIDER=resend` with a verified sending domain and `RESEND_API_KEY`.
For local work, `EMAIL_PROVIDER=log` prints codes to the console.

## 5. GitHub: deploying other repos into spaces

In this repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | R2 → Manage API tokens → *Object Read & Write*, scoped to `ddcnorth-portal-sites` only |
| `PROJECTS_READ_TOKEN` | only for private project repos: fine-grained token, *Contents: read* on those repos |

Then, for each project:

1. **Register the repo.** Add an entry to `projects.json` with `slug`, `repo`, `ref`, `install`,
   `build` and `output`.
2. **Make it work under a subpath.** Use `base: './'` in its Vite config (lovefutboler already
   does), or read `process.env.VITE_BASE`.
3. **Create the space** with the same slug in `/admin`.
4. **Deploy it.** Run **Actions → Deploy space** with that slug. To redeploy automatically on
   every push, copy [templates/notify-portal.yml](templates/notify-portal.yml) into the project
   repo and give it a `PORTAL_DISPATCH_TOKEN` secret. That is a fine-grained token on *this* repo
   with **Actions: read and write** and **Contents: read**, which `repository_dispatch` requires.

## 6. Subdomain mounts (optional)

1. Turn on the space's "Also serve at its own subdomain" setting.
2. Pages → Custom domains → add `<slug>.ddcnorth.com`. Pages has no wildcard custom domains, so add
   one per subdomain.
3. Set the build variable `PORTAL_SUBDOMAINS=1` and redeploy. This routes every path through
   Functions, which is needed for subdomains but costs one Function invocation per static request.

## 7. Local development

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

The example sets `PORTAL_DEV=1`, the dev admin token and `EMAIL_PROVIDER=log`.

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

This builds everything and runs `wrangler pages dev` on http://localhost:8788.

To put a project into the local bucket:

```bash
sh scripts/publish-space.sh lovefutbol ../lovefutboler/dist dev1 --local
```

It is slow because it uploads one file at a time.

Open http://localhost:8788/admin and enter the dev token. With `PORTAL_DEV=1`, email codes are
shown in the API response and the UI.

Checks:

```bash
npm test
```

This runs the timing-rule unit tests.

```bash
npm run typecheck
```

## Going live checklist

- [ ] D1 created, `database_id` set, `npm run db:migrate:remote` applied
- [ ] R2 bucket created (private)
- [ ] Pages build command `npm run build`; `VITE_CLERK_PUBLISHABLE_KEY` set; secrets set
- [ ] `/admin` signs in with a tenant account; a non-admin account is refused
- [ ] Create a test space, deploy it, make a password share, open it in a private window, check it
      appears under Visitors
- [ ] Wait for (or set) a short expiry and confirm the page redirects to `/access`
- [ ] `PORTAL_DEV` is **not** set in production
