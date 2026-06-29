#!/usr/bin/env bash
# Checks this folder into https://github.com/rajanishnuguri/investmentdashboard.git
# Run from inside the wealth-trajectory folder:  bash push.sh
# If GitHub rejects the push because the repo already has commits, re-run as:  FORCE=1 bash push.sh
set -euo pipefail

REPO="https://github.com/rajanishnuguri/investmentdashboard.git"
MSG="${MSG:-Independent broker dashboard (MCP backend)}"

git init -q
git add -A
git commit -qm "$MSG" || echo "• Nothing new to commit (already committed)."
git branch -M main

if git remote | grep -qx origin; then
  git remote set-url origin "$REPO"
else
  git remote add origin "$REPO"
fi

echo "• Pushing to $REPO"
if [ "${FORCE:-0}" = "1" ]; then
  git push -u origin main --force
else
  git push -u origin main
fi

echo "✓ Done → https://github.com/rajanishnuguri/investmentdashboard"
