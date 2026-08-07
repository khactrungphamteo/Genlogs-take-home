import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_nyc_to_dc_exact_ordered_list() -> None:
    resp = client.get("/lanes", params={"origin": "New York City", "destination": "Washington DC"})
    assert resp.status_code == 200
    body = resp.json()
    assert [c["legal_name"] for c in body["carriers"]] == [
        "Knight-Swift Transport Services",
        "J.B. Hunt Transport Services Inc",
        "YRC Worldwide",
    ]
    assert [c["trip_count"] for c in body["carriers"]] == [10, 7, 5]


def test_sf_to_la_exact_ordered_list() -> None:
    resp = client.get("/lanes", params={"origin": "San Francisco", "destination": "Los Angeles"})
    assert resp.status_code == 200
    body = resp.json()
    assert [c["legal_name"] for c in body["carriers"]] == [
        "XPO Logistics",
        "Schneider",
        "Landstar Systems",
    ]
    assert [c["trip_count"] for c in body["carriers"]] == [9, 6, 2]


def test_reverse_of_known_lane_falls_back() -> None:
    resp = client.get("/lanes", params={"origin": "Washington DC", "destination": "New York City"})
    assert resp.status_code == 200
    body = resp.json()
    assert [c["legal_name"] for c in body["carriers"]] == ["UPS Inc."]


def test_unrelated_city_pair_falls_back_to_ups_only() -> None:
    resp = client.get("/lanes", params={"origin": "Chicago", "destination": "Boston"})
    assert resp.status_code == 200
    body = resp.json()
    assert [c["legal_name"] for c in body["carriers"]] == ["UPS Inc."]
    assert [c["trip_count"] for c in body["carriers"]] == [11]


@pytest.mark.parametrize("params", [{"destination": "DC"}, {"origin": "NYC"}])
def test_missing_city_returns_422(params: dict[str, str]) -> None:
    resp = client.get("/lanes", params=params)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "params",
    [
        {"origin": "", "destination": "DC"},
        {"origin": "NYC", "destination": ""},
    ],
)
def test_empty_city_returns_422(params: dict[str, str]) -> None:
    resp = client.get("/lanes", params=params)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "params",
    [
        {"origin": "   ", "destination": "DC"},
        {"origin": "NYC", "destination": "   "},
    ],
)
def test_whitespace_only_city_returns_422(params: dict[str, str]) -> None:
    resp = client.get("/lanes", params=params)
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "params",
    [
        {"origin": "NYC", "destination": "New York City"},
        {"origin": "nyc", "destination": "NYC"},
        {"origin": "Washington DC", "destination": "Washington, DC, USA"},
        {"origin": "Chicago", "destination": "Chicago"},
        {"origin": "  NYC  ", "destination": "nyc"},
    ],
)
def test_same_city_including_via_different_aliases_returns_400(params: dict[str, str]) -> None:
    resp = client.get("/lanes", params=params)
    assert resp.status_code == 400


def test_case_and_whitespace_insensitivity_still_resolves_known_lane() -> None:
    resp = client.get("/lanes", params={"origin": "  nyc  ", "destination": "  DC  "})
    assert resp.status_code == 200
    body = resp.json()
    assert [c["legal_name"] for c in body["carriers"]] == [
        "Knight-Swift Transport Services",
        "J.B. Hunt Transport Services Inc",
        "YRC Worldwide",
    ]
