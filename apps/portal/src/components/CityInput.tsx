import { useEffect, useRef } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface CityInputProps {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Portal always sends the plain string typed/selected, never a Places
// `place_id` (design.md - Decisions), so the backend faces one request
// contract regardless of whether Maps loaded.
export function CityInput({ id, label, value, onChange, placeholder }: CityInputProps) {
  const placesLibrary = useMapsLibrary('places');
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!placesLibrary || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new placesLibrary.Autocomplete(inputRef.current, {
      types: ['(cities)'],
      fields: ['formatted_address', 'name'],
    });
    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const text = place.formatted_address ?? place.name ?? inputRef.current?.value ?? '';
      onChange(text);
    });

    return () => {
      google.maps.event.removeListener(listener);
      autocompleteRef.current = null;
    };
  }, [placesLibrary, onChange]);

  return (
    <label className="city-input">
      <span className="city-input__label">{label}</span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
}
