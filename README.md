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
- Build command: `npm run build` (runs `sh scripts/build.sh`; static files only)
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

## Client portal (separate repo)

The client portal (`/admin`, `/access`, `/p/<slug>/`, `/api/*`) is **not** in this repo. It lives in
[`ddcnorth/portal`](https://github.com/ddcnorth/portal) and runs as the Cloudflare Worker
`ddcnorth-portal`, attached to those paths on `ddcnorth.com` and `www.ddcnorth.com`. Cloudflare
sends requests on those paths to the Worker before this Pages project, so the two share the domain
but are built and deployed independently.

The only link between them is the footer's "Client access" / "Accès client" link to
`https://ddcnorth.com/access/`. Don't add website pages under `/admin`, `/access`, `/p/`, `/api/` or
`/portal/`; the Worker owns those paths.

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
- `wrangler.toml`: Pages project settings (no bindings; the portal Worker has its own).

Contact links open the visitor's email application. Search and navigation run
entirely in the browser.
