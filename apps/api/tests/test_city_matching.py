import pytest

from app.city_matching import normalize, resolve_city_key


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("New York City", "new york city"),
        ("  New York City  ", "new york city"),
        ("NEW YORK CITY", "new york city"),
        ("New York, NY, USA", "new york ny"),
        ("New York, NY, United States", "new york ny"),
        ("nyc", "nyc"),
        ("N.Y.C.", "n y c"),
    ],
)
def test_normalize(raw: str, expected: str) -> None:
    assert normalize(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected_key"),
    [
        ("nyc", "nyc"),
        ("NYC", "nyc"),
        ("New York City", "nyc"),
        ("New York", "nyc"),
        ("new york, ny, usa", "nyc"),
        ("dc", "dc"),
        ("DC", "dc"),
        ("Washington DC", "dc"),
        ("Washington, DC, USA", "dc"),
        ("sf", "sf"),
        ("San Francisco", "sf"),
        ("San Francisco, CA, USA", "sf"),
        ("la", "la"),
        ("Los Angeles", "la"),
        ("Los Angeles, CA, USA", "la"),
    ],
)
def test_resolve_city_key_known_variants(raw: str, expected_key: str) -> None:
    assert resolve_city_key(raw) == expected_key


def test_resolve_city_key_unrecognized_city_returns_none() -> None:
    assert resolve_city_key("Chicago") is None
    assert resolve_city_key("") is None
    assert resolve_city_key("   ") is None
