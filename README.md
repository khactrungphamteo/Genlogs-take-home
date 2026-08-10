# GenLogs — Lane Query Platform

GenLogs tracks commercial trucks nationwide from roadside highway cameras and
answers one question through a web portal:

> For a given origin and destination city, which carriers move the most trucks?

Flow in one sentence: **a camera reads a DOT number off a passing truck and
sends a small record; the record is queued, matched to a carrier via the FMCSA
SAFER registry, and stored; a nightly job counts how many trucks each carrier
moved between each pair of cities; the portal reads those counts.**

## Status

This repository holds two design documents and one implemented slice:

| Artifact | What it is |
|---|---|
| [02-system-architecture.md](02-system-architecture.md) | Document 2 of a planned 8 — component decomposition, ingest/query flows, and the 9 numbered design decisions (DD-1..DD-9) with cost/tradeoff for each |
| [03-data-model.md](03-data-model.md) | Document 3 of a planned 8, revision v2 — schema and rationale for the GCS / Pub-Sub / Cloud SQL split |
| [`apps/api`](apps/api) + [`apps/portal`](apps/portal) | The **portal demo application** — a FastAPI + React implementation of the lane-query path against fixture data, the runnable artifact for this exercise |

The two design documents are the **authoritative spec**; the demo implements a
narrow, mock-data subset of what they describe and contradicts neither. See
[CLAUDE.md](CLAUDE.md) for the full narrative (including a noted divergence
between doc 2's Appendix A and doc 3 v2 on queue/storage technology, resolved
in favor of doc 3 v2 as the more recent and specific).

## Architecture — five components in a line, plus a lookup table

```
Camera sites → Ingest API + queue → Matching worker → Rollup job (nightly) → Query API → Portal
                                          ↑
                                   Carrier cache (synced from FMCSA)
```

- **Camera sites** — edge inference: detect vehicle, classify commercial vs.
  private (discard if private), OCR the DOT number and plate, classify logo and
  equipment, blur windows, publish a detection message (DD-1, DD-2).
- **Ingest / queue** — Pub/Sub, with independent `match-service` and
  `archive-writer` subscriptions so archiving is never starved by matcher
  backlog (DD-3, DD-4).
- **Matching worker** — resolves a sighting to a carrier against the SCD-2
  `carrier` cache. High confidence → resolved sighting; low confidence →
  quarantined, never guessed (DD-7).
- **Rollup job** — nightly aggregation into `(origin_metro, dest_metro, carrier, day)`
  rows in `lane_daily`, the only table reads ever touch (DD-6).
- **Query API / Portal** — resolves city names to metro IDs, reads precomputed
  rollups, returns ranked carriers **with coverage metadata** so "no trucks"
  and "no cameras" are never confused (DD-9).

Full component diagrams, sequence flows, and the reasoning behind each design
decision are in [02-system-architecture.md](02-system-architecture.md).

## Data model — three systems, three jobs

| Data | Shape | System | Mutability |
|---|---|---|---|
| Observation — the image | Binary, large, write-once | **GCS** | Immutable, retained forever |
| Interpretation — OCR output | Nested JSON, variable, model-versioned | **Pub/Sub** in flight → **GCS** at rest | Append-only |
| Resolution & derivation — carriers, sightings, trips, lanes | Relational, queried by users | **Cloud SQL** (PostgreSQL + PostGIS) | Rebuildable |

The relational database holds **only resolved and derived data** — 4 tables of
substance (`carrier`, `sighting`, `trip`, `lane_daily`), a triage table
(`sighting_quarantine`), and 3 reference tables (`camera_site`, `metro_area`,
`lane_coverage`). Full schema, `EXCLUDE`/index rationale, and the v1 → v2
table removals are in [03-data-model.md](03-data-model.md).

## Current implementation scope

Per doc 2 §7, only the lane-query path is built end to end for this exercise:
database schema, carrier cache/sync job shape (SAFER mocked), rollup job,
Query API, and Portal. Edge inference, the ingest pipeline, and the matching
worker are designed but not implemented — synthetic events stand in for real
camera data.

The **portal demo application** narrows that further: it builds only the
Query API + Portal pair, against fixture data instead of a database.

## Repository layout

```
02-system-architecture.md   Design doc 2 — architecture, flows, DD-1..DD-9
03-data-model.md            Design doc 3 (v2) — GCS / Pub-Sub / Cloud SQL schema
CLAUDE.md                   Full narrative context for the demo and its scope
apps/
  api/                       FastAPI service — GET /lanes?origin=&destination=
  portal/                    React + TypeScript + Vite single-page app
docs/
  deployment-runbook.md       One-time GCP setup, deploy, custom domain mapping
openspec/                   Spec-driven change proposals (see below)
deploy.sh                    Orchestrates deploying both apps to Cloud Run
```

## Portal demo application

- **[`apps/api`](apps/api)** — FastAPI service exposing
  `GET /lanes?origin=&destination=`. Backed by an in-process mock dataset
  shaped like the `lane_daily` rollup it stands in for. Returns a ranked
  carrier list plus `lane_coverage` metadata (DD-9). No database, no auth.
- **[`apps/portal`](apps/portal)** — React + TypeScript + Vite single-page
  app. Origin/destination city search against the API, with an optional
  Google Maps route view; runs fully with no API key present.

### Run it locally

```bash
# API
cd apps/api
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Portal (separate shell)
cd apps/portal
npm install
npm run dev
```

API: `http://localhost:8000` (docs at `/docs`). Portal: `http://localhost:5173`.
See each app's own README ([apps/api](apps/api/README.md),
[apps/portal](apps/portal/README.md)) for tests and environment variables.

### Deploy

Both services are containerized and deployable to Cloud Run:

```bash
./deploy.sh <PROJECT_ID> <REGION> [GOOGLE_MAPS_API_KEY]
```

This deploys the API first, bakes its URL into the portal build, then updates
the API's `ALLOWED_ORIGINS` to the portal's deployed origin. See
[docs/deployment-runbook.md](docs/deployment-runbook.md) for one-time GCP
project setup and custom domain mapping.

**Deployed at** — not yet published here; fill in the live URL once
`./deploy.sh` has been run against a real project.

## Spec-driven development with OpenSpec

Changes to this repo are proposed and applied through
[OpenSpec](openspec/config.yaml) — see [openspec/changes](openspec/changes)
for the proposals (`add-lane-query-demo`, `add-cloud-run-deployment`) that
produced the current demo, each with a `proposal.md`, `design.md`, `tasks.md`,
and delta spec.

## Prompts and rules used in this project

This repo was built with an AI coding assistant driven through the OpenSpec
workflow below, rather than free-form prompting. Every change went through the
same slash-commands, against the same set of rules, so the artifacts stay
consistent across changes.

### Workflow prompts (`.claude/commands/opsx`)

| Command | Purpose |
|---|---|
| `/opsx:explore` | Thinking-only mode — investigate the codebase and design docs, clarify requirements. Never writes code. |
| `/opsx:propose` | Create a new change and generate all of its artifacts (`proposal.md`, `design.md`, `specs/<capability>/spec.md`, `tasks.md`) in one step. |
| `/opsx:update` | Revise an existing change's planning artifacts and keep them coherent with each other. Never edits code. |
| `/opsx:apply` | Implement the tasks in an approved change's `tasks.md` against the actual codebase. |
| `/opsx:sync` | Merge a change's delta specs into the main `openspec/specs/` tree without archiving. |
| `/opsx:archive` | Archive a change once its implementation is complete and merged into main specs. |

Each command's full instructions live alongside it in
[.claude/commands/opsx](.claude/commands/opsx) (and as reusable skills in
[.claude/skills](.claude/skills)). Both `add-lane-query-demo` and
`add-cloud-run-deployment` were produced by `/opsx:propose` followed by
`/opsx:apply`.

### Rules the assistant had to follow (`openspec/config.yaml`)

Every proposal, spec, and task list generated in this repo is checked against
the same rules, defined once in [openspec/config.yaml](openspec/config.yaml):

- **Proposals** must state which numbered design decisions (DD-n, see below)
  the change touches and how it honors them, and must include a "Non-goals"
  section naming any designed-only components the change deliberately leaves
  out.
- **Specs** must be written from the portal user's or API consumer's point of
  view, and every requirement must carry at least one scenario, including the
  empty/unknown case (e.g. an unmonitored lane).
- **Tasks** must be grouped by deliverable (API, portal, docs) and each task
  must be independently verifiable.
- Mock data must stay shaped like the `lane_daily` rollup it stands in for, so
  the API contract doesn't change when a real database replaces it, and the
  app must run with no Google Maps API key present (degrade, never crash).

