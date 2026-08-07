import { useEffect, useState } from 'react';
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

interface DirectionsLayerProps {
  origin: string;
  destination: string;
  activeRouteIndex: number;
  onRoutes: (routes: google.maps.DirectionsRoute[]) => void;
  onError: () => void;
}

// Directions has no declarative wrapper in @vis.gl/react-google-maps, so it's
// built imperatively here, scoped to the <Map> instance via useMap().
function DirectionsLayer({ origin, destination, activeRouteIndex, onRoutes, onError }: DirectionsLayerProps) {
  const map = useMap();
  const routesLibrary = useMapsLibrary('routes');
  const [directionsService, setDirectionsService] = useState<google.maps.DirectionsService | null>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLibrary || !map) return;
    setDirectionsService(new routesLibrary.DirectionsService());
    setDirectionsRenderer(new routesLibrary.DirectionsRenderer({ map }));
  }, [routesLibrary, map]);

  // Re-fetch alternatives whenever the searched cities change. One active
  // renderer shows one route at a time — see the chip row below to switch
  // (design.md - Decisions: rejected overlaying all alternatives as noisy).
  useEffect(() => {
    if (!directionsService || !directionsRenderer || !origin || !destination) return;

    directionsService.route(
      {
        origin,
        destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
      },
      (result, status) => {
        if (status !== google.maps.DirectionsStatus.OK || !result) {
          onError();
          return;
        }
        directionsRenderer.setDirections(result);
        onRoutes(result.routes.slice(0, 3));
      },
    );
  }, [directionsService, directionsRenderer, origin, destination, onRoutes, onError]);

  useEffect(() => {
    directionsRenderer?.setRouteIndex(activeRouteIndex);
  }, [directionsRenderer, activeRouteIndex]);

  return null;
}

export function MapPanel({ origin, destination, mapsAvailable }: MapPanelProps) {
  const status = useApiLoadingStatus();
  const hasSearched = Boolean(origin && destination);

  const [routes, setRoutes] = useState<google.maps.DirectionsRoute[]>([]);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);

  useEffect(() => {
    setRoutes([]);
    setActiveRouteIndex(0);
    setRouteError(null);
  }, [origin, destination]);

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
            activeRouteIndex={activeRouteIndex}
            onRoutes={setRoutes}
            onError={() => setRouteError('Could not find a route between these cities.')}
          />
        )}
      </Map>
      {!hasSearched && <p className="map-panel__hint">Search a lane to see the route.</p>}
      {hasSearched && routeError && <p className="map-panel__error">{routeError}</p>}
      {hasSearched && routes.length > 1 && (
        <div className="map-panel__chips">
          {routes.map((route, index) => (
            <button
              key={route.summary || index}
              type="button"
              className={index === activeRouteIndex ? 'chip chip--active' : 'chip'}
              onClick={() => setActiveRouteIndex(index)}
            >
              {route.summary || `Route ${index + 1}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
