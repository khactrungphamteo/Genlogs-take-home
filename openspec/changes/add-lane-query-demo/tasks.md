## 1. API — project setup

- [x] 1.1 Scaffold `apps/api/pyproject.toml` with fastapi, uvicorn, pydantic
      (v2), pytest, httpx as dependencies — verify: `uvicorn app.main:app` boots
- [x] 1.2 Add `apps/api/README.md` with run instructions (`uvicorn`, `pytest`)
      — verify: instructions work on a fresh clone

## 2. API — mock data and matching

- [x] 2.1 Implement `apps/api/app/schemas.py` with `CarrierLaneStat` and
      `LaneQueryResponse` Pydantic models (plain carrier list only, no
      coverage object), field names lifted from `carrier`/`lane_daily` in
      `03-data-model.md` §4.4 — verify: models import and
      `LaneQueryResponse.model_json_schema()` succeeds
- [x] 2.2 Implement `apps/api/app/city_matching.py`: `normalize()`,
      `CITY_ALIASES` (nyc/dc/sf/la), `resolve_city_key()`, directional-only
      matching — verify: unit tests below pass
- [x] 2.3 Write `apps/api/tests/test_city_matching.py` covering
      normalization (case/punctuation/whitespace/trailing "USA"), all
      documented alias variants for each of the 4 cities, and unrecognized
      city returning `None` — verify: `pytest apps/api/tests/test_city_matching.py` green
- [x] 2.4 Implement `apps/api/app/mock_data.py`: NYC→DC lane (Knight-Swift 10,
      J.B. Hunt 7, YRC 5), SF→LA lane (XPO 9, Schneider 6, Landstar 2),
      fallback (UPS Inc. 11) — plain carrier name + trucks/day per entry, no
      coverage fields — verify: manual read-through matches proposal.md's
      confirmed carrier/day figures exactly

## 3. API — endpoint

- [x] 3.1 Implement `GET /lanes` in `apps/api/app/main.py`: required
      `origin`/`destination` query params, `min_length=1`, whitespace-only
      rejected after `.strip()` → 422, same-resolved-city → 400, otherwise
      look up known lane or fallback and return `LaneQueryResponse` — verify:
      manual curl against all three lane branches
- [x] 3.2 Add `CORSMiddleware` allowing the Vite dev origin — verify: browser
      fetch from `localhost:5173` to `localhost:8000/lanes` succeeds with no
      CORS error
- [x] 3.3 Write `apps/api/tests/test_lanes.py` covering: NYC→DC exact ordered
      list, SF→LA exact ordered list, reverse-of-known-lane falls back,
      unrelated city pair falls back to UPS-only, missing/empty/
      whitespace-only city → 422, same city (incl. via different aliases) →
      400, case/whitespace insensitivity — verify: `pytest apps/api/tests`
      all green

## 4. Portal — project setup

- [ ] 4.1 Scaffold `apps/portal` with Vite + React + TypeScript — verify:
      `npm run dev` serves a blank page with no console errors
- [ ] 4.2 Add `apps/portal/.env.example` with `VITE_GOOGLE_MAPS_API_KEY=` and
      `VITE_API_BASE_URL=http://localhost:8000`, and `apps/portal/README.md`
      noting the app runs fully (degraded map) with the Maps key left blank
      — verify: fresh clone + `npm install` + `npm run dev` works with
      `.env` absent

## 5. Portal — data layer

- [ ] 5.1 Implement `apps/portal/src/types.ts` mirroring
      `apps/api/app/schemas.py` field-for-field — verify: manual diff against
      the Pydantic models
- [ ] 5.2 Implement `apps/portal/src/api.ts`: `fetchLanes(origin, destination)`
      against `VITE_API_BASE_URL`, with distinct error types for 422/400/
      network failure — verify: manual checks against the running backend for
      a 200, a 422, a 400, and the backend stopped

## 6. Portal — Google Maps integration

- [ ] 6.1 Implement `apps/portal/src/googleMaps.ts` (`useGoogleMaps()` hook):
      returns `unavailable` immediately when `VITE_GOOGLE_MAPS_API_KEY` is
      unset (no network call), lazily loads the Maps JS API + Places library
      when a key is present, and listens for `gm_authFailure` to degrade a
      bad key identically to no key — verify: app runs with `.env` absent and
      with a deliberately invalid key, in both cases with no thrown errors
- [ ] 6.2 Implement `apps/portal/src/components/CityInput.tsx`: attaches
      `google.maps.places.Autocomplete` (`types: ["(cities)"]`) when
      `useGoogleMaps()` is ready, otherwise a plain controlled text input with
      the same `onChange` contract — verify manual: typing works both with
      and without a configured key
- [ ] 6.3 Implement `apps/portal/src/components/CityInputPair.tsx`: two
      `CityInput`s (From/To) + Search button, disabled while either field is
      blank or both trim/lowercase to the same value — verify manual: button
      enabled/disabled states match input content
- [ ] 6.4 Implement `apps/portal/src/components/MapPanel.tsx`: on search,
      calls `DirectionsService.route({ provideRouteAlternatives: true })`,
      renders up to the first 3 returned routes via one active
      `DirectionsRenderer` with a chip row to switch between them; renders a
      static placeholder naming the two typed cities when Maps is
      unavailable — verify manual: routes render with a valid key, placeholder
      renders without one, no crash either way

## 7. Portal — results display

- [ ] 7.1 Implement `apps/portal/src/components/CarrierListPanel.tsx`: plain
      ranked carrier rows (`legal_name` — `trip_count` trucks/day), no
      coverage indicator — verify manual: rows match the mock data for each
      of the three response branches

## 8. Portal — orchestration

- [ ] 8.1 Implement `apps/portal/src/App.tsx`: `idle | loading | success |
      error` state machine wiring `CityInputPair`, `MapPanel`, and
      `CarrierListPanel` together via `fetchLanes`; on failure, shows a retry
      option instead of a blank page — verify manual: all four states
      reachable (fresh load, mid-search, successful result, backend stopped)

## 9. Docs

- [ ] 9.1 Fill in CLAUDE.md's referenced "Portal demo application" section
      describing what was built and how to run it — verify: section exists
      and matches the actual run commands in both READMEs
- [ ] 9.2 After implementation, archive this change (`openspec archive
      add-lane-query-demo`) so `specs/lane-query/spec.md` is synced into
      `openspec/specs/` — verify: `openspec/specs/lane-query/spec.md` exists
      and matches the delta applied here
