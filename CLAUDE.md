# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status

The repository holds design documents — [02-system-architecture.md](02-system-architecture.md)
and [03-data-model.md](03-data-model.md) (2 and 3 of a planned 8-document set —
the others are not written yet) — plus one implemented slice: the **portal demo
application** in `apps/api` and `apps/portal`. The two design documents remain
the **authoritative spec** for any implementation work in this repo; the demo
implements a narrow, mock-data subset of what they describe (see
[Current implementation scope](#current-implementation-scope) and
[Portal demo application](#portal-demo-application) below) and contradicts
neither.

The demo was built through OpenSpec — see
[Spec-Driven Development with OpenSpec](#spec-driven-development-with-openspec)
below for how to propose and apply the next change.

**03-data-model.md is at revision v2** ("storage tiering split across GCS,
Pub/Sub, and Cloud SQL") and has diverged from 02-system-architecture.md, which
was never updated to match. Doc 2's Appendix A still names Kafka/Kinesis and S3
as the queue/raw-storage tech; doc 3 v2 is explicit and GCP-specific: **Cloud
Storage (GCS)** for images, **Pub/Sub** for the interpretation message, **Cloud
SQL (PostgreSQL + PostGIS)** for resolved/derived data. Treat doc 3 v2 as
authoritative for storage technology — it is the more recent and more specific
of the two — and flag this to the user if it matters for implementation rather
than silently resolving it further.

## What this platform does

GenLogs tracks commercial trucks nationwide from roadside highway cameras and
answers one question through a web portal:

> For a given origin and destination city, which carriers move the most trucks?

Flow in one sentence: **a camera reads a DOT number off a passing truck and sends
a small record; the record is queued, matched to a carrier via the FMCSA SAFER
registry, and stored; a nightly job counts how many trucks each carrier moved
between each pair of cities; the portal reads those counts.**

**What "analyzing the image" means concretely (v2).** Each captured frame
produces one JSON message published to Pub/Sub — not a row per candidate in a
database table. The message carries a `detections` object with one **array per
signal type**: `usdot` (truck identification number — the primary identity
signal), `license_plate`, `truck_id`, `company_logo` (fallback identifier when
the USDOT number is occluded), and `equipment`. Each candidate carries its own
`raw_text`/`normalized` pair and `confidence` — OCR returns ranked candidates
(e.g. a `1234567` read at 0.962 alongside an `l234567` misread at 0.741), and
only the matcher's winning pick is later denormalized onto the `sighting` row;
the full ranked list stays in the GCS-archived JSON, not the relational
database. Do not reintroduce a per-detection database table — that's what v1
did, and v2 deliberately removed it (§8 below).

**What the SAFER integration attaches.** A confident USDOT number resolves to
a row in the `carrier` dimension (legal name, DBA, fleet size, authority
status, insurance on file, physical state), cached locally and synced from
FMCSA on a schedule (DD-5) — never a live per-sighting call. There is **no
separate `vehicle` table in v2**: plate text/state and equipment type are
denormalized directly onto `sighting` and `trip`. Cross-carrier vehicle
identity was explicitly deferred rather than half-modeled (§8).

Explicitly out of scope (per document 2): the origin/destination derivation
algorithm, computer-vision model design, and detailed API schemas.

## Architecture — five components in a line, plus a lookup table

```
Camera sites → Ingest API + queue → Matching worker → Rollup job (nightly) → Query API → Portal
                                          ↑
                                   Carrier cache (synced from FMCSA)
```

- **Camera sites** — edge inference. Detect vehicle → classify commercial vs.
  private (discard if private) → OCR the DOT number and plate, classify logo and
  equipment → blur windows → write the raw image to GCS and publish a detection
  message to Pub/Sub. Full frames never leave the device as the transported
  payload (DD-1, DD-2).
- **Ingest / queue** — Pub/Sub, with two independent subscriptions:
  `match-service` and `archive-writer`. The archive branch is not optional —
  Pub/Sub deletes a message on ack, so if the JSON isn't also durably archived
  to GCS, it's unrecoverable the moment the matcher acks it, and reprocessing
  history becomes impossible.
- **Matching worker** (`match-service` subscriber) — resolves a sighting to a
  carrier against the SCD-2 `carrier` cache in Cloud SQL. High confidence →
  resolved sighting. Low confidence → quarantined (`resolution_status`), never
  guessed (DD-7).
- **Rollup job** — nightly aggregation into `(origin_metro, dest_metro, carrier, day)`
  rows in `lane_daily`. This is the only thing reads ever touch (DD-6).
- **Query API / Portal** — resolves city names to metro IDs, reads precomputed
  rollups, returns ranked carriers **with coverage metadata** (`lane_coverage`)
  so "no trucks" and "no cameras" are never confused (DD-9).

Production container view and sequence diagrams are in Appendix A of
[02-system-architecture.md](02-system-architecture.md#appendix-a--detailed-production-architecture)
— note its queue/raw-storage tech names (Kafka/Kinesis, S3) predate data-model
v2's GCS/Pub-Sub choice; see the Status note above.

## Design decisions that must not be casually violated

These are load-bearing, not stylistic. Full rationale/costs are in document 2 §5;
this is the condensed version for implementation:

| # | Rule |
|---|---|
| DD-1 | Detection/OCR/classification run **on the camera**, not centrally. Only a structured event + evidence crop is transmitted — full frames at this volume are physically impossible to ship over cellular. |
| DD-2 | Private-vehicle frames are **discarded on the device**; windows blurred before transmission. Privacy is a structural property, not a downstream filter — there is no driver/person entity anywhere in the model, and `privacy_filter_version` travels as GCS object metadata. |
| DD-3 | Ingest and matching are **decoupled by a queue** (Pub/Sub). Ingest must stay up even when matching or the DB is slow. |
| DD-4 | Raw images and detection JSON are **immutable and kept indefinitely**, append-only. Enforced by **GCS Bucket Lock** (retention policy nothing can override, not even an admin credential) plus object versioning — not by convention. Never delete or overwrite an archived object. All Cloud SQL derived tables must be genuinely rebuildable from the archive. |
| DD-5 | FMCSA/SAFER is a **locally cached dimension** (`carrier`, SCD-2), bulk-synced on a schedule with async single-carrier lookups on cache miss. Ingestion never blocks on SAFER. Staleness is tracked (`fmcsa_last_synced_at`), never silent. |
| DD-6 | Reads **never scan raw sightings** — only the precomputed `lane_daily` rollup table, via a covering index. Writes do the aggregation once; reads stay cheap. |
| DD-7 | Match **precision over recall**. Below-threshold matches go to quarantine (`resolution_status = 'quarantined'`) with no carrier assigned, never a best-guess. A wrong carrier attribution is a false assertion about a real company (fraud/underwriting risk); a missed sighting is just marginally thinner data. |
| DD-8 | **One Cloud SQL (PostgreSQL + PostGIS) instance** holds only resolved/derived data — carrier cache, sightings, trips, rollups. No images, no raw detection JSON, no unmatched noise: those live in GCS/Pub-Sub. This is the serving layer, not the archive. No warehouse/search engine until scale forces it. |
| DD-9 | Every lane query response carries **coverage metadata** (camera count/period, from `lane_coverage`). An empty result on an unmonitored lane must never look identical to "zero carriers observed." |

## Data model (v2) — three systems, three jobs

Full schema and rationale in [03-data-model.md](03-data-model.md). v2's organizing
principle changed from "one database, three logical layers" (v1) to **one
physical system per data shape**, each chosen for how that shape is actually
used:

| Data | Shape | System | Mutability |
|---|---|---|---|
| Observation — the image | Binary, large, write-once | **GCS** | Immutable, retained forever |
| Interpretation — OCR output | Nested JSON, variable, model-versioned | **Pub/Sub** in flight → **GCS** at rest | Append-only |
| Resolution & derivation — carriers, sightings, trips, lanes | Relational, queried by users | **Cloud SQL** (PostgreSQL + PostGIS) | Rebuildable |

The relational database holds **only resolved and derived data** — it is the
serving layer, not the archive. This is a hard rule now, not a soft preference:
do not add a table to Cloud SQL to hold raw or unmatched data.

### GCS (observation layer)

- Object path encodes partitioning: `camera_id=<uuid>/dt=<date>/hour=<hh>/<event_id>.jpg`
  for images, `dt=<date>/hour=<hh>/detections-<shard>.jsonl` for archived
  detection JSON. This makes a date range a prefix scan and lets lifecycle
  rules act on whole days.
- **No `raw_image` catalogue table.** `event_id` is in the object path and on
  the `sighting` row, so the image is reachable without a separate catalogue —
  this is why v1's `raw_image` table was removed.
- Config that carries design weight: **Bucket Lock** (locked, indefinite —
  makes immutability platform-enforced, not convention), object versioning,
  lifecycle tiering **Standard → Nearline (30d) → Coldline (90d) → Archive
  (365d)**, CMEK encryption, uniform bucket-level access, and object metadata
  (`checksum`, `privacy_filter_version`, `edge_model_version`).

### Pub/Sub (interpretation layer)

- One JSON message per observed vehicle (schema in doc 3 §3) — `schema_version`
  and `edge_model_version` are tracked separately since they change on
  different schedules.
- At-least-once delivery is assumed; duplicates are certain, not hypothetical,
  which is why `event_id` uniqueness (not application dedup logic) is what
  makes redelivery a no-op.
- Two independent subscriptions (`match-service`, `archive-writer`) so
  archiving can't be starved by matcher backlog. Dead-letter topic after 5
  attempts. No ordering (sightings are independent). 7-day message retention —
  the durable copy is GCS, not Pub/Sub.

### Cloud SQL (resolution & derivation — 7 tables)

Four tables of substance, three reference tables the core can't function
without:

- **Reference:** `camera_site` (physical installation registry — needed for
  `lane_coverage`, silent-camera detection, and excluding decommissioned sites
  from historical coverage math), `metro_area` (polygon-based city→metro
  resolution; sightings are points, the portal takes city names, and doing this
  join per-sighting against an external geocoder would be millions of needless
  calls).
- **`carrier`** — the FMCSA cache, **Type-2 SCD** keyed by surrogate
  `carrier_sk` (not `usdot_number`, which is reassigned and can legitimately
  map to several historical rows). A sighting joins to the carrier version
  whose `[valid_from, valid_to)` contains its `observed_at` — never "whatever
  is current now." `EXCLUDE USING gist` on `(usdot_number, tstzrange(...))`
  enforces non-overlapping versions in the database itself; don't bypass it
  with a raw `UPDATE`. `fmcsa_last_synced_at` makes staleness queryable.
- **`sighting`** — one row per resolved observation. Carries `image_uri` and
  `detection_uri` pointing back to GCS (auditable to the actual pixels), only
  the *winning* detection candidate denormalized (`usdot_number`, `plate_text`,
  `plate_state`, `truck_unit_number`, `logo_label`, `equipment_type`),
  `match_method` (`usdot_exact` | `usdot_fuzzy` | `logo_plate` — records *how*
  identity was established, since an exact OCR read and a logo+plate inference
  are not equivalent evidence), `resolution_status` (`resolved` |
  `quarantined`), and lineage (`edge_model_version`, `resolution_version`).
  Partitioned by `observed_on`.
- **`trip`** and **`lane_daily`** — same grain and rationale as v1: trip
  segments a carrier's movement, `lane_daily` rolls up to
  `(origin_metro, dest_metro, carrier, day)` — the finest grain the product
  needs, since any window is a `SUM` over daily rows. `distinct_trucks` is
  stored per day and is **not additive across days** (`COUNT(DISTINCT)` isn't
  additive — summing it over a 90-day window double-counts a truck that ran the
  lane twice); don't "simplify" this by dropping the column and recomputing
  with `COUNT(DISTINCT)` over a date range. The covering index
  (`INCLUDE (carrier_sk, trip_count, distinct_trucks)`) answers the portal
  query from the index alone.
- **`lane_coverage`** — separate fact table of camera counts per lane per day.
  What makes DD-9 implementable: without it, a lane with zero rows is
  indistinguishable from a lane with zero cameras.

### Invariants to preserve in any implementation

- **`event_id` is deterministic**: `sha256(camera_id || observed_at || frame_seq)`.
  Never generate it randomly — idempotency is a schema property (unique
  constraint), not application logic.
- **Quarantine is a `resolution_status` value with a partial index, not a
  separate table** — avoids duplicating twenty columns and a `UNION` on every
  honest coverage query. The quarantine rate broken out by `edge_model_version`
  is a direct model/camera health signal.
- **`is_duplicate_of` marks, never deletes.** One truck crossing three cameras
  in ten minutes is one movement but three genuine observations; a partial
  index excludes duplicates from counts at no query cost.
- **Every Cloud SQL table with meaningful volume partitions by date**
  (`observed_on` / `day` / `started_on`). Backfill and reprocessing are
  partition swaps, not scattered `UPDATE`s.
- **Version columns (`resolution_version`, `derivation_version`,
  `rollup_version`) let a recomputation land beside the current one for
  comparison before promotion.** Reprocessing writes new versions; it never
  overwrites. (v2 dropped the `detection_run`/`run_id` table — the equivalent
  comparison now happens by diffing a newly written archived JSONL against the
  prior one for the same images, then promoting via `resolution_version` on
  `sighting`, not via a database run identifier.)
- **Do not recreate v1's removed tables** — `raw_image`, `detection`,
  `detection_run`, `capture_event`, `vehicle` — their responsibilities were
  deliberately moved to GCS/Pub-Sub or denormalized onto `sighting`/`trip` (see
  below).

### Changes from v1 → v2

| v1 | v2 | Reason |
|---|---|---|
| `raw_image` table | GCS object path + `image_uri` on `sighting` | Object key already encodes camera, date, event — a catalogue table duplicated it |
| `detection` + `detection_run` tables | JSON in Pub/Sub, archived to GCS | Ranked, nested, variable-length candidate lists are a document, not a relation |
| `capture_event` table | Detection message + `event_id` on `sighting` | Object + message already fully describe the observation; a third copy added write cost with no query needing it |
| `vehicle` table | `plate_text` / `plate_state` on `sighting` and `trip` | Cross-carrier vehicle identity is its own resolution problem — deferred rather than half-modeled |
| — | `lane_coverage`, `camera_site` retained | Required for DD-9; a coverage claim needs a camera registry behind it |

Net effect: **11 tables → 7** (4 of substance: `carrier`, `sighting`, `trip`,
`lane_daily`; 3 reference: `camera_site`, `metro_area`, `lane_coverage`), no
loss of capability — the data that left Cloud SQL went to a system built for
its shape.

### Retention

| Data | Location | Retention |
|---|---|---|
| Raw images | GCS, Bucket Lock, tiered Standard → Archive | Indefinite, never deleted |
| Detection JSON | GCS, partitioned JSONL | Indefinite |
| Detection messages | Pub/Sub | 7 days — transport only |
| `sighting` | Cloud SQL, partitioned | Current `resolution_version`; superseded versions pruned after promotion |
| `trip`, `lane_daily`, `lane_coverage` | Cloud SQL, partitioned | Disposable — rebuildable from the GCS archive |
| `carrier` | Cloud SQL | All versions retained (SCD-2) |

Everything in Cloud SQL below the carrier dimension can be dropped and
regenerated from Cloud Storage. Nothing in Cloud Storage can be recovered once
lost — the only tier with a hard durability requirement, which is why its
retention policy is *locked*, not merely configured.

## Non-functional targets (document 2 §6)

| Target | Value |
|---|---|
| Ingest throughput | 185 events/sec avg, 600 peak |
| Ingest availability | 99.9% (edge buffers through outages) |
| Sighting → stored | < 15 min |
| Sighting → queryable | < 24 h (one rollup cycle) |
| Lane query latency | p95 < 300 ms, served from rollups only |
| Match precision | Prioritized over recall (DD-7) |

## Current implementation scope

Per document 2 §7, only the lane-query path is meant to be built end to end for
this exercise: **database schema (Cloud SQL / PostgreSQL + PostGIS), carrier
cache/sync job shape (SAFER calls mocked), rollup job, Query API (FastAPI), and
Portal (React)**. Edge inference, the ingest pipeline (GCS + Pub/Sub), and the
matching worker are designed but not implemented — synthetic events stand in
for real camera data.

The **portal demo application** (below) is a further narrowing of that slice: it
builds the Query API + Portal pair alone, against fixture data instead of a
database. It is the runnable artifact for the take-home; the schema, sync job,
and rollup job remain designed-only unless separately requested.

## Portal demo application

What's actually implemented, in `apps/api` and `apps/portal`:

- **`apps/api`** — FastAPI service exposing `GET /lanes?origin=&destination=`.
  Backed by an in-process mock dataset (`app/mock_data.py`) shaped like the
  `lane_daily` rollup it stands in for, so the response contract doesn't
  change when a real database is put behind it. Returns a ranked carrier list
  plus `lane_coverage` metadata (DD-9), so "no trucks observed" and "no
  cameras on this lane" are distinguishable in the response. No database, no
  auth.
- **`apps/portal`** — React + TypeScript + Vite single-page app. Origin/
  destination city search against the API, with an optional Google Maps
  route view (`VITE_GOOGLE_MAPS_API_KEY`); the app runs fully with no key
  present, degrading to plain text input and a placeholder instead of a map.
- **Deployment** — both services are containerized (`Dockerfile` in each app)
  and deployable to Cloud Run via `deploy.sh` (per-app scripts plus an
  orchestrating root [`deploy.sh`](deploy.sh)), with CORS restricted to
  configured origins via `ALLOWED_ORIGINS`. See
  [`docs/deployment-runbook.md`](docs/deployment-runbook.md) for the full
  one-time GCP setup, deploy, and custom-domain-mapping flow.
- **Deployed at** — not yet deployed; the runbook's manual, account-bound
  steps (GCP project/billing selection, domain registration, running
  `deploy.sh` against a live project) have not been run yet. Fill in the live
  URL here once `./deploy.sh` has been run against a real project.