#!/usr/bin/env bash
# Pulls the latest commit for whatever branch this checkout is on and (re)builds the
# stack in place. Run from inside a checkout directory — e.g. ~/apps/vpms-production
# (on `main`) or ~/apps/vpms-staging (on `staging`). Same script for both; the only
# difference between environments is which directory/branch/.env you're sitting in.
#
# Used by .github/workflows/deploy-production.yml and deploy-staging.yml over SSH, and
# safe to run by hand for the same effect.
set -euo pipefail

if [ ! -f .env ]; then
  echo "No .env in $(pwd) — copy .env.example to .env and fill in real values first (see DEPLOYMENT.md)." >&2
  exit 1
fi

git fetch origin
git reset --hard "origin/$(git rev-parse --abbrev-ref HEAD)"

docker compose up -d --build

# Drop images/layers no longer referenced by any container — keeps a long-lived VM from
# quietly filling its disk with every previous build.
docker image prune -f
