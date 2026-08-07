from app.schemas import CarrierLaneStat

# Stand-in for the `lane_daily` rollup table (03-data-model.md §4.4), keyed
# by directional (origin_key, dest_key) city-key pairs — matching lane_daily's
# grain of (origin_metro_id, dest_metro_id, carrier_sk, day). Lookups here are
# a plain dict read, never an aggregation, so this endpoint behaves like it's
# reading a precomputed rollup even though there's no database (DD-6).
_KNOWN_LANES: dict[tuple[str, str], list[CarrierLaneStat]] = {
    ("nyc", "dc"): [
        CarrierLaneStat(carrier_sk=1, legal_name="Knight-Swift Transport Services", trip_count=10),
        CarrierLaneStat(carrier_sk=2, legal_name="J.B. Hunt Transport Services Inc", trip_count=7),
        CarrierLaneStat(carrier_sk=3, legal_name="YRC Worldwide", trip_count=5),
    ],
    ("sf", "la"): [
        CarrierLaneStat(carrier_sk=4, legal_name="XPO Logistics", trip_count=9),
        CarrierLaneStat(carrier_sk=5, legal_name="Schneider", trip_count=6),
        CarrierLaneStat(carrier_sk=6, legal_name="Landstar Systems", trip_count=2),
    ],
}

# Returned for any lane not in _KNOWN_LANES, including the reverse direction
# of a known corridor (matching is directional — see design.md - Decisions).
_FALLBACK_LANE: list[CarrierLaneStat] = [
    CarrierLaneStat(carrier_sk=7, legal_name="UPS Inc.", trip_count=11),
]


def get_carriers_for_lane(origin_key: str, dest_key: str) -> list[CarrierLaneStat]:
    return _KNOWN_LANES.get((origin_key, dest_key), _FALLBACK_LANE)
