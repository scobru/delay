#!/bin/bash
# sync-zen-script.sh
# Copies the zen workspace script/ folder into the Docker build context.
# Run this from the shogun-relay root before building the Docker image.
# Usage:  bash docker/sync-zen-script.sh [path-to-zen-repo]
#
# The zen script/ folder is not published in the NPM package, so we keep
# a local copy here (zen-script/) that the Dockerfile uses instead of
# cloning GitHub at build time.  This ensures the running container always
# uses the same version of zen/script/server.js as the local workspace.

set -e

ZEN_ROOT="${1:-../zen}"

if [ ! -d "$ZEN_ROOT/script" ]; then
  echo "ERROR: zen script folder not found at $ZEN_ROOT/script"
  echo "Usage: bash docker/sync-zen-script.sh [path-to-zen-repo]"
  exit 1
fi

DEST="$(dirname "$0")/../zen-script"
mkdir -p "$DEST"
cp -r "$ZEN_ROOT"/script/. "$DEST/"
echo "✅ Copied $ZEN_ROOT/script/ → zen-script/ ($(ls "$DEST" | wc -l | tr -d ' ') files)"
