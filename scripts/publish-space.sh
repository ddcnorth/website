#!/bin/sh
# Upload a built site to the portal's R2 bucket and make it the live version.
#
#   sh scripts/publish-space.sh <slug> <build-dir> <version> [--local]
#
# Remote (CI): needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and
# optionally R2_BUCKET (default ddcnorth-portal-sites); uses the AWS CLI against
# R2's S3 API. --local writes to the `wrangler pages dev` local bucket instead.
#
# Layout: sites/<slug>/<version>/... then sites/<slug>/current.json points at it,
# so a deploy switches over atomically and old versions remain for rollback.
set -eu
slug="$1"; dir="$2"; version="$3"; mode="${4:-remote}"
bucket="${R2_BUCKET:-ddcnorth-portal-sites}"
case "$slug" in *[!a-z0-9-]*|"") echo "bad slug: $slug" >&2; exit 1;; esac
[ -f "$dir/index.html" ] || { echo "$dir/index.html not found - is the build output directory right?" >&2; exit 1; }

pointer=$(mktemp)
printf '{"version":"%s","repo":"%s","ref":"%s","deployed_at":"%s"}\n' \
  "$version" "${SPACE_REPO:-}" "${SPACE_REF:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$pointer"

if [ "$mode" = "--local" ]; then
  cd "$(dirname "$0")/.."
  (cd "$dir" && find . -type f | sed 's#^\./##') | while read -r f; do
    npx wrangler r2 object put "$bucket/sites/$slug/$version/$f" --file "$dir/$f" --local >/dev/null
  done
  npx wrangler r2 object put "$bucket/sites/$slug/current.json" --file "$pointer" --local --content-type application/json >/dev/null
else
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto
  # R2 does not accept the newer default checksum headers from recent AWS CLIs.
  export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
  endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  aws s3 sync "$dir" "s3://$bucket/sites/$slug/$version/" --endpoint-url "$endpoint" --only-show-errors
  aws s3 cp "$pointer" "s3://$bucket/sites/$slug/current.json" --endpoint-url "$endpoint" \
    --content-type application/json --cache-control no-store --only-show-errors
fi
rm -f "$pointer"
echo "Published $slug@$version"
