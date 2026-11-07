#!/bin/sh
set -eu

# Publish only website files, keeping repository documentation out of the site.
cd "$(dirname "$0")/.."
rm -rf _site
mkdir _site
cp index.html 404.html _site/
cp -R services approach about fr assets licenses _site/
touch _site/.nojekyll

# --- Client portal routing (Cloudflare Pages only; ignored by GitHub Pages) ---
# Pages Functions run only for these paths; everything else stays plain static.
# Set PORTAL_SUBDOMAINS=1 in the Pages build environment to serve spaces at
# <slug>.ddcnorth.com, which needs Functions on every path of every host.
if [ "${PORTAL_SUBDOMAINS:-0}" = "1" ]; then
  printf '{"version":1,"include":["/*"],"exclude":[]}\n' > _site/_routes.json
else
  printf '{"version":1,"include":["/api/*","/p/*"],"exclude":[]}\n' > _site/_routes.json
fi

# The portal SPA (built by `npm run build` into _site/portal/) answers /admin and /access.
cat > _site/_redirects <<'REDIRECTS'
/admin       /portal/  200
/admin/*     /portal/  200
/access      /portal/  200
/access/*    /portal/  200
REDIRECTS

cat > _site/_headers <<'HEADERS'
/access/*
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow
/admin/*
  X-Robots-Tag: noindex, nofollow
/portal/*
  X-Robots-Tag: noindex, nofollow
HEADERS
