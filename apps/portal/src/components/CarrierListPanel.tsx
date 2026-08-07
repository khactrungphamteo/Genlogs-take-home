import type { CarrierLaneStat } from '../types';

interface CarrierListPanelProps {
  carriers: CarrierLaneStat[];
}

// Plain ranked list only — no coverage indicator. DD-9 coverage metadata is
// explicitly out of scope for this demo (design.md - Non-Goals).
export function CarrierListPanel({ carriers }: CarrierListPanelProps) {
  return (
    <ol className="carrier-list">
      {carriers.map((carrier) => (
        <li key={carrier.carrier_sk} className="carrier-list__row">
          <span className="carrier-list__name">{carrier.legal_name}</span>
          <span className="carrier-list__count">{carrier.trip_count} trucks/day</span>
        </li>
      ))}
    </ol>
  );
}
