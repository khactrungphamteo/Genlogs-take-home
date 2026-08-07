# GenLogs Lane-Query API (demo)

A FastAPI service exposing `GET /lanes?origin=&destination=`, returning a
plain ranked list of carriers observed moving trucks on that lane. Backed by
an in-process mock dataset — no database. See the repo root
[CLAUDE.md](../../CLAUDE.md) for how this fits into the larger design.

## Setup

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate      # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -e ".[dev]"
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

The API is then available at `http://localhost:8000`. Interactive docs at
`http://localhost:8000/docs`.

## Test

```bash
pytest
```

## Example

```bash
curl "http://localhost:8000/lanes?origin=New+York+City&destination=Washington+DC"
```

## Deploy

`deploy.sh` builds the container, pushes it to Artifact Registry, and deploys
it to Cloud Run:

```bash
bash deploy.sh <PROJECT_ID> <REGION> [ALLOWED_ORIGINS]
```

`ALLOWED_ORIGINS` is a comma-separated list of origins allowed to make
cross-origin requests to the API (defaults to `http://localhost:5173` when
omitted). In deployment this should be set to the portal's Cloud Run URL —
the root [`deploy.sh`](../../deploy.sh) handles this automatically when
deploying both services together. See
[`docs/deployment-runbook.md`](../../docs/deployment-runbook.md) for the
one-time GCP setup and full deployment flow.
