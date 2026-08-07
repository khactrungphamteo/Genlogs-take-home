## Why

The design docs (02-system-architecture.md, 03-data-model.md) specify a
lane-query platform but nothing runnable exists yet — `apps/api` and
`apps/portal` are empty. This change builds the one path document 2 §7 calls
out as worth building end to end: a Query API plus a Portal, backed by mock
data, so the product's central claim ("who moves the most trucks on this
lane") can actually be demonstrated.

## What Changes

- Add `apps/api`: a FastAPI service exposing `GET /lanes?origin=&destination=`,
  returning a plain ranked list of carriers for a city pair, served from an
  in-process mock dataset (no database, no coverage metadata).
- Add `apps/portal`: a single-page React + TypeScript + Vite app with an
  origin/destination city search (Google Places Autocomplete when a Maps API
  key is present, plain text input otherwise), a Search action, an embedded
  route map (Google Directions, up to 3 alternative routes), and a carrier
  list.
- Both apps are new; nothing existing is modified or removed.

## Capabilities

### New Capabilities
- `lane-query`: resolving an origin/destination city pair to a plain ranked
  list of carriers, and the portal experience for searching a lane and
  viewing the result (city input, route map, carrier list).

### Modified Capabilities
- (none — no existing specs in this repo)

## Impact

- **New code**: `apps/api/app/{main,schemas,city_matching,mock_data}.py`,
  `apps/api/tests/`, `apps/portal/src/**`.
- **APIs**: one new endpoint, `GET /lanes`, matching the route/verb documented
  in `02-system-architecture.md` §4.
- **Dependencies**: FastAPI, Pydantic v2, uvicorn, pytest (backend); React 18,
  TypeScript, Vite, `@googlemaps/js-api-loader` (frontend).
- **Design decisions honoured**:
  - **DD-6** (reads never scan raw sightings, only a precomputed rollup) — the
    endpoint reads from a static `mock_data.py` lookup table, never aggregates
    at request time, so the API always behaves like it's reading a rollup.
  - Carrier field names (`carrier_sk`, `legal_name`, `trip_count`) are lifted
    directly from `carrier` / `lane_daily` in `03-data-model.md` §4.4 where
    sensible, even though this change returns them as a plain list with no
    aggregation or coverage metadata attached.

## Non-goals

The following remain designed-only per `02-system-architecture.md` §7 and are
untouched by this change:

- Edge inference / camera capture (DD-1, DD-2)
- Ingest API, GCS raw-image storage, Pub/Sub messaging (DD-3, DD-4)
- Matching worker and the FMCSA/SAFER sync job (DD-5, DD-7)
- The nightly rollup job — this change hardcodes its output instead of
  computing it
- Cloud SQL / PostgreSQL + PostGIS (DD-8) — there is no database in this
  change; all data is an in-process mock module
- PostGIS metro-boundary geocoding — city resolution here is alias/string
  matching against a small fixed set, not a polygon join, and `metro_id` is
  stood in for by a mock `city_key`
- Authentication, entitlements, pagination, and rate limiting
- **DD-9 coverage metadata and `lane_coverage`** — by explicit instruction,
  `GET /lanes` returns a plain carrier list only (name + trucks/day), with no
  `coverage`/`camera_count`/`is_low_coverage` object and no portal coverage
  banner. This is a deliberate simplification for this demo and departs from
  `openspec/config.yaml`'s stated convention that DD-9 "must survive into the
  mock implementation" — flagged here rather than silently dropped.
- The two pre-existing empty worktrees (`.trees/query-api-feature`,
  `.trees/react-portal-feature`) — this change targets `apps/api` and
  `apps/portal` on `main` directly
