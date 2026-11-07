# DDCNorth website

Static website imported from `DDCNorth-Website(1).zip`.

Website address: <https://ddcnorth.com/>

## Preview locally

The marketing pages need no dependencies. Prepare the public files and serve them:

```sh
sh scripts/build.sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory _site
```

Open <http://127.0.0.1:8000/>.

The website is a single page, with Services, Our approach and About us sections.
Navigation jumps to the corresponding section or service panel. English is at `/`
and the complete static French version is at `/fr/`. The globe opens a small English/Français dropdown. Its links preserve the
current section when JavaScript is available; each language also works without it.

Search is retained but hidden and inactive by default. Set `searchEnabled` to
`true` in `assets/config.js` and rebuild to restore it in both languages. The
HTML starts hidden/inert to prevent a flash before scripts load. Search copy and
results are localized in `assets/header.js`. Keep English and French HTML in
sync when updating content.
Previously shared `/services/`, `/approach/` and `/about/` links redirect to the
homepage section; these paths contain no separate content pages. Individual
service fragments are preserved. Relative assets and links also support the
GitHub Pages `/website/` prefix.

## Publish changes

Cloudflare Pages is the primary host. Its Git integration connects directly to
`ddcnorth/website`: pushes to `main` build and deploy production; pushes to other
branches create preview deployments.

Cloudflare project settings:

- Project: `ddcnorth-website`
- Production branch: `main`
- Framework preset: None
- Build command: `npm run build` (static site + client portal; was `sh scripts/build.sh`)
- Build output directory: `_site`
- Root directory: repository root
- Custom domains: `ddcnorth.com` and `www.ddcnorth.com`

The build publishes only `index.html`, `404.html`, `services/`, `approach/`,
`about/`, `fr/`, `assets/`, and `licenses/` (plus `.nojekyll`).
Repository documentation and configuration are excluded. No deployment token is
stored in GitHub; Cloudflare's GitHub App handles the native build pipeline.

The existing GitHub Actions workflow in `.github/workflows/deploy-pages.yml`
also publishes the same files to <https://ddcnorth.github.io/website/> as a
secondary deployment. Documentation-only changes do not trigger that workflow.

GitHub Pages must use **GitHub Actions** as its publishing source. This repository
is public as authorized by its owner for hosting on GitHub Free.

## Client portal

`/admin` (the same verified accounts as Societyer DDCNorth) manages **spaces**: pages or whole apps
built from other GitHub repos (e.g. `ahzs645/lovefutboler`) and served privately at `/p/<slug>/`
or `<slug>.ddcnorth.com`. Each space can be shared by link, link + password, or verified email,
with timing rules (countdown from first open, deadline, hard end, max opens, revoke). The admin
shows who opened what, when, roughly where, and for how long. Clients use the link they were sent
or sign in by email at `/access` ("Client access" in the footer).

It runs on the same Cloudflare Pages project with Pages Functions, D1 and R2. See
[docs/portal/README.md](docs/portal/README.md) for the architecture and
[docs/portal/SETUP.md](docs/portal/SETUP.md) for the one-time setup. Cloudflare storage and the
Pages build are provisioned; see [docs/portal/DEPLOYMENT.md](docs/portal/DEPLOYMENT.md) for the
deployment state, account sign-in, email, and automatic project publishing.
The GitHub Pages mirror stays static-only (no portal).

Local: `npm install && cp .dev.vars.example .dev.vars && npm run db:migrate:local && npm run dev`
(http://localhost:8788). Checks: `npm run typecheck && npm test`.

## Files

- `index.html`: single-page site with hero, services, approach, about and a minimal footer.
- `fr/index.html`: complete French single-page website.
- `assets/config.js`: reversible search feature flag.
- `services/`, `approach/`, `about/`: compatibility redirects for previously shared URLs.
- `assets/site.css`: shared original styles and embedded fonts.
- `assets/`: header/footer styles and shared navigation/search/accordion behavior.
- `scripts/build.sh`: shared static build used by Cloudflare and GitHub Pages.
- `404.html`: missing-page response for static hosting.
- `licenses/`: licenses for the bundled Inter and Space Mono fonts.
- `README.txt`: original export notes.
- `docs/`: publication plan, status, requirement verification, and `design-review.md`.
- `functions/`, `server/`, `portal/`, `migrations/`, `wrangler.toml`: client portal (see `docs/portal/`).
- `projects.json`, `scripts/publish-space.sh`, `.github/workflows/deploy-space.yml`: deploy other repos into portal spaces.
- `.claude/skills/client-portal/`: working notes for Claude on the portal.

Contact links open the visitor's email application. Search and navigation run
entirely in the browser.
