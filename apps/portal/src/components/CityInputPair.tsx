import { useState, type FormEvent } from 'react';
import { CityInput } from './CityInput';

interface CityInputPairProps {
  onSearch: (origin: string, destination: string) => void;
  disabled?: boolean;
}

export function CityInputPair({ onSearch, disabled }: CityInputPairProps) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  const trimmedOrigin = origin.trim();
  const trimmedDestination = destination.trim();
  const isSameCity =
    trimmedOrigin !== '' && trimmedOrigin.toLowerCase() === trimmedDestination.toLowerCase();
  const canSearch = trimmedOrigin !== '' && trimmedDestination !== '' && !isSameCity;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSearch || disabled) return;
    onSearch(trimmedOrigin, trimmedDestination);
  }

  return (
    <form className="city-input-pair" onSubmit={handleSubmit}>
      <CityInput
        id="origin"
        label="From"
        value={origin}
        onChange={setOrigin}
        placeholder="e.g. New York City"
      />
      <CityInput
        id="destination"
        label="To"
        value={destination}
        onChange={setDestination}
        placeholder="e.g. Washington DC"
      />
      <button type="submit" disabled={!canSearch || disabled}>
        Search
      </button>
      {isSameCity && (
        <p className="city-input-pair__hint" role="alert">
          Origin and destination must be different cities.
        </p>
      )}
    </form>
  );
}
