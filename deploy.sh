#!/usr/bin/env bash
set -euo pipefail

# Deploys both apps/api and apps/portal to Cloud Run, in the required order:
# the API first (so its URL can be baked into the portal's build), then the
# portal, then the API's ALLOWED_ORIGINS is updated to include the portal's
# deployed origin.
#
# Usage: ./deploy.sh <PROJECT_ID> <REGION> [GOOGLE_MAPS_API_KEY]

PROJECT_ID="${1:?Usage: deploy.sh <PROJECT_ID> <REGION> [GOOGLE_MAPS_API_KEY]}"
REGION="${2:?Usage: deploy.sh <PROJECT_ID> <REGION> [GOOGLE_MAPS_API_KEY]}"
GOOGLE_MAPS_API_KEY="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== Deploying API =="
bash "${SCRIPT_DIR}/apps/api/deploy.sh" "${PROJECT_ID}" "${REGION}"

API_URL="$(gcloud run services describe genlogs-api \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "== Deploying portal (API_URL=${API_URL}) =="
bash "${SCRIPT_DIR}/apps/portal/deploy.sh" "${PROJECT_ID}" "${REGION}" "${API_URL}" "${GOOGLE_MAPS_API_KEY}"

PORTAL_URL="$(gcloud run services describe genlogs-portal \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "== Updating API's ALLOWED_ORIGINS to include portal origin =="
gcloud run services update genlogs-api \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --update-env-vars="ALLOWED_ORIGINS=${PORTAL_URL}"

echo ""
echo "Both services are live:"
echo "  API:    ${API_URL}"
echo "  Portal: ${PORTAL_URL}"
