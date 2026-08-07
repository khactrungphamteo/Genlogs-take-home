## Why

`apps/api` and `apps/portal` are fully implemented but only runnable on localhost — there is no Dockerfile, deploy script, or public URL anywhere in the repo. The take-home reviewer needs to open a real link, not clone and run two dev servers. This change makes both services deployable to Cloud Run behind a custom domain the user registers.

## What Changes

- Add a `Dockerfile` + `.dockerignore` to `apps/api`, producing a container that binds `uvicorn` to Cloud Run's injected `$PORT` instead of the hardcoded `--port 8000` used in local dev.
- Make `apps/api`'s CORS origin list configurable via an `ALLOWED_ORIGINS` environment variable (currently hardcoded to `http://localhost:5173` only) so the deployed portal's origin can be authorized without an image rebuild.
- Add a `Dockerfile` (multi-stage: Node build → nginx static serve) + `.dockerignore` + `nginx.conf.template` to `apps/portal`, serving the Vite production build on Cloud Run's `$PORT`.
- Add `apps/portal/.env.example` (referenced by the existing README/tasks but never created).
- Add per-app `deploy.sh` scripts plus an orchestrating root `deploy.sh` that builds, pushes to Artifact Registry, and deploys both services via `gcloud run deploy`, in the required order (API first, so its URL can be baked into the portal's build).
- Add a written domain-mapping runbook (`docs/deployment-runbook.md`) covering the manual, account-bound steps the assistant cannot perform on the user's behalf: registering a new domain via Cloud Domains, creating `gcloud run domain-mappings`, and adding the resulting DNS records.
- Add a root-level `.gitignore` — none currently exists, so `.venv/`, `node_modules/`, `dist/`, `__pycache__/`, and `.env` files are only excluded inside `apps/portal/` today.
- **BREAKING**: `apps/api`'s CORS behavior changes from a fixed allow-list to reading `ALLOWED_ORIGINS` at startup (defaulting to the current `http://localhost:5173` value, so local dev is unaffected).

## Capabilities

### New Capabilities
- `deployment`: covers both services being containerized, deployable to Cloud Run, publicly reachable over HTTPS at a stable custom domain, and the API's CORS being restricted to configured origins rather than open or hardcoded.

### Modified Capabilities
(none — `openspec/specs/` has no archived capabilities yet to delta against; the CORS behavior change is captured as a requirement of the new `deployment` capability instead, since it exists only in service of making the deployment reachable from the browser.)

## Impact

- **Code**: `apps/api/app/main.py` (CORS middleware reads an env var instead of a literal), new Dockerfiles/configs in both apps, no changes to business logic, mock data, or existing tests.
- **New infra dependencies**: Google Cloud Run, Artifact Registry, Cloud Domains, Cloud DNS — all in the user's existing GCP project (billing already enabled).
- **Manual, account-bound steps outside this change's automation**: GCP project/billing selection, domain purchase, running the deploy scripts against a live project, adding DNS records, and restricting/rotating the Google Maps API key for the public domain. These are documented in the runbook, not scripted, because they require the user's credentials and payment method.
- **Non-goals**: no CI/CD pipeline (manual `deploy.sh` only, per user's choice), no Global HTTPS Load Balancer / serverless NEGs (Cloud Run domain mappings only, per user's choice), no authentication on either service (both stay `--allow-unauthenticated`, matching the existing demo's no-auth scope), no autoscaling beyond `min-instances=0`/`max-instances=2`, no multi-region or DR, no database (the API keeps using in-memory mock data — this change only makes the existing mock-data demo reachable on the internet). None of DD-1..DD-9 in `02-system-architecture.md` are touched: those describe the production ingestion/matching/rollup pipeline, which this repo's implemented slice never built (per `02-system-architecture.md` §7 and `openspec/config.yaml`) and this change does not build either — it only hosts the existing mock-data read path.
