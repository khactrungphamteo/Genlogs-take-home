import re

_PUNCTUATION_RE = re.compile(r"[^a-z0-9\s]")
_WHITESPACE_RE = re.compile(r"\s+")
_TRAILING_COUNTRY_RE = re.compile(r"\s*\b(usa|united states)\b\s*$")


def normalize(raw: str) -> str:
    """Lowercase, strip punctuation/whitespace, and drop a trailing country
    suffix, so "New York, NY, USA" and "new york ny" compare equal.
    """
    text = raw.strip().lower()
    text = _PUNCTUATION_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    text = _TRAILING_COUNTRY_RE.sub("", text).strip()
    return text


# city_key -> normalized aliases a user or Google Places might send for that
# city. metro_area's PostGIS polygon join is out of scope for this demo
# (proposal.md - Non-goals); this is a small fixed alias set standing in for
# it, covering the four corridors this demo cares about.
CITY_ALIASES: dict[str, set[str]] = {
    "nyc": {"nyc", "new york", "new york city", "new york ny"},
    "dc": {"dc", "washington", "washington dc", "washington d c"},
    "sf": {"sf", "san francisco", "san francisco ca"},
    "la": {"la", "los angeles", "los angeles ca"},
}

_ALIAS_TO_KEY: dict[str, str] = {
    alias: city_key
    for city_key, aliases in CITY_ALIASES.items()
    for alias in aliases
}


def resolve_city_key(raw: str) -> str | None:
    """Resolve a raw city string to one of the known `city_key`s, or None if
    it's not one of the four cities this demo models. Matching is on the
    normalized string only — case, punctuation, and country suffix are
    ignored, but the result is not directional; direction is a lane-level
    concern (see mock_data.py).
    """
    return _ALIAS_TO_KEY.get(normalize(raw))
