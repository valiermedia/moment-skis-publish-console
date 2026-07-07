#!/usr/bin/env bash
# Deploy the Publish Console on the droplet. Follows the Valier simple-app pattern:
# timestamped release dir + symlink flip + PM2 restart. Idempotent; keeps last 3.
#
# Usage (on the droplet, as deploy@):  ./deploy.sh [branch]
set -euo pipefail

BRANCH="${1:-main}"
APP="moment-skis-publish-console"
BASE="/opt/apps/${APP}"
REPO="${REPO_SSH:-git@github.com:valiermedia/${APP}.git}"
TS="$(date +%Y%m%d%H%M%S)"
REL="${BASE}/releases/${TS}"
SHARED="${BASE}/shared"

echo "[1/5] Clone ${BRANCH} → ${REL}"
mkdir -p "${BASE}/releases"
git clone --depth 1 --branch "${BRANCH}" "${REPO}" "${REL}"

echo "[2/5] npm ci"
cd "${REL}"
npm ci

echo "[3/5] Link environment"
# production secrets + persistent state live in shared/, symlinked into the release
ln -sfn "${SHARED}/.env.production" "${REL}/.env.production"
mkdir -p "${SHARED}"

echo "[4/5] Build"
npm run build

echo "[5/5] Activate + restart"
ln -sfn "${REL}" "${BASE}/current"
cd "${BASE}/current"
pm2 restart "${APP}" --update-env || pm2 start deploy/ecosystem.config.cjs
pm2 save

# prune old releases (keep last 3)
ls -1dt "${BASE}/releases/"*/ | tail -n +4 | xargs -r rm -rf

echo "Deployed ${APP} @ ${TS} (branch ${BRANCH})."
echo "Health: curl -s http://127.0.0.1:3006/api/health"
