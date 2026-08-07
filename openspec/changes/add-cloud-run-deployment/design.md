## Context

See proposal.md - Why. Both apps run today only via local dev servers (`uvicorn --reload --port 8000`, `vite dev` on `5173`). Neither has a Dockerfile, CI config, or any deployment artifact; no root `.gitignore` exists. The portal's Vite build inlines `import.meta.env.VITE_*` vars at **build time**, not runtime — this constrains how the API's URL and the Google Maps key reach the portal. The user has an existing GCP project with billing enabled, wants to register a new domain, wants Cloud Run domain mappings (not a load balancer), and wants manual deploy scripts rather than CI/CD for this first pass.

## Goals / Non-Goals

**Goals:**
- Container images for both services, buildable and runnable locally and on Cloud Run without code changes beyond the one CORS config change.
- A deterministic, documented deploy order (API before portal) so the portal's build always points at a live API URL.
- A runbook for the manual, account-bound steps (domain purchase, DNS, domain mappings) that this change's scripts cannot perform.

**Non-Goals:**
- CI/CD automation (explicitly deferred by the user to a later change).
- A Global HTTPS Load Balancer / serverless NEGs setup (explicitly declined in favor of Cloud Run domain mappings).
- Any change to API business logic, mock data, or test coverage.
- Choosing the final domain name or GCP region on the user's behalf — both are left as script parameters (see Open Questions).

## Decisions

**1. Dockerfile + Artifact Registry over `gcloud run deploy --source .` (Buildpacks).** Buildpacks' Node detection expects the app to expose its own start command (e.g. via a `Procfile` or a `start` script); `apps/portal/package.json` has only `dev`/`build`/`preview`, and there's no documented way to pass the two required build-time values (`VITE_API_BASE_URL`, `VITE_GOOGLE_MAPS_API_KEY`) into a Buildpacks build the way a Dockerfile `ARG` does. A plain Dockerfile removes that ambiguity for both services and keeps the build mechanism symmetric. Trade-off: requires Docker locally (or Cloud Shell, which has it preinstalled) instead of a source-only `gcloud` command.

**2. `apps/api`: single-stage `python:3.11-slim`, `pip install .` (not `.[dev]`).** Matches `requires-python = ">=3.11"` exactly; installing without the `dev` extra already excludes pytest/httpx from the runtime image. No multi-stage needed — no C-extension compilation. `CMD` uses shell form so `${PORT:-8080}` expands, satisfying Cloud Run's contract (it injects `$PORT`, default 8080, and requires binding `0.0.0.0`).

**3. `apps/portal`: multi-stage Node build → nginx static serve, port via `envsubst` template.** Stage 1 (`node:22-alpine`): `ARG`/`ENV` for `VITE_API_BASE_URL` and `VITE_GOOGLE_MAPS_API_KEY`, then `npm ci && npm run build`. Stage 2 (`nginx:1.27-alpine`): copy `dist/` in, plus an `nginx.conf.template` using `${PORT}` — the official nginx image auto-runs `envsubst` on `*.template` files at container start, which satisfies Cloud Run's dynamic-port requirement with no custom entrypoint script.

**4. Google Maps key baked into the client bundle at build time, restricted by HTTP referrer rather than treated as a server secret.** This is the only mechanism Vite offers (`import.meta.env.*` is compile-time), and it's normal practice for Maps JS API keys specifically, which Google's own guidance says to restrict by HTTP referrer rather than keep server-side. The key currently sitting in `apps/portal/.env` is untracked and unrestricted — recommend rotating to a fresh key restricted to `https://app.<domain>/*` before the first real deploy (see runbook), rather than reusing the current one.

**5. CORS origin list becomes an env var (`ALLOWED_ORIGINS`), read once at process startup.** Changing which origins are allowed after the domain is finalized becomes a Cloud Run env-var update (`--update-env-vars`), not an image rebuild — this is the one production-code change in this proposal, and it's additive (defaults to today's hardcoded value when unset, per the spec's "no origins configured" scenario).

**6. Deploy order is fixed: API → capture URL → build/deploy portal → tighten API's `ALLOWED_ORIGINS`.** Because the portal's API base URL is baked in at build time, the API must exist first. The orchestrating root `deploy.sh` captures the API's URL via `gcloud run services describe --format='value(status.url)'` and passes it as the portal's build arg automatically, so the user runs one command instead of manually copying URLs between steps.

**7. Region and domain name are script parameters, not hardcoded.** `PROJECT_ID` and `REGION` are required inputs to every script (per the user's constraint that no specific project should be assumed). Recommend `us-central1` in the runbook as the default (long-supported for Cloud Run domain mappings, generally lowest cost) but the user can override.

**8. Cloud Run sizing: `min-instances=0`, `max-instances=2`, API `512Mi`, portal `256Mi`, default 1 vCPU, `--allow-unauthenticated` on both.** Scale-to-zero avoids idle cost for a demo; the max cap bounds worst-case spend; memory sizes are generous for an in-memory mock API and a static nginx server respectively.

## Risks / Trade-offs

- **[Risk] Google-managed TLS cert issuance for a domain mapping can take minutes to ~48h after DNS propagates.** → Mitigation: the runbook has the user verify both `*.run.app` URLs work first (immediate), then treats the custom domain as a cutover step layered on top, not a blocking dependency for having *something* live.
- **[Risk] The Maps API key becomes visible in the deployed JS bundle (unavoidable for a client-side Maps JS integration).** → Mitigation: HTTP-referrer restriction scoped to the final domain, documented as a required pre-launch step, not optional polish.
- **[Risk] Portal's `VITE_API_BASE_URL` is baked in at build time, so pointing it at the API's custom domain (`api.<domain>`) instead of its `*.run.app` URL requires one more rebuild after the domain mapping is live.** → Mitigation: documented as an explicit, optional final runbook step; the demo functions correctly either way since the `*.run.app` URL is permanently stable.
- **[Risk] No root `.gitignore` exists today, so a careless `git add -A` could commit `.venv/`, `node_modules/`, `dist/`, or `.env`.** → Mitigation: this change adds the root `.gitignore` before any deploy scripts are exercised.
- **[Trade-off] No CI/CD means every future change requires the user to re-run `deploy.sh` manually.** Accepted per the user's explicit choice for this first pass; documented as a natural follow-up change rather than solved here.

## Migration Plan

1. Land the code changes in this change (Dockerfiles, `.dockerignore`s, `ALLOWED_ORIGINS` config, `.env.example`, `.gitignore`, deploy scripts, runbook) — no deploy happens yet, nothing here is destructive or affects local dev (`ALLOWED_ORIGINS` defaults to the current value; `uvicorn --reload --port 8000` and `npm run dev` still work unchanged).
2. User runs the one-time GCP setup (enable APIs, create the Artifact Registry repo) per the runbook.
3. User runs `./deploy.sh <PROJECT_ID> <REGION>`, which deploys the API, then the portal pointed at the API's `*.run.app` URL. The app is now live and testable at its default Cloud Run URLs — this alone satisfies "other people can see the application" even before the domain exists.
4. User registers the domain via Cloud Domains and follows the runbook to create the two domain mappings and DNS records, then waits for cert issuance.
5. (Optional) User re-runs the portal deploy step with `VITE_API_BASE_URL` set to the API's custom domain, and tightens `ALLOWED_ORIGINS` to drop the `*.run.app` origin if desired.
6. Rollback at any step is non-destructive: `gcloud run services update-traffic --to-revisions=<previous>=100` reverts a bad deploy; domain mappings can be deleted independently of the underlying services, which keep serving on their `*.run.app` URLs regardless.

## Open Questions

- Exact domain name and whether `app.`/`api.` subdomains are acceptable — left as a runbook fill-in the user provides at execution time; does not change the spec, approach, or task breakdown, since every artifact treats the domain as a parameter.
- Whether to reuse or rotate the Maps API key currently in `apps/portal/.env` — recommendation given in Decisions/Risks above; final call is the user's at deploy time and doesn't change what gets built.
