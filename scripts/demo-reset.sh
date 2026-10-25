#!/usr/bin/env bash
# Put the deployment back to the demo's starting state: July and August signed, September open and untouched,
# Moss memory equal to the database. Takes about a minute; no model calls.
#   scripts/demo-reset.sh            restore prod from demo/golden.zip
#   scripts/demo-reset.sh --dev      same, into the dev deployment
#   scripts/demo-reset.sh save       overwrite demo/golden.zip from prod (only when prod is in the state you want to keep)
set -euo pipefail
cd "$(dirname "$0")/.."
SNAP=demo/golden.zip
TARGET=--prod
[[ "${1:-}" == "--dev" ]] && TARGET="" && shift
if [[ "${1:-}" == "save" ]]; then
  rm -f "$SNAP" && npx convex export $TARGET --path "$SNAP" && exit
fi
npx convex import $TARGET --replace-all -y "$SNAP"
npx convex run $TARGET retrieval:reindexAll '{"entity":"eo-festival-nyc"}'
