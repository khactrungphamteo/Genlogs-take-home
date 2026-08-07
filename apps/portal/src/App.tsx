import { useCallback, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import './App.css';
import { CityInputPair } from './components/CityInputPair';
import { MapPanel } from './components/MapPanel';
import { CarrierListPanel } from './components/CarrierListPanel';
import { fetchLanes, InvalidLaneError, NetworkError, ValidationError } from './api';
import type { CarrierLaneStat } from './types';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

type LaneState =
  | { status: 'idle' }
  | { status: 'loading'; origin: string; destination: string }
  | { status: 'success'; origin: string; destination: string; carriers: CarrierLaneStat[] }
  | { status: 'error'; origin: string; destination: string; message: string };

function App() {
  const [state, setState] = useState<LaneState>({ status: 'idle' });

  const runSearch = useCallback(async (origin: string, destination: string) => {
    setState({ status: 'loading', origin, destination });
    try {
      const response = await fetchLanes(origin, destination);
      setState({ status: 'success', origin, destination, carriers: response.carriers });
    } catch (err) {
      const message =
        err instanceof ValidationError || err instanceof InvalidLaneError || err instanceof NetworkError
          ? err.message
          : 'Something went wrong. Please try again.';
      setState({ status: 'error', origin, destination, message });
    }
  }, []);

  const mapOrigin = state.status === 'idle' ? '' : state.origin;
  const mapDestination = state.status === 'idle' ? '' : state.destination;

  const content = (
    <div className="app">
      <div className="app__card">
        <header className="app__header">
          <h1>GenLogs Platform</h1>
        </header>

        <CityInputPair onSearch={runSearch} disabled={state.status === 'loading'} />

        <div className="app__results">
          <MapPanel
            origin={mapOrigin}
            destination={mapDestination}
            mapsAvailable={Boolean(GOOGLE_MAPS_API_KEY)}
          />

          <div className="app__carriers">
            {state.status === 'idle' && (
              <p className="app__hint">Enter an origin and destination, then search.</p>
            )}
            {state.status === 'loading' && <p className="app__hint">Searching…</p>}
            {state.status === 'success' && <CarrierListPanel carriers={state.carriers} />}
            {state.status === 'error' && (
              <div className="app__error" role="alert">
                <p>{state.message}</p>
                <button type="button" onClick={() => runSearch(state.origin, state.destination)}>
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return GOOGLE_MAPS_API_KEY ? (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>{content}</APIProvider>
  ) : (
    content
  );
}

export default App;
