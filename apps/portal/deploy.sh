#!/usr/bin/env bash
set -euo pipefail

# Builds apps/portal, pushes it to Artifact Registry, and deploys it to Cloud Run.
# Usage: apps/portal/deploy.sh <PROJECT_ID> <REGION> <API_URL> [GOOGLE_MAPS_API_KEY]

PROJECT_ID="${1:?Usage: deploy.sh <PROJECT_ID> <REGION> <API_URL> [GOOGLE_MAPS_API_KEY]}"
REGION="${2:?Usage: deploy.sh <PROJECT_ID> <REGION> <API_URL> [GOOGLE_MAPS_API_KEY]}"
API_URL="${3:?Usage: deploy.sh <PROJECT_ID> <REGION> <API_URL> [GOOGLE_MAPS_API_KEY]}"
GOOGLE_MAPS_API_KEY="${4:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="genlogs-portal"
REPO_NAME="genlogs"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"

echo "Building ${IMAGE} ..."
docker build \
  --build-arg "VITE_API_BASE_URL=${API_URL}" \
  --build-arg "VITE_GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY}" \
  -t "${IMAGE}" "${SCRIPT_DIR}"

echo "Pushing ${IMAGE} ..."
docker push "${IMAGE}"

echo "Deploying ${SERVICE_NAME} to Cloud Run (${REGION}) ..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=256Mi

URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "Deployed: ${URL}"
