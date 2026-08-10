import { useCallback, useEffect, useState } from 'react';
import {
  APILoadingStatus,
  Map,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';

interface MapPanelProps {
  origin: string;
  destination: string;
  mapsAvailable: boolean;
}

const US_CENTER = { lat: 39.8283, lng: -98.5795 };

const MAX_ROUTES = 3;

// `provideRouteAlternatives` is a hint, not a guarantee: on corridors that one
// interstate dominates (NYC->DC, SF->LA) Google returns a single route no
// matter how it's asked. Asking the same lane three ways and merging is what
// reliably produces three distinct options. Costs 3 Directions requests per
// search — 6 in dev, where StrictMode double-invokes the effect.
const ROUTE_VARIANTS: ReadonlyArray<{
  tag: string | null;
  options: Pick<google.maps.DirectionsRequest, 'avoidTolls' | 'avoidHighways'>;
}> = [
  { tag: null, options: {} },
  { tag: 'avoids tolls', options: { avoidTolls: true } },
  { tag: 'avoids highways', options: { avoidHighways: true } },
];

interface RouteEntry {
  // Stable identity for React keys, selection, and dedupe.
  key: string;
  // The response this route came from — routes now span three separate
  // DirectionsResults, and the renderer needs the matching one.
  result: google.maps.DirectionsResult;
  routeIndex: number;
  route: google.maps.DirectionsRoute;
  tag: string | null;
  durationSec: number;
}

function routeDurationSec(route: google.maps.DirectionsRoute): number {
  const legs = route.legs ?? [];
  // ?? 0 means a route with missing duration data sorts first (as if
  // instantaneous), not last — acceptable for this demo's edge cases.
  return legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);
}

// Two variants often return the same physical corridor (SF->LA yields 5 routes
// but only 4 distinct ones), so identical geometry has to collapse before the
// top 3 is taken — otherwise a duplicate eats one of the three slots.
function routeDedupeKey(route: google.maps.DirectionsRoute, durationSec: number): string {
  if (typeof route.overview_polyline === 'string' && route.overview_polyline) {
    return route.overview_polyline;
  }
  const legs = route.legs ?? [];
  const meters = legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
  return `${route.summary ?? ''}|${durationSec}|${meters}`;
}

function routeLabel(entry: RouteEntry, positionNumber: number): string {
  const legs = entry.route.legs ?? [];
  const parts = [entry.route.summary].filter(Boolean);
  // Distinct routes can share a summary — NYC->DC returns two different paths
  // both called "I-95 S" — so the variant tag is what tells them apart.
  if (entry.tag) parts.push(entry.tag);
  // Every route in this app has exactly one leg (no waypoints are ever
  // passed); the length check is defensive, not expected to trigger.
  if (legs.length === 1 && legs[0].duration?.text && legs[0].distance?.text) {
    parts.push(legs[0].duration.text, legs[0].distance.text);
  }
  return parts.length ? parts.join(' · ') : `Route ${positionNumber}`;
}

interface DirectionsLayerProps {
  origin: string;
  destination: string;
  activeEntry: RouteEntry | null;
  onRoutes: (entries: RouteEntry[]) => void;
  onError: () => void;
}

// Directions has no declarative wrapper in @vis.gl/react-google-maps, so it's
// built imperatively here, scoped to the <Map> instance via useMap().
function DirectionsLayer({ origin, destination, activeEntry, onRoutes, onError }: DirectionsLayerProps) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLibrary || !map) return;
    const service = new routesLibrary.DirectionsService();
    const renderer = new routesLibrary.DirectionsRenderer({ map });
    setDirectionsService(service);
    setDirectionsRenderer(renderer);
    // Without this, StrictMode's mount -> cleanup -> mount leaves an orphaned
    // renderer permanently attached to the map in dev.
    return () => renderer.setMap(null);
  }, [routesLibrary, map]);

  useEffect(() => {
    if (!directionsService || !origin || !destination) return;

    // Three requests are in flight at once and a newer search can start before
    // they settle; cleanup flips this so stale responses never land.
    let current = true;

    void Promise.allSettled(
      ROUTE_VARIANTS.map((variant) =>
        directionsService
          .route({
            origin,
            destination,
            travelMode: google.maps.TravelMode.DRIVING,
            provideRouteAlternatives: true,
            ...variant.options,
          })
          .then((result) => ({ variant, result })),
      ),
    ).then((settled) => {
      if (!current) return;

      // A variant that comes back empty is skipped, not fatal — the other two
      // still have routes to offer.
      const pool: RouteEntry[] = [];
      for (const outcome of settled) {
        if (outcome.status !== 'fulfilled') continue;
        const { variant, result } = outcome.value;
        result.routes.forEach((route, routeIndex) => {
          const durationSec = routeDurationSec(route);
          pool.push({
            key: routeDedupeKey(route, durationSec),
            result,
            routeIndex,
            route,
            tag: variant.tag,
            durationSec,
          });
        });
      }

      if (!pool.length) {
        onError();
        return;
      }

      pool.sort((a, b) => a.durationSec - b.durationSec);

      const seen = new Set<string>();
      const fastestFirst: RouteEntry[] = [];
      for (const entry of pool) {
        if (seen.has(entry.key)) continue;
        seen.add(entry.key);
        fastestFirst.push(entry);
        if (fastestFirst.length === MAX_ROUTES) break;
      }

      onRoutes(fastestFirst);
    });

    return () => {
      current = false;
    };
  }, [directionsService, origin, destination, onRoutes, onError]);

  // setRouteIndex only indexes within a single DirectionsResult, so switching
  // between routes that came from different variants needs setDirections too.
  useEffect(() => {
    if (!directionsRenderer || !activeEntry) return;
    directionsRenderer.setDirections(activeEntry.result);
    directionsRenderer.setRouteIndex(activeEntry.routeIndex);
  }, [directionsRenderer, activeEntry]);

  return null;
}

export function MapPanel({ origin, destination, mapsAvailable }: MapPanelProps) {
  const status = useApiLoadingStatus();
  const hasSearched = Boolean(origin && destination);

  const [routes, setRoutes] = useState<RouteEntry[]>([]);
  const [activeRouteKey, setActiveRouteKey] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    setRoutes([]);
    setActiveRouteKey(null);
    setRouteError(null);
  }, [origin, destination]);

  const handleRoutes = useCallback((entries: RouteEntry[]) => {
    setRoutes(entries);
    // Entries arrive fastest-first, so the fastest route is what gets selected.
    setActiveRouteKey(entries[0]?.key ?? null);
    setRouteError(null);
  }, []);

  const handleError = useCallback(() => {
    setRoutes([]);
    setActiveRouteKey(null);
    setRouteError('Could not find a route between these cities.');
  }, []);

  const activeEntry = routes.find((entry) => entry.key === activeRouteKey) ?? null;

  const loadFailed =
    !mapsAvailable ||
    status === APILoadingStatus.FAILED ||
    status === APILoadingStatus.AUTH_FAILURE;

  if (loadFailed) {
    return (
      <div className="map-panel map-panel--placeholder">
        <p>
          {hasSearched ? (
            <>
              Map unavailable — route from {origin} to {destination}
            </>
          ) : (
            'Map unavailable.'
          )}
        </p>
      </div>
    );
  }

  if (status !== APILoadingStatus.LOADED) {
    return (
      <div className="map-panel map-panel--placeholder">
        <p>Loading map…</p>
      </div>
    );
  }

  return (
    <div className="map-panel">
      <Map className="map-panel__map" defaultCenter={US_CENTER} defaultZoom={4}>
        {hasSearched && (
          <DirectionsLayer
            origin={origin}
            destination={destination}
            activeEntry={activeEntry}
            onRoutes={handleRoutes}
            onError={handleError}
          />
        )}
      </Map>
      {!hasSearched && <p className="map-panel__hint">Search a lane to see the route.</p>}
      {hasSearched && routeError && <p className="map-panel__error">{routeError}</p>}
      {hasSearched && routes.length > 0 && (
        <div className="map-panel__chips">
          {routes.map((entry, position) => (
            <button
              key={entry.key}
              type="button"
              className={entry.key === activeRouteKey ? 'chip chip--active' : 'chip'}
              aria-pressed={entry.key === activeRouteKey}
              onClick={() => setActiveRouteKey(entry.key)}
            >
              {routeLabel(entry, position + 1)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
