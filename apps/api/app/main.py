import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app.city_matching import normalize, resolve_city_key
from app.mock_data import get_carriers_for_lane
from app.schemas import LaneQueryResponse

app = FastAPI(title="GenLogs Lane-Query API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _city_identity(raw: str, key: str | None) -> str:
    """A comparable identity for a city: its resolved city_key when known,
    otherwise its normalized text, so two unrecognized-but-identical inputs
    still count as "the same city" for the same-city check below.
    """
    return key if key is not None else normalize(raw)


@app.get("/lanes", response_model=LaneQueryResponse)
def get_lanes(
    origin: str = Query(..., min_length=1),
    destination: str = Query(..., min_length=1),
) -> LaneQueryResponse:
    if not origin.strip():
        raise HTTPException(status_code=422, detail="origin must not be blank")
    if not destination.strip():
        raise HTTPException(status_code=422, detail="destination must not be blank")

    origin_key = resolve_city_key(origin)
    dest_key = resolve_city_key(destination)

    if _city_identity(origin, origin_key) == _city_identity(destination, dest_key):
        raise HTTPException(
            status_code=400,
            detail="origin and destination must be different cities",
        )

    carriers = get_carriers_for_lane(origin_key or "", dest_key or "")

    return LaneQueryResponse(origin=origin, destination=destination, carriers=carriers)
