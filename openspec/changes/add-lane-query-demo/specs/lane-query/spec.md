## Purpose

Lets a portal user or API consumer enter an origin and destination city and
get back a plain ranked list of carriers observed moving trucks on that lane.

## ADDED Requirements

### Requirement: Lane query returns a plain ranked carrier list
The system SHALL accept an origin city and a destination city and respond
with a plain ranked list of carriers observed on that lane (carrier name and
trucks/day), with no coverage or aggregation metadata attached.

#### Scenario: Known high-volume lane
- **WHEN** a consumer requests the lane from New York City to Washington DC
- **THEN** the response lists Knight-Swift Transport Services (10 trucks/day),
  J.B. Hunt Transport Services Inc (7 trucks/day), and YRC Worldwide
  (5 trucks/day), ranked from most to fewest trucks/day

#### Scenario: Another known high-volume lane
- **WHEN** a consumer requests the lane from San Francisco to Los Angeles
- **THEN** the response lists XPO Logistics (9 trucks/day), Schneider
  (6 trucks/day), and Landstar Systems (2 trucks/day), ranked from most to
  fewest trucks/day

#### Scenario: Unmodeled or unknown lane (empty/unknown case)
- **WHEN** a consumer requests a lane that is not one of the known
  high-volume corridors — including the reverse direction of a known
  corridor, e.g. Washington DC to New York City
- **THEN** the response lists UPS Inc. (11 trucks/day) as the only carrier

#### Scenario: Missing or blank city
- **WHEN** a consumer requests a lane with an origin or destination that is
  missing, empty, or whitespace-only
- **THEN** the system rejects the request with a validation error and does
  not return any carrier data

#### Scenario: Origin and destination are the same city
- **WHEN** a consumer requests a lane where the origin and destination
  resolve to the same city, including when expressed with different
  spellings or abbreviations (e.g. "NYC" and "New York City")
- **THEN** the system rejects the request as an invalid lane and does not
  return any carrier data

### Requirement: City name matching tolerates common input variants
The system SHALL resolve an origin or destination city consistently
regardless of common surface variation in how the city name is written, so
that a user typing a casual abbreviation and a user selecting a formatted
place-lookup suggestion for the same city are treated identically.

#### Scenario: Abbreviation matches full name
- **WHEN** a consumer requests a lane using the abbreviation "NYC" as the
  origin
- **THEN** it resolves to the same city as requesting with "New York City"

#### Scenario: Formatted place name matches casual name
- **WHEN** a consumer requests a lane using a fully formatted place name such
  as "Washington, DC, USA" as the destination
- **THEN** it resolves to the same city as requesting with "DC" or
  "Washington DC"

#### Scenario: Case and punctuation differences are ignored
- **WHEN** two requests for the same city differ only in letter case,
  punctuation, or surrounding whitespace
- **THEN** both resolve to the same city

### Requirement: Portal user can search a lane and see results with route context
The system SHALL let a portal user enter an origin city and a destination
city, trigger a search, and see the returned carrier list together with a
visual route between the two cities, without the page failing to load or
crashing.

#### Scenario: Successful search shows carriers and a route
- **WHEN** a user enters a valid origin and destination and clicks Search
- **THEN** the page displays the ranked carrier list and a map showing a
  route between the two cities

#### Scenario: Search works without a map provider configured (empty/unknown case)
- **WHEN** a user enters a valid origin and destination and clicks Search
  while no map provider is configured or reachable
- **THEN** the carrier list still displays correctly, the city fields still
  accept free-text input, and the map area shows a placeholder instead of a
  route — the page does not crash or fail to load

#### Scenario: Backend unreachable
- **WHEN** a user clicks Search and the backend does not respond
- **THEN** the page shows an error message and a way to retry the search,
  rather than displaying a blank or broken page
