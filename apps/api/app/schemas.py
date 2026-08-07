from pydantic import BaseModel, Field


class CarrierLaneStat(BaseModel):
    """A single carrier's ranking on a lane.

    Field names mirror `carrier` / `lane_daily` in 03-data-model.md §4.4
    (`carrier_sk`, `legal_name`, `trip_count`) so a real rollup table could
    sit behind this same response shape later. No coverage/aggregation
    metadata is attached (see proposal.md - Non-goals: DD-9 is out of scope
    for this demo).
    """

    carrier_sk: int
    legal_name: str
    trip_count: int = Field(description="Trucks/day observed on this lane")


class LaneQueryResponse(BaseModel):
    origin: str
    destination: str
    carriers: list[CarrierLaneStat]
