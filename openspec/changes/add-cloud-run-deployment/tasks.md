## 1. Repo hygiene

- [x] 1.1 Add a root `.gitignore` covering `.venv/`, `__pycache__/`, `*.pyc`, `*.egg-info/`, `.pytest_cache/`, `node_modules/`, `dist/`, `.vite/`, `.env`, `.idea/`, `.DS_Store` — verify: `git status` no longer lists any of these paths as untracked after `git add`

## 2. API — deployment readiness

- [x] 2.1 Add `apps/api/Dockerfile` (`python:3.11-slim`, creates an in-container `.venv` and `pip install .` into it, copies only `pyproject.toml` + `app/`, `CMD` runs `uvicorn --reload` bound to fixed `0.0.0.0:8001`) — verify: `docker build -t genlogs-api apps/api && docker run -p 8001:8001 genlogs-api` then `curl localhost:8001/lanes?origin=...&destination=...` returns a 200
- [x] 2.2 Add `apps/api/.dockerignore` (`.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `tests/`, `*.egg-info/`, `.git`) — verify: `docker build` context size drops noticeably vs. without it
- [x] 2.3 Change `apps/api/app/main.py`'s CORS middleware to read `ALLOWED_ORIGINS` (comma-separated) from the environment, defaulting to `http://localhost:5173` when unset — verify: existing `pytest apps/api/tests` still green unchanged; manual check that setting `ALLOWED_ORIGINS=https://example.com` and omitting it both produce the CORS behavior described in `specs/deployment/spec.md`
- [x] 2.4 Update `apps/api/README.md` with a "Deploy" section pointing at `deploy.sh` and noting `ALLOWED_ORIGINS` — verify: section present and commands match the actual script

## 3. Portal — deployment readiness

- [x] 3.1 Add `apps/portal/Dockerfile` (multi-stage: `node:22-alpine` build with `ARG`/`ENV` for `VITE_API_BASE_URL` and `VITE_GOOGLE_MAPS_API_KEY` → `nginx:1.27-alpine` runtime) — verify: `docker build --build-arg VITE_API_BASE_URL=http://localhost:8000 -t genlogs-portal apps/portal && docker run -p 8080:8080 genlogs-portal` serves the app at `localhost:8080`
- [x] 3.2 Add `apps/portal/nginx.conf.template` using `${PORT}` (resolved via nginx's built-in `envsubst` on `*.template` files) with SPA fallback `try_files $uri /index.html;` — verify: container listens on whatever `-e PORT=` is passed, defaulting sanely if unset
- [x] 3.3 Add `apps/portal/.dockerignore` (`node_modules/`, `dist/`, `.vite/`, `.idea/`, `.env`, `.git`) — verify: build context excludes these
- [x] 3.4 Add `apps/portal/.env.example` (`VITE_GOOGLE_MAPS_API_KEY=`, `VITE_API_BASE_URL=http://localhost:8000`) — verify: fresh clone + `npm install` + `npm run dev` works with `.env` absent, per the existing README's stated behavior
- [x] 3.5 Update `apps/portal/README.md` with a "Deploy" section noting the two build args and pointing at `deploy.sh` — verify: section present and matches the actual script

## 4. Deploy scripts

- [x] 4.1 Add `apps/api/deploy.sh` (`PROJECT_ID`, `REGION` required args/env vars; builds and pushes to Artifact Registry, `gcloud run deploy` with `--port=8001 --allow-unauthenticated --min-instances=0 --max-instances=2 --memory=512Mi --set-env-vars ALLOWED_ORIGINS=...` — the explicit `--port` is required since the container's fixed `EXPOSE 8001` doesn't match Cloud Run's default `8080` target, prints the deployed URL) — verify: `bash apps/api/deploy.sh <project> <region>` against a real project deploys and prints a working `https://*.run.app` URL
- [x] 4.2 Add `apps/portal/deploy.sh` (requires an `API_URL` input and optional Maps key; builds with `--build-arg`, pushes, `gcloud run deploy` with the same sizing flags at `--memory=256Mi`, prints the deployed URL) — verify: run against a live API URL, deployed portal successfully calls that API from the browser
- [x] 4.3 Add orchestrating root `deploy.sh` (deploys API, captures its URL via `gcloud run services describe --format='value(status.url)'`, deploys portal with that URL as the build arg, then updates the API's `ALLOWED_ORIGINS` to include the portal's URL) — verify: a single `./deploy.sh <project> <region>` run against a fresh project ends with both services live and the portal's search successfully round-tripping to the API with no CORS error in the browser console

## 5. GCP one-time setup docs

- [x] 5.1 Document the one-time per-project setup (enable `run.googleapis.com`, `artifactregistry.googleapis.com`, `domains.googleapis.com`, `dns.googleapis.com`; create the Artifact Registry repo; `gcloud auth configure-docker`) in `docs/deployment-runbook.md` — verify: commands run cleanly against a fresh project with billing enabled

## 6. Domain registration + mapping runbook

- [x] 6.1 Write `docs/deployment-runbook.md`'s domain section: check availability, register via Cloud Domains (console or `gcloud domains registrations register`), confirm the Cloud DNS-managed zone — verify: a reader unfamiliar with Cloud Domains can follow it to a registered domain with billing already enabled
- [x] 6.2 Document creating the two domain mappings (`gcloud run domain-mappings create --service=... --domain=... --region=...`) and adding the returned DNS records to Cloud DNS — verify: both `https://app.<domain>` and `https://api.<domain>` resolve with a valid managed TLS certificate after propagation
- [x] 6.3 Document the optional final step — re-running the portal deploy with `VITE_API_BASE_URL` pointed at `https://api.<domain>` and tightening `ALLOWED_ORIGINS` to drop the `*.run.app` origin — verify: portal network requests target the custom API domain, and a request from an origin outside the allow-list is rejected per `specs/deployment/spec.md`
- [x] 6.4 Document restricting (or rotating) the Google Maps API key's HTTP referrers to `https://app.<domain>/*` — verify: Maps still loads on the deployed domain and a request from an unrestricted origin using the same key fails in the GCP Console's usage view

## 7. Docs

- [x] 7.1 Fill in `CLAUDE.md`'s dangling "Portal demo application" section reference with what was actually built (this was already outstanding from `add-lane-query-demo` task 9.1) and add a short "Deployed at" pointer once live — verify: section exists, no dangling anchor links remain
- [ ] 7.2 After implementation, archive this change (`openspec archive add-cloud-run-deployment`) so `specs/deployment/spec.md` is synced into `openspec/specs/` — verify: `openspec/specs/deployment/spec.md` exists and matches the delta applied here
