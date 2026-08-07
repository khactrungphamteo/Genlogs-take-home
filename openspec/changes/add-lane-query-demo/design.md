## Context

`apps/api` and `apps/portal` are empty; nothing to integrate with. See
`proposal.md` - Why for motivation and Non-goals for what's deliberately
excluded. `openspec/config.yaml` pins the tech stack (FastAPI/Pydantic v2 for
`apps/api`; React 18 + TS + Vite + Google Maps JS API for `apps/portal`) and
the hard constraint that the portal must run with no Google Maps API key
present, degrading rather than crashing.

## Goals / Non-Goals

**Goals:**
- A single `GET /lanes` endpoint returning a plain ranked carrier list, whose
  carrier field names mirror `carrier` / `lane_daily` closely enough that a
  real database could sit behind the same contract later.
- A portal that degrades gracefully (plain input, static map placeholder)
  when no Google Maps API key is configured or a key fails, rather than
  branching behavior unpredictably per component.

**Non-Goals:**
- Forcing exactly 3 routes back from the Directions API — Google returns
  however many alternatives it computes; the UI takes up to 3 without
  padding.
- Truck-specific routing (weight/height restrictions) — the standard Maps JS
  Directions API has no consumer-facing truck mode; `DRIVING` is used.
- Any persistence, auth, or pagination — this is a stateless demo endpoint.
- DD-9 coverage metadata / `lane_coverage` — by explicit instruction, the
  response is a plain carrier list with no `coverage` object, and the portal
  has no coverage banner (see proposal.md - Non-goals).

## Decisions

**Endpoint shape: `GET /lanes?origin=&destination=`.** Matches the route and
verb documented in `02-system-architecture.md` §4 exactly, so the mock's
contract is the same one the production design already specifies — nothing
invented.

**Validation split: 422 for shape, 400 for the domain rule.** Missing, empty,
or whitespace-only `origin`/`destination` are 422 (FastAPI's native
required/shape validation lane). Origin and destination resolving to the
same city is a domain-level rule, not a shape problem, so it's a distinct 400.
Alternative considered: treat same-city as 422 too — rejected because it
conflates "malformed request" with "well-formed but semantically invalid
request," which a consumer needs to distinguish to react correctly.

**City resolution: alias/string matching, not geocoding.** `metro_area`'s
PostGIS polygon join is explicitly out of scope (proposal Non-goals). Instead,
input is normalized (lowercased, punctuation stripped, trailing "USA"/"United
States" dropped) and matched against a small fixed alias set for the four
cities this demo cares about (NYC, DC, SF, LA). This has to tolerate both
casual text ("nyc") and Google Places' canonical formatted address ("New
York, NY, USA") because the portal always sends whatever string is currently
in the field, regardless of whether it came from a picked suggestion or free
typing (see portal decision below) — one input shape, not two.

**Matching is directional, matching `lane_daily`'s primary key.**
`lane_daily`'s grain is `(origin_metro_id, dest_metro_id, carrier_sk, day)` —
directional. So Washington DC → New York City is treated as a *different,
unmodeled* lane from New York City → Washington DC, falling to the fallback
carrier rather than reusing the NYC→DC list. This mirrors the real schema's
behavior rather than being an oversight; it's covered by an explicit test.

**Portal always sends the plain string, never a Places `place_id`.** If
`place_id` were sent when a Maps key happens to be present and a raw string
otherwise, the backend would face two different request contracts depending
on frontend configuration it doesn't control. Sending one consistent shape
(whatever text is currently in the field) keeps the API contract independent
of whether Maps loaded successfully at runtime, at the cost of the backend
needing tolerant string matching (see above) rather than an exact ID lookup.

**Single source of truth for Maps availability.** A single load-state check
(available / unavailable / failed) gates both the autocomplete behavior and
the map rendering, rather than each component independently checking for an
API key. This avoids two different components disagreeing about whether Maps
is usable, and avoids double-loading the Maps script.

**Route rendering: one active route + alternatives list, not overlapping
renderers.** Requesting `provideRouteAlternatives: true` from Directions and
rendering all returned routes as simultaneous overlaid lines on one map was
considered and rejected as visually noisy for a demo; instead one route
renders at a time with a way to switch between the returned alternatives.

## Risks / Trade-offs

- **[Risk]** Alias matching only recognizes four cities by name/abbreviation
  → any city outside that set (even a real, sensible city) hits the fallback.
  **Mitigation:** this is the explicitly confirmed, intended behavior for
  this demo (see proposal.md); not something to "fix" without a scope change.
- **[Risk]** Directions API may return 0-2 alternatives for some corridors,
  not always 3. **Mitigation:** UI takes up to 3 without padding or implying
  a fixed count; documented as a non-goal above.
- **[Risk]** A bad/expired Google Maps API key surfaces as an async
  `gm_authFailure` callback rather than a normal fetch error. **Mitigation:**
  the single load-state source of truth listens for that callback and treats
  it identically to "no key configured."
- **[Trade-off]** CORS is wide open (`allow_origins=["*"]`) for local dev
  simplicity; not something to carry into a non-demo deployment.
