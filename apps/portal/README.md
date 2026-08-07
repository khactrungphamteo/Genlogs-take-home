# GenLogs Portal (demo)

A React + TypeScript + Vite portal for the lane-query demo: enter an origin
and destination city and see the carriers observed moving trucks on that
lane, with an optional route map. Talks to the FastAPI backend in
[`apps/api`](../api). See the repo root [CLAUDE.md](../../CLAUDE.md) for how
this fits into the larger design.

## Setup

```bash
cd apps/portal
npm install
```

## Run

```bash
npm run dev
```

The portal is then available at `http://localhost:5173`. The backend
(`apps/api`) must be running at the URL configured by `VITE_API_BASE_URL`
(default `http://localhost:8000`) for searches to return results.

## Google Maps API key (optional)

`VITE_GOOGLE_MAPS_API_KEY` in `.env` is optional. The app runs fully with it
left blank: city fields fall back to plain text input and the map area shows
a placeholder instead of a route. Set it to a valid Google Maps JavaScript
API key (with the Places and Directions APIs enabled) to get city
autocomplete and a real route on the map.

## Test

No automated frontend tests in this demo — verify manually per
`.env` present / absent, as described in the run instructions above.

## Deploy

`deploy.sh` builds the production image (baking in the two build-time env
vars below), pushes it to Artifact Registry, and deploys it to Cloud Run:

```bash
bash deploy.sh <PROJECT_ID> <REGION> <API_URL> [GOOGLE_MAPS_API_KEY]
```

- `API_URL` — the deployed API's base URL, baked into the client bundle as
  `VITE_API_BASE_URL` (Vite inlines `import.meta.env.*` at build time, so this
  can't be changed at runtime without rebuilding).
- `GOOGLE_MAPS_API_KEY` — optional, baked in as `VITE_GOOGLE_MAPS_API_KEY`.

The root [`deploy.sh`](../../deploy.sh) deploys the API first and passes its
URL here automatically. See
[`docs/deployment-runbook.md`](../../docs/deployment-runbook.md) for the
one-time GCP setup and full deployment flow.
