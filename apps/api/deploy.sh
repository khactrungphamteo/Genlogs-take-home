#!/usr/bin/env bash
set -euo pipefail

# Builds apps/api, pushes it to Artifact Registry, and deploys it to Cloud Run.
# Usage: apps/api/deploy.sh <PROJECT_ID> <REGION> [ALLOWED_ORIGINS]

PROJECT_ID="${1:?Usage: deploy.sh <PROJECT_ID> <REGION> [ALLOWED_ORIGINS]}"
REGION="${2:?Usage: deploy.sh <PROJECT_ID> <REGION> [ALLOWED_ORIGINS]}"
ALLOWED_ORIGINS="${3:-http://localhost:5173}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="genlogs-api"
REPO_NAME="genlogs"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"

echo "Building ${IMAGE} ..."
docker build -t "${IMAGE}" "${SCRIPT_DIR}"

echo "Pushing ${IMAGE} ..."
docker push "${IMAGE}"

echo "Deploying ${SERVICE_NAME} to Cloud Run (${REGION}) ..."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE}" \
  --port=8001 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=512Mi \
  --set-env-vars="ALLOWED_ORIGINS=${ALLOWED_ORIGINS}"

URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "Deployed: ${URL}"
