## Purpose

Defines the externally observable behavior of the deployed lane-query demo: a portal and API that are reachable over the public internet at a stable HTTPS custom domain, with cross-origin access restricted to known origins.

## ADDED Requirements

### Requirement: Portal is publicly reachable over HTTPS at a custom domain
The deployed portal SHALL serve its production build over HTTPS at a stable custom-domain hostname (e.g. `app.<domain>`), with a browser-trusted TLS certificate.

#### Scenario: Portal loads at the custom domain
- **WHEN** a browser requests `https://app.<domain>/`
- **THEN** the portal's production build is returned with a valid TLS certificate and no certificate warning

#### Scenario: Domain mapping not yet provisioned
- **WHEN** the custom domain's DNS records or managed certificate have not finished propagating/issuing
- **THEN** the service remains reachable at its underlying Cloud Run `*.run.app` URL so the portal is never left completely unreachable during cutover

### Requirement: API is publicly reachable over HTTPS at a custom domain
The deployed API SHALL serve `GET /lanes` over HTTPS at a stable custom-domain hostname (e.g. `api.<domain>`), independent of the portal's hostname.

#### Scenario: API responds at the custom domain
- **WHEN** a client requests `https://api.<domain>/lanes?origin=New+York+City&destination=Washington+DC`
- **THEN** the API returns the same `LaneQueryResponse` it would return on localhost, unchanged by deployment

### Requirement: API restricts cross-origin requests to configured allowed origins
The API SHALL read its list of allowed CORS origins from configuration (an environment variable) rather than a hardcoded value, defaulting to the existing local-dev origin when unset, so that authorizing a new deployed origin never requires a code change or rebuild.

#### Scenario: Request from an allowed origin succeeds
- **WHEN** a browser at an origin present in the configured allow-list calls `GET /lanes`
- **THEN** the response includes CORS headers permitting that origin, and the browser accepts the response

#### Scenario: Request from an origin not in the allow-list is rejected
- **WHEN** a browser at an origin absent from the configured allow-list calls `GET /lanes`
- **THEN** the response omits CORS headers for that origin and the browser blocks the response from being read by the calling page

#### Scenario: No origins configured
- **WHEN** the `ALLOWED_ORIGINS` environment variable is unset
- **THEN** the API falls back to allowing only `http://localhost:5173`, matching today's behavior, so an incomplete deployment configuration fails closed rather than open

### Requirement: Both services are publicly accessible without authentication
Consistent with the existing demo's no-auth scope, the deployed portal and API SHALL accept unauthenticated requests — no login, API key, or IAM identity is required to reach either service.

#### Scenario: Anonymous request succeeds
- **WHEN** a client with no credentials of any kind calls `GET /lanes` on the deployed API or loads the deployed portal
- **THEN** the request succeeds with the same response it would return to any other caller
