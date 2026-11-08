#!/bin/sh
set -eu

# Publish only website files, keeping repository documentation out of the site.
cd "$(dirname "$0")/.."
rm -rf _site
mkdir _site
cp index.html 404.html _site/
cp -R services approach about fr assets licenses _site/
touch _site/.nojekyll
