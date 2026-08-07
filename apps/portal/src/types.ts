// Mirrors apps/api/app/schemas.py field-for-field.

export interface CarrierLaneStat {
  carrier_sk: number;
  legal_name: string;
  trip_count: number;
}

export interface LaneQueryResponse {
  origin: string;
  destination: string;
  carriers: CarrierLaneStat[];
}
